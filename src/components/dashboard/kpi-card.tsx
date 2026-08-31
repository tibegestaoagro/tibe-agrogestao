import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * As cores da marca continuam as mesmas; o que mudou foi o que se pinta EM
 * CIMA delas. Ícone e texto usam a variante "tinta" (o mesmo matiz, escurecido
 * o suficiente para passar em AA sobre o fundo tintado), e o botão usa o
 * verde-escuro da marca em vez de branco. Antes: ícone laranja sobre laranja
 * claro a 2,3:1 e botão branco sobre laranja a 2,84:1.
 */
const VARIANTS = {
  green: {
    bg: "bg-primaria-suave",
    iconBg: "bg-primaria/15",
    iconColor: "text-primaria-tinta",
    button: "bg-primaria text-sobre-primaria group-hover:bg-primaria-hover",
  },
  orange: {
    bg: "bg-acento-suave",
    iconBg: "bg-superficie/70",
    iconColor: "text-acento-tinta",
    button: "bg-acento text-sobre-acento group-hover:bg-acento-hover",
  },
} as const;

/**
 * Card de KPI "hero" do dashboard (briefing de layout, Fase 2): fundo
 * tintado verde ou laranja, ícone, valor grande, botão circular de ação.
 * Estilo fiel ao mockup do cliente (docs/idVisual/ID-visual-dashboard.jpeg).
 */
export default function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  variant,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  variant: "green" | "orange";
  href: string;
}) {
  const v = VARIANTS[variant];
  return (
    <Link href={href} className={`group block rounded-xl ${v.bg} p-4 transition hover:brightness-[0.97]`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${v.iconBg} ${v.iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${v.button}`}>
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-sm text-texto-secundario">{label}</p>
      <p className="text-2xl font-semibold text-tibe-dark">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-texto-secundario">{sub}</p>}
    </Link>
  );
}
