import { type CalcResult, isPositiveNumber, round } from "./shared";

const KG_POR_ARROBA_CARCACA = 15;

/**
 * Compra e Venda de Gado (SIMULACAO): converte peso vivo em arrobas de
 * carcaca e projeta margem bruta de uma operacao de compra/engorda/venda.
 *
 * IMPORTANTE: esta e uma calculadora de simulacao numerica isolada, sem
 * nenhuma ligacao com o rebanho real do sistema (nao le nem grava
 * AnimalBatch/Animal do Modulo 25, nao gera lancamento financeiro nenhum):
 * serve so para o produtor rascunhar um cenario de compra/venda antes de
 * negociar.
 *
 * Formulas: arrobas de carcaca = (peso vivo, kg x rendimento de carcaca, %)
 * / 15 (1 arroba = 15 kg de carcaca: conversao padrao usada no mercado
 * brasileiro de gado de corte). Valor = arrobas x preco da arroba (R$).
 * Margem bruta = valor de venda - valor de compra - custos adicionais
 * informados (racao, frete, sanidade etc., se houver).
 *
 * Rendimento de carcaca varia por categoria, acabamento e sistema de
 * terminacao: a literatura cita de 50% a 56% para machos terminados no
 * Brasil, mas o usuario deve informar o rendimento esperado da sua propria
 * operacao (nao ha valor padrao preenchido).
 *
 * Fontes: Nutrimosaic, "Peso do boi: como calcular e converter em arrobas"
 * (https://nutrimosaic.com.br/peso-do-boi/); Corteva, "Precificacao do boi
 * gordo: peso vivo x carcaca"
 * (https://www.corteva.com/br/coeficiente-agro/precificacao-do-boi-gordo-e-venda-pelo-peso-vivo-ou-carcaca.html).
 *
 * Confianca: ALTA para a formula de conversao em arrobas (padrao de
 * mercado, nao controverso, usado todo dia em negociacao real de boi). A
 * simulacao de margem e so aritmetica sobre os valores que o usuario
 * informa (preco, rendimento, custos), sem nenhum pressuposto oculto: o
 * risco de uma simulacao errada aqui e financeiro/de planejamento, nao
 * afeta a saude de nenhum animal.
 */
export function calcularCompraVendaGado(input: {
  pesoVivoCompraKg: number;
  rendimentoCarcacaCompraPercent: number;
  precoArrobaCompra: number;
  pesoVivoVendaKg: number;
  rendimentoCarcacaVendaPercent: number;
  precoArrobaVenda: number;
  numeroAnimais?: number;
  custosAdicionais?: number;
}): CalcResult<{
  arrobasCompraPorAnimal: number;
  valorCompraPorAnimal: number;
  arrobasVendaPorAnimal: number;
  valorVendaPorAnimal: number;
  margemBrutaPorAnimal: number;
  margemBrutaTotal: number | null;
}> {
  const {
    pesoVivoCompraKg,
    rendimentoCarcacaCompraPercent,
    precoArrobaCompra,
    pesoVivoVendaKg,
    rendimentoCarcacaVendaPercent,
    precoArrobaVenda,
    numeroAnimais,
    custosAdicionais,
  } = input;

  const camposObrigatorios: Array<[string, number]> = [
    ["Peso vivo na compra", pesoVivoCompraKg],
    ["Preco da arroba na compra", precoArrobaCompra],
    ["Peso vivo na venda", pesoVivoVendaKg],
    ["Preco da arroba na venda", precoArrobaVenda],
  ];
  for (const [label, value] of camposObrigatorios) {
    if (!isPositiveNumber(value)) {
      return { ok: false, error: `${label} deve ser maior que zero.` };
    }
  }

  const rendimentos: Array<[string, number]> = [
    ["Rendimento de carcaca na compra", rendimentoCarcacaCompraPercent],
    ["Rendimento de carcaca na venda", rendimentoCarcacaVendaPercent],
  ];
  for (const [label, value] of rendimentos) {
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      return { ok: false, error: `${label} deve estar entre 0 e 100%.` };
    }
  }

  const arrobasCompraPorAnimal = (pesoVivoCompraKg * (rendimentoCarcacaCompraPercent / 100)) / KG_POR_ARROBA_CARCACA;
  const valorCompraPorAnimal = arrobasCompraPorAnimal * precoArrobaCompra;
  const arrobasVendaPorAnimal = (pesoVivoVendaKg * (rendimentoCarcacaVendaPercent / 100)) / KG_POR_ARROBA_CARCACA;
  const valorVendaPorAnimal = arrobasVendaPorAnimal * precoArrobaVenda;
  const custos = custosAdicionais !== undefined && isPositiveNumber(custosAdicionais) ? custosAdicionais : 0;
  const margemBrutaPorAnimal = valorVendaPorAnimal - valorCompraPorAnimal - custos;

  const margemBrutaTotal =
    numeroAnimais !== undefined && isPositiveNumber(numeroAnimais)
      ? round(margemBrutaPorAnimal * numeroAnimais, 2)
      : null;

  return {
    ok: true,
    data: {
      arrobasCompraPorAnimal: round(arrobasCompraPorAnimal, 2),
      valorCompraPorAnimal: round(valorCompraPorAnimal, 2),
      arrobasVendaPorAnimal: round(arrobasVendaPorAnimal, 2),
      valorVendaPorAnimal: round(valorVendaPorAnimal, 2),
      margemBrutaPorAnimal: round(margemBrutaPorAnimal, 2),
      margemBrutaTotal,
    },
  };
}

/**
 * A pergunta INVERSA, do §25 e do §26: "estou pagando quanto por arroba nisto
 * aqui?".
 *
 * A funcao acima parte do preco da arroba para chegar ao valor do animal. Esta
 * parte do valor que o comprador ofereceu (total ou por cabeca) e do peso, e
 * devolve o preco de arroba embutido nele. E a conta que o produtor faz de
 * cabeca no curral quando alguem chega com uma proposta fechada, e errar nela
 * custa dinheiro na hora.
 *
 * ⚠️ **O §26 e explicito: simular venda NAO gera venda.** Nada aqui escreve.
 *
 * Confianca: ALTA. Aritmetica pura sobre numeros do proprio negocio, com a
 * arroba de carcaca de 15 kg.
 */
export function calcularValorPorArroba(input: {
  numeroAnimais: number;
  pesoMedioKg: number;
  rendimentoCarcacaPercent: number;
  /** Informe um dos dois: o valor fechado do lote, ou o valor de cada cabeca. */
  valorTotal?: number;
  valorPorCabeca?: number;
}): CalcResult<{
  valorTotal: number;
  valorPorCabeca: number;
  pesoTotalKg: number;
  arrobasPorAnimal: number;
  arrobasTotais: number;
  valorPorArroba: number;
}> {
  const { numeroAnimais, pesoMedioKg, rendimentoCarcacaPercent, valorTotal, valorPorCabeca } =
    input;

  if (!isPositiveNumber(numeroAnimais)) {
    return { ok: false, error: "Numero de animais deve ser maior que zero." };
  }
  if (!isPositiveNumber(pesoMedioKg)) {
    return { ok: false, error: "Peso medio deve ser maior que zero." };
  }
  if (
    !Number.isFinite(rendimentoCarcacaPercent) ||
    rendimentoCarcacaPercent <= 0 ||
    rendimentoCarcacaPercent > 100
  ) {
    return { ok: false, error: "Rendimento de carcaca deve estar entre 0 e 100%." };
  }
  if (valorTotal === undefined && valorPorCabeca === undefined) {
    return { ok: false, error: "Informe o valor total do lote ou o valor por cabeca." };
  }
  if (valorTotal !== undefined && !isPositiveNumber(valorTotal)) {
    return { ok: false, error: "Valor total deve ser maior que zero." };
  }
  if (valorPorCabeca !== undefined && !isPositiveNumber(valorPorCabeca)) {
    return { ok: false, error: "Valor por cabeca deve ser maior que zero." };
  }

  /*
   * Com os dois informados, o TOTAL vence: e o numero que foi de fato
   * negociado, e o por cabeca costuma ser o arredondamento que alguem fez de
   * cabeca.
   */
  const total = valorTotal ?? valorPorCabeca! * numeroAnimais;
  const arrobasPorAnimal =
    (pesoMedioKg * (rendimentoCarcacaPercent / 100)) / KG_POR_ARROBA_CARCACA;
  const arrobasTotais = arrobasPorAnimal * numeroAnimais;

  return {
    ok: true,
    data: {
      valorTotal: round(total, 2),
      valorPorCabeca: round(total / numeroAnimais, 2),
      pesoTotalKg: round(pesoMedioKg * numeroAnimais, 1),
      arrobasPorAnimal: round(arrobasPorAnimal, 2),
      arrobasTotais: round(arrobasTotais, 2),
      valorPorArroba: round(total / arrobasTotais, 2),
    },
  };
}
