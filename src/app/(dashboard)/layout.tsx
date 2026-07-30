import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { requireSessionGateForPage } from "@/lib/session-gate";
import { getBillingAccess, isBillingExemptPath } from "@/lib/billing-access";
import { canAccess } from "@/lib/permissions";
import DashboardShell from "@/components/layout/dashboard-shell";
import type { NavLink } from "@/components/layout/sidebar";

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
  const navLinks: NavLink[] = [
    { href: "/dashboard", label: "Início", show: true },
    { href: "/rebanho", label: "Rebanho", show: hasFazenda },
    { href: "/lavoura", label: "Lavoura", show: hasFazenda },
    { href: "/prestador", label: "Prestador", show: hasPrestador },
    { href: "/financeiro", label: "Financeiro", show: true },
    { href: "/alertas", label: "Alertas", show: true },
    { href: "/configuracoes/usuarios", label: "Usuários", show: canAccess(user.role, "usuarios") },
    { href: "/configuracoes/assinatura", label: "Assinatura", show: canAccess(user.role, "assinatura") },
    // Trocar a própria senha não é privilégio de papel: todo usuário precisa
    // alcançar isso, inclusive quem não vê Configurações (Módulo 19).
    { href: "/configuracoes/senha", label: "Minha senha", show: true },
  ].filter((l) => l.show);

  return (
    <DashboardShell
      navLinks={navLinks}
      tenantName={tenant?.name ?? "—"}
      userName={user.name ?? "—"}
      roleLabel={ROLE_LABEL[user.role] ?? user.role}
      billingAccess={billingAccess}
    >
      {children}
    </DashboardShell>
  );
}
