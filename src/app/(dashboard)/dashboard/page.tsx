import Link from "next/link";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { getCashFlow } from "@/lib/actions/financial-reports";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { listUpcomingVaccinations } from "@/lib/actions/animals";
import { decToNum } from "@/lib/serialize";
import CashFlowChart from "@/components/financeiro/cash-flow-chart";

function Card({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number;
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-gray-200 bg-white p-5 transition hover:border-tibe-primary">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-tibe-dark">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Dashboard consolidado (spec 5.1). URL mantida em /dashboard (não
 * app/(dashboard)/page.tsx literal: colidiria com a home pública em "/").
 */
export default async function DashboardHome() {
  const user = await getSessionUser();
  const profiles = await getActiveProfiles();
  const db = await getTenantDb();

  const hasFazenda = profiles.includes("fazenda");
  const hasPrestador = profiles.includes("prestador");

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const maintenanceLimit = new Date(now.getTime() + 15 * 86_400_000);
  const taskLimit = new Date(now.getTime() + 7 * 86_400_000);

  const [
    animalCount,
    activePlotCount,
    upcomingVaccinations,
    clientCount,
    unbilledOrders,
    balance,
    pendingAlerts,
    cashFlow,
    upcomingTasks,
    overdueEntriesCount,
    upcomingMaintenanceCount,
    recentEntries,
  ] = await Promise.all([
    hasFazenda ? db.animal.count({ where: { status: "active" } }) : Promise.resolve(0),
    hasFazenda
      ? db.plot.count({ where: { cycles: { some: { status: { in: ["planted", "growing"] } } } } })
      : Promise.resolve(0),
    hasFazenda ? listUpcomingVaccinations(db, 15) : Promise.resolve([]),
    hasPrestador ? db.serviceClient.count() : Promise.resolve(0),
    hasPrestador ? db.serviceOrder.count({ where: { status: "completed" } }) : Promise.resolve(0),
    getBalanceAction(db, null),
    db.alert.count({ where: { status: "pending" } }),
    getCashFlow(db, { start: sixMonthsAgo, end: now, groupBy: "month" }),
    // Próximos compromissos (Módulo 27): "atrasada" é calculada, não gravada
    // (ver src/lib/actions/tasks.ts), então esta contagem já reflete due_date
    // futuro por construção (o filtro exclui o que já passou).
    db.task.count({ where: { status: "pending", due_date: { gte: now, lte: taskLimit } } }),
    // Contas vencidas (Módulo 28): "overdue" não é um status realmente
    // gravado no FinancialEntry hoje (mesmo critério já usado por
    // ensureBillDueAlertForEntry/calculatePendingDaysOverdue): pending +
    // due_date no passado.
    db.financialEntry.count({ where: { status: "pending", due_date: { lt: now } } }),
    // Manutenções próximas (Módulo 26): mesma janela do alerta maintenance_due.
    db.machine.count({
      where: { status: { not: "sold" }, next_maintenance_at: { gte: now, lte: maintenanceLimit } },
    }),
    db.financialEntry.findMany({ orderBy: { created_at: "desc" }, take: 5 }),
  ]);

  const nextVaccine = upcomingVaccinations[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Olá, {user?.name?.split(" ")[0] ?? ""}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Perfis ativos: {profiles.map((p) => (p === "fazenda" ? "Fazenda" : "Prestador")).join(" + ")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {hasFazenda && <Card label="Animais ativos" value={animalCount} href="/rebanho" />}
        {hasFazenda && <Card label="Talhões com ciclo ativo" value={activePlotCount} href="/lavoura" />}
        {hasFazenda && (
          <Card
            label="Próxima vacina"
            value={
              nextVaccine
                ? `${nextVaccine.ear_tag ?? "?"} · ${nextVaccine.days_remaining}d`
                : "Nenhuma"
            }
            href="/rebanho"
          />
        )}
        {hasPrestador && <Card label="Clientes" value={clientCount} href="/prestador" />}
        {hasPrestador && (
          <Card label="Ordens a faturar" value={unbilledOrders} href="/prestador?tab=ordens" />
        )}
        <Card
          label="Saldo do mês"
          value={balance.ok ? brl(balance.data.balance) : "indisponível"}
          href="/financeiro"
        />
        <Card label="Alertas pendentes" value={pendingAlerts} href="/alertas" />
        <Card label="Próximos compromissos" value={upcomingTasks} href="/meu-dia" />
        <Card label="Contas vencidas" value={overdueEntriesCount} href="/financeiro" />
        {hasFazenda && (
          <Card label="Manutenções próximas" value={upcomingMaintenanceCount} href="/maquinas" />
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-gray-700">Evolução financeira (6 meses)</p>
        <CashFlowChart data={cashFlow} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-gray-700">Últimos lançamentos</p>
        {recentEntries.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum lançamento ainda.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentEntries.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{e.category ?? "não informado"}</span>
                <span className={e.entry_type === "income" ? "text-green-700" : "text-gray-900"}>
                  {e.entry_type === "income" ? "+" : "-"}
                  {brl(decToNum(e.amount) ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/financeiro" className="mt-3 inline-block text-sm text-tibe-primary hover:underline">
          Ver todos →
        </Link>
      </div>
    </div>
  );
}
