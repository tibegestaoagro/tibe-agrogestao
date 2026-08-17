import { str } from "./shared";
import { lerNumeroBr } from "@/lib/numero-br";

/**
 * Reexportado para quem ja importava daqui. A funcao mora em `@/lib/numero-br`,
 * modulo PURO, porque a tela tambem precisa dela e nao pode importar nada que
 * arraste Prisma para o bundle do navegador.
 */
export { lerNumeroBr };

/**
 * Os leitores de linguagem do produtor, compartilhados por todo handler que
 * registra um negocio (Modulo 31).
 *
 * Vivem fora de `negociacao.ts` porque o negocio de PRODUTO le exatamente as
 * mesmas coisas do negocio de gado: dinheiro, data, parcela, custo adicional e
 * "ja paguei". Duas copias significariam que "60 mil" funciona numa compra de
 * boi e nao numa compra de sal, e a diferenca so apareceria no dia em que
 * alguem comprasse sal falando como fala.
 *
 * Cada funcao aqui nasceu de um defeito real, e o comentario de cada uma diz
 * qual. Nao simplifique nenhuma sem ler o motivo.
 */


export type CustoLido = { descricao: string; valor: number };

/**
 * Custos adicionais (§15): frete, comissão, taxas. Aceita a lista estruturada
 * e também os campos planos que o classificador produz quando a mensagem cita
 * um custo só ("com 2 mil de frete").
 */
export function custosDosParametros(parameters: Record<string, unknown>): CustoLido[] {
  const saida: CustoLido[] = [];
  const brutos = parameters.custos;
  if (Array.isArray(brutos)) {
    for (const bruto of brutos) {
      if (typeof bruto !== "object" || bruto === null) continue;
      const registro = bruto as Record<string, unknown>;
      const valor = lerDinheiro(registro, "valor", "amount");
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
    // `guia` e `guia_transporte` são o mesmo custo com dois nomes possíveis do
    // classificador, e `taxa`/`taxa_leilao` idem: a checagem por rótulo no laço
    // abaixo mantém só a primeira ocorrência, senão o custo entraria duas vezes
    // se o modelo mandasse os dois nomes.
    ["guia", "Guia de transporte"],
    ["guia_transporte", "Guia de transporte"],
    ["exames", "Exames"],
    ["vacinas", "Vacinas"],
    ["pedagio", "Pedágio"],
    ["outros", "Outros custos"],
  ] as const) {
    const valor = lerDinheiro(parameters, campo);
    if (valor != null && valor > 0 && !saida.some((c) => c.descricao === rotulo)) {
      saida.push({ descricao: rotulo, valor });
    }
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
export type DataLida = { tipo: "vazio" } | { tipo: "ok"; data: Date } | { tipo: "invalida"; bruto: string };

export function lerData(parameters: Record<string, unknown>, ...campos: string[]): DataLida {
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
export function aoMeioDia(ano: number, mes: number, dia: number): Date {
  return new Date(ano, mes, dia, 12, 0, 0);
}

export function interpretarData(bruto: string, hoje = new Date()): Date | null {
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
 * mas depender de o produtor conferir não é trava.
 *
 * Vale para TODO dinheiro do handler, principal e custos do §15. Uma versão
 * anterior corrigiu só o principal e afirmou aqui, por escrito, que dinheiro
 * tinha deixado de confiar no formato do LLM: era falso, porque
 * `custosDosParametros` seguia lendo por `num()` uma linha acima. Um frete de
 * "2.000" virava R$ 2,00 e "2.000,00" sumia calado, o que erra o líquido da
 * venda em mil vezes sem nada na tela denunciar.
 *
 * Aceita número puro, "60000", "60.000", "60.000,50" e "60000.50".
 */
export function lerDinheiro(parameters: Record<string, unknown>, ...campos: string[]): number | null {
  for (const campo of campos) {
    const n = lerNumeroBr(parameters[campo]);
    if (n != null) return n;
  }
  return null;
}


/**
 * "3x", "3 vezes", "em tres vezes": o modelo repassa o que o produtor falou.
 * Devolve `null` quando não há número nenhum, e aí o chamador PERGUNTA.
 */
export function extrairNumeroDeParcelas(bruto: unknown): number | null {
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
export function interpretarSim(bruto: unknown): boolean {
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
export function montarParcelas(
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
export function somarMeses(base: Date, meses: number): Date {
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
