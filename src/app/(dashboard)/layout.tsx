import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { getTenantRecord } from "@/lib/tenant-record";
import { requireSessionGateForPage } from "@/lib/session-gate";
import { getBillingState, isBillingExemptPath } from "@/lib/billing-access";
import { getActivePropertyId } from "@/lib/active-property";
import { buildNavItems } from "@/lib/nav";
import { isFeatureVisibleForUser } from "@/lib/features";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { DESTINO_DO_SO_DA_LOJA, paginaPermitidaAoSoDaLoja } from "@/lib/emporio/paginas-do-so-da-loja";
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
  const { access: billingAccess, archived } = await getBillingState(user.tenant_id);
  if (billingAccess === "blocked" && !isBillingExemptPath(pathname)) {
    redirect("/configuracoes/assinatura");
  }

  // F6b (Q120): quem é só da loja só abre as páginas da lista de permitidas;
  // o resto volta ao Empório. Lido do banco a cada request (papel.ts), nunca do JWT.
  // Vale mesmo com o recurso desligado: fecha por padrão, e /emporio é permitido,
  // então não há laço (lá o 404 do recurso responde).
  const papelEmporio = await papelDoEmporio(await getTenantDb(), user);
  const soDaLoja = papelEmporio.soDaLoja;
  if (soDaLoja && pathname && !paginaPermitidaAoSoDaLoja(pathname)) redirect(DESTINO_DO_SO_DA_LOJA);

  // Nome do tenant da própria sessão (Tenant não é tenant-scoped; lookup por
  // id). Vem do registro único por request: o gate de sessão e o controle de
  // inadimplência precisam da mesma linha, com outros campos.
  const tenant = await getTenantRecord(user.tenant_id);

  const hasFazenda = profiles.includes("fazenda");
  const hasPrestador = profiles.includes("prestador");
  // Módulo 39: perfil ativo não basta, o recurso é liberado por conta (e, na
  // Da Mata, por usuário), e quem decide isso é `isFeatureVisibleForUser`.
  const hasEmporio = await isFeatureVisibleForUser(user.tenant_id, user.id, "emporio");

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

  const navItems = buildNavItems({ role: user.role, hasFazenda, hasPrestador, hasEmporio,
    soDaLoja,
    veHistoricoDoEmporio: pode(papelEmporio, "gestor_da_loja"),
  });

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
          archived={archived}
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
