"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  X,
  Home,
  Warehouse,
  Layers,
  CalendarCheck,
  Calculator,
  BarChart3,
  MessageCircle,
  Settings,
  ChevronDown,
  KeyRound,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signOut } from "next-auth/react";

export type IconKey =
  | "home"
  | "fazenda"
  | "operacao"
  | "meu-dia"
  | "calculadora"
  | "numeros"
  | "whatsapp"
  | "configuracoes";

export type NavChild = { href: string; label: string; show: boolean };

export type NavItem =
  | { kind: "link"; href: string; label: string; icon: IconKey; show: boolean }
  | { kind: "group"; label: string; icon: IconKey; show: boolean; children: NavChild[] }
  | { kind: "soon"; label: string; icon: IconKey };

const ICONS: Record<IconKey, LucideIcon> = {
  home: Home,
  fazenda: Warehouse,
  operacao: Layers,
  "meu-dia": CalendarCheck,
  calculadora: Calculator,
  numeros: BarChart3,
  whatsapp: MessageCircle,
  configuracoes: Settings,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegação lateral. Recebe os itens JÁ filtrados por permissão de role
 * (perfil ativo continua resolvido dentro de cada `NavChild.show`, calculado
 * no server component `layout.tsx`): importar `@/lib/permissions` aqui
 * quebraria o bundle do client, porque esse módulo arrasta `getSessionUser`
 * (`tenant-context.ts` → `auth.ts` → `rate-limit.ts` → `ioredis`, módulos
 * Node inexistentes no browser).
 *
 * Em telas pequenas vira um drawer (off-canvas): escondido por padrão,
 * controlado por `mobileOpen`/`onClose` (estado vive no DashboardShell, que
 * também tem o botão de abrir no header): o painel é usado majoritariamente
 * pelo celular (fluxo nasce no WhatsApp), então isso não é opcional.
 */
export default function Sidebar({
  navItems,
  tenantName,
  userName,
  mobileOpen,
  onClose,
}: {
  navItems: NavItem[];
  tenantName: string;
  userName: string;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [manualToggle, setManualToggle] = useState<Record<string, boolean>>({});

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-sobreposicao/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-tibe-darkest text-tibe-light transition-transform duration-200 ease-in-out md:static md:z-auto md:w-60 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <TibeMark className="h-8 w-8 shrink-0" />
            <span className="text-xl font-bold tracking-wide text-texto-invertido">TIBÉ</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-md text-tibe-light/70 hover:bg-texto-invertido/10 hover:text-texto-invertido focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tibe-primary md:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3" onClick={(e) => {
          // Só fecha o drawer mobile quando o clique cai num link de verdade,
          // não ao abrir/fechar um grupo (senão o menu some antes de escolher).
          if ((e.target as HTMLElement).closest("a")) onClose();
        }}>
          {navItems.map((item) => {
            const Icon = ICONS[item.icon];

            if (item.kind === "link") {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tibe-primary md:min-h-0 ${
                    active
                      ? "bg-primaria text-sobre-primaria"
                      : "text-tibe-light/85 hover:bg-texto-invertido/10 hover:text-texto-invertido"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                </Link>
              );
            }

            if (item.kind === "soon") {
              return (
                <div
                  key={item.label}
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-tibe-light/60 md:min-h-0"
                  aria-disabled="true"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded-full bg-texto-invertido/10 px-2 py-0.5 text-[10px] font-normal">
                    em breve
                  </span>
                </div>
              );
            }

            // Grupo expansível.
            const children = item.children.filter((c) => c.show);
            if (children.length === 0) return null;
            const hasActiveChild = children.some((c) => isActive(pathname, c.href));
            const open = manualToggle[item.label] ?? hasActiveChild;

            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() =>
                    setManualToggle((prev) => ({ ...prev, [item.label]: !open }))
                  }
                  className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tibe-primary md:min-h-0 ${
                    hasActiveChild
                      ? "text-texto-invertido"
                      : "text-tibe-light/85 hover:bg-texto-invertido/10 hover:text-texto-invertido"
                  }`}
                  aria-expanded={open}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="ml-4 space-y-1 border-l border-texto-invertido/10 pl-4 pt-1">
                    {children.map((child) => {
                      const active = isActive(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tibe-primary md:min-h-0 ${
                            active
                              ? "font-medium text-texto-invertido"
                              : "text-tibe-light/70 hover:text-texto-invertido"
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="space-y-2 px-3 pb-2">
          <div className="flex items-center gap-2.5 rounded-lg bg-texto-invertido/5 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tibe-primary/25 text-tibe-primary">
              <Home className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-texto-invertido">{tenantName}</p>
              <p className="truncate text-xs text-tibe-light/60">{userName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/configuracoes/senha"
                className="flex h-11 w-11 items-center justify-center rounded-md text-tibe-light/70 hover:bg-texto-invertido/10 hover:text-texto-invertido focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tibe-primary sm:h-9 sm:w-9"
                aria-label="Minha senha"
                title="Minha senha"
              >
                <KeyRound className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex h-11 w-11 items-center justify-center rounded-md text-tibe-light/70 hover:bg-texto-invertido/10 hover:text-texto-invertido focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tibe-primary sm:h-9 sm:w-9"
                aria-label="Sair"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          <FarmSilhouette className="h-16 w-full text-tibe-dark" />
        </div>
      </aside>
    </>
  );
}

/** Marca do Tibé (docs/idVisual/id-visual-marca.jpeg), simplificada para 32px. */
function TibeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M20 10 L9 24 L20 38"
        fill="none"
        stroke="#FCF8F5"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M28 10 L39 24 L28 38"
        fill="none"
        stroke="#649721"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="17.5" y="15" width="13" height="4" rx="1.5" fill="#FCF8F5" />
      <rect x="22" y="15" width="4" height="20" rx="1.5" fill="#FCF8F5" />
      <path
        d="M20 9 Q24 5 28 9"
        fill="none"
        stroke="#E97D0F"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M22 6.5 Q24 4.5 26 6.5"
        fill="none"
        stroke="#E97D0F"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Ilustração decorativa leve (colinas + árvores), sem imagem/asset externo. */
function FarmSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 64" aria-hidden="true" className={className}>
      <path
        d="M0 44 Q30 24 60 38 T120 34 T180 42 T240 32 V64 H0 Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M0 52 Q40 36 90 48 T180 46 T240 48 V64 H0 Z"
        fill="currentColor"
      />
      {[
        { x: 34, s: 1 },
        { x: 58, s: 0.8 },
        { x: 196, s: 0.9 },
        { x: 218, s: 1.1 },
      ].map((tree, i) => (
        <g key={i} transform={`translate(${tree.x} 30) scale(${tree.s})`} opacity="0.9">
          <rect x="-1.5" y="10" width="3" height="10" fill="currentColor" />
          <circle cx="0" cy="8" r="7" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
