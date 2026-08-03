"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar, { type NavItem } from "@/components/layout/sidebar";
import BillingBanner from "@/components/billing/billing-banner";
import type { BillingAccess } from "@/lib/billing-access";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Casca do dashboard (sidebar + header + conteúdo). Extraído de
 * (dashboard)/layout.tsx pra virar client component: precisa de estado pra
 * abrir/fechar o menu no celular, já que o painel é usado majoritariamente
 * pelo WhatsApp/celular, não desktop.
 *
 * Fase 1 do briefing de layout (docs/design/briefing-novo-layout.md): nome
 * do tenant/usuário e o botão de sair migraram para o rodapé da sidebar
 * (mais perto do mockup); o header ficou só com o essencial (menu mobile +
 * avatar de iniciais), sem busca/sino/seletor de fazenda (decisão explícita
 * de simplificar por enquanto, não um esquecimento).
 */
export default function DashboardShell({
  navItems,
  tenantName,
  userName,
  roleLabel,
  billingAccess,
  children,
}: {
  navItems: NavItem[];
  tenantName: string;
  userName: string;
  roleLabel: string;
  billingAccess: BillingAccess;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-tibe-light">
      <Sidebar
        navItems={navItems}
        tenantName={tenantName}
        userName={userName}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <BillingBanner access={billingAccess} />
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1" />
          <div className="hidden text-right sm:block">
            <p className="truncate text-sm font-medium text-gray-900">{userName}</p>
            <p className="truncate text-xs text-gray-500">{roleLabel}</p>
          </div>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tibe-primary text-sm font-semibold text-white"
            title={userName}
          >
            {initialsOf(userName)}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
