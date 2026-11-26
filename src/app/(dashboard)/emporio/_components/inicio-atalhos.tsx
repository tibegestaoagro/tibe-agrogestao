import Link from "next/link";

export type AtalhoDoInicio = { href: string; rotulo: string };

/** Os atalhos que o papel abre; a página decide a lista (por `veAPagina`) e a ordem. */
export function InicioAtalhos({ atalhos }: { atalhos: AtalhoDoInicio[] }) {
  if (atalhos.length === 0) return null;
  return (
    <section aria-labelledby="inicio-atalhos" className="space-y-2">
      <h2 id="inicio-atalhos" className="text-lg font-semibold text-texto">
        Atalhos
      </h2>
      <div className="flex flex-wrap gap-2">
        {atalhos.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="inline-flex min-h-11 items-center rounded-lg border border-borda bg-superficie px-4 text-sm font-medium text-texto shadow-sm hover:border-borda-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria"
          >
            {a.rotulo}
          </Link>
        ))}
      </div>
    </section>
  );
}
