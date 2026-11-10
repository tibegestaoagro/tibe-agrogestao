import { Button } from "@/components/ui/button";

/** Monta `?a=1&b=2` só com o que tem valor; vazio vira string vazia. */
export function consulta(p: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * As duas saídas de um relatório do dinheiro, com os filtros que a tela está
 * usando: a planilha (CSV da rota) e a folha para imprimir ou salvar em PDF
 * (página de impressão, em nova aba).
 */
export function RelatorioAcoes({ csvHref, imprimirHref }: { csvHref: string; imprimirHref: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={csvHref} download>
          Baixar planilha
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={imprimirHref} target="_blank" rel="noopener noreferrer">
          Imprimir ou salvar em PDF
        </a>
      </Button>
    </div>
  );
}
