import { redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";
import { prisma } from "@/lib/prisma";
import InviteTeamForm from "@/components/platform/invite-team-form";
import TeamRowActions from "@/components/platform/team-row-actions";

/** Gestão de equipe da plataforma (spec 6.10): só master_admin. */
export default async function PlatformTeamPage() {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");
  if (!isMasterAdmin(platformUser.role)) redirect("/plataforma/tenants");

  const members = await prisma.platformUser.findMany({ orderBy: { created_at: "asc" } });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Equipe</h1>
        <InviteTeamForm />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Papel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium text-white">{m.name}</td>
                <td className="px-4 py-3 text-gray-300">{m.email}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.active ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-600/20 text-gray-400"}`}>
                    {m.active ? "Ativo" : "Desativado"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <TeamRowActions
                    memberId={m.id}
                    role={m.role}
                    active={m.active}
                    isSelf={m.id === platformUser.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Equipe vê tenants mas não KPIs financeiros; Master Admin tem acesso completo, incluindo forçar
        status de assinatura e gerenciar esta equipe.
      </p>
    </div>
  );
}
