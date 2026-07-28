import Link from "next/link";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { getCashFlow } from "@/lib/actions/financial-reports";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { listUpcomingVaccinations } from "@/lib/actions/animals";
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

  const [
    animalCount,
    activePlotCount,
    upcomingVaccinations,
    clientCount,
    unbilledOrders,
    balance,
    pendingAlerts,
    cashFlow,
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
          value={balance.ok ? brl(balance.data.balance) : "—"}
          href="/financeiro"
        />
        <Card label="Alertas pendentes" value={pendingAlerts} href="/alertas" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-gray-700">Evolução financeira (6 meses)</p>
        <CashFlowChart data={cashFlow} />
      </div>
    </div>
  );
}
