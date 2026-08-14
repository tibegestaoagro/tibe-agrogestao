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
import {
  itensDosParametros,
  resolverCategoria,
  resolverFazenda,
  resolverPasto,
  conferirOndeEstaOSaldo,
  nomeDaCategoria,
} from "./herd";
import { ask, failReply, str, num, type Handler, type RouterResult } from "./shared";

/**
 * Registro de negócio de gado pelo WhatsApp (Módulo 31, §18).
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

/**
 * O nome da categoria dentro de frase.
 *
 * Nunca o `label` ("Bezerro - 0 a 7 meses"): ele fica estranho no meio de uma
 * pergunta, e "Comprar 1 Bezerro - 0 a 7 meses por R$ 500,00?" é exatamente o
 * que o §2 pede para não parecer sistema contábil.
 *
 * Para uma cabeça só, o plural também não serve: "1 bezerros" está errado em
 * português e o produtor lê isso. `nomeDaCategoria` vive no handler de rebanho
 * e é importado aqui de propósito: o produtor lê os dois na mesma conversa, e
 * duas grafias para a mesma categoria pareceriam dois sistemas falando.
 */
function descreverItens(itens: { categoria: HerdCategory; quantidade: number }[]): string {
  return itens.map((i) => `${i.quantidade} ${nomeDaCategoria(i.categoria, i.quantidade)}`).join(" e ");
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
  /**
   * Os oito custos nomeados no §15, mais dois que aparecem na prática (vacinas
   * e pedágio) e o `outros` que o próprio parágrafo prevê.
   *
   * Uma versão anterior dizia "a lista do §15, inteira" e faltavam
   * DESCARREGAMENTO e TAXA DE FEIRA, ou seja, o comentário afirmava ter
   * corrigido o sumiço silencioso enquanto dois itens continuavam sumindo.
   */
  for (const [campo, rotulo] of [
    ["frete", "Frete"],
    ["comissao", "Comissão"],
    ["taxa", "Taxa"],
    ["taxa_leilao", "Taxa de leilão"],
    ["taxa_feira", "Taxa de feira"],
    ["carregamento", "Carregamento"],
    ["descarregamento", "Descarregamento"],
    ["guia", "Guia de transporte"],
    ["guia_transporte", "Guia de transporte"],
    ["exames", "Exames"],
    ["vacinas", "Vacinas"],
    ["pedagio", "Pedágio"],
    ["outros", "Outros custos"],
  ] as const) {
    const valor = num(parameters[campo]);
    if (valor != null && valor > 0) saida.push({ descricao: rotulo, valor });
  }
  return saida;
}

/**
 * Lê uma data dita na conversa.
 *
 * Aceita o que o produtor fala, não só o que o classificador idealmente
 * emitiria: ISO (`2026-12-10`), brasileiro (`10/12/2026` e `10/12`), o dia
 * sozinho do §18.1 ("para pagar dia 10") e as palavras "hoje" e "ontem".
 *
 * Uma versão anterior fazia só `new Date(bruto.slice(0,10) + "T12:00:00")` e
 * devolvia `null` em silêncio para tudo que não fosse ISO. Na prática isso
 * significava que "para pagar dia 10", o exemplo-bandeira do documento do
 * cliente, só virava vencimento se o modelo acertasse o formato: a informação
 * mais importante da frase dependia do LLM acertar o formato, sem nenhuma
 * trava em código: é o tipo de regra que este projeto não aceita deixar só no
 * prompt, porque prompt muda sem quebrar teste nenhum.
 *
 * Devolve `"invalida"` quando havia algo escrito e não deu para entender, para
 * o chamador PERGUNTAR em vez de descartar calado. Mesma escolha do handler de
 * rebanho.
 */
type DataLida = { tipo: "vazio" } | { tipo: "ok"; data: Date } | { tipo: "invalida"; bruto: string };

function lerData(parameters: Record<string, unknown>, ...campos: string[]): DataLida {
  for (const campo of campos) {
    const bruto = str(parameters[campo]);
    if (!bruto) continue;
    const data = interpretarData(bruto);
    if (data) return { tipo: "ok", data };
    return { tipo: "invalida", bruto };
  }
  return { tipo: "vazio" };
}

/** Meio-dia em toda data: evita o pulo de um dia por fuso. */
function aoMeioDia(ano: number, mes: number, dia: number): Date {
  return new Date(ano, mes, dia, 12, 0, 0);
}

function interpretarData(bruto: string, hoje = new Date()): Date | null {
  const texto = bruto.trim().toLowerCase();

  if (texto === "hoje") return aoMeioDia(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (texto === "ontem") {
    const d = aoMeioDia(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    d.setDate(d.getDate() - 1);
    return d;
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    // Mesma conferência de ida e volta do ramo brasileiro, abaixo: sem ela,
    // "2026-02-31" virava 03/03/2026 em silêncio. É o caso 5.3 do roteiro de
    // aparelho ("trinta e um de fevereiro"), e depender da confirmação
    // impressa para o produtor notar não é trava.
    const mes = Number(iso[2]) - 1;
    const dia = Number(iso[3]);
    const d = aoMeioDia(Number(iso[1]), mes, dia);
    return d.getMonth() === mes && d.getDate() === dia ? d : null;
  }

  const br = texto.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (br) {
    const dia = Number(br[1]);
    const mes = Number(br[2]) - 1;
    const anoBruto = br[3] ? Number(br[3]) : hoje.getFullYear();
    const ano = anoBruto < 100 ? 2000 + anoBruto : anoBruto;
    const d = aoMeioDia(ano, mes, dia);
    return d.getMonth() === mes && d.getDate() === dia ? d : null;
  }

  /**
   * Só o dia ("dia 10"), a forma do §18.1. É SEMPRE o mês corrente, mesmo que
   * o dia já tenha passado.
   *
   * Uma versão anterior empurrava para o mês seguinte quando o dia já tinha
   * passado, imitando o que se faz num balcão. Decisão do usuário, 2026-08-13,
   * e ele tem razão: se hoje é 13 e o vencimento é dia 10, isso é uma conta
   * VENCIDA, e o produtor precisa vê-la como vencida. Empurrar para o mês que
   * vem esconderia um atraso real e tiraria o lançamento do mês a que ele
   * pertence, sujando o fechamento dos dois meses.
   */
  const soDia = texto.match(/^(?:dia\s+)?(\d{1,2})$/);
  if (soDia) {
    const dia = Number(soDia[1]);
    if (dia < 1 || dia > 31) return null;
    const d = aoMeioDia(hoje.getFullYear(), hoje.getMonth(), dia);
    return d.getDate() === dia ? d : null;
  }

  return null;
}

/**
 * Dinheiro dito na conversa.
 *
 * `num("60.000")` devolve 60, porque em JavaScript o ponto é separador
 * decimal: uma compra de sessenta mil viraria sessenta reais. O que salvava
 * até aqui era a confirmação obrigatória imprimindo o valor antes de gravar,
 * mas depender de o produtor conferir não é trava. Dinheiro era o último campo
 * do handler que ainda confiava no formato do LLM, enquanto data, parcelamento
 * e "pago" já tinham leitor próprio.
 *
 * Aceita número puro, "60000", "60.000", "60.000,50" e "60000.50".
 */
function lerDinheiro(parameters: Record<string, unknown>, ...campos: string[]): number | null {
  for (const campo of campos) {
    const bruto = parameters[campo];
    if (typeof bruto === "number" && Number.isFinite(bruto)) return bruto;
    if (typeof bruto !== "string" || bruto.trim() === "") continue;

    const texto = bruto.trim().replace(/r\$\s*/i, "");
    // Vírgula presente: formato brasileiro, ponto é milhar.
    // Sem vírgula: ponto SÓ é decimal quando sobram 1 ou 2 casas no fim.
    const normalizado = texto.includes(",")
      ? texto.replace(/\./g, "").replace(",", ".")
      : /\.\d{1,2}$/.test(texto)
        ? texto
        : texto.replace(/\./g, "");
    const n = Number(normalizado);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * "3x", "3 vezes", "em tres vezes": o modelo repassa o que o produtor falou.
 * Devolve `null` quando não há número nenhum, e aí o chamador PERGUNTA.
 */
function extrairNumeroDeParcelas(bruto: unknown): number | null {
  if (typeof bruto !== "string") return null;
  const achado = bruto.match(/(\d{1,2})/);
  if (!achado) return null;
  const n = Number(achado[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * `pago` chega como booleano quando o classificador colabora e como "sim" /
 * "já paguei" quando ele repassa a fala. Só o `true` explícito valia, e um
 * "sim" virava conta em aberto sem ninguém notar.
 */
function interpretarSim(bruto: unknown): boolean {
  if (bruto === true) return true;
  if (typeof bruto !== "string") return false;
  const texto = bruto.trim().toLowerCase();
  return ["sim", "s", "ja paguei", "já paguei", "pago", "paguei", "true"].includes(texto);
}

/**
 * Parcelas (§14). Só o número de parcelas é aceito da conversa: pedir datas uma
 * a uma por WhatsApp seria pior que abrir o painel. As datas saem daí, uma por
 * mês, e a última parcela absorve o centavo da divisão para a soma bater
 * exatamente com o valor combinado, que é o que a action exige.
 *
 * `primeiroVencimento` é o vencimento que o produtor disse ("para pagar dia
 * 10"). Quando ele existe, é a data da PRIMEIRA parcela, e as outras contam a
 * partir dela: o §6.3 pede vencimento e número de parcelas na mesma frase, e
 * antes disso o vencimento dito era lido e depois descartado, com as parcelas
 * contando da data do negócio.
 */
function montarParcelas(
  total: number,
  quantas: number,
  base: Date,
  primeiroVencimento?: Date | null,
) {
  const centavos = Math.round(total * 100);
  const fatia = Math.floor(centavos / quantas);
  const inicio = primeiroVencimento ?? somarMeses(base, 1);
  const parcelas: { amount: number; due_date: Date }[] = [];
  for (let i = 0; i < quantas; i++) {
    parcelas.push({
      amount: (i === quantas - 1 ? centavos - fatia * (quantas - 1) : fatia) / 100,
      due_date: i === 0 ? inicio : somarMeses(inicio, i),
    });
  }
  return parcelas;
}

/**
 * Soma meses SEM pular para o mês seguinte. `setMonth` faz 31/01 + 1 virar
 * 03/03, porque fevereiro não tem 31 dias: a parcela de fevereiro apareceria em
 * março e o produtor cobraria uma conta que o sistema mostrou na data errada.
 * Quando o dia não existe no mês de destino, cai no último dia do mês.
 */
function somarMeses(base: Date, meses: number): Date {
  const ano = base.getFullYear();
  const mes = base.getMonth() + meses;
  const ultimoDiaDoMesDestino = new Date(ano, mes + 1, 0).getDate();
  return new Date(
    ano,
    mes,
    Math.min(base.getDate(), ultimoDiaDoMesDestino),
    12,
    0,
    0,
  );
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
  if (confirmed) {
    if (!temMemoria) {
      /**
       * SEM USUÁRIO RESOLVIDO, NÃO ESCREVE. Não há onde guardar o que foi
       * mostrado, então não há como saber se o "sim" se refere a isto.
       *
       * Esta guarda estava dentro do `temMemoria` e por isso não existia: uma
       * chamada sem `user_id` caía direto na gravação com o que o
       * classificador tinha remontado, mexendo em rebanho E financeiro sem
       * âncora nenhuma. Era exatamente a "assinatura em papel em branco" que o
       * cabeçalho deste arquivo diz proibir, no caminho em que ninguém olhava.
       */
      return ask(
        "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
          "Me conte de novo o que você comprou ou vendeu.",
      );
    }
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

  if (pendente?.aguardando === "pagamento") {
    /**
     * Única mesclagem que REMOVE um campo: ver o comentário da contradição,
     * abaixo. E o `else` no fim é obrigatório.
     *
     * Sem ele, uma resposta que não casasse com nenhum dos dois ramos ("a
     * prazo", "ainda não") deixava `parameters` valendo só a mensagem nova: os
     * animais, o valor, o vendedor e a data sumiam de uma vez, e o assistente
     * recomeçava do zero com o contador de tentativas limpo, sem nem cair na
     * trava de laço. O ramo criado para tornar a pergunta respondível abria um
     * caminho de perda silenciosa, que é o defeito que este arquivo mais
     * combate.
     */
    const dito = (
      str(parametrosDaMensagem.pagamento) ??
      str(parametrosDaMensagem.pago) ??
      str(parametrosDaMensagem.resposta) ??
      ""
    ).toLowerCase();
    const disseQuePagou =
      interpretarSim(parametrosDaMensagem.pago) || /pago|paguei|vista/.test(dito);
    const disseQueParcela =
      /parcel|vezes|prazo|\dx/.test(dito) || parametrosDaMensagem.parcelas != null;

    if (disseQuePagou && !disseQueParcela) {
      parameters = { ...pendente.parameters, pago: true };
      delete parameters.parcelas;
      delete parameters.installments;
    } else if (disseQueParcela) {
      parameters = { ...pendente.parameters, ...parametrosDaMensagem, pago: false };
      delete parameters.pago;
    } else {
      // Não deu para entender: o pendente continua valendo INTEIRO, e a
      // pergunta se repete até a trava de laço, que é o comportamento certo.
      parameters = { ...pendente.parameters, ...parametrosDaMensagem };
    }
  } else if (pendente && pendente.aguardando !== "confirmacao") {
    const juntado = aplicarRespostaNegocio(pendente, parametrosDaMensagem);
    if (juntado) {
      parameters = juntado;
    } else {
      /**
       * A mensagem não responde ao que foi perguntado, mas o que já foi
       * coletado continua valendo: o que a mensagem nova traz entra POR CIMA do
       * acumulado, nunca no lugar dele.
       *
       * Antes ficava só a mensagem nova, e `perguntar()` salvava esse conjunto
       * empobrecido por cima do pendente: quem dissesse "comprei 20 bezerros",
       * ouvisse "por quanto?" e respondesse "do João" perdia os 20 bezerros e
       * voltava para a primeira pergunta.
       */
      parameters = { ...pendente.parameters, ...parametrosDaMensagem };
    }
    // O pendente NÃO é apagado aqui: apagar zerava o contador e a trava de laço
    // nunca disparava. Ele morre por TTL, sucesso ou recusa.
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

  // `movement_type` entra aqui porque é o campo que `desempatarIntencao` usa
  // para converter uma movimentação de rebanho em negócio. Sem lê-lo, a
  // informação que decidiu o roteamento era jogada fora e o assistente
  // perguntava "foi uma compra ou uma venda?" logo depois de "comprei 20
  // bezerros por 60 mil": a mesma família da pergunta repetida que custou uma
  // rodada no Módulo 30.
  const tipoBruto = (
    str(parameters.tipo) ??
    str(parameters.negotiation_type) ??
    str(parameters.movement_type) ??
    ""
  ).toLowerCase();
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

  const valor = lerDinheiro(parameters, "valor", "amount", "valor_total");
  if (valor == null || valor <= 0) {
    return perguntar(
      ask(compra ? "Por quanto você comprou?" : "Por quanto você vendeu?"),
      "valor",
    );
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return perguntar(fazenda.resposta, "fazenda");

  /**
   * §6.2 e §7.2 pedem pasto de destino e de origem. Sem ler o pasto, a pergunta
   * "você tem 45 no Pasto da Baixada, registro por lá?" não tinha resposta
   * possível: qualquer coisa que o produtor dissesse voltava ao mesmo ponto até
   * o assistente desistir. Agora a resposta entra, e o negócio grava na posição
   * certa.
   */
  const pasto = await resolverPasto(
    db,
    fazenda.id,
    str(parameters.pasto) ?? str(parameters.pasto_origem) ?? str(parameters.pasture),
  );
  if (!pasto.ok) return perguntar(pasto.resposta, "pasto");

  /**
   * NUMA VENDA, CONFERIR ONDE O SALDO ESTÁ, ANTES DE PEDIR CONFIRMAÇÃO.
   *
   * A venda procura na posição `(categoria, fazenda, pasto=null)`, porque a
   * conversa não fala de pasto. Quem lançou o rebanho por pasto tem o saldo em
   * `(categoria, fazenda, pasto=P)`, e a busca acha zero: o produtor com 45
   * cabeças no pasto ouvia "existem apenas 0 animais". O rebanho já tinha
   * corrigido isso (achado em teste real, 2026-08-10) e este caminho nascia com
   * a mesma falha, pior: sem a conferência, ele só descobria DEPOIS de dizer
   * "sim".
   *
   * `conferirOndeEstaOSaldo` devolve `null` quando pode seguir e uma pergunta
   * quando o saldo está em outro lugar. Não move sozinho: escolher de qual
   * pasto tirar é do mesmo tipo de chute que o §14 do documento de REBANHO
   * proíbe (aqui o §14 é parcelamento, outro assunto).
   */
  if (!compra) {
    for (const item of itens) {
      const ondeEsta = await conferirOndeEstaOSaldo(
        db,
        item.categoria,
        fazenda.id,
        pasto.id,
        item.quantidade,
      );
      // "pasto", não "categoria": a resposta a esta pergunta é o NOME DO PASTO,
      // e `atalho()` já mapeia `pasto` para `pasto_origem`. Com "categoria", a
      // resposta nunca casava e o contador de tentativas era compartilhado com
      // a pergunta de faixa de idade, fazendo a conversa desistir antes da hora.
      if (ondeEsta) return perguntar(ondeEsta, "pasto");
    }
  }

  /**
   * §18.1: "Comprei 20 bezerros DO JOÃO por 60 mil". O contato é parte do
   * exemplo-bandeira do cliente, e a resposta esperada no documento traz
   * "Vendedor: João". Sem isto, o nome que o produtor disse era descartado.
   * §4 permite criar com só o nome, sem classificar.
   */
  const nomeContato =
    str(parameters.contato) ??
    str(parameters.contact) ??
    (compra ? str(parameters.vendedor) : str(parameters.comprador)) ??
    str(parameters.vendedor) ??
    str(parameters.comprador);
  // NÃO cria aqui. Criar antes do "sim" gravava o contato "João" no banco assim
  // que o produtor descrevia o negócio, e ele ficava lá mesmo se a resposta
  // fosse "cancela". A promessa é que nada é gravado antes da confirmação, e
  // contato é gravação.

  /**
   * §6.1 e §7.1 listam a data da operação como obrigatória, e o handler de
   * rebanho já lia "ontem"/"dia 10" desde o Módulo 30. Aqui a data era sempre
   * `new Date()`, então "comprei 20 bezerros ontem" era gravado hoje, calado.
   */
  const dataDoNegocio = lerData(parameters, "data", "date", "occurred_at");
  if (dataDoNegocio.tipo === "invalida") {
    return perguntar(
      ask(
        `Não entendi a data "${dataDoNegocio.bruto}". Diga por exemplo "hoje", "ontem" ou "05/08/2026".`,
      ),
      "data",
    );
  }

  // --- como foi pago -------------------------------------------------------

  const custos = custosDosParametros(parameters);
  const totalCustos = custos.reduce((s, c) => s + c.valor, 0);
  const parcelasBruto = parameters.parcelas ?? parameters.installments;
  const parcelasPedidas = num(parcelasBruto) ?? extrairNumeroDeParcelas(parcelasBruto);
  if (parcelasBruto != null && parcelasPedidas == null) {
    // "3x", "três vezes": o modelo manda o que o produtor falou, e descartar
    // calado faria a compra virar uma conta única sem ninguém perceber.
    //
    // O texto só é ecoado quando ele é TEXTO. Uma lista estruturada
    // (`parcelas: [{...}]`, que o classificador emite às vezes, como já emite
    // para custos) virava "[object Object]" na cara do produtor.
    const eco = typeof parcelasBruto === "string" ? ` "${parcelasBruto}"` : "";
    return perguntar(ask(`Não entendi o parcelamento${eco}. Em quantas vezes?`), "parcelamento");
  }
  const quantasParcelas =
    parcelasPedidas != null && Number.isInteger(parcelasPedidas) && parcelasPedidas > 1
      ? parcelasPedidas
      : null;
  // §6.3 e §7.3: "o pagamento já foi feito?". Sem parcelamento e sem alguém
  // dizer que pagou, o negócio nasce pendente, que é o caso comum de curral.
  if (interpretarSim(parameters.pago) && quantasParcelas) {
    /**
     * A contradição vira pergunta, e a pergunta precisa ser RESPONDÍVEL.
     *
     * A mesclagem de resposta é aditiva por desenho (o que já foi dito não se
     * perde), então uma resposta nova nunca removeria o campo antigo: quem
     * dissesse "já paguei" continuaria com `parcelas: 3` e voltaria à mesma
     * pergunta até bater no limite de tentativas. Por isso a resposta a ESTE
     * campo limpa o lado contrário, que é a única forma de sair do impasse.
     */
    return perguntar(
      ask("Esse negócio já foi pago ou vai ser parcelado? Não dá para os dois."),
      "pagamento",
    );
  }
  const pago = interpretarSim(parameters.pago);

  const quando = dataDoNegocio.tipo === "ok" ? dataDoNegocio.data : new Date();
  // §6.3 e §7.3: quando não foi pago, o vencimento é o PRIMEIRO dado pedido
  // ("Data de vencimento; Quantidade de parcelas, quando houver"). É o que faz
  // "para pagar dia 10" do §18.1 virar uma conta que vence dia 10, em vez de
  // uma conta vencendo hoje que dispara alerta de atraso na mesma hora.
  const vencimentoLido = lerData(parameters, "vencimento", "due_date", "data_pagamento");
  if (vencimentoLido.tipo === "invalida") {
    return perguntar(
      ask(
        `Não entendi o vencimento "${vencimentoLido.bruto}". Diga por exemplo "dia 10" ou "10/12/2026".`,
      ),
      "vencimento",
    );
  }
  const vencimento = vencimentoLido.tipo === "ok" ? vencimentoLido.data : null;

  // --- regra 2: confirmar sempre, mostrando o que vai ser escrito ----------

  if (!confirmado) {
    const linhas = [
      compra
        ? `Comprar ${descreverItens(itens)} por ${reais(valor)}?`
        : `Vender ${descreverItens(itens)} por ${reais(valor)}?`,
      `Fazenda: ${fazenda.nome}`,
    ];
    if (pasto.nome) linhas.push(`Pasto: ${pasto.nome}`);
    if (nomeContato) linhas.push(`${compra ? "Vendedor" : "Comprador"}: ${nomeContato}`);
    if (dataDoNegocio.tipo === "ok") linhas.push(`Data: ${quando.toLocaleDateString("pt-BR")}`);
    for (const c of custos) linhas.push(`${c.descricao}: ${reais(c.valor)}`);
    if (totalCustos > 0) {
      linhas.push(
        compra
          ? `Custo total da compra: ${reais(valor + totalCustos)}`
          : `Valor líquido da venda: ${reais(valor - totalCustos)}`,
      );
    }
    if (quantasParcelas) {
      // As parcelas MOSTRADAS são as mesmas que serão gravadas: antes a tela
      // dividia por conta própria e dizia "3x de R$ 33,33" enquanto o banco
      // recebia 33,33 / 33,33 / 33,34. E "a partir do mês que vem" era falso
      // num negócio retroativo, porque as datas contam a partir da data do
      // negócio, não de hoje.
      const previa = montarParcelas(valor, quantasParcelas, quando, vencimento);
      const iguais = previa.every((p) => p.amount === previa[0].amount);
      linhas.push(
        iguais
          ? `Em ${quantasParcelas}x de ${reais(previa[0].amount)}, a primeira em ${previa[0].due_date.toLocaleDateString("pt-BR")}`
          : `Em ${quantasParcelas}x: ${previa.map((p) => reais(p.amount)).join(" + ")}, a primeira em ${previa[0].due_date.toLocaleDateString("pt-BR")}`,
      );
    } else if (pago) {
      linhas.push("Pagamento: já foi feito");
    } else if (vencimento) {
      linhas.push(`Pagamento previsto para ${vencimento.toLocaleDateString("pt-BR")}`);
    } else {
      linhas.push("Pagamento: ainda em aberto");
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
    itens: itens.map((i) => ({
      category_id: i.categoria.id,
      quantity: i.quantidade,
      pasture_id: pasto.id,
    })),
    amount: valor,
    // O nome vai para a action, que resolve ou cria DENTRO da transação: assim
    // uma recusa por saldo não deixa o contato órfão no banco.
    contact_name: nomeContato,
    due_date: vencimento,
    pago,
    parcelas: quantasParcelas
      ? montarParcelas(valor, quantasParcelas, quando, vencimento)
      : undefined,
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
