/**
 * Comparação por DIA de calendário, no fuso da fazenda.
 *
 * Existe porque comparar `Date` por instante mente para o produtor. Uma tarefa
 * anotada para hoje é gravada como meia-noite (`new Date("2026-09-10")`, que o
 * navegador manda de um `<input type="date">`), e qualquer hora depois disso
 * fazia `due_date < now` virar verdade: a tarefa nascia "Atrasada" no mesmo
 * segundo em que foi criada. Defeito real, corrigido em 2026-09-10.
 *
 * O Financeiro já comparava por dia (`calculatePendingDaysOverdue`), e o Meu
 * Dia não. Esta é a função que os dois passam a usar, para a regra não
 * divergir de novo.
 *
 * ⚠️ `Negotiation.derivarSituacao` tem a sua própria cópia da ideia. Não foi
 * migrada aqui de propósito: aquele módulo está estável e mexer nele para
 * consertar um defeito do Meu Dia aumentaria o risco da correção sem ganho.
 * Quem for mexer em negociações, migre.
 */

const FUSO_DA_FAZENDA = "America/Sao_Paulo";

const formatador = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_DA_FAZENDA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * A meia-noite UTC do dia em que `momento` cai no fuso da fazenda.
 *
 * Use para o AGORA, nunca para o prazo. O porquê está em `prazoVencido`.
 */
export function inicioDoDiaEmSaoPaulo(momento: Date): Date {
  const partes = formatador.formatToParts(momento);
  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  const dia = Number(partes.find((p) => p.type === "day")?.value);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** O dia de calendário de uma data lida em UTC, como número comparável. */
function diaUtc(data: Date): number {
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
}

/**
 * `true` só quando o dia do prazo já ficou para trás. Prazo que vence HOJE não
 * está atrasado, a qualquer hora do dia.
 *
 * ⚠️ **A comparação é assimétrica de propósito, e essa é a parte que engana.**
 *
 * O prazo é lido em **UTC**, o agora é lido no **fuso da fazenda**. Parece
 * inconsistente e não é: os dois lados são coisas diferentes.
 *
 * `due_date` não é um instante, é uma DATA de calendário. O navegador manda
 * `"2026-09-10"` de um `<input type="date">` e o `new Date()` grava
 * `2026-09-10T00:00:00Z`. Convertê-la para São Paulo daria 21h do dia 09, e o
 * prazo "dia 10" viraria "dia 9": toda tarefa de hoje continuaria nascendo
 * atrasada, agora por outro caminho. Já o agora é um instante de verdade, e o
 * dia "de hoje" para quem está na fazenda é o dia em São Paulo.
 *
 * Foi assim que `financial-reports.ts` sempre fez, e é por isso que o
 * Financeiro nunca teve este defeito.
 */
export function prazoVencido(prazo: Date, agora = new Date()): boolean {
  return diaUtc(prazo) < inicioDoDiaEmSaoPaulo(agora).getTime();
}

/**
 * Quantos dias de calendário faltam até `prazo`: negativo quando já passou,
 * zero quando é hoje, positivo quando vem pela frente.
 *
 * Módulo 38: o Meu Dia separa "Atenção" (negativo), "Hoje" (zero) e "Próximos
 * dias" (de 1 a 7) com este número só, e a mesma assimetria de `prazoVencido`
 * vale aqui pelo mesmo motivo: o prazo é data de calendário, o agora é
 * instante.
 */
export function diasAte(prazo: Date, agora = new Date()): number {
  return Math.round((diaUtc(prazo) - inicioDoDiaEmSaoPaulo(agora).getTime()) / 86_400_000);
}
