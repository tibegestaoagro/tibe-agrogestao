import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Cerca: material e custo de uma cerca retilinea simples.
 *
 * ⚠️ Canto e esticador continuam FORA: exigem reforco a parte e variam demais
 * entre propriedades para ter formula fixa. A porteira entra so como PECA A
 * COMPRAR (§6 e §7): a conta nao desconta do comprimento o vao que ela ocupa,
 * porque o vao depende do modelo, e errar para mais em arame e barato perto de
 * faltar material no meio da obra.
 *
 * Formulas (padrao de dimensionamento do setor de material de construcao
 * rural, nao e formula zootecnica: um erro aqui e de compra de material,
 * nao afeta a saude do rebanho):
 * - mouroes = ceil(comprimento / espacamento) + 1 (um mourao a mais no
 *   inicio da linha, alem dos que fecham cada vao)
 * - arame = comprimento x numero de fios x 1,05 (folga de 5% para
 *   esticamento, perdas de corte e amarracao nas pontas)
 *
 * Fontes: Calculadora Rural, "Calculadora de Cerca Rural: Arame Farpado,
 * Liso e Mouroes" (https://calculadorarural.com.br/ferramentas/dimensionamento-cerca);
 * Casa das Cercas, "Como calcular cerca por tipo de propriedade e criacao"
 * (https://blog.casadascercas.com.br/telas-rurais/como-calcular-cerca-por-propriedade-e-animal/).
 *
 * Confianca: ALTA. E geometria e regra de compra de material, nao dosagem
 * biologica: o risco de errar aqui e financeiro/logistico (comprar material
 * a mais ou a menos), nao ha risco pratico ao rebanho ou a lavoura.
 */
export function calcularCerca(input: {
  comprimentoMetros: number;
  espacamentoMetros: number;
  numeroFios: number;
  metrosPorRoloArame?: number;
  /**
   * §6: estacas entre os mouroes, so para sustentar o fio. Quando o produtor
   * informa o espacamento delas, a conta desconta os mouroes que ja ocupam
   * aquela linha.
   */
  espacamentoEstacasMetros?: number;
  quantidadePorteiras?: number;
  /** §6: folga sobre TODO o material, para quem prefere sobrar. */
  margemSegurancaPercent?: number;
  /** §7: cada preco e opcional, e o custo so aparece com o que foi informado. */
  precoRoloArame?: number;
  precoMourao?: number;
  precoEstaca?: number;
  precoGrampoPorKg?: number;
  precoPorteira?: number;
  maoDeObraPorMetro?: number;
}): CalcResult<{
  mouroesNecessarios: number;
  metrosDeArameNecessarios: number;
  rolosDeArameNecessarios: number | null;
  estacasNecessarias: number | null;
  gramposKg: number;
  porteiras: number;
  custoMaterial: number | null;
  custoMaoDeObra: number | null;
  custoTotal: number | null;
  custoPorMetro: number | null;
}> {
  const {
    comprimentoMetros,
    espacamentoMetros,
    numeroFios,
    metrosPorRoloArame,
    espacamentoEstacasMetros,
    quantidadePorteiras,
    margemSegurancaPercent,
    precoRoloArame,
    precoMourao,
    precoEstaca,
    precoGrampoPorKg,
    precoPorteira,
    maoDeObraPorMetro,
  } = input;

  if (!isPositiveNumber(comprimentoMetros)) {
    return { ok: false, error: "Comprimento da cerca deve ser maior que zero." };
  }
  if (!isPositiveNumber(espacamentoMetros)) {
    return { ok: false, error: "Espacamento entre mouroes deve ser maior que zero." };
  }
  if (!isPositiveNumber(numeroFios) || !Number.isInteger(numeroFios)) {
    return { ok: false, error: "Numero de fios deve ser um numero inteiro maior que zero." };
  }
  if (espacamentoEstacasMetros !== undefined && !isPositiveNumber(espacamentoEstacasMetros)) {
    return { ok: false, error: "Espacamento entre estacas deve ser maior que zero." };
  }
  if (espacamentoEstacasMetros !== undefined && espacamentoEstacasMetros >= espacamentoMetros) {
    return {
      ok: false,
      error: "A estaca fica ENTRE os mouroes: o espacamento dela precisa ser menor.",
    };
  }
  if (margemSegurancaPercent !== undefined && margemSegurancaPercent < 0) {
    return { ok: false, error: "Margem de seguranca nao pode ser negativa." };
  }

  const folga = 1 + (margemSegurancaPercent ?? 0) / 100;
  const comMargem = (valor: number) => valor * folga;

  const mouroesNecessarios = Math.ceil(comMargem(comprimentoMetros / espacamentoMetros) + 1);
  const metrosDeArameNecessarios = round(comMargem(comprimentoMetros * numeroFios * 1.05), 1);
  const rolosDeArameNecessarios =
    metrosPorRoloArame !== undefined && isPositiveNumber(metrosPorRoloArame)
      ? Math.ceil(metrosDeArameNecessarios / metrosPorRoloArame)
      : null;

  /*
   * Estaca ocupa os pontos da linha que o mourao nao ocupa. Contar os pontos
   * de estaca cheios e subtrair os de mourao evita cobrar duas pecas para a
   * mesma posicao, que e o erro classico de quem calcula as duas separadas.
   */
  const estacasNecessarias =
    espacamentoEstacasMetros !== undefined
      ? Math.max(
          0,
          Math.ceil(comMargem(comprimentoMetros / espacamentoEstacasMetros)) -
            (mouroesNecessarios - 1),
        )
      : null;

  /*
   * Grampo: 2 por fio em cada mourao (um de cada lado do poste). O grampo de
   * cerca comum pesa perto de 5 g, entao 200 grampos fazem 1 kg, que e como
   * ele e vendido. Numero de compra, nao de engenharia: por isso vai
   * arredondado para cima em kg fechado.
   */
  const GRAMPOS_POR_FIO_POR_MOURAO = 2;
  const GRAMPOS_POR_KG = 200;
  const grampos = mouroesNecessarios * numeroFios * GRAMPOS_POR_FIO_POR_MOURAO;
  const gramposKg = Math.ceil(grampos / GRAMPOS_POR_KG);

  const porteiras = quantidadePorteiras ?? 0;

  const parcelas: (number | null)[] = [
    rolosDeArameNecessarios !== null && precoRoloArame !== undefined
      ? rolosDeArameNecessarios * precoRoloArame
      : precoRoloArame !== undefined
        ? null
        : 0,
    precoMourao !== undefined ? mouroesNecessarios * precoMourao : 0,
    precoEstaca !== undefined && estacasNecessarias !== null
      ? estacasNecessarias * precoEstaca
      : 0,
    precoGrampoPorKg !== undefined ? gramposKg * precoGrampoPorKg : 0,
    precoPorteira !== undefined ? porteiras * precoPorteira : 0,
  ];

  const informouAlgumPreco =
    precoRoloArame !== undefined ||
    precoMourao !== undefined ||
    precoEstaca !== undefined ||
    precoGrampoPorKg !== undefined ||
    precoPorteira !== undefined;

  /*
   * Preco de arame sem saber o tamanho do rolo nao da para transformar em
   * custo, e chutar o rolo sairia caro no lugar errado: ai o material inteiro
   * fica sem custo, em vez de sair incompleto passando por completo.
   */
  const custoMaterial =
    informouAlgumPreco && !parcelas.includes(null)
      ? round(
          parcelas.reduce((total: number, p) => total + (p ?? 0), 0),
          2,
        )
      : null;

  const custoMaoDeObra =
    maoDeObraPorMetro !== undefined ? round(comprimentoMetros * maoDeObraPorMetro, 2) : null;

  const custoTotal =
    custoMaterial !== null || custoMaoDeObra !== null
      ? round((custoMaterial ?? 0) + (custoMaoDeObra ?? 0), 2)
      : null;

  return {
    ok: true,
    data: {
      mouroesNecessarios,
      metrosDeArameNecessarios,
      rolosDeArameNecessarios,
      estacasNecessarias,
      gramposKg,
      porteiras,
      custoMaterial,
      custoMaoDeObra,
      custoTotal,
      custoPorMetro: custoTotal !== null ? round(custoTotal / comprimentoMetros, 2) : null,
    },
  };
}
