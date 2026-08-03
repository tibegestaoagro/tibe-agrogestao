import Link from "next/link";
import { PiggyBank, Wallet, FileWarning, CalendarClock, ChevronRight } from "lucide-react";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { getCashFlow } from "@/lib/actions/financial-reports";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { listUpcomingVaccinations, getHerdEvolution } from "@/lib/actions/animals";
import { getActivePropertyId } from "@/lib/active-property";
import { decToNum } from "@/lib/serialize";
import KpiCard from "@/components/dashboard/kpi-card";
import HerdEvolutionChart from "@/components/dashboard/herd-evolution-chart";
import RevenueExpenseChart from "@/components/dashboard/revenue-expense-chart";
import MiniCalendar from "@/components/dashboard/mini-calendar";
import CalculadoraGrid from "@/components/dashboard/calculadora-grid";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Dashboard consolidado (spec 5.1 + briefing de layout, Fase 2: docs/design/
 * briefing-novo-layout.md). URL mantida em /dashboard (não app/(dashboard)/
 * page.tsx literal: colidiria com a home pública em "/").
 */
export default async function DashboardHome() {
  const user = await getSessionUser();
  const profiles = await getActiveProfiles();
  const db = await getTenantDb();

  const hasFazenda = profiles.includes("fazenda");
  const hasPrestador = profiles.includes("prestador");
  // Seletor de propriedade no topo (briefing de layout, seção 12): filtra
  // os KPIs de fazenda. Financeiro não tem property_id no schema (nunca
  // teve), então fica de fora do filtro: não há o que filtrar ali.
  const activePropertyId = hasFazenda ? await getActivePropertyId(db) : null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const maintenanceLimit = new Date(now.getTime() + 15 * 86_400_000);
  const taskLimit = new Date(now.getTime() + 7 * 86_400_000);
  const eventWindowStart = new Date(now.getTime() - 60 * 86_400_000);
  const eventWindowEnd = new Date(now.getTime() + 60 * 86_400_000);

  const [
    animalCount,
    activePlotCount,
    upcomingVaccinations,
    clientCount,
    unbilledOrders,
    balance,
    pendingAlerts,
    cashFlow,
    herdEvolution,
    upcomingTasksCount,
    overdueEntriesCount,
    upcomingMaintenanceCount,
    recentEntries,
    receivables,
    payables,
    todayPayables,
    todayReceivables,
    dueTodayTasksCount,
    calendarTasks,
    calendarEntries,
    calendarVaccinations,
  ] = await Promise.all([
    hasFazenda
      ? db.animal.count({
          where: { status: "active", ...(activePropertyId ? { property_id: activePropertyId } : {}) },
        })
      : Promise.resolve(0),
    hasFazenda
      ? db.plot.count({
          where: {
            cycles: { some: { status: { in: ["planted", "growing"] } } },
            ...(activePropertyId ? { property_id: activePropertyId } : {}),
          },
        })
      : Promise.resolve(0),
    hasFazenda ? listUpcomingVaccinations(db, 15, activePropertyId) : Promise.resolve([]),
    hasPrestador ? db.serviceClient.count() : Promise.resolve(0),
    hasPrestador ? db.serviceOrder.count({ where: { status: "completed" } }) : Promise.resolve(0),
    getBalanceAction(db, null),
    db.alert.count({ where: { status: "pending" } }),
    getCashFlow(db, { start: sixMonthsAgo, end: now, groupBy: "month" }),
    hasFazenda ? getHerdEvolution(db, { months: 6, propertyId: activePropertyId }) : Promise.resolve([]),
    db.task.count({ where: { status: "pending", due_date: { gte: now, lte: taskLimit } } }),
    db.financialEntry.count({ where: { status: "pending", due_date: { lt: now } } }),
    hasFazenda
      ? db.machine.count({
          where: {
            status: { not: "sold" },
            next_maintenance_at: { gte: now, lte: maintenanceLimit },
            ...(activePropertyId ? { property_id: activePropertyId } : {}),
          },
        })
      : Promise.resolve(0),
    db.financialEntry.findMany({ orderBy: { created_at: "desc" }, take: 5 }),
    db.financialEntry.aggregate({
      where: { entry_type: "income", status: "pending" },
      _sum: { amount: true },
      _count: true,
    }),
    db.financialEntry.aggregate({
      where: { entry_type: "expense", status: "pending" },
      _sum: { amount: true },
      _count: true,
    }),
    db.financialEntry.aggregate({
      where: { entry_type: "expense", status: "pending", due_date: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: true,
    }),
    db.financialEntry.aggregate({
      where: { entry_type: "income", status: "pending", due_date: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: true,
    }),
    db.task.count({ where: { status: "pending", due_date: { lte: todayEnd } } }),
    db.task.findMany({
      where: { status: "pending", due_date: { gte: eventWindowStart, lte: eventWindowEnd } },
      select: { due_date: true },
    }),
    db.financialEntry.findMany({
      where: { status: "pending", due_date: { gte: eventWindowStart, lte: eventWindowEnd } },
      select: { due_date: true },
    }),
    hasFazenda
      ? db.animalVaccination.findMany({
          where: {
            next_due_at: { gte: eventWindowStart, lte: eventWindowEnd },
            ...(activePropertyId ? { animal: { property_id: activePropertyId } } : {}),
          },
          select: { next_due_at: true },
        })
      : Promise.resolve([]),
  ]);

  const nextVaccine = upcomingVaccinations[0] ?? null;
  const firstName = user?.name?.split(" ")[0] ?? "";

  const herdTrend = (() => {
    if (herdEvolution.length < 2) return null;
    const last = herdEvolution[herdEvolution.length - 1].count;
    const prev = herdEvolution[herdEvolution.length - 2].count;
    if (prev === 0) return null;
    const pct = ((last - prev) / prev) * 100;
    return `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(1)}% em relação ao mês anterior`;
  })();

  const eventDates = new Set<string>();
  for (const t of calendarTasks) eventDates.add(dateKey(t.due_date));
  for (const e of calendarEntries) if (e.due_date) eventDates.add(dateKey(e.due_date));
  for (const v of calendarVaccinations) if (v.next_due_at) eventDates.add(dateKey(v.next_due_at));

  const meuDiaItems: { label: string; sub?: string; href: string }[] = [];
  if ((todayPayables._count ?? 0) > 0) {
    meuDiaItems.push({
      label: `${todayPayables._count} conta${todayPayables._count > 1 ? "s" : ""} para pagar hoje`,
      sub: brl(decToNum(todayPayables._sum.amount) ?? 0),
      href: "/financeiro",
    });
  }
  if ((todayReceivables._count ?? 0) > 0) {
    meuDiaItems.push({
      label: `${todayReceivables._count} recebimento${todayReceivables._count > 1 ? "s" : ""} previsto`,
      sub: brl(decToNum(todayReceivables._sum.amount) ?? 0),
      href: "/financeiro",
    });
  }
  if (dueTodayTasksCount > 0) {
    meuDiaItems.push({ label: `${dueTodayTasksCount} tarefa${dueTodayTasksCount > 1 ? "s" : ""} pendente${dueTodayTasksCount > 1 ? "s" : ""}`, href: "/meu-dia" });
  }
  if (nextVaccine) {
    meuDiaItems.push({
      label: `Vacinação: ${nextVaccine.ear_tag ?? "?"} · ${nextVaccine.vaccine_name ?? ""}`,
      sub: `${nextVaccine.days_remaining}d`,
      href: "/rebanho",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {greeting()}, {firstName}! 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Perfis ativos: {profiles.map((p) => (p === "fazenda" ? "Fazenda" : "Prestador")).join(" + ")}
        </p>
      </div>

      {/* KPIs principais, no estilo do mockup (verde = positivo/informativo, laranja = atenção). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {hasFazenda && (
          <KpiCard
            icon={PiggyBank}
            label="Rebanho atual"
            value={`${animalCount.toLocaleString("pt-BR")} cabeças`}
            sub={herdTrend ?? undefined}
            variant="green"
            href="/rebanho"
          />
        )}
        <KpiCard
          icon={Wallet}
          label="Valores a receber"
          value={brl(decToNum(receivables._sum.amount) ?? 0)}
          sub={`${receivables._count} recebimento${receivables._count === 1 ? "" : "s"} previsto${receivables._count === 1 ? "" : "s"}`}
          variant="green"
          href="/financeiro"
        />
        <KpiCard
          icon={FileWarning}
          label="Valores a pagar"
          value={brl(decToNum(payables._sum.amount) ?? 0)}
          sub={`${payables._count} conta${payables._count === 1 ? "" : "s"} a pagar`}
          variant="orange"
          href="/financeiro"
        />
        <KpiCard
          icon={CalendarClock}
          label="Próximos compromissos"
          value={upcomingTasksCount}
          sub="nos próximos 7 dias"
          variant="orange"
          href="/meu-dia"
        />
      </div>

      {/* Indicadores secundários (mantidos do dashboard anterior, sem remover nenhum). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {hasFazenda && <MiniStat label="Talhões com ciclo ativo" value={activePlotCount} href="/lavoura" />}
        {hasFazenda && (
          <MiniStat
            label="Próxima vacina"
            value={nextVaccine ? `${nextVaccine.ear_tag ?? "?"} · ${nextVaccine.days_remaining}d` : "Nenhuma"}
            href="/rebanho"
          />
        )}
        {hasPrestador && <MiniStat label="Clientes" value={clientCount} href="/prestador" />}
        {hasPrestador && (
          <MiniStat label="Ordens a faturar" value={unbilledOrders} href="/prestador?tab=ordens" />
        )}
        <MiniStat label="Saldo do mês" value={balance.ok ? brl(balance.data.balance) : "indisponível"} href="/financeiro" />
        <MiniStat label="Alertas pendentes" value={pendingAlerts} href="/alertas" />
        <MiniStat label="Contas vencidas" value={overdueEntriesCount} href="/financeiro" />
        {hasFazenda && <MiniStat label="Manutenções próximas" value={upcomingMaintenanceCount} href="/maquinas" />}
      </div>

      {/* 2 gráficos lado a lado. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {hasFazenda && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="mb-3 text-sm font-medium text-gray-700">Evolução do rebanho (6 meses)</p>
            <HerdEvolutionChart data={herdEvolution} />
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="mb-3 text-sm font-medium text-gray-700">Receitas x despesas (6 meses)</p>
          <RevenueExpenseChart data={cashFlow} />
        </div>
      </div>

      {/* Meu Dia + calendário lado a lado. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Meu Dia</p>
            <Link href="/meu-dia" className="text-sm text-tibe-primary hover:underline">
              Ver tudo →
            </Link>
          </div>
          {meuDiaItems.length === 0 ? (
            <p className="text-sm text-gray-500">Nada previsto para hoje.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {meuDiaItems.map((item, i) => (
                <li key={i}>
                  <Link href={item.href} className="flex items-center justify-between py-2.5 text-sm hover:text-tibe-primary">
                    <span className="text-gray-700">{item.label}</span>
                    <span className="flex items-center gap-2 text-gray-500">
                      {item.sub}
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <MiniCalendar eventDates={Array.from(eventDates)} />
        </div>
      </div>

      {hasFazenda && <CalculadoraGrid />}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-gray-700">Últimos lançamentos</p>
        {recentEntries.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum lançamento ainda.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentEntries.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{e.category ?? "não informado"}</span>
                <span className={e.entry_type === "income" ? "text-tibe-primary" : "text-gray-900"}>
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

function MiniStat({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-gray-200 bg-white p-3 transition hover:border-tibe-primary">
      <p className="truncate text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold text-tibe-dark">{value}</p>
    </Link>
  );
}
