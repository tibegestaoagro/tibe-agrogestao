import type { HerdCategory } from "@/lib/herd/categories";
import { createCattleNegotiation } from "@/lib/actions/negotiations";
import {
  savePendingNegotiation,
  loadPendingNegotiation,
  clearPendingNegotiation,
  aplicarRespostaNegocio,
  MAX_TENTATIVAS,
  type CampoNegocio,
} from "@/lib/actions/negotiation-pending";
import { itensDosParametros, resolverCategoria, resolverFazenda } from "./herd";
import { ask, failReply, str, num, type Handler, type RouterResult } from "./shared";

/**
 * Registro de negócio de gado pelo WhatsApp (Módulo 31, §22).
 *
 * A promessa do módulo é que o produtor conte o negócio UMA vez e o rebanho, o
 * financeiro e o histórico se atualizem sozinhos. Pela conversa isso vale
 * dobrado: no curral ninguém abre painel.
 *
 * TRÊS REGRAS QUE NÃO PODEM AFROUXAR, todas herdadas de defeitos reais do
 * Módulo 30 e válidas aqui com mais peso, porque um negócio grava animais E
 * dinheiro numa tacada:
 *
 * 1. "não"/"cancela" vence tudo e é a PRIMEIRA coisa checada. Antes disso
 *    ficar no topo, no rebanho, qualquer pergunta de esclarecimento retornava
 *    primeiro e o produtor via a mesma pergunta de novo sem nada ser
 *    cancelado.
 * 2. Confirmação é sempre obrigatória, independente do valor: não usa
 *    `CONFIRMATION_THRESHOLD`. Um negócio de R$ 500 lançado errado suja o
 *    rebanho e o contas a pagar do mesmo jeito que um de R$ 50.000, e desfazer
 *    exige cancelar a negociação inteira.
 * 3. O "sim" executa o que foi MOSTRADO, lido do pedido guardado, nunca o que
 *    o classificador remontou da própria resposta do assistente. Sem âncora,
 *    confirmação é assinatura em papel em branco.
 */

const TIPOS: Record<string, "compra_gado" | "venda_gado"> = {
  compra: "compra_gado",
  compra_gado: "compra_gado",
  comprei: "compra_gado",
  venda: "venda_gado",
  venda_gado: "venda_gado",
  vendi: "venda_gado",
};

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function descreverItens(itens: { categoria: HerdCategory; quantidade: number }[]): string {
  return itens
    .map((i) => `${i.quantidade} ${i.quantidade === 1 ? i.categoria.label : i.categoria.plural}`)
    .join(" e ");
}

type CustoLido = { descricao: string; valor: number };

/**
 * Custos adicionais (§15): frete, comissão, taxas. Aceita a lista estruturada
 * e também os campos planos que o classificador produz quando a mensagem cita
 * um custo só ("com 2 mil de frete").
 */
function custosDosParametros(parameters: Record<string, unknown>): CustoLido[] {
  const saida: CustoLido[] = [];
  const brutos = parameters.custos;
  if (Array.isArray(brutos)) {
    for (const bruto of brutos) {
      if (typeof bruto !== "object" || bruto === null) continue;
      const registro = bruto as Record<string, unknown>;
      const valor = num(registro.valor) ?? num(registro.amount);
      const descricao = str(registro.descricao) ?? str(registro.description) ?? "Custo adicional";
      if (valor != null && valor > 0) saida.push({ descricao, valor });
    }
    if (saida.length > 0) return saida;
  }
  for (const [campo, rotulo] of [
    ["frete", "Frete"],
    ["comissao", "Comissão"],
    ["taxa", "Taxa"],
  ] as const) {
    const valor = num(parameters[campo]);
    if (valor != null && valor > 0) saida.push({ descricao: rotulo, valor });
  }
  return saida;
}

/**
 * Parcelas (§14). Só o número de parcelas é aceito da conversa: pedir datas
 * uma a uma por WhatsApp seria pior que abrir o painel. As datas saem daí, uma
 * por mês, e a última parcela absorve o centavo da divisão para a soma bater
 * exatamente com o valor combinado, que é o que a action exige.
 */
function montarParcelas(total: number, quantas: number, base: Date) {
  const centavos = Math.round(total * 100);
  const fatia = Math.floor(centavos / quantas);
  const parcelas: { amount: number; due_date: Date }[] = [];
  for (let i = 0; i < quantas; i++) {
    const venc = new Date(base);
    venc.setMonth(venc.getMonth() + i + 1);
    const valorCentavos = i === quantas - 1 ? centavos - fatia * (quantas - 1) : fatia;
    parcelas.push({ amount: valorCentavos / 100, due_date: venc });
  }
  return parcelas;
}

export const registrarNegocioGado: Handler = async ({
  db,
  tenant_id,
  user_id,
  parameters: parametrosDaMensagem,
  confirmed,
  explicitNo,
}) => {
  const intent = "registrar_negocio_gado";
  const temMemoria = !!user_id;

  // Regra 1: recusa vence tudo, e vem primeiro.
  if (explicitNo) {
    if (temMemoria) await clearPendingNegotiation(tenant_id, user_id!);
    return {
      reply_text: "Tudo bem, não registrei nada.",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${intent}:cancelado`,
    };
  }

  let parameters = parametrosDaMensagem;
  let confirmado = confirmed;
  const pendente = temMemoria ? await loadPendingNegotiation(tenant_id, user_id!) : null;

  // Regra 3: o "sim" só vale para o que foi mostrado.
  if (temMemoria && confirmed) {
    if (pendente?.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else if (pendente) {
      // Há pendência, mas de um CAMPO: o produtor está respondendo a pergunta,
      // não confirmando. Ninguém confirma o que ainda não viu.
      confirmado = false;
    } else {
      return ask(
        "Não tenho nenhum negócio esperando confirmação. Me conte de novo o que você comprou ou vendeu.",
      );
    }
  }

  if (pendente && pendente.aguardando !== "confirmacao") {
    const juntado = aplicarRespostaNegocio(pendente, parametrosDaMensagem);
    if (juntado) parameters = juntado;
    // Quando não é resposta, o pendente NÃO é apagado: apagar zerava o contador
    // e a trava de laço nunca disparava. Ele morre por TTL, sucesso ou recusa.
  }

  const perguntar = async (resposta: RouterResult, campo: CampoNegocio): Promise<RouterResult> => {
    if (!temMemoria) return resposta;

    const tentativas = pendente?.aguardando === campo ? (pendente.tentativas ?? 1) + 1 : 1;
    if (tentativas >= MAX_TENTATIVAS) {
      await clearPendingNegotiation(tenant_id, user_id!);
      return ask(
        "Não estou conseguindo entender essa parte. Tente mandar tudo numa frase só, " +
          'por exemplo: "comprei 20 bezerros do João por 60 mil em 3 vezes".',
      );
    }

    await savePendingNegotiation(tenant_id, user_id!, { parameters, aguardando: campo, tentativas });
    return resposta;
  };

  // --- o que foi negociado -------------------------------------------------

  const tipoBruto = (str(parameters.tipo) ?? str(parameters.negotiation_type) ?? "").toLowerCase();
  const type = TIPOS[tipoBruto];
  if (!type) {
    return perguntar(ask("Foi uma compra ou uma venda de animais?"), "tipo");
  }
  const compra = type === "compra_gado";

  const itensBrutos = itensDosParametros(parameters);
  if (itensBrutos.length === 0) {
    return perguntar(ask("Quantos animais e de qual categoria?"), "categoria");
  }
  for (const item of itensBrutos) {
    if (!Number.isInteger(item.quantidade) || item.quantidade <= 0) {
      return perguntar(ask("A quantidade precisa ser um número inteiro maior que zero."), "quantidade");
    }
  }

  // Mesma regra do rebanho: termo ambíguo interrompe TUDO e vira pergunta.
  // Resolver os outros itens daria a impressão de que já registrou.
  const itens: { categoria: HerdCategory; quantidade: number }[] = [];
  for (const item of itensBrutos) {
    const resolvida = resolverCategoria(item.categoria);
    if (!resolvida.ok) return perguntar(resolvida.resposta, "categoria");
    itens.push({ categoria: resolvida.categoria, quantidade: item.quantidade });
  }

  const valor = num(parameters.valor) ?? num(parameters.amount) ?? num(parameters.valor_total);
  if (valor == null || valor <= 0) {
    return perguntar(
      ask(compra ? "Por quanto você comprou?" : "Por quanto você vendeu?"),
      "valor",
    );
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return perguntar(fazenda.resposta, "fazenda");

  // --- como foi pago -------------------------------------------------------

  const custos = custosDosParametros(parameters);
  const totalCustos = custos.reduce((s, c) => s + c.valor, 0);
  const parcelasPedidas = num(parameters.parcelas) ?? num(parameters.installments);
  const quantasParcelas =
    parcelasPedidas != null && Number.isInteger(parcelasPedidas) && parcelasPedidas > 1
      ? parcelasPedidas
      : null;
  // §6.3 e §7.3: "o pagamento já foi feito?". Sem parcelamento e sem alguém
  // dizer que pagou, o negócio nasce pendente, que é o caso comum de curral.
  const pago = parameters.pago === true && !quantasParcelas;

  const quando = new Date();

  // --- regra 2: confirmar sempre, mostrando o que vai ser escrito ----------

  if (!confirmado) {
    const linhas = [
      compra
        ? `Comprar ${descreverItens(itens)} por ${reais(valor)}?`
        : `Vender ${descreverItens(itens)} por ${reais(valor)}?`,
      `Fazenda: ${fazenda.nome}`,
    ];
    for (const c of custos) linhas.push(`${c.descricao}: ${reais(c.valor)}`);
    if (totalCustos > 0) {
      linhas.push(
        compra
          ? `Custo total da compra: ${reais(valor + totalCustos)}`
          : `Valor líquido da venda: ${reais(valor - totalCustos)}`,
      );
    }
    if (quantasParcelas) {
      linhas.push(`Em ${quantasParcelas}x de ${reais(valor / quantasParcelas)}, a partir do mês que vem`);
    } else {
      linhas.push(pago ? "Pagamento: já foi feito" : "Pagamento: ainda em aberto");
    }
    linhas.push(
      compra
        ? "Vou somar os animais ao rebanho e lançar no financeiro."
        : "Vou baixar os animais do rebanho e lançar no financeiro.",
    );

    if (temMemoria) {
      await savePendingNegotiation(tenant_id, user_id!, {
        parameters,
        aguardando: "confirmacao",
      });
    }
    return {
      reply_text: linhas.join("\n"),
      requires_confirmation: true,
      auxiliary_data: { tipo: type, fazenda: fazenda.nome, valor },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  // --- grava ---------------------------------------------------------------

  const resultado = await createCattleNegotiation(db, {
    type,
    property_id: fazenda.id,
    itens: itens.map((i) => ({ category_id: i.categoria.id, quantity: i.quantidade })),
    amount: valor,
    pago,
    parcelas: quantasParcelas ? montarParcelas(valor, quantasParcelas, quando) : undefined,
    custos: custos.length > 0 ? custos.map((c) => ({ descricao: c.descricao, amount: c.valor })) : undefined,
    occurred_at: quando,
    recorded_by_user_id: user_id ?? null,
  });

  if (temMemoria) await clearPendingNegotiation(tenant_id, user_id!);
  if (!resultado.ok) return failReply(intent, resultado);

  const partes = [
    compra
      ? `✅ Compra registrada: ${descreverItens(itens)} por ${reais(valor)}.`
      : `✅ Venda registrada: ${descreverItens(itens)} por ${reais(valor)}.`,
  ];
  partes.push(compra ? "Os animais entraram no rebanho." : "Os animais saíram do rebanho.");
  if (quantasParcelas) {
    partes.push(`${quantasParcelas} parcelas lançadas no financeiro.`);
  } else if (!pago) {
    partes.push(compra ? "Lancei como conta a pagar." : "Lancei como conta a receber.");
  }
  if (totalCustos > 0) partes.push(`Custos adicionais: ${reais(totalCustos)}.`);

  return {
    reply_text: partes.join(" "),
    requires_confirmation: false,
    auxiliary_data: { negotiation_id: resultado.data.id },
    report_url: null,
    action_taken: `${intent}:${type}`,
  };
};

/** Reexportado para o teste conseguir conferir a divisão das parcelas. */
export const _montarParcelas = montarParcelas;

/** Reexportado para o teste: a leitura de custos tem duas formas de entrada. */
export const _custosDosParametros = custosDosParametros;
