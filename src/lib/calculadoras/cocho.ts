import { type CalcResult, isPositiveNumber, round } from "./shared";

const CM_ACESSO_POR_CABECA_POR_LADO = 5;

/**
 * Cocho (sal mineral): comprimento linear de cocho necessario para que todo
 * o rebanho tenha acesso simultaneo ao sal mineral, sem disputa.
 *
 * Formula: 5 cm de espaco de acesso por cabeca, de cada lado do cocho. Um
 * cocho acessivel pelos 2 lados oferece 10 cm de acesso por cabeca a cada
 * metro linear construido. Exemplo da propria Embrapa: para um rebanho de
 * 100 vacas, um cocho de 2,5 m de comprimento com acesso nos 2 lados e
 * suficiente.
 *
 * Fonte: Embrapa Gado de Corte (CNPGC), Central de Atendimento ao Cidadao,
 * "Qual e o tamanho, o numero e a localizacao ideal do cocho de minerais?"
 * (https://cloud.cnpgc.embrapa.br/sac/2012/07/13/296-qual-e-o-tamanho-o-numero-e-a-localizacao-ideal-do-cocho-de-minerais/).
 *
 * Confianca: ALTA, especificamente para cocho de SAL MINERAL (fonte direta
 * da Embrapa Gado de Corte, com exemplo numerico batendo com o resultado
 * desta funcao). Esta formula NAO vale para cocho de racao/volumoso de
 * confinamento, que usa espacamentos bem maiores (a literatura tecnica cita
 * de 30 a 70 cm/cabeca dependendo do sistema, sem uma fonte Embrapa unica e
 * confiavel encontrada nesta rodada): por isso esta calculadora cobre so o
 * cocho de sal mineral.
 */
export function calcularCocho(input: {
  numeroAnimais: number;
  acessoDoisLados: boolean;
}): CalcResult<{
  comprimentoCochoMetros: number;
}> {
  const { numeroAnimais, acessoDoisLados } = input;

  if (!isPositiveNumber(numeroAnimais)) {
    return { ok: false, error: "Numero de animais deve ser maior que zero." };
  }

  const acessoTotalCm = numeroAnimais * CM_ACESSO_POR_CABECA_POR_LADO;
  const comprimentoCochoMetros = (acessoDoisLados ? acessoTotalCm / 2 : acessoTotalCm) / 100;

  return { ok: true, data: { comprimentoCochoMetros: round(comprimentoCochoMetros, 2) } };
}
