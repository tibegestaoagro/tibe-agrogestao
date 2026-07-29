import type { ProfileType } from "@/lib/tenant-context";
import { listUpcomingVaccinations } from "@/lib/actions/animals";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { decToNum } from "@/lib/serialize";
import { str, type Handler } from "./shared";

const RESUMO_TOP_LEVEL: { scope: string; label: string; profile?: ProfileType }[] = [
  { scope: "rebanho", label: "Rebanho", profile: "fazenda" },
  { scope: "lavoura", label: "Lavoura", profile: "fazenda" },
  { scope: "prestador", label: "Prestador", profile: "prestador" },
  { scope: "financeiro", label: "Financeiro" },
];
const RESUMO_SECOND_LEVEL = ["Clientes", "Agendamentos", "Contas a receber"];

export const resumo: Handler = async ({ db, parameters, activeProfiles }) => {
  const scope = str(parameters.scope);
  const availableTopLevel = RESUMO_TOP_LEVEL.filter((o) => !o.profile || activeProfiles.includes(o.profile));

  if (scope === "rebanho" && availableTopLevel.some((o) => o.scope === "rebanho")) {
    const [count, upcoming] = await Promise.all([
      db.animal.count({ where: { status: "active" } }),
      listUpcomingVaccinations(db, 15),
    ]);
    const next = upcoming[0];
    const vaccineText = next
      ? `Próxima vacina: brinco ${next.ear_tag ?? "?"} em ${next.days_remaining} dia(s).`
      : "Nenhuma vacina prevista.";
    return {
      reply_text: `🐄 Rebanho: ${count} animal(is) ativo(s). ${vaccineText}`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "resumo:rebanho",
    };
  }

  if (scope === "lavoura" && availableTopLevel.some((o) => o.scope === "lavoura")) {
    const count = await db.plot.count({
      where: { cycles: { some: { status: { in: ["planted", "growing"] } } } },
    });
    return {
      reply_text: `🌱 Lavoura: ${count} talhão(ões) com ciclo ativo.`,
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

  if (scope === "clientes" || scope === "agendamentos" || scope === "contas_a_receber") {
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
      const count = await db.serviceClient.count();
      return {
        reply_text: `🧾 Você tem ${count} cliente(s) cadastrado(s).`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "resumo:clientes",
      };
    }
    if (scope === "agendamentos") {
      const count = await db.serviceOrder.count({ where: { status: "scheduled" } });
      return {
        reply_text: `📅 Você tem ${count} ordem(ns) de serviço agendada(s) (ainda não realizadas).`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "resumo:agendamentos",
      };
    }
    const [count, agg] = await Promise.all([
      db.serviceOrder.count({ where: { status: "completed" } }),
      db.serviceOrder.aggregate({ where: { status: "completed" }, _sum: { total_value: true } }),
    ]);
    const total = decToNum(agg._sum.total_value) ?? 0;
    return {
      reply_text: `💵 Você tem ${count} ordem(ns) concluída(s) aguardando fatura, totalizando R$ ${total.toFixed(2)}.`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "resumo:contas_a_receber",
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
