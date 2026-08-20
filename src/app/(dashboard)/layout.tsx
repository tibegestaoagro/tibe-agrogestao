import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { getTenantRecord } from "@/lib/tenant-record";
import { requireSessionGateForPage } from "@/lib/session-gate";
import { getBillingAccess, isBillingExemptPath } from "@/lib/billing-access";
import { getActivePropertyId } from "@/lib/active-property";
import { buildNavItems } from "@/lib/nav";
import DashboardShell from "@/components/layout/dashboard-shell";
import InstallInvite from "@/components/pwa/install-invite";
import NotificationOptIn from "@/components/pwa/notification-opt-in";
import { ToastProvider } from "@/components/ui/toast";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  OPERADOR: "Operador",
  VISUALIZADOR: "Visualizador",
};

/**
 * Layout protegido do dashboard (spec task 0.7). Garante:
 * - sessão válida (senão → login);
 * - pelo menos um TenantProfile ativo (senão → onboarding);
 * - acesso liberado por status de cobrança (spec 5.7/5.8): bloqueado
 *   redireciona para a página de assinatura, exceto na própria página.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { active_profiles: profiles } = await requireSessionGateForPage(user);

  const pathname = (await headers()).get("x-pathname") ?? "";
  const billingAccess = await getBillingAccess(user.tenant_id);
  if (billingAccess === "blocked" && !isBillingExemptPath(pathname)) {
    redirect("/configuracoes/assinatura");
  }

  // Nome do tenant da própria sessão (Tenant não é tenant-scoped; lookup por
  // id). Vem do registro único por request: o gate de sessão e o controle de
  // inadimplência precisam da mesma linha, com outros campos.
  const tenant = await getTenantRecord(user.tenant_id);

  const hasFazenda = profiles.includes("fazenda");
  const hasPrestador = profiles.includes("prestador");

  // Seletor de propriedade no topo (briefing de layout, seção 12): só
  // busca se o perfil fazenda estiver ativo (senão não existe Property).
  let properties: { id: string; name: string }[] = [];
  let activePropertyId: string | null = null;
  if (hasFazenda) {
    const db = await getTenantDb();
    const [propertyRows, active] = await Promise.all([
      db.property.findMany({
        where: { archived_at: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      getActivePropertyId(db),
    ]);
    properties = propertyRows;
    activePropertyId = active;
  }

  const navItems = buildNavItems({ role: user.role, hasFazenda, hasPrestador });

  return (
    <>
      {/* O provider envolve o painel inteiro porque toda ação de escrita
          precisa poder avisar, e elas estão espalhadas por 27 formulários e
          por botões soltos dentro de tabela. */}
      <ToastProvider>
        <DashboardShell
          navItems={navItems}
          tenantName={tenant?.name ?? "Fazenda"}
          userName={user.name ?? "Usuário"}
          roleLabel={ROLE_LABEL[user.role] ?? user.role}
          billingAccess={billingAccess}
          properties={properties}
          activePropertyId={activePropertyId}
        >
          {children}
        </DashboardShell>
        <InstallInvite />
        <NotificationOptIn />
      </ToastProvider>
    </>
  );
}
