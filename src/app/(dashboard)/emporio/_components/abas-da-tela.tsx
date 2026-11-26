import Link from "next/link";
import { cn } from "@/lib/utils";

/** Abas de uma tela, por `?aba=`. Cada aba traz o `href` pronto (quem chama preserva a loja). */
export function AbasDaTela({
  rotulo,
  abas,
  atual,
}: {
  rotulo: string;
  abas: { valor: string; rotulo: string; href: string }[];
  atual: string;
}) {
  return (
    <nav aria-label={rotulo} className="flex flex-wrap gap-2">
      {abas.map((a) => (
        <Link
          key={a.valor}
          href={a.href}
          aria-current={a.valor === atual ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria sm:min-h-9",
            a.valor === atual
              ? "border-primaria bg-primaria text-sobre-primaria"
              : "border-borda bg-superficie text-texto hover:border-borda-forte",
          )}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
