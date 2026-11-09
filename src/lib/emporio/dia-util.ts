/**
 * Calendário de dias úteis do cartão (entrega 2). Puro e sem import de servidor: o balcão
 * (navegador) também o usa. Convenção: todo `Date` aqui é meia-noite UTC do dia de calendário,
 * como o Prisma devolve um `@db.Date`. Comparar sempre por `toISOString().slice(0, 10)`.
 */

const DIA_MS = 86_400_000;

const chave = (d: Date): string => d.toISOString().slice(0, 10);
const somar = (d: Date, n: number): Date => new Date(d.getTime() + n * DIA_MS);
const utc = (ano: number, mes: number, dia: number): Date => new Date(Date.UTC(ano, mes - 1, dia));

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), meia-noite UTC. */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(ano, mes, dia);
}

/** Feriados nacionais do ano (fixos, Carnaval, Sexta-feira Santa e Corpus Christi), "AAAA-MM-DD". */
export function feriadosNacionais(ano: number): Set<string> {
  const p = pascoa(ano);
  const fixos: Array<[number, number]> = [
    [1, 1],
    [4, 21],
    [5, 1],
    [9, 7],
    [10, 12],
    [11, 2],
    [11, 15],
    [11, 20],
    [12, 25],
  ];
  const lista = fixos.map(([m, d]) => chave(utc(ano, m, d)));
  for (const delta of [-48, -47, -2, 60]) lista.push(chave(somar(p, delta)));
  return new Set(lista);
}

export function ehDiaUtil(dia: Date): boolean {
  const dow = dia.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !feriadosNacionais(dia.getUTCFullYear()).has(chave(dia));
}

/** O próprio dia, se útil; senão o primeiro útil seguinte. */
export function proximoDiaUtil(dia: Date): Date {
  let atual = dia;
  while (!ehDiaUtil(atual)) atual = somar(atual, 1);
  return atual;
}

/** `n` dias úteis depois de `dia` (n >= 0). Com n = 0 devolve `proximoDiaUtil(dia)`. */
export function somarDiasUteis(dia: Date, n: number): Date {
  let atual = proximoDiaUtil(dia);
  let falta = n;
  while (falta > 0) {
    atual = proximoDiaUtil(somar(atual, 1));
    falta -= 1;
  }
  return atual;
}
