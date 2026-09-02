import type { PayFrequency } from "@/generated/prisma/client";

/**
 * A data do próximo pagamento de um trabalhador fixo (§7 do Módulo 33).
 *
 * ESTRITAMENTE DEPOIS de `apartirDe`, e isto é o ponto todo: quem acabou de
 * confirmar o pagamento do dia 5 espera o próximo no mês que vem, não hoje de
 * novo. Um `>=` aqui criaria duas previsões pendentes para o mesmo dia, e a
 * regra da previsão rolante é que existe SEMPRE UMA.
 *
 * O dia habitual só vale para `mensal` e `outra`. Em `diaria`, `semanal` e
 * `quinzenal` o documento não pede dia fixo do mês, e forçá-lo faria "toda
 * sexta" virar "todo dia 5"; quinzenal soma 15 dias a partir do último
 * pagamento, que é como o produtor conta.
 *
 * FEVEREIRO: dia 31 vira o último dia do mês, nunca 3 de março. Quem escreveu
 * 31 quis dizer "no fim do mês", e empurrar para o mês seguinte transformaria
 * uma previsão de salário numa data que o produtor nunca escolheu.
 *
 * Tudo em UTC ao meio-dia. O projeto guarda `due_date` como `DateTime`, e usar
 * meia-noite local faria a data virar o dia anterior em qualquer fuso a oeste
 * de Greenwich na hora de formatar: o Brasil inteiro.
 */
export function proximaDataDePagamento(
  frequencia: PayFrequency,
  diaHabitual: number | null,
  apartirDe: Date,
): Date {
  const base = new Date(
    Date.UTC(apartirDe.getUTCFullYear(), apartirDe.getUTCMonth(), apartirDe.getUTCDate(), 12),
  );

  if (frequencia === "diaria") return somarDias(base, 1);
  if (frequencia === "semanal") return somarDias(base, 7);
  if (frequencia === "quinzenal") return somarDias(base, 15);

  // `mensal` e `outra`.
  if (diaHabitual === null) return somarMeses(base, 1);

  const noMesAtual = comDia(base.getUTCFullYear(), base.getUTCMonth(), diaHabitual);
  if (noMesAtual.getTime() > base.getTime()) return noMesAtual;
  return comDia(base.getUTCFullYear(), base.getUTCMonth() + 1, diaHabitual);
}

function somarDias(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, 12));
}

function somarMeses(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), 12));
}

/** Grampeia o dia ao último do mês: 31 em fevereiro vira 28, ou 29 se bissexto. */
function comDia(ano: number, mes: number, dia: number): Date {
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimo), 12));
}
