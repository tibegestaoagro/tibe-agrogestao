import Link from "next/link";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/emporio/financeiro", rotulo: "Hoje" },
  { href: "/emporio/financeiro/pagar", rotulo: "A pagar" },
  { href: "/emporio/financeiro/receber", rotulo: "A receber" },
  { href: "/emporio/financeiro/cobranca", rotulo: "Cobrança" },
  { href: "/emporio/financeiro/caixa", rotulo: "Posição de caixa" },
  { href: "/emporio/financeiro/aprovacoes", rotulo: "Aprovações" },
  { href: "/emporio/financeiro/projecao", rotulo: "Projeção" },
  { href: "/emporio/financeiro/relatorios", rotulo: "Relatórios" },
] as const;

/** O endereço de uma aba do Financeiro, levando a loja escolhida junto. */
export const enderecoDaAba = (href: string, loja: string) =>
  loja ? `${href}?loja=${encodeURIComponent(loja)}` : href;

/** A subnavegação da casa do Financeiro. Cada link preserva `?loja=`. */
export function FinanceiroAbas({ atual, loja }: { atual: (typeof ABAS)[number]["href"]; loja: string }) {
  return (
    <nav aria-label="Telas do Financeiro" className="flex flex-wrap gap-2">
      {ABAS.map((a) => (
        <Link
          key={a.href}
          href={enderecoDaAba(a.href, loja)}
          aria-current={a.href === atual ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria sm:min-h-9",
            a.href === atual
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
