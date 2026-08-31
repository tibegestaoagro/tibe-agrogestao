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
import {
  aplicarResposta,
  clearPendingHerd,
  loadPendingHerd,
  savePendingHerd,
  MAX_TENTATIVAS,
  type CampoPendente,
} from "@/lib/actions/herd-pending";
import { ask, failReply, str, confirmFlow, type Handler, type RouterResult } from "./shared";
import { lerData, lerDinheiro, lerNumeroBr } from "./parsers";

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
 * **O pedido que espera resposta é GUARDADO** (`herd-pending.ts`), e é ele que
 * manda. Até 2026-08-06 isso era delegado ao classificador do n8n, que
 * remontava o pedido pelo `recent_history`: falhou em três testes reais
 * seguidos, o pior deles trocando o TIPO da movimentação. Da mensagem seguinte
 * entra SÓ o campo perguntado; o resto vem do que foi gravado.
 */

/**
 * Exportados para o handler de Negociações (Módulo 31): "comprei 20 bezerros"
 * precisa resolver categoria e fazenda exatamente como "nasceram 20
 * bezerros". Duplicar essa resolução seria pior que duplicar código: a regra
 * de nunca chutar faixa de idade divergiria entre os dois caminhos, e o
 * assistente passaria a lançar animais na idade errada por um caminho e não
 * pelo outro.
 */
export type Item = { categoria: string; quantidade: number };

export function itensDosParametros(parameters: Record<string, unknown>): Item[] {
  const brutos = parameters.itens;
  if (Array.isArray(brutos)) {
    const lista: Item[] = [];
    for (const bruto of brutos) {
      if (typeof bruto !== "object" || bruto === null) continue;
      const registro = bruto as Record<string, unknown>;
      const categoria = str(registro.categoria) ?? str(registro.category);
      // `lerNumeroBr`, e não `num`: o handler de estoque já aprendeu isso
      // ("comprei 2.000 kg de racao" virava 2 quilos), e a mesma frase com
      // cabeças de gado tinha o mesmo destino aqui.
      const quantidade = lerNumeroBr(registro.quantidade) ?? lerNumeroBr(registro.quantity);
      if (categoria && quantidade != null) lista.push({ categoria, quantidade });
    }
    if (lista.length > 0) return lista;
  }
  // Forma plana, para o caso de um item só (a maioria das mensagens).
  const categoria = str(parameters.categoria) ?? str(parameters.category);
  const quantidade = lerNumeroBr(parameters.quantidade) ?? lerNumeroBr(parameters.quantity);
  if (categoria && quantidade != null) return [{ categoria, quantidade }];
  return [];
}

/**
 * A pergunta do §14, com as candidatas como opções.
 *
 * O que falta muda o texto. "novilha" serve a três idades do mesmo sexo, e aí
 * a pergunta é a do documento ("qual é a idade aproximada?"). Já "13 a 24
 * meses" (o classificador manda isso ao processar "novilhas de 13 a 24
 * meses", guardando a faixa e descartando o sexo) tem a idade e falta o sexo:
 * perguntar a idade de novo faria o produtor repetir o que acabou de dizer.
 */
function perguntaDeFaixa(termo: string, candidatas: HerdCategory[]): RouterResult {
  const mesmaIdade = candidatas.every(
    (c) => c.min_months === candidatas[0].min_months && c.max_months === candidatas[0].max_months,
  );
  const pergunta = mesmaIdade ? "São machos ou fêmeas?" : "Qual é a idade aproximada?";
  const opcoes = candidatas.map((c) => `- ${c.label}`).join("\n");
  return ask(`"${termo}" pode ser mais de uma categoria. ${pergunta}\n${opcoes}`, {
    termo_ambiguo: termo,
    opcoes: candidatas.map((c) => c.id),
  });
}

type CategoriaResolvida =
  | { ok: true; categoria: HerdCategory }
  | { ok: false; resposta: RouterResult };

export function resolverCategoria(termo: string, nascimento = false): CategoriaResolvida {
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
export async function resolverFazenda(
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

export async function resolverPasto(
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
export async function conferirOndeEstaOSaldo(
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

  /**
   * Só interessa saldo em OUTRO lugar. Se tudo que existe já está na posição
   * pedida e apenas não dá a quantidade, quem responde é o bloqueio de saldo
   * negativo, com a mensagem literal do cliente.
   *
   * Sem este filtro, "vendi 100" com 18 em estoque respondia "Não encontrei
   * Fêmea 13 a 24 sem pasto informado. Você tem 18 em sem pasto informado",
   * que aponta o mesmo lugar duas vezes e não diz o que importa: são 18, você
   * pediu 100. Visto em teste real, 2026-08-10.
   */
  const comSaldo = posicoes.filter((p) => p.quantity > 0 && p.pasture_id !== pastureIdPedido);
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
/** §5: as duas únicas categorias de 0 a 7 meses. Nascimento não entra em outra. */
const CATEGORIAS_DE_NASCIMENTO = new Set(["bezerro_0_7", "bezerra_0_7"]);
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
  return itens.map((i) => `${i.quantidade} ${nomeDaCategoria(i.categoria, i.quantidade)}`).join(" e ");
}

/**
 * O nome da categoria dentro de frase, no singular quando for uma cabeça só.
 *
 * "morreu 1 bezerros" é o que saía antes, e o produtor lê isso. Cada palavra
 * que é plural vira singular até a primeira preposição: "garrotes reprodutores"
 * vira "garrote reprodutor", mas em "fêmeas de 8 a 12 meses" o "meses" é
 * complemento de idade e não pode virar "mese".
 *
 * Exportado para o handler de Negociações usar a MESMA regra: o produtor lê os
 * dois na mesma conversa, e duas grafias para a mesma categoria pareceriam dois
 * sistemas falando.
 */
export function nomeDaCategoria(categoria: HerdCategory, quantidade: number): string {
  if (quantidade !== 1) return categoria.plural;
  const palavras = categoria.plural.split(" ");
  const fim = palavras.findIndex((p) => p === "de" || p === "da" || p === "do");
  const limite = fim === -1 ? palavras.length : fim;
  return palavras.map((p, i) => (i < limite ? p.replace(/s$/, "") : p)).join(" ");
}

/**
 * "hoje" quando for hoje; a data por extenso quando o produtor disser outra.
 *
 * Exportado para o handler de Confinamento (fase 3 do Módulo 30) usar a MESMA
 * regra: a entrada em confinamento também confirma com "hoje" ou a data dita,
 * e duas funções fariam a mesma coisa de dois jeitos.
 */
export function descreverData(data: Date): string {
  const hoje = new Date();
  const mesmoDia =
    data.getFullYear() === hoje.getFullYear() &&
    data.getMonth() === hoje.getMonth() &&
    data.getDate() === hoje.getDate();
  return mesmoDia ? "hoje" : `em ${data.toLocaleDateString("pt-BR")}`;
}

export const registrarMovimentacaoRebanho: Handler = async ({
  db,
  tenant_id,
  user_id,
  parameters: parametrosDaMensagem,
  confirmed,
  explicitNo,
}) => {
  const intent = "registrar_movimentacao_rebanho";
  const temMemoria = !!user_id;

  // "cancela" / "não" vence TUDO e vem primeiro. Antes isto vivia lá embaixo,
  // dentro do confirmFlow, e qualquer pergunta de esclarecimento (faixa de
  // idade, fazenda, pasto) retornava antes: o produtor dizia "cancela" e
  // recebia a pergunta de novo, sem nada ser cancelado. Achado em teste real.
  if (explicitNo) {
    if (temMemoria) await clearPendingHerd(tenant_id, user_id!);
    return {
      reply_text: "Tudo bem, não registrei nada.",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${intent}:cancelado`,
    };
  }

  /**
   * O pedido que ficou esperando resposta manda sobre a reconstrução do
   * classificador. Da mensagem nova entra só o campo perguntado; tipo,
   * quantidade, fazenda e pasto vêm do que foi guardado. Sem isto, um
   * "13 a 24 meses" respondido a um saldo inicial voltava como nascimento,
   * porque o LLM herdava o tipo de outra conversa (achado em teste real,
   * 2026-08-06).
   */
  let parameters = parametrosDaMensagem;
  let confirmado = confirmed;
  const pendente = temMemoria ? await loadPendingHerd(tenant_id, user_id!) : null;

  if (temMemoria && confirmed) {
    /**
     * "Sim" só vale para o que o assistente MOSTROU. Sem um pedido guardado
     * esperando confirmação, não escreve nada.
     *
     * Em 2026-08-10 um "sim" gravou 18 animais que ninguém pediu: o produtor
     * mandou VENDER 100, o assistente respondeu "você tem 18", e o
     * classificador montou um pedido de saldo inicial com o 18 que leu na
     * própria resposta. Confirmação sem âncora é assinatura em papel em
     * branco.
     */
    if (pendente?.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else if (pendente) {
      // Há pendência, mas de um CAMPO: o produtor está respondendo a pergunta,
      // não confirmando. Ninguém confirma o que ainda não viu.
      confirmado = false;
    } else {
      return ask(
        "Não tenho nenhum registro esperando confirmação. Me diga de novo o que você quer registrar.",
      );
    }
  }

  if (pendente && pendente.aguardando !== "confirmacao") {
    const juntado = aplicarResposta(pendente, parametrosDaMensagem);
    if (juntado) parameters = juntado;
    // Quando não é resposta, o pendente NÃO é apagado: apagar zerava o contador
    // de tentativas e a trava de laço nunca chegava a disparar (visto em teste
    // real, a mesma pergunta repetiu sem parar). Ele morre por TTL, por
    // sucesso ou por cancelamento.
  }

  /**
   * Toda pergunta de esclarecimento guarda o pedido antes de sair, e conta
   * quantas vezes o MESMO campo já foi perguntado. Se o classificador insiste
   * no mesmo valor errado, repetir a pergunta prende o produtor num laço: a
   * partir do limite, o assistente para de perguntar e diz o que escrever.
   */
  const perguntar = async (
    resposta: RouterResult,
    campo: CampoPendente,
  ): Promise<RouterResult> => {
    if (!temMemoria) return resposta;

    const tentativas = pendente?.aguardando === campo ? (pendente.tentativas ?? 1) + 1 : 1;
    if (tentativas >= MAX_TENTATIVAS) {
      await clearPendingHerd(tenant_id, user_id!);
      return ask(
        "Não estou conseguindo entender essa parte. Tente mandar tudo numa frase só, " +
          'por exemplo: "saldo inicial de 20 fêmeas de 13 a 24 meses na Fazenda Boa Vista".',
      );
    }

    await savePendingHerd(tenant_id, user_id!, { parameters, aguardando: campo, tentativas });
    return resposta;
  };

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
    if (!resolvida.ok) return perguntar(resolvida.resposta, "categoria");

    // Recém-nascido tem 0 a 7 meses. Sem esta trava, um classificador
    // confuso grava "nascimento de 4 fêmeas de 13 a 24 meses", que aconteceu
    // num teste real: a regra estava só no prompt do LLM, e prompt não é
    // garantia. Aqui é código, e vale mesmo quando o LLM erra.
    if (tipo === "nascimento" && !CATEGORIAS_DE_NASCIMENTO.has(resolvida.categoria.id)) {
      /**
       * O combinado é impossível, mas RECUSAR deixava o produtor num beco: ele
       * repetia a frase e caía no mesmo lugar (visto em teste real, três
       * vezes). Entre o tipo e a categoria, quem quase sempre está errado é o
       * TIPO, porque o classificador herda "nascimento" de conversa anterior;
       * a idade veio da boca do produtor. Então perguntamos o tipo, com o
       * pedido guardado, em vez de mandar recomeçar.
       */
      return perguntar(
        ask(
          `Você disse ${resolvida.categoria.plural}, então não é nascimento ` +
            "(recém-nascido tem 0 a 7 meses). O que você quer registrar?\n" +
            "- Saldo inicial (já são seus, só ainda não estavam no sistema)\n" +
            "- Compra (você acabou de comprar)",
          { conflito: "nascimento_com_categoria_adulta", categoria: resolvida.categoria.id },
        ),
        "movement_type",
      );
    }

    itens.push({ categoria: resolvida.categoria, quantidade: item.quantidade });
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return perguntar(fazenda.resposta, "fazenda");

  const pastoOrigem = await resolverPasto(
    db,
    fazenda.id,
    str(parameters.pasto_origem) ?? str(parameters.pasto),
  );
  if (!pastoOrigem.ok) return perguntar(pastoOrigem.resposta, "pasto");

  const pastoDestino = await resolverPasto(db, fazenda.id, str(parameters.pasto_destino));
  if (!pastoDestino.ok) return pastoDestino.resposta;

  // Transferência precisa saber para onde. Mudança de categoria muda a
  // categoria; transferência de pasto muda o pasto; a de fazenda, a fazenda.
  let categoriaDestino: HerdCategory | null = null;
  let fazendaDestino: { id: string; nome: string } | null = null;
  if (TRANSFERENCIAS.has(tipo)) {
    if (tipo === "mudanca_categoria") {
      const termo = str(parameters.categoria_destino) ?? str(parameters.category_destino);
      if (!termo) {
        return perguntar(ask("Para qual categoria devo passar esses animais?"), "categoria_destino");
      }
      const resolvida = resolverCategoria(termo);
      if (!resolvida.ok) return perguntar(resolvida.resposta, "categoria_destino");
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
      if (aviso) return perguntar(aviso, "pasto");
    }
  }

  // `lerDinheiro` e `lerData`, e não `num` + `new Date` cru: os mesmos
  // parsers que os handlers de negociação e estoque já usam. Antes disto,
  // "60 mil" virava NaN aqui e a data só era aceita em ISO, embora a própria
  // mensagem de erro abaixo sugira o formato '05/08/2026', que a linha antiga
  // não conseguia ler.
  const valor = lerDinheiro(parameters, "valor", "value", "valor_total");
  const dataLida = lerData(parameters, "data", "date", "occurred_at");
  if (dataLida.tipo === "invalida") {
    return ask("Não entendi a data. Diga por exemplo 'hoje', 'ontem' ou '05/08/2026'.");
  }
  const quando = dataLida.tipo === "ok" ? dataLida.data : new Date();

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
    confirmed: confirmado,
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
  if (parado) {
    // Guarda o pedido JUNTO com a pergunta de confirmação: é ele que o "sim"
    // vai executar, não o que o classificador reconstruir.
    if (parado.requires_confirmation && temMemoria) {
      await savePendingHerd(tenant_id, user_id!, {
        parameters,
        aguardando: "confirmacao",
        tentativas: 1,
      });
    }
    return parado;
  }

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

  // Registrou: o pedido deixou de estar pendente. Sem isto, a próxima
  // mensagem curta do produtor seria interpretada como resposta a uma
  // pergunta que já foi respondida.
  if (temMemoria) await clearPendingHerd(tenant_id, user_id!);

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
