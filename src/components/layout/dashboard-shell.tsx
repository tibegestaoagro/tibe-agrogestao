"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar, { type NavLink } from "@/components/layout/sidebar";
import LogoutButton from "@/components/logout-button";
import BillingBanner from "@/components/billing/billing-banner";
import type { BillingAccess } from "@/lib/billing-access";

/**
 * Casca do dashboard (sidebar + header + conteúdo). Extraído de
 * (dashboard)/layout.tsx pra virar client component — precisa de estado pra
 * abrir/fechar o menu no celular, já que o painel é usado majoritariamente
 * pelo WhatsApp/celular, não desktop.
 */
export default function DashboardShell({
  navLinks,
  tenantName,
  userName,
  roleLabel,
  billingAccess,
  children,
}: {
  navLinks: NavLink[];
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
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar navLinks={navLinks} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
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
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{tenantName}</p>
            <p className="truncate text-xs text-gray-500">
              {userName} · {roleLabel}
            </p>
          </div>
          <LogoutButton />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
