import Link from "next/link";
import { prisma } from "@/lib/prisma";
import TenantFilters from "@/components/platform/tenant-filters";
import StatusBadge from "@/components/platform/status-badge";
import CreateTenantForm from "@/components/platform/create-tenant-form";

const PLAN_LABEL: Record<string, string> = { campo: "Campo", fazenda: "Fazenda", grupo: "Grupo" };

/** Lista de tenants (spec 6.3/6.9) — acessível a equipe e master_admin. */
export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: { status?: string; plan?: string; q?: string };
}) {
  const tenants = await prisma.tenant.findMany({
    where: {
      ...(searchParams.plan ? { plan: searchParams.plan as "campo" | "fazenda" | "grupo" } : {}),
      ...(searchParams.q
        ? {
            OR: [
              { name: { contains: searchParams.q, mode: "insensitive" } },
              { document: { contains: searchParams.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { created_at: "desc" },
    include: {
      profiles: { where: { active: true } },
      subscription: { select: { status: true, next_due_date: true } },
    },
  });

  const mapped = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    document: t.document,
    plan: t.plan,
    status: t.subscription?.status ?? "trial",
    active_profiles: t.profiles.map((p) => p.profile_type),
    created_at: t.created_at,
  }));

  const filtered = searchParams.status ? mapped.filter((t) => t.status === searchParams.status) : mapped;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Tenants</h1>
        <div className="flex flex-wrap items-center gap-3">
          <TenantFilters />
          <CreateTenantForm />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Perfis</th>
              <th className="px-4 py-3">Cadastro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <Link href={`/plataforma/tenants/${t.id}`} className="font-medium text-white hover:underline">
                    {t.name}
                  </Link>
                  <p className="text-xs text-gray-500">{t.document}</p>
                </td>
                <td className="px-4 py-3 text-gray-300">{PLAN_LABEL[t.plan] ?? t.plan}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-4 py-3 text-gray-300">{t.active_profiles.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-gray-400">{t.created_at.toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Nenhum tenant encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
