"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  X,
  Home,
  Warehouse,
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
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
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
          <span className="text-xl font-bold tracking-tight text-white">Tibé</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-tibe-light/70 hover:bg-white/10 hover:text-white md:hidden"
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
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-tibe-primary text-white"
                      : "text-tibe-light/85 hover:bg-white/10 hover:text-white"
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
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-tibe-light/40"
                  aria-disabled="true"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-normal">
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
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                    hasActiveChild
                      ? "text-white"
                      : "text-tibe-light/85 hover:bg-white/10 hover:text-white"
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
                  <div className="ml-4 space-y-1 border-l border-white/10 pl-4 pt-1">
                    {children.map((child) => {
                      const active = isActive(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`block rounded-md px-3 py-1.5 text-sm transition ${
                            active
                              ? "font-medium text-white"
                              : "text-tibe-light/70 hover:text-white"
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

        <div className="space-y-3 px-3 pb-3">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{tenantName}</p>
              <p className="truncate text-xs text-tibe-light/60">{userName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/configuracoes/senha"
                className="rounded-md p-1.5 text-tibe-light/70 hover:bg-white/10 hover:text-white"
                aria-label="Minha senha"
                title="Minha senha"
              >
                <KeyRound className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="rounded-md p-1.5 text-tibe-light/70 hover:bg-white/10 hover:text-white"
                aria-label="Sair"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          <svg
            viewBox="0 0 240 56"
            aria-hidden="true"
            className="h-14 w-full text-tibe-dark"
          >
            <path
              d="M0 40 Q 30 20 60 34 T 120 30 T 180 38 T 240 28 V56 H0 Z"
              fill="currentColor"
              opacity="0.6"
            />
            <path
              d="M0 48 Q 40 32 90 44 T 180 42 T 240 44 V56 H0 Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </aside>
    </>
  );
}
