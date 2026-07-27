import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";

/** Lista de integrações externas (spec 2026-07-24) — só master_admin. */
export default async function PlatformIntegracoesPage() {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");
  if (!isMasterAdmin(platformUser.role)) redirect("/plataforma/tenants");

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-white">Integrações</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/plataforma/configuracoes/whatsapp"
          className="block rounded-lg border border-gray-800 bg-gray-900 p-5 transition hover:border-gray-700 hover:bg-gray-800/50"
        >
          <h2 className="font-semibold text-white">WhatsApp</h2>
          <p className="mt-1 text-sm text-gray-400">
            Evolution API ou Meta Cloud API.
          </p>
        </Link>
      </div>
    </div>
  );
}
