/**
 * Balcão rápido (Q361): as teclas que o balcão aceita como atalho. A lista é
 * fechada de propósito: fica fora o que o navegador toma (F1, F3, F5, F6, F7,
 * F10 a F12) e o que escreveria no campo (Shift com letra).
 */

export const TECLAS_PERMITIDAS: readonly string[] = [
  "F2",
  "F4",
  "F8",
  "F9",
  "Ctrl+Enter",
  "Alt+1",
  "Alt+2",
  "Alt+3",
  "Alt+4",
  "Alt+5",
  "Alt+6",
  "Alt+7",
  "Alt+8",
  "Alt+9",
];

export const ACOES_DE_ATALHO = ["produto", "cliente", "vendedor", "pagamento", "fechar"] as const;
export type AcaoDeAtalho = (typeof ACOES_DE_ATALHO)[number];

export const ATALHOS_PADRAO: Record<AcaoDeAtalho, string> = {
  produto: "F2",
  cliente: "F4",
  vendedor: "F8",
  pagamento: "F9",
  fechar: "Ctrl+Enter",
};

/** A tecla do evento no formato de `TECLAS_PERMITIDAS`, ou `null` se não é uma delas. */
export function teclaDoEvento(e: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  if (e.metaKey || e.shiftKey) return null;
  if (!e.ctrlKey && !e.altKey && ["F2", "F4", "F8", "F9"].includes(e.key)) return e.key;
  if (e.ctrlKey && !e.altKey && e.key === "Enter") return "Ctrl+Enter";
  if (e.altKey && !e.ctrlKey && /^[1-9]$/.test(e.key)) return `Alt+${e.key}`;
  return null;
}
