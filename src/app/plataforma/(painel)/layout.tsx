import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";
import PlatformLogoutButton from "@/components/platform/platform-logout-button";

const ROLE_LABEL: Record<string, string> = {
  MASTER_ADMIN: "Master Admin",
  EQUIPE: "Equipe",
};

/**
 * Layout do painel autenticado (Módulo 6, task 6.8/6.9/6.10). O middleware já
 * bloqueia /plataforma/* sem sessão de PlatformUser (getToken sobre o cookie
 * próprio) — este guard aqui é defesa em profundidade, igual ao padrão já
 * usado no DashboardLayout de tenant.
 */
export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");

  const masterAdmin = isMasterAdmin(platformUser.role);

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-900">
        <div className="px-5 py-5">
          <span className="text-xl font-bold text-white">Tibé Plataforma</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {masterAdmin && (
            <Link href="/plataforma/visao-geral" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white">
              Visão geral
            </Link>
          )}
          <Link href="/plataforma/tenants" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white">
            Tenants
          </Link>
          {masterAdmin && (
            <Link href="/plataforma/configuracoes" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white">
              Configurações
            </Link>
          )}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-6 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{platformUser.name}</p>
            <p className="text-xs text-gray-400">{ROLE_LABEL[platformUser.role] ?? platformUser.role}</p>
          </div>
          <PlatformLogoutButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
