import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const VARIANTS = {
  green: {
    bg: "bg-tibe-primary/10",
    iconBg: "bg-tibe-primary/15",
    iconColor: "text-tibe-primary",
    button: "bg-tibe-primary text-white group-hover:bg-tibe-dark",
  },
  orange: {
    bg: "bg-tibe-accentLight",
    iconBg: "bg-white/70",
    iconColor: "text-tibe-accent",
    button: "bg-tibe-accent text-white group-hover:bg-tibe-accentDark",
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
      <p className="mt-3 text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-semibold text-tibe-dark">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-gray-500">{sub}</p>}
    </Link>
  );
}
