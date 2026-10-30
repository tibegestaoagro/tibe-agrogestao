"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BASE_DO_EMPORIO, GRUPOS, GUIA_DO_VENDEDOR, PARTES_DO_EMPORIO } from "../_conteudo/indice";

function Lista({ pathname }: { pathname: string }) {
  const classe = (ativo: boolean) =>
    `block rounded-md px-3 py-2 text-sm ${
      ativo ? "bg-primaria-suave font-medium text-primaria-tinta" : "text-texto-secundario hover:bg-superficie-afundada hover:text-texto"
    }`;
  return (
    <nav aria-label="Capítulo Meu Empório" className="space-y-4">
      <Link href={BASE_DO_EMPORIO} className={classe(pathname === BASE_DO_EMPORIO)}>
        Visão geral
      </Link>
      {GRUPOS.map((g) => (
        <div key={g}>
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-texto-discreto">{g}</p>
          <ul className="mt-1">
            {PARTES_DO_EMPORIO.filter((p) => p.grupo === g).map((p) => {
              const href = `${BASE_DO_EMPORIO}/${p.slug}`;
              return (
                <li key={p.slug}>
                  <Link href={href} className={classe(pathname === href)} aria-current={pathname === href ? "page" : undefined}>
                    {p.titulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Link href={GUIA_DO_VENDEDOR.href} className={classe(pathname === GUIA_DO_VENDEDOR.href)}>
        {GUIA_DO_VENDEDOR.titulo}
      </Link>
    </nav>
  );
}

/** Lateral no computador; no celular vira uma lista que abre no topo. */
export function IndiceDoCapitulo() {
  const pathname = usePathname();
  return (
    <>
      <details className="rounded-lg border border-borda bg-superficie lg:hidden">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-texto">Índice do capítulo</summary>
        <div className="border-t border-borda p-2">
          <Lista pathname={pathname} />
        </div>
      </details>
      <div className="hidden lg:block">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-borda bg-superficie p-2">
          <Lista pathname={pathname} />
        </div>
      </div>
    </>
  );
}
