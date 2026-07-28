import { redirect } from "next/navigation";
import { getPlatformSessionUser, isMasterAdmin } from "@/lib/platform-context";
import { prisma } from "@/lib/prisma";
import { calculateMRR, calculateMrrTrend, calculateChurn, calculateLTV, calculateFunnel, type Period } from "@/lib/platform/kpis";
import PeriodSelector from "@/components/platform/period-selector";
import MrrTrendChart from "@/components/platform/mrr-trend-chart";
import FunnelChart from "@/components/platform/funnel-chart";

const VALID_PERIODS: Period[] = ["30d", "90d", "12m"];

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Home do painel da plataforma (spec 6.8): só master_admin (equipe não vê
 * KPIs financeiros, decisão do módulo). Chama as funções de lib/platform/kpis
 * diretamente (Server Component), sem round-trip pela própria API HTTP:
 * mesmo padrão das páginas server do painel de tenant.
 */
export default async function PlatformKpisPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) redirect("/plataforma/login");
  if (!isMasterAdmin(platformUser.role)) redirect("/plataforma/tenants");

  const period: Period = VALID_PERIODS.includes(searchParams.period as Period)
    ? (searchParams.period as Period)
    : "30d";

  const [mrr, mrrTrend, churn, ltv, funnel, activeCount, trialCount] = await Promise.all([
    calculateMRR(),
    calculateMrrTrend(6),
    calculateChurn(period),
    calculateLTV(),
    calculateFunnel(period),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.tenant.count({ where: { subscription: null } }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Visão geral</h1>
        <PeriodSelector basePath="/plataforma/visao-geral" current={period} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "MRR atual", value: fmtBRL(mrr.total_mrr) },
          { label: "Tenants ativos", value: String(activeCount) },
          { label: "Em trial", value: String(trialCount) },
          { label: `Churn (${period})`, value: `${churn.customer_churn_pct}%` },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "MRR: Campo", value: fmtBRL(mrr.by_plan.campo) },
          { label: "MRR: Fazenda", value: fmtBRL(mrr.by_plan.fazenda) },
          { label: "MRR: Grupo", value: fmtBRL(mrr.by_plan.grupo) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{c.label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-300">Evolução de MRR (6 meses)</h2>
          <div className="mt-4">
            <MrrTrendChart data={mrrTrend} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-300">Funil de conversão por origem ({period})</h2>
          <div className="mt-4">
            <FunnelChart data={funnel.by_source} />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
            <div>
              <dt className="text-gray-500">Trials</dt>
              <dd className="text-base font-semibold text-white">{funnel.trials_created}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Convertidos</dt>
              <dd className="text-base font-semibold text-white">{funnel.converted_to_paid}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Dias médios p/ converter</dt>
              <dd className="text-base font-semibold text-white">{funnel.avg_days_to_convert}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold text-gray-300">LTV (lifetime value simplificado)</h2>
        <div className="mt-3 flex flex-wrap gap-8">
          <div>
            <p className="text-xs text-gray-500">LTV estimado</p>
            <p className="text-xl font-bold text-white">{ltv.ltv != null ? fmtBRL(ltv.ltv) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Ticket médio mensal</p>
            <p className="text-xl font-bold text-white">{ltv.avg_ticket_mensal != null ? fmtBRL(ltv.avg_ticket_mensal) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Churn mensal usado</p>
            <p className="text-xl font-bold text-white">{ltv.churn_mensal_pct != null ? `${ltv.churn_mensal_pct}%` : "—"}</p>
          </div>
        </div>
        {ltv.ltv == null && (
          <p className="mt-3 text-xs text-gray-500">
            LTV não calculável ainda: sem churn observado nos últimos 30 dias (divisão por zero evitada).
          </p>
        )}
      </div>
    </div>
  );
}
