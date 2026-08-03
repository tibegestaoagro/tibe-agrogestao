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
