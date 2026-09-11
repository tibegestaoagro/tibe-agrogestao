import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Ganho de peso (§27 do documento do cliente): quanto falta ganhar, e em
 * quantos dias, no ritmo que o produtor informou.
 *
 * ⚠️ **O ganho medio diario e ENTRADA, nunca palpite do sistema.** Ele depende
 * da dieta, da categoria, da estacao e do potencial genetico, e um numero
 * inventado aqui viraria promessa de data de venda. O §46 separa CALCULO de
 * RECOMENDACAO justamente nisso: o produtor traz o ritmo que observa (ou o que
 * o tecnico dele projetou) e o Tibe faz a conta.
 *
 * Confianca: ALTA na aritmetica, que e divisao. A projecao vale o quanto valer
 * o ganho informado, e a tela diz isso.
 */
export function calcularGanhoDePeso(input: {
  pesoAtualKg: number;
  pesoDesejadoKg: number;
  ganhoMedioDiarioKg: number;
  /** Quando informada, a resposta tambem diz a data provavel. */
  dataInicial?: Date;
}): CalcResult<{
  ganhoNecessarioKg: number;
  dias: number;
  meses: number;
  dataPrevista: Date | null;
}> {
  const { pesoAtualKg, pesoDesejadoKg, ganhoMedioDiarioKg, dataInicial } = input;

  if (!isPositiveNumber(pesoAtualKg)) {
    return { ok: false, error: "Peso atual deve ser maior que zero." };
  }
  if (!isPositiveNumber(pesoDesejadoKg)) {
    return { ok: false, error: "Peso desejado deve ser maior que zero." };
  }
  if (pesoDesejadoKg <= pesoAtualKg) {
    return { ok: false, error: "O peso desejado precisa ser maior que o peso atual." };
  }
  if (!isPositiveNumber(ganhoMedioDiarioKg)) {
    return { ok: false, error: "Ganho medio diario deve ser maior que zero." };
  }

  const ganhoNecessarioKg = pesoDesejadoKg - pesoAtualKg;
  /*
   * Dia e unidade inteira aqui: "99,7 dias" nao ajuda ninguem a marcar a
   * viagem do caminhao. Para CIMA, porque no dia 99 o animal ainda nao chegou
   * ao peso.
   */
  const dias = Math.ceil(ganhoNecessarioKg / ganhoMedioDiarioKg);

  let dataPrevista: Date | null = null;
  if (dataInicial) {
    dataPrevista = new Date(dataInicial.getTime());
    dataPrevista.setUTCDate(dataPrevista.getUTCDate() + dias);
  }

  return {
    ok: true,
    data: {
      ganhoNecessarioKg: round(ganhoNecessarioKg, 1),
      dias,
      meses: round(dias / 30, 1),
      dataPrevista,
    },
  };
}
