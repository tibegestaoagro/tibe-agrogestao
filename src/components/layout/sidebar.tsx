"use client";

import Link from "next/link";
import { X } from "lucide-react";

export type NavLink = { href: string; label: string; show: boolean };

/**
 * Navegação lateral. Recebe os links JÁ filtrados (perfil ativo + permissão
 * de role) calculados no server component (layout.tsx) — importar
 * `@/lib/permissions` aqui quebraria o bundle do client, porque esse módulo
 * arrasta `getSessionUser` (`tenant-context.ts` → `auth.ts` → `rate-limit.ts`
 * → `ioredis`, que usa módulos Node como `dns` inexistentes no browser).
 *
 * Em telas pequenas vira um drawer (off-canvas): escondido por padrão,
 * controlado por `mobileOpen`/`onClose` (estado vive no DashboardShell, que
 * também tem o botão de abrir no header) — o painel é usado majoritariamente
 * pelo celular (fluxo nasce no WhatsApp), então isso não é opcional.
 */
export default function Sidebar({
  navLinks,
  mobileOpen,
  onClose,
}: {
  navLinks: NavLink[];
  mobileOpen: boolean;
  onClose: () => void;
}) {
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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-in-out md:static md:z-auto md:w-56 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <span className="text-2xl font-bold text-tibe-dark">Tibé</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 md:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3" onClick={onClose}>
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-tibe-light hover:text-tibe-dark"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
