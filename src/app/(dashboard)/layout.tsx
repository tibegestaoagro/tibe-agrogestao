import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser, getActiveProfiles } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { getBillingAccess, isBillingExemptPath } from "@/lib/billing-access";
import Sidebar from "@/components/layout/sidebar";
import LogoutButton from "@/components/logout-button";
import BillingBanner from "@/components/billing/billing-banner";

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
 * - acesso liberado por status de cobrança (spec 5.7/5.8) — bloqueado
 *   redireciona para a página de assinatura, exceto na própria página.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profiles = await getActiveProfiles();
  if (profiles.length === 0) redirect("/onboarding");

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

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profiles={profiles} role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BillingBanner access={billingAccess} />
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              {tenant?.name ?? "—"}
            </p>
            <p className="text-xs text-gray-500">
              {user.name} · {ROLE_LABEL[user.role] ?? user.role}
            </p>
          </div>
          <LogoutButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
