import type { TenantPrismaClient } from "@/lib/prisma";
import { createProductNegotiation } from "@/lib/actions/product-negotiations";
import { recordStockMovement, adjustStock, getStockBalance } from "@/lib/actions/stock-ledger";
import { listProductsWithBalance } from "@/lib/actions/products";
import { descreverQuantidade, findUnit } from "@/lib/stock/units";
import { resolverFazenda } from "./herd";
import { ask, failReply, str, num, type Handler, type RouterResult } from "./shared";
import {
  custosDosParametros,
  lerData,
  lerDinheiro,
  extrairNumeroDeParcelas,
  interpretarSim,
  montarParcelas,
} from "./parsers";

/**
 * Estoque de insumos pelo WhatsApp (Módulo 31, §9 e §10).
 *
 * Quatro gestos: comprei produto, vendi produto, usei e contei. O uso é o que
 * mais acontece e o que menos combina com painel: quem acabou de dar sal ao
 * gado está no curral, não na frente do computador.
 *
 * DUAS REGRAS QUE NÃO PODEM AFROUXAR:
 *
 * 1. **O produto é resolvido no CATÁLOGO, nunca criado pela conversa.**
 *    Cadastrar produto exige categoria e unidade (§9.1), e adivinhar as duas a
 *    partir de uma frase produziria "sal", "sal mineral" e "sal mineral 60"
 *    como três produtos diferentes, com três saldos, para a mesma coisa. Não
 *    achou, PERGUNTA e mostra o que existe.
 * 2. **Escrita de dinheiro sempre confirma**, como no negócio de gado, e pelo
 *    mesmo motivo: uma linha grava estoque E contas a pagar de uma vez. Uso e
 *    ajuste NÃO pedem confirmação: não mexem em dinheiro, são o gesto de maior
 *    frequência do módulo, e um erro ali se desfaz com outro ajuste.
 */

type ProdutoDoCatalogo = {
  id: string;
  name: string;
  unit: string;
};

/**
 * Acha o produto pelo nome dito, sem inventar.
 *
 * Compara sem acento e sem caixa, aceitando que o produtor fale menos do que
 * cadastrou: "sal" encontra "Sal mineral 60 P". Quando mais de um casa, mostra
 * os candidatos em vez de escolher o primeiro: dois produtos parecidos com
 * saldos diferentes é exatamente o caso em que chutar erra o estoque de dois
 * de uma vez.
 */
export async function resolverProduto(
  db: TenantPrismaClient,
  nome: string | null,
): Promise<{ ok: true; produto: ProdutoDoCatalogo } | { ok: false; resposta: RouterResult }> {
  const produtos = await db.product.findMany({
    where: { archived_at: null },
    select: { id: true, name: true, unit: true },
    orderBy: { name: "asc" },
  });

  if (produtos.length === 0) {
    return {
      ok: false,
      resposta: ask(
        "Você ainda não tem produto cadastrado no estoque. Cadastre no painel, em Estoque, e depois me chame.",
      ),
    };
  }

  if (!nome) {
    return {
      ok: false,
      resposta: ask(`Qual produto?\n${produtos.map((p) => `- ${p.name}`).join("\n")}`),
    };
  }

  const alvo = normalizar(nome);
  const exato = produtos.find((p) => normalizar(p.name) === alvo);
  if (exato) return { ok: true, produto: exato };

  const parciais = produtos.filter(
    (p) => normalizar(p.name).includes(alvo) || alvo.includes(normalizar(p.name)),
  );
  if (parciais.length === 1) return { ok: true, produto: parciais[0] };
  if (parciais.length > 1) {
    return {
      ok: false,
      resposta: ask(
        `Tenho mais de um parecido com "${nome}". Qual deles?\n${parciais.map((p) => `- ${p.name}`).join("\n")}`,
      ),
    };
  }

  return {
    ok: false,
    resposta: ask(
      `Não achei "${nome}" no seu estoque. Você tem:\n${produtos.map((p) => `- ${p.name}`).join("\n")}\n\nSe for produto novo, cadastre no painel, em Estoque.`,
    ),
  };
}

function normalizar(termo: string): string {
  return termo
    .toLowerCase()
    .normalize("NFD")
    // Escape explícito, não o caractere combinante cru: ele é invisível no
    // editor e some numa cópia distraída, e aí "ureia" deixa de achar "Ureia".
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * A quantidade dita, conferida contra a unidade do produto.
 *
 * Meia saca existe e meia enxada não (§10.5), e a recusa precisa acontecer
 * ANTES da confirmação: perguntar "confirma 2,5 enxadas?" já é aceitar a
 * premissa errada, e o produtor diria sim.
 */
function lerQuantidade(
  bruto: unknown,
  produto: ProdutoDoCatalogo,
): { ok: true; valor: number } | { ok: false; resposta: RouterResult } {
  const valor = num(bruto);
  if (valor == null || valor <= 0) {
    return {
      ok: false,
      resposta: ask(`Quantas ${plural(produto)} de ${produto.name}?`),
    };
  }

  const unidade = findUnit(produto.unit);
  if (unidade && !unidade.fracionavel && !Number.isInteger(valor)) {
    return {
      ok: false,
      resposta: ask(
        `${produto.name} é contado em ${unidade.plural}, que não aceita quantidade quebrada. Quantas exatamente?`,
      ),
    };
  }

  return { ok: true, valor };
}

function plural(produto: ProdutoDoCatalogo): string {
  return findUnit(produto.unit)?.plural ?? "unidades";
}

/**
 * "Usei 2 sacas de sal no lote do curral" (§10.3).
 *
 * Não pede confirmação: é o gesto mais frequente do módulo, não mexe em
 * dinheiro, e um erro se desfaz contando de novo. Exigir "sim" a cada saca de
 * sal faria o produtor parar de registrar, e estoque que ninguém registra não
 * serve para nada.
 */
export const registrarUsoEstoque: Handler = async ({ db, parameters }) => {
  const produtoResolvido = await resolverProduto(
    db,
    str(parameters.produto) ?? str(parameters.product) ?? str(parameters.item),
  );
  if (!produtoResolvido.ok) return produtoResolvido.resposta;
  const produto = produtoResolvido.produto;

  const quantidade = lerQuantidade(
    parameters.quantidade ?? parameters.quantity ?? parameters.qtd,
    produto,
  );
  if (!quantidade.ok) return quantidade.resposta;

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return fazenda.resposta;

  const data = lerData(parameters, "data", "date", "occurred_at");
  if (data.tipo === "invalida") {
    return ask(`Não entendi a data "${data.bruto}". Pode dizer como 10/12 ou "hoje"?`);
  }

  const resultado = await recordStockMovement(db, {
    product_id: produto.id,
    property_id: fazenda.id,
    movement_type: "utilizacao",
    quantity: quantidade.valor,
    occurred_at: data.tipo === "ok" ? data.data : null,
    purpose: str(parameters.finalidade) ?? str(parameters.purpose) ?? null,
  });
  if (!resultado.ok) return failReply("registrar_uso_estoque", resultado);

  const [posicao] = await getStockBalance(db, {
    product_id: produto.id,
    property_id: fazenda.id,
  });
  const restante = posicao?.quantity ?? 0;

  return {
    reply_text:
      `✅ Anotei: ${descreverQuantidade(quantidade.valor, produto.unit)} de ${produto.name} ` +
      `usadas em ${fazenda.nome}. Restam ${descreverQuantidade(restante, produto.unit)}.`,
    requires_confirmation: false,
    auxiliary_data: { movement_id: resultado.data.id, saldo: restante },
    report_url: null,
    action_taken: "registrar_uso_estoque:ok",
  };
};

/**
 * "Contei e tem só 6 sacas de sal" (§10.6).
 *
 * O produtor informa o que EXISTE; a diferença é conta do sistema. Também não
 * pede confirmação, pelo mesmo motivo do uso, e porque a resposta já mostra a
 * diferença aplicada: se ele errou o número, corrige contando de novo.
 */
export const ajustarEstoque: Handler = async ({ db, parameters }) => {
  const produtoResolvido = await resolverProduto(
    db,
    str(parameters.produto) ?? str(parameters.product) ?? str(parameters.item),
  );
  if (!produtoResolvido.ok) return produtoResolvido.resposta;
  const produto = produtoResolvido.produto;

  const bruto =
    parameters.saldo ?? parameters.quantidade ?? parameters.quantity ?? parameters.corrected_balance;
  const contado = num(bruto);
  if (contado == null || contado < 0) {
    return ask(`Quantas ${plural(produto)} de ${produto.name} você contou?`);
  }
  const unidade = findUnit(produto.unit);
  if (unidade && !unidade.fracionavel && !Number.isInteger(contado)) {
    return ask(
      `${produto.name} é contado em ${unidade.plural}, que não aceita quantidade quebrada. Quantas exatamente?`,
    );
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return fazenda.resposta;

  const resultado = await adjustStock(db, {
    product_id: produto.id,
    property_id: fazenda.id,
    corrected_balance: contado,
    reason: str(parameters.motivo) ?? str(parameters.reason) ?? "Contagem informada pelo WhatsApp",
  });
  if (!resultado.ok) return failReply("ajustar_estoque", resultado);

  const diferenca = resultado.data.diferenca;
  const movimento =
    diferenca > 0
      ? `Somei ${descreverQuantidade(diferenca, produto.unit)}`
      : `Tirei ${descreverQuantidade(Math.abs(diferenca), produto.unit)}`;

  return {
    reply_text:
      `✅ Corrigido: ${produto.name} agora está com ` +
      `${descreverQuantidade(contado, produto.unit)} em ${fazenda.nome}. ${movimento}.`,
    requires_confirmation: false,
    auxiliary_data: { movement_id: resultado.data.id, diferenca },
    report_url: null,
    action_taken: "ajustar_estoque:ok",
  };
};

/** "Quanto tenho de sal?" e "o que está acabando?" (§10.2 e §10.8). */
export const consultarEstoque: Handler = async ({ db, parameters }) => {
  const nome = str(parameters.produto) ?? str(parameters.product) ?? str(parameters.item);
  const produtos = await listProductsWithBalance(db);

  if (produtos.length === 0) {
    return responder(
      "Você ainda não tem produto cadastrado no estoque. Cadastre no painel, em Estoque.",
      "consultar_estoque:vazio",
    );
  }

  if (nome) {
    const resolvido = await resolverProduto(db, nome);
    if (!resolvido.ok) return resolvido.resposta;
    const p = produtos.find((x) => x.id === resolvido.produto.id);
    if (!p) {
      return responder(
        `${resolvido.produto.name} ainda não teve nenhuma movimentação.`,
        "consultar_estoque:sem_movimento",
      );
    }
    const alerta = p.abaixo_do_minimo && p.minimum_stock != null
      ? ` (seu mínimo é ${descreverQuantidade(p.minimum_stock, p.unit)})`
      : "";
    return responder(
      `📦 ${p.name}: ${descreverQuantidade(p.saldo_total, p.unit)}${alerta}.`,
      "consultar_estoque:ok",
    );
  }

  const acabando = produtos.filter((p) => p.abaixo_do_minimo);
  const comSaldo = produtos.filter((p) => p.saldo_total > 0);

  // Sem produto citado, a resposta é o que ele precisa saber, não o catálogo
  // inteiro: uma lista de 40 linhas no WhatsApp não é resposta, é despejo.
  const linhas = (acabando.length > 0 ? acabando : comSaldo)
    .slice(0, 10)
    .map((p) => `- ${p.name}: ${descreverQuantidade(p.saldo_total, p.unit)}`)
    .join("\n");

  if (acabando.length > 0) {
    return responder(
      `📦 Precisa repor:\n${linhas}` +
        (acabando.length > 10 ? `\n...e mais ${acabando.length - 10}.` : ""),
      "consultar_estoque:acabando",
    );
  }
  if (comSaldo.length === 0) {
    return responder("Seu estoque está zerado em todos os produtos.", "consultar_estoque:zerado");
  }
  return responder(
    `📦 No estoque:\n${linhas}` +
      (comSaldo.length > 10 ? `\n...e mais ${comSaldo.length - 10}.` : ""),
    "consultar_estoque:ok",
  );
};

function responder(texto: string, acao: string): RouterResult {
  return {
    reply_text: texto,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: acao,
  };
}

const TIPOS: Record<string, "compra_produto" | "venda_produto"> = {
  compra: "compra_produto",
  compra_produto: "compra_produto",
  comprei: "compra_produto",
  venda: "venda_produto",
  venda_produto: "venda_produto",
  vendi: "venda_produto",
};

/**
 * "Comprei 10 sacas de sal do Zé por 1200, para pagar dia 10" (§9).
 *
 * Mesmo envelope, mesma confirmação obrigatória e mesmas regras de parcela e
 * custo do negócio de gado. A diferença é só o que entra no estoque em vez do
 * rebanho, e é por isso que os leitores de dinheiro, data e parcela vêm de
 * `parsers.ts`, compartilhados: "60 mil" precisa significar a mesma coisa nas
 * duas conversas.
 *
 * NÃO usa o pendente de conversa do negócio de gado. Uma compra de insumo tem
 * menos campos (não tem categoria, pasto nem situação), e reaproveitar a
 * máquina de perguntas do gado traria de volta o risco que ela existe para
 * conter: uma resposta curta caindo no fluxo errado. Aqui o que falta é
 * perguntado direto, e o produtor repete a frase inteira, que é curta.
 */
export const registrarNegocioProduto: Handler = async ({
  db,
  parameters,
  confirmed,
  explicitNo,
}) => {
  // "não"/"cancela" vence tudo e é a PRIMEIRA coisa checada, como no gado:
  // sem isso, qualquer pergunta de esclarecimento retorna antes e o produtor
  // vê a mesma pergunta de novo sem nada ter sido cancelado.
  if (explicitNo) {
    return responder("Ok, não registrei nada.", "registrar_negocio_produto:cancelado");
  }

  const tipoBruto = (str(parameters.tipo) ?? str(parameters.type) ?? "").toLowerCase();
  const tipo = TIPOS[tipoBruto];
  if (!tipo) {
    return ask("Você comprou ou vendeu esse produto?");
  }
  const compra = tipo === "compra_produto";

  const produtoResolvido = await resolverProduto(
    db,
    str(parameters.produto) ?? str(parameters.product) ?? str(parameters.item),
  );
  if (!produtoResolvido.ok) return produtoResolvido.resposta;
  const produto = produtoResolvido.produto;

  const quantidade = lerQuantidade(
    parameters.quantidade ?? parameters.quantity ?? parameters.qtd,
    produto,
  );
  if (!quantidade.ok) return quantidade.resposta;

  const valor = lerDinheiro(parameters, "valor", "amount", "valor_total", "preco");
  if (valor == null || valor <= 0) {
    return ask(
      compra
        ? `Por quanto você comprou ${descreverQuantidade(quantidade.valor, produto.unit)} de ${produto.name}?`
        : `Por quanto você vendeu ${descreverQuantidade(quantidade.valor, produto.unit)} de ${produto.name}?`,
    );
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return fazenda.resposta;

  const dataNegocio = lerData(parameters, "data", "date", "occurred_at");
  if (dataNegocio.tipo === "invalida") {
    return ask(`Não entendi a data "${dataNegocio.bruto}". Pode dizer como 10/12 ou "hoje"?`);
  }
  const occurredAt = dataNegocio.tipo === "ok" ? dataNegocio.data : new Date();

  const vencimento = lerData(parameters, "vencimento", "due_date");
  if (vencimento.tipo === "invalida") {
    return ask(`Não entendi o vencimento "${vencimento.bruto}". Pode dizer como 10/12 ou "dia 10"?`);
  }

  const pago = interpretarSim(parameters.pago ?? parameters.paid);
  const quantasParcelas = extrairNumeroDeParcelas(
    parameters.parcelas ?? parameters.installments ?? parameters.parcelamento,
  );
  const custos = custosDosParametros(parameters);

  // "Já paguei" e "vou parcelar em 3x" não podem valer ao mesmo tempo. A
  // action recusaria, mas a pergunta aqui é melhor que o erro depois da
  // confirmação: o produtor ainda está com a frase na cabeça.
  if (pago && quantasParcelas != null && quantasParcelas > 1) {
    return ask("Você já pagou ou vai parcelar? Uma coisa ou outra.");
  }

  const parcelas =
    !pago && quantasParcelas != null && quantasParcelas > 1
      ? montarParcelas(
          valor,
          quantasParcelas,
          occurredAt,
          vencimento.tipo === "ok" ? vencimento.data : null,
        )
      : [];

  const totalCustos = custos.reduce((s, c) => s + c.valor, 0);
  const descricaoCustos =
    custos.length > 0
      ? `\nCustos: ${custos.map((c) => `${c.descricao} ${reais(c.valor)}`).join(", ")}`
      : "";
  const descricaoPagamento = pago
    ? "\nJá pago."
    : parcelas.length > 0
      ? `\nEm ${parcelas.length}x de ${reais(parcelas[0].amount)}, a primeira em ${parcelas[0].due_date.toLocaleDateString("pt-BR")}.`
      : vencimento.tipo === "ok"
        ? `\nA ${compra ? "pagar" : "receber"} em ${vencimento.data.toLocaleDateString("pt-BR")}.`
        : `\nA ${compra ? "pagar" : "receber"}, sem data informada (vou lançar para hoje).`;

  if (!confirmed) {
    return {
      reply_text:
        `Confirma?\n${compra ? "Compra" : "Venda"} de ` +
        `${descreverQuantidade(quantidade.valor, produto.unit)} de ${produto.name} ` +
        `por ${reais(valor)}${totalCustos > 0 ? ` mais ${reais(totalCustos)} de custos` : ""}, ` +
        `em ${fazenda.nome}.${descricaoCustos}${descricaoPagamento}`,
      requires_confirmation: true,
      // O pedido inteiro viaja no auxiliary: o "sim" executa o que foi
      // MOSTRADO, nunca o que o classificador remontar da própria resposta do
      // assistente. Confirmação sem âncora é assinatura em papel em branco.
      auxiliary_data: {
        intent: "registrar_negocio_produto",
        parameters,
      },
      report_url: null,
      action_taken: "registrar_negocio_produto:aguardando_confirmacao",
    };
  }

  const resultado = await createProductNegotiation(db, {
    type: tipo,
    property_id: fazenda.id,
    itens: [{ product_id: produto.id, quantity: quantidade.valor }],
    amount: valor,
    contact_name: str(parameters.contato) ?? str(parameters.contact_name) ?? null,
    occurred_at: occurredAt,
    pago,
    due_date: vencimento.tipo === "ok" ? vencimento.data : null,
    parcelas: parcelas.map((p) => ({ due_date: p.due_date, amount: p.amount })),
    custos: custos.map((c) => ({ descricao: c.descricao, amount: c.valor })),
    notes: str(parameters.observacao) ?? str(parameters.notes) ?? null,
  });
  if (!resultado.ok) return failReply("registrar_negocio_produto", resultado);

  const [posicao] = await getStockBalance(db, {
    product_id: produto.id,
    property_id: fazenda.id,
  });

  return {
    reply_text:
      `✅ Registrado: ${compra ? "compra" : "venda"} de ` +
      `${descreverQuantidade(quantidade.valor, produto.unit)} de ${produto.name} ` +
      `por ${reais(valor)}. Estoque agora: ${descreverQuantidade(posicao?.quantity ?? 0, produto.unit)}.`,
    requires_confirmation: false,
    auxiliary_data: { negotiation_id: resultado.data.id },
    report_url: null,
    action_taken: "registrar_negocio_produto:ok",
  };
};
