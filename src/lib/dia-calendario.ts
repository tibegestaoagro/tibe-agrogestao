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
 * `derivarSituacao`, das negociações, tinha uma cópia própria que cortava o
 * dia no fuso do SERVIDOR, e migrou para `prazoVencido` em 2026-10-13: na
 * Vercel (UTC), das 21h à meia-noite a conta que vencia hoje aparecia vencida.
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
/**
 * "Bom dia", "Boa tarde", "Boa noite" pela hora de SÃO PAULO.
 *
 * `new Date().getHours()` no servidor devolve a hora do servidor, que na
 * Vercel é UTC: às 9h na fazenda ela marca meio-dia, e o produtor lê "Boa
 * tarde" antes do café. O `/dashboard` ainda faz assim.
 */
export function saudacaoEmSaoPaulo(agora = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO_DA_FAZENDA, hour: "numeric", hour12: false }).format(agora),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function diasAte(prazo: Date, agora = new Date()): number {
  return Math.round((diaUtc(prazo) - inicioDoDiaEmSaoPaulo(agora).getTime()) / 86_400_000);
}

export type PeriodoRapido = "hoje" | "semana" | "mes" | "ano";

const DIA_MS = 86_400_000;
// ponytail: São Paulo é UTC-3 fixo desde o fim do horário de verão (2019). Se
// ele voltar, este deslocamento passa a errar uma hora na virada do dia.
const MEIA_NOITE_SP_EM_UTC_MS = 3 * 3_600_000;

/**
 * O intervalo de INSTANTES (`since` e `until`, os dois inclusivos) que cobre um
 * período de calendário na fazenda. Para filtrar campo que é instante de
 * verdade, como `Negotiation.occurred_at`: o formulário grava meio-dia local e
 * o agente grava o agora, então a fronteira do dia tem de ser a meia-noite de
 * São Paulo, e não a de UTC. A semana começa na segunda-feira.
 */
export function periodoEmSaoPaulo(periodo: PeriodoRapido, agora = new Date()): { since: Date; until: Date } {
  const hoje = inicioDoDiaEmSaoPaulo(agora);
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  let inicio: number;
  let fim: number;
  switch (periodo) {
    case "hoje":
      inicio = hoje.getTime();
      fim = inicio + DIA_MS;
      break;
    case "semana":
      inicio = hoje.getTime() - ((hoje.getUTCDay() + 6) % 7) * DIA_MS;
      fim = inicio + 7 * DIA_MS;
      break;
    case "mes":
      inicio = Date.UTC(ano, mes, 1);
      fim = Date.UTC(ano, mes + 1, 1);
      break;
    case "ano":
      inicio = Date.UTC(ano, 0, 1);
      fim = Date.UTC(ano + 1, 0, 1);
      break;
  }
  return {
    since: new Date(inicio + MEIA_NOITE_SP_EM_UTC_MS),
    until: new Date(fim + MEIA_NOITE_SP_EM_UTC_MS - 1),
  };
}

/**
 * Período personalizado: duas datas de `<input type="date">` ("YYYY-MM-DD"),
 * do começo do primeiro dia ao fim do último, em São Paulo. Data inválida ou
 * ausente vira `undefined`, e aquela ponta fica aberta.
 */
export function periodoDeDatasEmSaoPaulo(de?: string | null, ate?: string | null): { since?: Date; until?: Date } {
  const dia = (s?: string | null) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
    const t = Date.parse(`${s}T00:00:00Z`);
    return Number.isNaN(t) ? undefined : t;
  };
  const inicio = dia(de);
  const fim = dia(ate);
  return {
    since: inicio === undefined ? undefined : new Date(inicio + MEIA_NOITE_SP_EM_UTC_MS),
    until: fim === undefined ? undefined : new Date(fim + DIA_MS + MEIA_NOITE_SP_EM_UTC_MS - 1),
  };
}
