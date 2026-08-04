import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { requireSessionGateForPage } from "@/lib/session-gate";
import { getBillingAccess, isBillingExemptPath } from "@/lib/billing-access";
import { hasMinRole } from "@/lib/permissions";
import { getActivePropertyId } from "@/lib/active-property";
import DashboardShell from "@/components/layout/dashboard-shell";
import type { NavItem } from "@/components/layout/sidebar";
import InstallInvite from "@/components/pwa/install-invite";
import NotificationOptIn from "@/components/pwa/notification-opt-in";

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

  const pathname = headers().get("x-pathname") ?? "";
  const billingAccess = await getBillingAccess(user.tenant_id);
  if (billingAccess === "blocked" && !isBillingExemptPath(pathname)) {
    redirect("/configuracoes/assinatura");
  }

  // Nome do tenant da própria sessão (Tenant não é tenant-scoped; lookup por id).
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenant_id },
    select: { name: true },
  });

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

  // Fase 1 do briefing de layout (docs/design/briefing-novo-layout.md):
  // reagrupa os 12 links planos de sempre em 7 entradas, seguindo a IA do
  // mockup do cliente. Nenhuma regra de permissão nova: "Configurações da
  // conta" aponta pro hub /configuracoes, que já é gated por
  // hasMinRole("ADMIN") e já lista Usuários/Assinatura internamente (a
  // segunda com o gate extra de OWNER): evita duplicar essa checagem aqui.
  const navItems: NavItem[] = [
    { kind: "link", href: "/dashboard", label: "Início", icon: "home", show: true },
    // "Minha Fazenda" (Módulo 29): tela própria de cadastro da fazenda +
    // pastos, ponto de partida do sistema (docs/Minha Fazenda —
    // Especificação Funcional.doc). Antes deste módulo, "Minha Fazenda" era
    // o nome do grupo abaixo (Rebanho/Máquinas/.../Alertas): renomeado pra
    // "Operação" pra não colidir com o novo significado (decisão do
    // usuário, 2026-08-04).
    { kind: "link", href: "/minha-fazenda", label: "Minha Fazenda", icon: "fazenda", show: hasFazenda },
    {
      kind: "group",
      label: "Operação",
      icon: "operacao",
      show: true,
      children: [
        { href: "/rebanho", label: "Rebanho", show: hasFazenda },
        { href: "/maquinas", label: "Máquinas", show: hasFazenda },
        { href: "/lavoura", label: "Lavoura", show: hasFazenda },
        { href: "/prestador", label: "Prestador", show: hasPrestador },
        { href: "/financeiro", label: "Financeiro", show: true },
        { href: "/alertas", label: "Alertas", show: true },
      ],
    },
    { kind: "link", href: "/meu-dia", label: "Meu Dia", icon: "meu-dia", show: true },
    { kind: "link", href: "/calculadoras", label: "Calculadora Pecuária", icon: "calculadora", show: true },
    // "Fazenda em Números" (Fase 2): esclarecido pelo usuário como área de
    // inteligência que centraliza os relatórios (DRE, evolução do rebanho,
    // produtividade, faturamento), não mais um placeholder "em breve".
    { kind: "link", href: "/relatorios", label: "Fazenda em Números", icon: "numeros", show: true },
    // "WhatsApp" continua sem conteúdo real (nenhum número de contato
    // configurado em lugar nenhum do código ainda): segue desabilitado.
    { kind: "soon", label: "WhatsApp", icon: "whatsapp" },
    {
      kind: "group",
      label: "Configurações",
      icon: "configuracoes",
      show: true,
      children: [
        { href: "/configuracoes", label: "Configurações da conta", show: hasMinRole(user.role, "ADMIN") },
        // Perfil e senha não são privilégio de papel: todo usuário precisa
        // alcançar isso, inclusive quem não vê o resto (Módulo 19).
        { href: "/configuracoes/perfil", label: "Perfil", show: true },
        { href: "/configuracoes/senha", label: "Minha senha", show: true },
      ],
    },
  ];

  return (
    <>
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
    </>
  );
}
