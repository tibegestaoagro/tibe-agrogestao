import type { ModuleKey } from "@/lib/permissions";
import { canAccess } from "@/lib/permissions";
import type { ProfileType } from "@/lib/tenant-context";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { resolvePeriod } from "@/lib/actions/financial-reports";
import { buildReportLink } from "@/lib/reports/report-link";
import { createManualEntryAction } from "@/lib/actions/financial-entries";
import { FINANCIAL_CATEGORIES } from "@/lib/category-suggestions";
import { ask, failReply, str, num, confirmFlow, type Handler } from "./shared";

const REPORT_TYPE_MODULE: Record<string, ModuleKey> = {
  financeiro: "financeiro",
  rebanho: "rebanho",
  lavoura: "lavoura",
  prestador: "prestador",
};

export const consultarSaldo: Handler = async ({ db, parameters }) => {
  const period = str(parameters.period);
  const result = await getBalanceAction(db, period);
  if (!result.ok) return failReply("consultar_saldo", result);
  return {
    reply_text: `Saldo de ${result.data.period_label}: receita R$ ${result.data.income.toFixed(2)}, despesa R$ ${result.data.expense.toFixed(2)}, saldo R$ ${result.data.balance.toFixed(2)}.`,
    requires_confirmation: false,
    auxiliary_data: result.data,
    report_url: null,
    action_taken: "consultar_saldo",
  };
};

export const gerarRelatorio: Handler = async ({ tenant_id, role, activeProfiles, parameters }) => {
  const tipoRaw = str(parameters.tipo);
  const tipo = tipoRaw && REPORT_TYPE_MODULE[tipoRaw] ? tipoRaw : null;
  if (!tipo) {
    return ask("Qual tipo de relatório você quer? (financeiro, rebanho, lavoura ou prestador)");
  }
  const moduleForTipo = REPORT_TYPE_MODULE[tipo];
  if (!canAccess(role, moduleForTipo)) {
    return {
      reply_text: "Você não tem permissão para gerar esse relatório.",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "gerar_relatorio:sem_permissao",
    };
  }
  const profileNeeded: ProfileType | null =
    moduleForTipo === "rebanho" || moduleForTipo === "lavoura"
      ? "fazenda"
      : moduleForTipo === "prestador"
        ? "prestador"
        : null;
  if (profileNeeded && !activeProfiles.includes(profileNeeded)) {
    return ask(`O perfil necessário para o relatório de ${tipo} não está ativo neste tenant.`);
  }

  // Só o relatório financeiro (DRE + lançamentos) tem PDF pronto (spec 4.7).
  // Relatórios de rebanho/lavoura/prestador ainda não têm gerador dedicado.
  if (tipo !== "financeiro") {
    return {
      reply_text: `O relatório de ${tipo} em PDF ainda não está disponível: por enquanto só o relatório financeiro é gerado. Em breve!`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "gerar_relatorio:tipo_nao_suportado",
    };
  }

  const { start, end } = resolvePeriod(str(parameters.period), null);
  const report_url = buildReportLink(tenant_id, start, end);
  return {
    reply_text: `Aqui está o relatório financeiro de ${start.toLocaleDateString("pt-BR")} a ${end.toLocaleDateString("pt-BR")}: ${report_url}`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url,
    action_taken: "gerar_relatorio:financeiro",
  };
};

export const registrarLancamentoFinanceiro: Handler = async ({ db, parameters, confirmed, explicitNo }) => {
  const amount = num(parameters.amount);
  const categoryRaw = str(parameters.category);
  const vendor = str(parameters.vendor);
  const description = str(parameters.description);

  if (amount == null) {
    return ask("Não consegui identificar o valor do lançamento. Pode informar quanto foi?");
  }

  const category = (FINANCIAL_CATEGORIES as readonly string[]).includes(categoryRaw ?? "")
    ? (categoryRaw as string)
    : "Outros";

  const gate = confirmFlow({
    intent: "registrar_lancamento_financeiro",
    explicitNo,
    confirmed,
    cancelledText: "Lançamento cancelado.",
    question: `Entendi: R$ ${amount.toFixed(2)}, categoria ${category}${vendor ? `, ${vendor}` : ""}. Confirma o lançamento?`,
    auxiliary: { amount, category, vendor, description },
  });
  if (gate) return gate;

  const result = await createManualEntryAction(db, {
    entry_type: "expense",
    category,
    amount,
    due_date: new Date(),
    notes: vendor ?? description ?? null,
  });
  if (!result.ok) return failReply("registrar_lancamento_financeiro", result);
  return {
    reply_text: `Lançamento registrado: R$ ${amount.toFixed(2)}, ${category}${vendor ? `, ${vendor}` : ""}.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `registrar_lancamento_financeiro:${result.data.id}`,
  };
};
