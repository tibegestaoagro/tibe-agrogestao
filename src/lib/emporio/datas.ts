/** Data de calendário "AAAA-MM-DD" (ou ISO completo) como "DD/MM/AAAA", sem passar por fuso. */
export function dataBr(iso: string): string {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

/** Hoje em Brasília como "AAAA-MM-DD". */
export function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
