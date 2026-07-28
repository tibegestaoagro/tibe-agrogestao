import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";

/**
 * Hub de configurações da plataforma (spec 2026-07-24): só master_admin.
 * Agrupa Equipe e Integrações (antes itens soltos na sidebar).
 */
export default async function PlatformConfiguracoesPage() {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");
  if (!isMasterAdmin(platformUser.role)) redirect("/plataforma/tenants");

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/plataforma/configuracoes/equipe"
          className="block rounded-lg border border-gray-800 bg-gray-900 p-5 transition hover:border-gray-700 hover:bg-gray-800/50"
        >
          <h2 className="font-semibold text-white">Equipe</h2>
          <p className="mt-1 text-sm text-gray-400">
            Gerenciar administradores e equipe da plataforma.
          </p>
        </Link>
        <Link
          href="/plataforma/configuracoes/integracoes"
          className="block rounded-lg border border-gray-800 bg-gray-900 p-5 transition hover:border-gray-700 hover:bg-gray-800/50"
        >
          <h2 className="font-semibold text-white">Integrações</h2>
          <p className="mt-1 text-sm text-gray-400">
            Provedores externos conectados ao Tibé.
          </p>
        </Link>
      </div>
    </div>
  );
}
