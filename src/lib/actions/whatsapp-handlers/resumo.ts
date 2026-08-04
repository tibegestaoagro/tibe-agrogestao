import type { ProfileType } from "@/lib/tenant-context";
import { listUpcomingVaccinations, countActiveAnimals } from "@/lib/actions/animals";
import { countActivePlots } from "@/lib/actions/plots";
import { countServiceClients } from "@/lib/actions/service-clients";
import { countCompletedUnbilledOrders } from "@/lib/actions/service-orders";
import { listPendingEntries } from "@/lib/actions/financial-reports";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { decToNum } from "@/lib/serialize";
import { str, type Handler } from "./shared";

const RESUMO_TOP_LEVEL: { scope: string; label: string; profile?: ProfileType }[] = [
  { scope: "rebanho", label: "Rebanho", profile: "fazenda" },
  { scope: "lavoura", label: "Lavoura", profile: "fazenda" },
  { scope: "prestador", label: "Prestador", profile: "prestador" },
  { scope: "financeiro", label: "Financeiro" },
];
const RESUMO_SECOND_LEVEL = ["Clientes", "Agendamentos", "Ordens a faturar"];
const civilDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
});

function formatCivilDate(date: Date): string {
  return civilDateFormatter.format(date);
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

export const resumo: Handler = async ({ db, parameters, activeProfiles }) => {
  const scope = str(parameters.scope);
  const availableTopLevel = RESUMO_TOP_LEVEL.filter((o) => !o.profile || activeProfiles.includes(o.profile));

  if (scope === "rebanho" && availableTopLevel.some((o) => o.scope === "rebanho")) {
    const [count, upcoming] = await Promise.all([
      countActiveAnimals(db),
      listUpcomingVaccinations(db, 30),
    ]);
    const relatedIds = Array.from(
      new Set(
        upcoming.map((vaccination) =>
          `${vaccination.animal_id}:${vaccination.vaccine_id}`),
      ),
    );
    const previsions = relatedIds.length
      ? await db.financialEntry.findMany({
          where: {
            related_id: { in: relatedIds },
            entry_type: "expense",
            status: "pending",
          },
          select: { related_id: true, amount: true },
        })
      : [];
    const previsionByRelatedId = new Map(
      previsions.map((prevision) => [
        prevision.related_id,
        decToNum(prevision.amount) ?? 0,
      ]),
    );
    const firstWithoutPrevision = upcoming.find(
      (vaccination) =>
        !previsionByRelatedId.has(
          `${vaccination.animal_id}:${vaccination.vaccine_id}`,
        ),
    );
    const vaccineLines = upcoming.map((vaccination) => {
      const vaccineName = vaccination.vaccine_name ?? "Vacina";
      const earTag = vaccination.ear_tag ?? "?";
      const date = formatCivilDate(vaccination.next_due_at);
      const relatedId = `${vaccination.animal_id}:${vaccination.vaccine_id}`;
      const prevision = previsionByRelatedId.get(relatedId);
      return prevision !== undefined
        ? `${vaccineName} (brinco ${earTag}) dia ${date}, previsão R$ ${formatAmount(prevision)}`
        : `${vaccineName} (brinco ${earTag}) dia ${date}, sem previsão de gasto`;
    });
    const vaccineText = vaccineLines.length
      ? vaccineLines.join("\n")
      : "Nenhuma vacina prevista nos próximos 30 dias.";
    const offerText = firstWithoutPrevision
      ? `\nQuer registrar um valor previsto para ${firstWithoutPrevision.vaccine_name ?? "Vacina"} (brinco ${firstWithoutPrevision.ear_tag ?? "?"})? Me diga o valor.`
      : "";
    return {
      reply_text: `🐄 Rebanho: ${count} animal(is) ativo(s).\n${vaccineText}${offerText}`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "resumo:rebanho",
    };
  }

  if (scope === "lavoura" && availableTopLevel.some((o) => o.scope === "lavoura")) {
    const now = new Date();
    const cycleWhere = {
      status: {
        in: ["planted", "growing"] as ("planted" | "growing")[],
      },
      expected_harvest_at: { gt: now },
    };
    const [count, cycles, cycleCount] = await Promise.all([
      countActivePlots(db),
      db.cropCycle.findMany({
        where: cycleWhere,
        orderBy: { expected_harvest_at: "asc" },
        take: 6,
        include: { plot: { select: { name: true } } },
      }),
      db.cropCycle.count({ where: cycleWhere }),
    ]);
    const lines = cycles.slice(0, 5).map(
      (cycle) =>
        `${cycle.crop_name} (talhão ${cycle.plot.name}): colheita prevista ${formatCivilDate(cycle.expected_harvest_at!)}`,
    );
    if (cycleCount > 5) {
      lines.push(`e mais ${cycleCount - 5} colheita(s)`);
    }
    const harvestText = lines.length
      ? lines.join("\n")
      : "Nenhuma colheita prevista.";
    return {
      reply_text: `🌱 Lavoura: ${count} talhão(ões) com ciclo ativo.\n${harvestText}`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "resumo:lavoura",
    };
  }

  if (scope === "financeiro") {
    const [balance, alerts] = await Promise.all([
      getBalanceAction(db, null),
      db.alert.count({ where: { status: "pending" } }),
    ]);
    const balanceText = balance.ok ? `R$ ${balance.data.balance.toFixed(2)}` : "indisponível";
    return {
      reply_text: `💰 Financeiro: saldo do mês ${balanceText}. ${alerts} alerta(s) pendente(s).`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "resumo:financeiro",
    };
  }

  if (scope === "prestador" && availableTopLevel.some((o) => o.scope === "prestador")) {
    return {
      reply_text: `Quer saber sobre ${RESUMO_SECOND_LEVEL.join(", ")}?`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "resumo:prestador:aguardando_escopo",
    };
  }

  if (scope === "clientes" || scope === "agendamentos" || scope === "ordens_a_faturar") {
    if (!activeProfiles.includes("prestador")) {
      return {
        reply_text: `Esse recurso requer o perfil "Prestador de Serviço" ativo, que não está habilitado para sua empresa.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "resumo:perfil_inativo",
      };
    }
    if (scope === "clientes") {
      const count = await countServiceClients(db);
      return {
        reply_text: `🧾 Você tem ${count} cliente(s) cadastrado(s).`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "resumo:clientes",
      };
    }
    if (scope === "agendamentos") {
      const [orders, count] = await Promise.all([
        db.serviceOrder.findMany({
          where: { status: "scheduled" },
          orderBy: { performed_at: "asc" },
          take: 6,
          include: {
            service: { select: { name: true } },
            service_client: { select: { name: true } },
          },
        }),
        db.serviceOrder.count({ where: { status: "scheduled" } }),
      ]);
      if (count === 0) {
        return {
          reply_text: "Nenhum agendamento pendente no momento.",
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "resumo:agendamentos",
        };
      }
      const lines = orders.slice(0, 5).map((order) => {
        const date = order.performed_at
          ? formatCivilDate(order.performed_at)
          : "sem data";
        const amount = decToNum(order.total_value) ?? 0;
        return `${order.service.name} para ${order.service_client.name} dia ${date}, R$ ${formatAmount(amount)}`;
      });
      if (count > 5) {
        lines.push(`e mais ${count - 5} agendamento(s)`);
      }
      return {
        reply_text: lines.join("\n"),
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "resumo:agendamentos",
      };
    }
    const [count, agg] = await Promise.all([
      countCompletedUnbilledOrders(db),
      db.serviceOrder.aggregate({ where: { status: "completed" }, _sum: { total_value: true } }),
    ]);
    const total = decToNum(agg._sum.total_value) ?? 0;
    return {
      reply_text: `💵 Você tem ${count} ordem(ns) concluída(s) aguardando fatura, totalizando R$ ${total.toFixed(2)}.`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "resumo:ordens_a_faturar",
    };
  }

  if (scope === "contas_a_pagar" || scope === "contas_a_receber") {
    const isPayable = scope === "contas_a_pagar";
    const entries = await listPendingEntries(db, {
      entry_type: isPayable ? "expense" : "income",
    });
    const direction = isPayable ? "pagar" : "receber";
    if (entries.length === 0) {
      return {
        reply_text: `Nenhuma conta a ${direction} no período.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `resumo:${scope}`,
      };
    }

    const lines = entries.slice(0, 5).map((entry) => {
      const category = entry.category ?? "Sem categoria";
      const amount = formatAmount(entry.amount ?? 0);
      const dueDate = formatCivilDate(entry.due_date);
      if (entry.days_overdue !== null) {
        return `⚠️ VENCIDA há ${entry.days_overdue} dias: ${category}, R$ ${amount} (venceu ${dueDate})`;
      }
      return `${category}: R$ ${amount}, vence ${dueDate}`;
    });
    if (entries.length > 5) {
      lines.push(`e mais ${entries.length - 5} conta(s)`);
    }
    const total = entries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
    lines.push(`Total a ${direction} no período: R$ ${formatAmount(total)}`);

    return {
      reply_text: lines.join("\n"),
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `resumo:${scope}`,
    };
  }

  // scope null/não reconhecido/indisponível: pergunta nível 1. O N8N
  // decide (via recent_history) quando desistir de perguntar e manda
  // "ambigua" em vez de "resumo" de novo.
  return {
    reply_text: `Sobre o que você quer saber: ${availableTopLevel.map((o) => o.label).join(", ")}?`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: "resumo:aguardando_escopo",
  };
};
