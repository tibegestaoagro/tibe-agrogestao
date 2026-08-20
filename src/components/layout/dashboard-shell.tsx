"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar, { type NavItem } from "@/components/layout/sidebar";
import BillingBanner from "@/components/billing/billing-banner";
import PropertySelector, { type PropertyOption } from "@/components/layout/property-selector";
import UserMenu from "@/components/layout/user-menu";
import type { BillingAccess } from "@/lib/billing-access";

/**
 * Casca do dashboard (sidebar + header + conteúdo). Extraído de
 * (dashboard)/layout.tsx pra virar client component: precisa de estado pra
 * abrir/fechar o menu no celular, já que o painel é usado majoritariamente
 * pelo WhatsApp/celular, não desktop.
 *
 * Briefing de layout (docs/design/briefing-novo-layout.md): seletor de
 * propriedade e menu de conta (Perfil/Minha senha/Sair) no topo, seção 12;
 * nome do tenant/usuário e os atalhos de senha/logout continuam TAMBÉM no
 * rodapé da sidebar (Fase 1): os dois elementos coexistem no mockup.
 */
export default function DashboardShell({
  navItems,
  tenantName,
  userName,
  roleLabel,
  billingAccess,
  properties,
  activePropertyId,
  children,
}: {
  navItems: NavItem[];
  tenantName: string;
  userName: string;
  roleLabel: string;
  billingAccess: BillingAccess;
  properties: PropertyOption[];
  activePropertyId: string | null;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Fecha a gaveta ao navegar. Ajuste durante o render, e nao efeito: com
  // efeito, o React pintava a tela nova com a gaveta ainda aberta e so entao
  // fechava, causando um piscar. Este e o padrao que a documentacao do React
  // chama de "ajustar estado quando uma prop muda".
  const [pathAnterior, setPathAnterior] = useState(pathname);
  if (pathAnterior !== pathname) {
    setPathAnterior(pathname);
    setMobileOpen(false);
  }

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
          <PropertySelector properties={properties} activePropertyId={activePropertyId} />
          <div className="min-w-0 flex-1" />
          <UserMenu userName={userName} roleLabel={roleLabel} />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
