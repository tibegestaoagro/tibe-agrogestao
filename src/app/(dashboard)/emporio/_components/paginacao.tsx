import Link from "next/link";
import { cn } from "@/lib/utils";

/** Números a mostrar: a primeira, a última, a atual e as vizinhas; `null` é reticências. */
export function numerosDaPaginacao(atual: number, ultima: number): (number | null)[] {
  const base = new Set<number>([1, ultima, atual - 1, atual, atual + 1]);
  const ordenados = [...base].filter((n) => n >= 1 && n <= ultima).sort((a, b) => a - b);
  const saida: (number | null)[] = [];
  ordenados.forEach((n, i) => {
    const anterior = ordenados[i - 1];
    if (i > 0) {
      if (n - anterior === 2) saida.push(n - 1);
      else if (n - anterior > 2) saida.push(null);
    }
    saida.push(n);
  });
  return saida;
}

const ITEM =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-borda px-3 text-sm font-medium";

/**
 * Paginação por links (a página server relê a URL). `hrefDe(n)` monta o endereço
 * da página n, com os demais filtros preservados.
 */
export function Paginacao({
  page,
  perPage,
  total,
  hrefDe,
}: {
  page: number;
  perPage: number;
  total: number;
  hrefDe: (pagina: number) => string;
}) {
  if (total === 0) return null;
  const ultima = Math.max(1, Math.ceil(total / perPage));
  const de = (page - 1) * perPage + 1;
  const ate = Math.min(total, page * perPage);

  return (
    <div className="space-y-3">
      <p className="text-sm text-texto-secundario">
        Mostrando {de} a {ate} de {total}
      </p>
      {ultima > 1 && (
        <nav aria-label="Paginação" className="flex flex-wrap items-center gap-2">
          {page > 1 ? (
            <Link href={hrefDe(page - 1)} className={cn(ITEM, "bg-superficie text-texto hover:bg-superficie-afundada")}>
              Anterior
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(ITEM, "cursor-not-allowed text-texto-secundario opacity-50")}>
              Anterior
            </span>
          )}
          {numerosDaPaginacao(page, ultima).map((n, i) =>
            n === null ? (
              <span key={`r${i}`} aria-hidden="true" className="px-1 text-texto-secundario">
                ...
              </span>
            ) : n === page ? (
              <span
                key={n}
                aria-current="page"
                className={cn(ITEM, "border-primaria bg-primaria text-sobre-primaria")}
              >
                {n}
              </span>
            ) : (
              <Link
                key={n}
                href={hrefDe(n)}
                aria-label={`Página ${n}`}
                className={cn(ITEM, "bg-superficie text-texto hover:bg-superficie-afundada")}
              >
                {n}
              </Link>
            ),
          )}
          {page < ultima ? (
            <Link href={hrefDe(page + 1)} className={cn(ITEM, "bg-superficie text-texto hover:bg-superficie-afundada")}>
              Próxima
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(ITEM, "cursor-not-allowed text-texto-secundario opacity-50")}>
              Próxima
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
