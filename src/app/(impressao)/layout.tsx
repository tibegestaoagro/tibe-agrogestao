import type { ReactNode } from "react";

/**
 * Casca das páginas de impressão: fora do painel, sem menu nem cabeçalho.
 * A folha é sempre branca, como o papel, qualquer que seja o tema do usuário.
 */
export default function ImpressaoLayout({ children }: { children: ReactNode }) {
  return <div style={{ background: "#fff", color: "#000", minHeight: "100vh" }}>{children}</div>;
}
