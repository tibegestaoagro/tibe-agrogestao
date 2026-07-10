import { notFound, redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";
import { prisma } from "@/lib/prisma";
import StatusBadge from "@/components/platform/status-badge";
import ForceStatusForm from "@/components/platform/force-status-form";

const PLAN_LABEL: Record<string, string> = { campo: "Campo", fazenda: "Fazenda", grupo: "Grupo" };
const PROFILE_LABEL: Record<string, string> = { fazenda: "Fazenda", prestador: "Prestador de Serviço" };

/** Detalhe do tenant (spec 6.3/6.9) — histórico de assinatura e resumo de uso. */
export default async function PlatformTenantDetailPage({ params }: { params: { id: string } }) {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      profiles: true,
      subscription: { include: { status_logs: { orderBy: { created_at: "desc" } } } },
    },
  });
  if (!tenant) notFound();

  const activeProfiles = tenant.profiles.filter((p) => p.active).map((p) => p.profile_type);
  const [animalsCount, plotsCount, ordersCount] = await Promise.all([
    activeProfiles.includes("fazenda") ? prisma.animal.count({ where: { tenant_id: tenant.id } }) : 0,
    activeProfiles.includes("fazenda") ? prisma.plot.count({ where: { tenant_id: tenant.id } }) : 0,
    activeProfiles.includes("prestador") ? prisma.serviceOrder.count({ where: { tenant_id: tenant.id } }) : 0,
  ]);

  const status = tenant.subscription?.status ?? "trial";

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
          <p className="text-sm text-gray-500">{tenant.document}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold text-gray-300">Dados cadastrais</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-500">Plano</dt>
            <dd className="text-white">{PLAN_LABEL[tenant.plan] ?? tenant.plan}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Telefone</dt>
            <dd className="text-white">{tenant.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Email</dt>
            <dd className="text-white">{tenant.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Perfis ativos</dt>
            <dd className="text-white">{activeProfiles.map((p) => PROFILE_LABEL[p] ?? p).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Cadastrado em</dt>
            <dd className="text-white">{tenant.created_at.toLocaleDateString("pt-BR")}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Origem</dt>
            <dd className="text-white">{tenant.lead_source_utm_source ?? "Direto / sem origem"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold text-gray-300">Uso</h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
          <div>
            <dt className="text-xs text-gray-500">Animais</dt>
            <dd className="text-lg font-semibold text-white">{animalsCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Talhões</dt>
            <dd className="text-lg font-semibold text-white">{plotsCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Ordens de serviço</dt>
            <dd className="text-lg font-semibold text-white">{ordersCount}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Assinatura</h2>
          {isMasterAdmin(platformUser.role) && <ForceStatusForm tenantId={tenant.id} />}
        </div>
        {tenant.subscription ? (
          <>
            <p className="mt-2 text-sm text-gray-400">
              Próximo vencimento:{" "}
              {tenant.subscription.next_due_date
                ? tenant.subscription.next_due_date.toLocaleDateString("pt-BR")
                : "—"}
            </p>
            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-gray-500">Histórico de transições</p>
              {tenant.subscription.status_logs.length === 0 && (
                <p className="text-sm text-gray-500">Sem histórico ainda.</p>
              )}
              {tenant.subscription.status_logs.map((log) => (
                <div key={log.id} className="flex flex-wrap items-center gap-2 border-b border-gray-800 py-2 text-sm">
                  <span className="text-gray-400">{log.created_at.toLocaleString("pt-BR")}</span>
                  <StatusBadge status={log.from_status ?? "—"} />
                  <span className="text-gray-500">→</span>
                  <StatusBadge status={log.to_status} />
                  <span className="text-xs text-gray-500">
                    {log.changed_by_platform_user_id ? "manual" : "automático (webhook)"}
                  </span>
                  {log.reason && <span className="text-xs text-gray-400">— {log.reason}</span>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Este tenant ainda não tem assinatura no Asaas (em trial).</p>
        )}
      </section>
    </div>
  );
}
