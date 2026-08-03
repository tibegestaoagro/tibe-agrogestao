import { type CalcResult, isPositiveNumber, round } from "./shared";

const CONSUMO_MS_PERCENT_PV = 0.025;

// Teor de materia seca (MS) aproximado de cada tipo de volumoso, derivado do
// mesmo exemplo numerico da Embrapa citado na fonte abaixo (10 kg de MS
// equivalem a 30 kg de silagem, 40 kg de capim verde ou 12 kg de feno).
const TEOR_MS = {
  materia_seca: 1,
  silagem: 10 / 30,
  capim_verde: 10 / 40,
  feno: 10 / 12,
} as const;

export type TipoAlimento = keyof typeof TEOR_MS;

export const TIPOS_ALIMENTO: { value: TipoAlimento; label: string }[] = [
  { value: "materia_seca", label: "Materia seca pura (racao/concentrado balanceado por MS)" },
  { value: "silagem", label: "Silagem" },
  { value: "capim_verde", label: "Capim verde (pasto cortado)" },
  { value: "feno", label: "Feno" },
];

/**
 * Racao / Volumoso: necessidade diaria de materia seca (MS) do rebanho, e
 * conversao para quantidade de alimento "in natura" conforme o tipo de
 * volumoso escolhido.
 *
 * Formula: consumo de MS de um bovino adulto e aproximadamente 2,5% do peso
 * vivo por dia. Exemplo da propria Embrapa: um animal de 400 kg consome
 * cerca de 10 kg de MS/dia, equivalentes a aproximadamente 30 kg de
 * silagem, 40 kg de capim verde ou 12 kg de feno (usado aqui para derivar o
 * teor de MS aproximado de cada volumoso: 33% na silagem, 25% no capim
 * verde, 83% no feno).
 *
 * Fonte: Embrapa Gado de Corte (CNPGC), Central de Atendimento ao Cidadao,
 * "Quantos quilos de materia seca (kg de MS) um animal adulto consome por
 * dia?"
 * (https://cloud.cnpgc.embrapa.br/sac/2016/05/24/quantos-quilos-de-materia-seca-kg-de-ms-um-animal-adulto-consome-por-dia/).
 *
 * Confianca: ALTA para o percentual de MS (2,5% do peso vivo, direto da
 * Embrapa). MEDIA para as conversoes por tipo de volumoso: sao derivadas de
 * um unico exemplo numerico da propria Embrapa, nao de uma tabela
 * bromatologica completa, e o teor de MS real de silagem/capim/feno varia
 * com especie, corte e umidade: use como estimativa, nao como analise
 * bromatologica de verdade.
 */
export function calcularRacao(input: {
  pesoMedioKg: number;
  numeroAnimais: number;
  tipoAlimento: TipoAlimento;
}): CalcResult<{
  materiaSecaKgDiaPorAnimal: number;
  materiaSecaKgDiaRebanho: number;
  alimentoNaturalKgDiaPorAnimal: number;
  alimentoNaturalKgDiaRebanho: number;
}> {
  const { pesoMedioKg, numeroAnimais, tipoAlimento } = input;

  if (!isPositiveNumber(pesoMedioKg)) {
    return { ok: false, error: "Peso medio deve ser maior que zero." };
  }
  if (!isPositiveNumber(numeroAnimais)) {
    return { ok: false, error: "Numero de animais deve ser maior que zero." };
  }
  const teorMs = TEOR_MS[tipoAlimento];
  if (!teorMs) {
    return { ok: false, error: "Tipo de alimento invalido." };
  }

  const materiaSecaKgDiaPorAnimal = pesoMedioKg * CONSUMO_MS_PERCENT_PV;
  const alimentoNaturalKgDiaPorAnimal = materiaSecaKgDiaPorAnimal / teorMs;

  return {
    ok: true,
    data: {
      materiaSecaKgDiaPorAnimal: round(materiaSecaKgDiaPorAnimal, 2),
      materiaSecaKgDiaRebanho: round(materiaSecaKgDiaPorAnimal * numeroAnimais, 1),
      alimentoNaturalKgDiaPorAnimal: round(alimentoNaturalKgDiaPorAnimal, 2),
      alimentoNaturalKgDiaRebanho: round(alimentoNaturalKgDiaPorAnimal * numeroAnimais, 1),
    },
  };
}
