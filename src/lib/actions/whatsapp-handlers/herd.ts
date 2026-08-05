import type { TenantPrismaClient } from "@/lib/prisma";
import {
  getPositions,
  recordMovement,
  HERD_MOVEMENT_TYPES,
  type HerdPositionKey,
} from "@/lib/actions/herd-ledger";
import { summarizePositions } from "@/lib/herd/summary";
import {
  resolveBirthCategoryTerm,
  resolveCategoryTerm,
  type HerdCategory,
} from "@/lib/herd/categories";
import { findActivePropertyByName, listActiveProperties } from "@/lib/actions/properties";
import { ask, failReply, str, num, confirmFlow, type Handler, type RouterResult } from "./shared";

/**
 * O rebanho pelo WhatsApp (Módulo 30, §13 e §14).
 *
 * Duas regras mandam aqui, e as duas vêm escritas no documento do cliente:
 *
 * 1. **Nunca escolher categoria sem confirmação** (§14, última linha). Quando
 *    o termo do produtor serve a mais de uma faixa de idade ("novilha",
 *    "garrote"), o assistente PERGUNTA a faixa e para. É o que impede lançar
 *    20 animais na idade errada, e é por isso que `resolveCategoryTerm`
 *    devolve `ambiguous` em vez de chutar.
 * 2. **Todo registro passa por confirmação** (§13.3: "O lançamento deverá ser
 *    realizado somente após confirmação"), independentemente de valor. Não usa
 *    `CONFIRMATION_THRESHOLD`: aqui o risco não é financeiro, é o saldo do
 *    rebanho ficar errado.
 *
 * A resposta à pergunta de desambiguação NÃO cria estado novo: o classificador
 * do n8n reemite a intenção com a faixa já escolhida, lendo o `recent_history`,
 * exatamente como o funil do `resumo` faz. Estado de conversa em banco é o
 * `AgentFlowState`, que serve a formulário de cadastro, não a uma pergunta só.
 */

type Item = { categoria: string; quantidade: number };

function itensDosParametros(parameters: Record<string, unknown>): Item[] {
  const brutos = parameters.itens;
  if (Array.isArray(brutos)) {
    const lista: Item[] = [];
    for (const bruto of brutos) {
      if (typeof bruto !== "object" || bruto === null) continue;
      const registro = bruto as Record<string, unknown>;
      const categoria = str(registro.categoria) ?? str(registro.category);
      const quantidade = num(registro.quantidade) ?? num(registro.quantity);
      if (categoria && quantidade != null) lista.push({ categoria, quantidade });
    }
    if (lista.length > 0) return lista;
  }
  // Forma plana, para o caso de um item só (a maioria das mensagens).
  const categoria = str(parameters.categoria) ?? str(parameters.category);
  const quantidade = num(parameters.quantidade) ?? num(parameters.quantity);
  if (categoria && quantidade != null) return [{ categoria, quantidade }];
  return [];
}

/** A pergunta do §14, com as faixas candidatas como opções. */
function perguntaDeFaixa(termo: string, candidatas: HerdCategory[]): RouterResult {
  const opcoes = candidatas.map((c) => `- ${c.label}`).join("\n");
  return ask(
    `"${termo}" pode ser mais de uma categoria. Qual é a idade aproximada?\n${opcoes}`,
    { termo_ambiguo: termo, opcoes: candidatas.map((c) => c.id) },
  );
}

type CategoriaResolvida =
  | { ok: true; categoria: HerdCategory }
  | { ok: false; resposta: RouterResult };

function resolverCategoria(termo: string, nascimento = false): CategoriaResolvida {
  // Num nascimento, o sexo sozinho já basta: recém-nascido é 0 a 7 meses.
  // É o que o §13.4 espera de "nasceram 4 machos e 3 fêmeas".
  const resolucao = nascimento ? resolveBirthCategoryTerm(termo) : resolveCategoryTerm(termo);
  if (resolucao.kind === "exact") return { ok: true, categoria: resolucao.category };
  if (resolucao.kind === "ambiguous") {
    return { ok: false, resposta: perguntaDeFaixa(termo, resolucao.candidates) };
  }
  return {
    ok: false,
    resposta: ask(
      `Não reconheci a categoria "${termo}". Diga o sexo e a idade aproximada, por exemplo "fêmeas de 13 a 24 meses".`,
    ),
  };
}

type FazendaResolvida =
  | { ok: true; id: string; nome: string }
  | { ok: false; resposta: RouterResult };

/**
 * Resolve a fazenda pelo nome. Sem nome informado: usa a única fazenda quando
 * só existe uma, e PERGUNTA quando existe mais de uma. Adivinhar a fazenda tem
 * o mesmo defeito de adivinhar a categoria, o saldo vai parar no lugar errado.
 */
async function resolverFazenda(
  db: TenantPrismaClient,
  nome: string | null,
): Promise<FazendaResolvida> {
  if (nome) {
    const encontrada = await findActivePropertyByName(db, nome);
    if (encontrada) return { ok: true, id: encontrada.id, nome: encontrada.name };
    return {
      ok: false,
      resposta: ask(`Não encontrei a fazenda "${nome}". Confira o nome e tente de novo.`),
    };
  }

  const fazendas = await listActiveProperties(db);
  if (fazendas.length === 0) {
    return {
      ok: false,
      resposta: ask("Você ainda não tem fazenda cadastrada. Cadastre uma no painel, em Minha Fazenda."),
    };
  }
  if (fazendas.length === 1) return { ok: true, id: fazendas[0].id, nome: fazendas[0].name };

  const nomes = fazendas.map((f) => `- ${f.name}`).join("\n");
  return { ok: false, resposta: ask(`Em qual fazenda?\n${nomes}`) };
}

async function resolverPasto(
  db: TenantPrismaClient,
  propertyId: string,
  nome: string | null,
): Promise<{ ok: true; id: string | null; nome: string | null } | { ok: false; resposta: RouterResult }> {
  if (!nome) return { ok: true, id: null, nome: null };
  const pasto = await db.pasture.findFirst({
    where: { property_id: propertyId, archived_at: null, name: { contains: nome, mode: "insensitive" } },
  });
  if (!pasto) {
    return { ok: false, resposta: ask(`Não encontrei o pasto "${nome}" nessa fazenda.`) };
  }
  return { ok: true, id: pasto.id, nome: pasto.name };
}

/**
 * O pasto faz parte da IDENTIDADE da posição, então "morreram 2 vacas no Pasto
 * da Baixada" não acha nada se as vacas foram cadastradas sem pasto. O saldo
 * está certo; a resposta "existem apenas 0 animais nesta categoria" é que
 * mentia por omissão, porque existem 45, só em outro lugar.
 *
 * Aqui a gente confere ANTES de pedir confirmação e, quando a categoria tem
 * saldo em outro ponto da fazenda, diz onde está e devolve a escolha ao
 * produtor. Não move sozinho: escolher de qual pasto tirar é da mesma família
 * de chute que o §14 proíbe para faixa de idade.
 *
 * Devolve `null` quando pode seguir: ou há saldo suficiente na posição exata,
 * ou não há saldo em lugar nenhum (aí quem responde é a mensagem literal do
 * cliente, no §10.3, que é a certa para esse caso).
 */
async function conferirOndeEstaOSaldo(
  db: TenantPrismaClient,
  categoria: HerdCategory,
  propertyId: string,
  pastureIdPedido: string | null,
  quantidade: number,
): Promise<RouterResult | null> {
  const posicoes = await getPositions(db, {
    category_id: categoria.id,
    property_id: propertyId,
    owner: "proprio",
  });

  const naPosicaoExata = posicoes
    .filter((p) => p.pasture_id === pastureIdPedido)
    .reduce((soma, p) => soma + p.quantity, 0);
  if (naPosicaoExata >= quantidade) return null;

  const comSaldo = posicoes.filter((p) => p.quantity > 0);
  const totalNaFazenda = comSaldo.reduce((soma, p) => soma + p.quantity, 0);
  if (totalNaFazenda === 0) return null;

  const pastos = await db.pasture.findMany({
    where: { property_id: propertyId },
    select: { id: true, name: true },
  });
  const nomeDoPasto = new Map(pastos.map((p) => [p.id, p.name]));
  const ondeEstao = comSaldo.map((p) => ({
    lugar: p.pasture_id ? (nomeDoPasto.get(p.pasture_id) ?? "pasto removido") : "sem pasto informado",
    quantidade: p.quantity,
  }));

  const pedido = pastureIdPedido
    ? (nomeDoPasto.get(pastureIdPedido) ?? "no pasto informado")
    : null;
  const abertura = pedido
    ? `Não encontrei ${categoria.label} no ${pedido}.`
    : `Não encontrei ${categoria.label} sem pasto informado.`;

  if (ondeEstao.length === 1) {
    const unico = ondeEstao[0];
    return ask(
      `${abertura}\nVocê tem ${unico.quantidade} em ${unico.lugar}. Registro por lá?`,
      { categoria: categoria.id, sugerir_pasture_id: comSaldo[0].pasture_id },
    );
  }

  const lista = ondeEstao.map((o) => `- ${o.lugar}: ${o.quantidade}`).join("\n");
  return ask(`${abertura}\nVocê tem ${categoria.label} em:\n${lista}\nDe onde devo tirar?`, {
    categoria: categoria.id,
  });
}

// ── §13.1 e §13.2: consulta ────────────────────────────────────────

export const consultarRebanho: Handler = async ({ db, parameters }) => {
  const termoCategoria = str(parameters.categoria) ?? str(parameters.category);
  const nomeFazenda = str(parameters.fazenda) ?? str(parameters.property);

  let propertyId: string | undefined;
  let nomeDaFazenda: string | null = null;
  if (nomeFazenda) {
    const fazenda = await resolverFazenda(db, nomeFazenda);
    if (!fazenda.ok) return fazenda.resposta;
    propertyId = fazenda.id;
    nomeDaFazenda = fazenda.nome;
  }

  const posicoes = await getPositions(db, {
    owner: "proprio",
    ...(propertyId ? { property_id: propertyId } : {}),
  });
  const onde = nomeDaFazenda ? ` em ${nomeDaFazenda}` : "";

  // §13.2: consulta por categoria. Termo ambíguo pergunta, nunca chuta.
  if (termoCategoria) {
    const categoria = resolverCategoria(termoCategoria);
    if (!categoria.ok) return categoria.resposta;

    const total = posicoes
      .filter((p) => p.category_id === categoria.categoria.id)
      .reduce((soma, p) => soma + p.quantity, 0);

    return {
      reply_text: `Você possui ${total} ${categoria.categoria.plural}${onde}.`,
      requires_confirmation: false,
      auxiliary_data: { category_id: categoria.categoria.id, quantidade: total },
      report_url: null,
      action_taken: "consultar_rebanho:categoria",
    };
  }

  // §13.1: consulta geral.
  const resumo = summarizePositions(posicoes);
  const [femeas, machos] = resumo.by_sex;
  return {
    reply_text:
      `Seu rebanho possui atualmente ${resumo.total} animais${onde}.\n` +
      `Fêmeas: ${femeas.total} | Machos: ${machos.total}`,
    requires_confirmation: false,
    auxiliary_data: { total: resumo.total },
    report_url: null,
    action_taken: "consultar_rebanho:geral",
  };
};

// ── §13.3 a §13.7: registro ────────────────────────────────────────

const ENTRADAS = new Set(["saldo_inicial", "nascimento", "compra"]);
const SAIDAS = new Set(["venda", "morte"]);
const TRANSFERENCIAS = new Set(["transferencia_pasto", "transferencia_fazenda", "mudanca_categoria"]);

const VERBO: Record<string, string> = {
  saldo_inicial: "registrar",
  nascimento: "registrar o nascimento de",
  compra: "registrar a compra de",
  venda: "registrar a venda de",
  morte: "registrar a morte de",
};

/** Como o cliente escreve nos §13.4 e §13.5: "4 bezerros e 3 bezerras". */
function descreverItens(itens: { categoria: HerdCategory; quantidade: number }[]): string {
  return itens.map((i) => `${i.quantidade} ${i.categoria.plural}`).join(" e ");
}

/** "hoje" quando for hoje; a data por extenso quando o produtor disser outra. */
function descreverData(data: Date): string {
  const hoje = new Date();
  const mesmoDia =
    data.getFullYear() === hoje.getFullYear() &&
    data.getMonth() === hoje.getMonth() &&
    data.getDate() === hoje.getDate();
  return mesmoDia ? "hoje" : `em ${data.toLocaleDateString("pt-BR")}`;
}

export const registrarMovimentacaoRebanho: Handler = async ({
  db,
  parameters,
  confirmed,
  explicitNo,
}) => {
  const intent = "registrar_movimentacao_rebanho";
  const tipo = str(parameters.movement_type) ?? str(parameters.tipo);
  if (!tipo || !(HERD_MOVEMENT_TYPES as readonly string[]).includes(tipo)) {
    return ask(
      "Não entendi que tipo de movimentação é. Você pode dizer, por exemplo, " +
        '"nasceram 4 bezerros", "morreram 2 vacas" ou "passe 10 bezerras para 8 a 12 meses".',
    );
  }

  const itensBrutos = itensDosParametros(parameters);
  if (itensBrutos.length === 0) {
    return ask("Quantos animais e de qual categoria?");
  }
  for (const item of itensBrutos) {
    if (!Number.isInteger(item.quantidade) || item.quantidade <= 0) {
      return ask("A quantidade precisa ser um número inteiro maior que zero.");
    }
  }

  // §14: qualquer termo ambíguo interrompe TUDO e vira pergunta. Resolver os
  // outros itens e deixar um pendente daria a impressão de que já registrou.
  const itens: { categoria: HerdCategory; quantidade: number }[] = [];
  for (const item of itensBrutos) {
    const resolvida = resolverCategoria(item.categoria, tipo === "nascimento");
    if (!resolvida.ok) return resolvida.resposta;
    itens.push({ categoria: resolvida.categoria, quantidade: item.quantidade });
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return fazenda.resposta;

  const pastoOrigem = await resolverPasto(
    db,
    fazenda.id,
    str(parameters.pasto_origem) ?? str(parameters.pasto),
  );
  if (!pastoOrigem.ok) return pastoOrigem.resposta;

  const pastoDestino = await resolverPasto(db, fazenda.id, str(parameters.pasto_destino));
  if (!pastoDestino.ok) return pastoDestino.resposta;

  // Transferência precisa saber para onde. Mudança de categoria muda a
  // categoria; transferência de pasto muda o pasto; a de fazenda, a fazenda.
  let categoriaDestino: HerdCategory | null = null;
  let fazendaDestino: { id: string; nome: string } | null = null;
  if (TRANSFERENCIAS.has(tipo)) {
    if (tipo === "mudanca_categoria") {
      const termo = str(parameters.categoria_destino) ?? str(parameters.category_destino);
      if (!termo) return ask("Para qual categoria devo passar esses animais?");
      const resolvida = resolverCategoria(termo);
      if (!resolvida.ok) return resolvida.resposta;
      categoriaDestino = resolvida.categoria;
    }
    if (tipo === "transferencia_pasto" && !pastoDestino.id) {
      return ask("Para qual pasto devo transferir?");
    }
    if (tipo === "transferencia_fazenda") {
      const nome = str(parameters.fazenda_destino);
      if (!nome) return ask("Para qual fazenda devo transferir?");
      const destino = await resolverFazenda(db, nome);
      if (!destino.ok) return destino.resposta;
      fazendaDestino = { id: destino.id, nome: destino.nome };
    }
  }

  // Só quem TIRA de algum lugar precisa desta conferência: entrada não tem
  // origem. Roda antes da confirmação, para não pedir "sim" a uma coisa que
  // já se sabe que vai falhar.
  if (!ENTRADAS.has(tipo)) {
    for (const item of itens) {
      const aviso = await conferirOndeEstaOSaldo(
        db,
        item.categoria,
        fazenda.id,
        pastoOrigem.id,
        item.quantidade,
      );
      if (aviso) return aviso;
    }
  }

  const valor = num(parameters.valor) ?? num(parameters.value);
  const dataInformada = str(parameters.data) ?? str(parameters.date) ?? str(parameters.occurred_at);
  const quando = dataInformada ? new Date(`${dataInformada.slice(0, 10)}T12:00:00`) : new Date();
  if (Number.isNaN(quando.getTime())) {
    return ask("Não entendi a data. Diga por exemplo 'hoje', 'ontem' ou '05/08/2026'.");
  }

  // "no Pasto X" é seguro (pasto é masculino e o nome começa com "Pasto").
  // Para a fazenda, "em X" em vez de "na X": o nome é livre e adivinhar o
  // artigo produz coisas como "na Da Mata".
  const lugar = pastoOrigem.nome ? `no ${pastoOrigem.nome}` : `em ${fazenda.nome}`;

  let pergunta: string;
  if (TRANSFERENCIAS.has(tipo)) {
    // O §13.6 do cliente usa o RÓTULO oficial nos dois lados aqui, não o
    // plural coloquial: "da categoria Bezerra - 0 a 7 meses para Fêmea - 8 a
    // 12 meses". É mais preciso, e é o que a mudança de categoria pede.
    const origem = itens[0];
    const destinoTexto = categoriaDestino
      ? `para ${categoriaDestino.label}`
      : fazendaDestino
        ? `para ${fazendaDestino.nome}`
        : `para o ${pastoDestino.nome}`;
    pergunta = `Deseja transferir ${origem.quantidade} animais da categoria ${origem.categoria.label} ${destinoTexto}?`;
  } else {
    const verbo = VERBO[tipo] ?? "registrar";
    const complemento = valor != null ? ` no valor de R$ ${valor.toLocaleString("pt-BR")}` : "";
    pergunta = `Deseja ${verbo} ${descreverItens(itens)} ${descreverData(quando)} ${lugar}${complemento}?`;
  }

  const parado = confirmFlow({
    intent,
    explicitNo,
    confirmed,
    question: pergunta,
    auxiliary: {
      movement_type: tipo,
      itens: itens.map((i) => ({ category_id: i.categoria.id, quantidade: i.quantidade })),
      property_id: fazenda.id,
      pasture_id: pastoOrigem.id,
      ...(categoriaDestino ? { category_destino: categoriaDestino.id } : {}),
      ...(fazendaDestino ? { property_destino: fazendaDestino.id } : {}),
      ...(pastoDestino.id ? { pasture_destino: pastoDestino.id } : {}),
      ...(valor != null ? { valor } : {}),
    },
    cancelledText: "Tudo bem, não registrei nada.",
  });
  if (parado) return parado;

  const posicao = (
    categoria: HerdCategory,
    propertyId: string,
    pastureId: string | null,
  ): HerdPositionKey => ({
    category_id: categoria.id,
    property_id: propertyId,
    pasture_id: pastureId,
    situation: "presente",
    owner: "proprio",
  });

  const registradas: string[] = [];
  for (const item of itens) {
    const origem = posicao(item.categoria, fazenda.id, pastoOrigem.id);
    const destino = posicao(
      categoriaDestino ?? item.categoria,
      fazendaDestino?.id ?? fazenda.id,
      TRANSFERENCIAS.has(tipo) ? (pastoDestino.id ?? pastoOrigem.id) : pastoOrigem.id,
    );

    const resultado = await recordMovement(db, {
      movement_type: tipo as (typeof HERD_MOVEMENT_TYPES)[number],
      quantity: item.quantidade,
      from: ENTRADAS.has(tipo) ? null : origem,
      to: SAIDAS.has(tipo) ? null : destino,
      value: valor ?? null,
      occurred_at: quando,
      notes: "Registrado pelo assistente no WhatsApp",
    });

    if (!resultado.ok) {
      // Falha no meio de vários itens: dizer o que JÁ entrou é obrigatório,
      // senão o produtor repete tudo e duplica o que deu certo.
      const jaFeito = registradas.length > 0 ? ` Já registrei: ${registradas.join(", ")}.` : "";
      return {
        ...failReply(intent, resultado),
        reply_text: `⚠️ ${resultado.message}${jaFeito}`,
      };
    }
    registradas.push(`${item.quantidade} ${item.categoria.plural}`);
  }

  const total = itens.reduce((soma, i) => soma + i.quantidade, 0);
  const saldo = await getPositions(db, { owner: "proprio" });

  return {
    reply_text:
      `✅ Registrado: ${registradas.join(", ")}.\n` +
      `Seu rebanho agora tem ${summarizePositions(saldo).total} animais.`,
    requires_confirmation: false,
    auxiliary_data: { registradas: registradas.length, cabecas: total },
    report_url: null,
    action_taken: `${intent}:${tipo}`,
  };
};
