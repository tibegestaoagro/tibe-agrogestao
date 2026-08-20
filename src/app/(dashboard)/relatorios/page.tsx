import { getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { getDre, getCashFlow, resolvePeriod } from "@/lib/actions/financial-reports";
import { getHerdEvolution } from "@/lib/actions/herd-evolution";
import { getActivePropertyId } from "@/lib/active-property";
import { MODULE_LABEL } from "@/lib/related-modules";
import ExportReportButton from "@/components/financeiro/export-report-button";
import HerdEvolutionChart from "@/components/dashboard/herd-evolution-chart";
import RevenueExpenseChart from "@/components/dashboard/revenue-expense-chart";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * "Fazenda em Números" (briefing de layout, Fase 2): área de inteligência
 * que centraliza os relatórios já existentes (DRE, fluxo de caixa, evolução
 * do rebanho, produtividade da lavoura, faturamento do prestador) numa tela
 * só, em vez de cada um viver isolado dentro do próprio módulo. Não introduz
 * cálculo novo: reusa `getDre`/`getCashFlow`/`getHerdEvolution`, já usados
 * em `/financeiro` e no dashboard.
 */
export default async function RelatoriosPage() {
  const profiles = await getActiveProfiles();
  const db = await getTenantDb();
  const hasFazenda = profiles.includes("fazenda");
  const hasPrestador = profiles.includes("prestador");

  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const monthRange = resolvePeriod();
  // Seletor de propriedade no topo (briefing de layout, seção 12): filtra
  // rebanho/lavoura. Financeiro não tem property_id no schema, fica de fora.
  const activePropertyId = hasFazenda ? await getActivePropertyId(db) : null;

  const [dre, cashFlow, herdEvolution, harvestByCrop, serviceOrders] = await Promise.all([
    getDre(db, monthRange),
    getCashFlow(db, { start: twelveMonthsAgo, end: now, groupBy: "month" }),
    hasFazenda ? getHerdEvolution(db, { months: 12, propertyId: activePropertyId }) : Promise.resolve([]),
    hasFazenda
      ? db.cropCycle.groupBy({
          by: ["crop_name"],
          where: {
            status: "harvested",
            harvested_at: { gte: twelveMonthsAgo, lte: now },
            ...(activePropertyId ? { plot: { property_id: activePropertyId } } : {}),
          },
          _sum: { yield_amount: true },
          _count: true,
        })
      : Promise.resolve([]),
    hasPrestador
      ? db.serviceOrder.aggregate({
          where: { status: "invoiced", performed_at: { gte: twelveMonthsAgo, lte: now } },
          _sum: { total_value: true },
          _count: true,
        })
      : Promise.resolve(null),
  ]);

  const relevantModules = dre.by_module.filter(
    (m) => m.module !== "rebanho" || hasFazenda,
  ).filter((m) => m.module !== "lavoura" || hasFazenda)
   .filter((m) => m.module !== "maquinas" || hasFazenda)
   .filter((m) => m.module !== "servico" || hasPrestador);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Fazenda em Números</h1>
        <p className="mt-1 text-sm text-gray-500">
          Central de relatórios: financeiro, rebanho, lavoura e prestador, num só lugar.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Resultado do mês</p>
            <p className="text-xs text-gray-500">
              {dre.period.start} a {dre.period.end}
            </p>
          </div>
          <ExportReportButton />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {relevantModules.map((m) => (
            <div key={m.module} className="rounded-lg bg-tibe-light p-3">
              <p className="text-xs text-gray-500">{MODULE_LABEL[m.module]}</p>
              <p className={`mt-0.5 text-base font-semibold ${m.result >= 0 ? "text-primaria-tinta" : "text-red-600"}`}>
                {brl(m.result)}
              </p>
            </div>
          ))}
          <div className="rounded-lg bg-tibe-dark p-3 text-white">
            <p className="text-xs text-white/70">Resultado total</p>
            <p className="mt-0.5 text-base font-semibold">{brl(dre.total_result)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {hasFazenda && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="mb-3 text-sm font-medium text-gray-700">Evolução do rebanho (12 meses)</p>
            <HerdEvolutionChart data={herdEvolution} />
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="mb-3 text-sm font-medium text-gray-700">Receitas x despesas (12 meses)</p>
          <RevenueExpenseChart data={cashFlow} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {hasFazenda && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="mb-3 text-sm font-medium text-gray-700">Produtividade da lavoura (12 meses)</p>
            {harvestByCrop.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma colheita registrada no período.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {harvestByCrop.map((h) => (
                  <li key={h.crop_name} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-700">{h.crop_name}</span>
                    <span className="text-gray-500">
                      {h._count} colheita{h._count === 1 ? "" : "s"} · {Number(h._sum.yield_amount ?? 0).toLocaleString("pt-BR")} sacas
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {hasPrestador && serviceOrders && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="mb-3 text-sm font-medium text-gray-700">Faturamento do prestador (12 meses)</p>
            <p className="text-2xl font-semibold text-tibe-dark">
              {brl(Number(serviceOrders._sum.total_value ?? 0))}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {serviceOrders._count} ordem{serviceOrders._count === 1 ? "" : "s"} faturada{serviceOrders._count === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
