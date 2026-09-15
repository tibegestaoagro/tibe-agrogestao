import type { ModuleKey } from "@/lib/permissions";
import { canAccess } from "@/lib/permissions";
import type { ProfileType } from "@/lib/tenant-context";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { buildReportLink } from "@/lib/reports/report-link";
import { createManualEntryAction } from "@/lib/actions/financial-entries";
import { suggestCategory } from "@/lib/category-suggestions";
import { listFinancialCategoriesAction } from "@/lib/actions/financial-categories";
import { ask, failReply, str, normalizarTermo, type Handler } from "./shared";
import { lerDinheiro, lerMes } from "./parsers";
import { reaisBr } from "@/lib/numero-br";
import { savePendingFinance, loadPendingFinance, clearPendingFinance } from "@/lib/actions/finance-pending";

const REPORT_TYPE_MODULE: Record<string, ModuleKey> = {
  financeiro: "financeiro",
  rebanho: "rebanho",
  lavoura: "lavoura",
  prestador: "prestador",
};

export const consultarSaldo: Handler = async ({ db, parameters }) => {
  const mesLido = lerMes(parameters.period);
  if (mesLido === null) return ask("De qual mês?");
  const period = `${mesLido.ano}-${String(mesLido.mes).padStart(2, "0")}`;
  const result = await getBalanceAction(db, period);
  if (!result.ok) return failReply("consultar_saldo", result);
  return {
    reply_text: `Saldo de ${result.data.period_label}: receita ${reaisBr(result.data.income)}, despesa ${reaisBr(result.data.expense)}, saldo ${reaisBr(result.data.balance)}.`,
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

  const mesLido = lerMes(parameters.period);
  if (mesLido === null) return ask("De qual mês?");
  const start = new Date(mesLido.ano, mesLido.mes - 1, 1);
  const end = new Date(mesLido.ano, mesLido.mes, 1);
  const report_url = buildReportLink(tenant_id, start, end);
  return {
    reply_text: `Aqui está o relatório financeiro de ${start.toLocaleDateString("pt-BR")} a ${end.toLocaleDateString("pt-BR")}: ${report_url}`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url,
    action_taken: "gerar_relatorio:financeiro",
  };
};

type LancamentoResolvido = {
  entry_type: "income" | "expense";
  amount: number;
  category: string;
  vendor: string | null;
  description: string | null;
};

export const registrarLancamentoFinanceiro: Handler = async ({
  db,
  parameters,
  confirmed,
  explicitNo,
  tenant_id,
  user_id,
}) => {
  const intent = "registrar_lancamento_financeiro";
  const temMemoria = !!user_id;

  /*
   * "não"/"cancela" é a PRIMEIRA coisa checada, antes de qualquer resolução:
   * mesma regra de `mao-de-obra.ts` e do defeito de 2026-08-18 no estoque
   * ("não, deixa pra lá" gravou a compra recusada).
   */
  if (explicitNo) {
    if (temMemoria) await clearPendingFinance(tenant_id, user_id!);
    return {
      reply_text: "Lançamento cancelado.",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${intent}:cancelado`,
    };
  }

  /*
   * O "sim" executa o que foi GUARDADO, nunca o que o classificador remontou
   * da própria confirmação impressa (achado da revisão do Task 5: o n8n não
   * remanda os parâmetros literalmente, `.claude/rules/whatsapp.md`, e um
   * "tipo" perdido na volta reescrevia receita como despesa em silêncio).
   * Havendo pendente, ele manda: os parâmetros que chegaram nesta mensagem
   * são ignorados por completo. Sem pendente (sem memória, TTL vencido, ou
   * cancelado por um "não" antes desta mensagem), NÃO EXISTE caminho que
   * grave: cai no fluxo abaixo, que só resolve e pergunta de novo (achado da
   * re-revisão, 2ª rodada: um "sim" sem pendente válido gravava direto do que
   * esta própria mensagem trazia, e por esse caminho "não" seguido do
   * classificador reenviando a mesma intenção com "sim" gravava o lançamento
   * recusado).
   */
  const pendente = temMemoria ? await loadPendingFinance(tenant_id, user_id!) : null;
  if (confirmed && pendente?.aguardando === "confirmacao") {
    const p = pendente.parameters as unknown as LancamentoResolvido;
    await clearPendingFinance(tenant_id, user_id!);
    const result = await createManualEntryAction(db, {
      entry_type: p.entry_type,
      category: p.category,
      amount: p.amount,
      due_date: new Date(),
      notes: p.vendor ?? p.description ?? null,
    });
    if (!result.ok) return failReply(intent, result);
    return {
      reply_text: `${p.entry_type === "income" ? "Receita" : "Despesa"} registrada: ${reaisBr(p.amount)}, ${p.category}${p.vendor ? `, ${p.vendor}` : ""}.`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${intent}:${result.data.id}`,
    };
  }

  /**
   * `lerDinheiro`, e não `num`.
   *
   * `num()` é `Number()` cru: "1.200,00" vira NaN e "60 mil" também. O
   * produtor fala assim, e o classificador repassa a fala. Este projeto já
   * pagou o mesmo defeito duas vezes em outros handlers ("60 mil e como o
   * produtor fala, e o codigo nao sabia ler", e o frete de R$ 2.000 que virava
   * R$ 2,00), e a correção nunca tinha chegado aqui: o lançamento financeiro
   * pelo WhatsApp continuava perguntando o valor de novo quando ele vinha
   * formatado.
   */
  const amount = lerDinheiro(parameters, "amount", "valor", "valor_total");
  const categoryRaw = str(parameters.category);
  const vendor = str(parameters.vendor);
  const description = str(parameters.description);

  if (amount == null) {
    return ask("Não consegui identificar o valor do lançamento. Pode informar quanto foi?");
  }

  /*
   * `tipo` distingue receita de despesa. Sem ele, continua despesa: é o
   * caminho do recibo por foto (§ visão), que nunca manda esse campo e
   * precisa se comportar exatamente como antes.
   */
  const tipoNormalizado = str(parameters.tipo) ? normalizarTermo(str(parameters.tipo)!) : null;
  const entryType: "income" | "expense" =
    tipoNormalizado && ["receita", "recebi", "income"].includes(tipoNormalizado) ? "income" : "expense";
  const outrasPadrao = entryType === "income" ? "Outras receitas" : "Outras despesas";

  /*
   * A categoria vem do banco, não de uma lista fixa: o que o produtor criou no
   * painel vale aqui também. Três tentativas, em ordem: o nome que o
   * classificador mandou, o palpite por palavra-chave sobre o texto todo, e
   * a categoria "outras" do tipo certo como último caso. As duas primeiras só
   * valem se o nome existir entre as categorias ativas do tenant.
   */
  const categorias = await listFinancialCategoriesAction(db, {
    entry_type: entryType,
    activeOnly: true,
  });
  const porNome = new Map(categorias.map((c) => [c.name.toLowerCase(), c.name]));
  const palpite = suggestCategory([categoryRaw, vendor, description].filter(Boolean).join(" "), entryType);
  const category =
    porNome.get((categoryRaw ?? "").trim().toLowerCase()) ??
    (palpite ? porNome.get(palpite.toLowerCase()) : undefined) ??
    outrasPadrao;

  /*
   * Chegou aqui sem pendente correspondente para executar (sem `user_id`,
   * TTL vencido, ou um "não" cancelou antes desta mensagem): NUNCA grava
   * direto do que esta mensagem trouxe, `confirmed` ou não. Reachable de
   * verdade (achado da re-revisão): "não" cancela, o classificador reenvia a
   * MESMA intenção com "sim", e sem esta guarda isso gravaria o lançamento
   * recusado; ou o TTL vence e um "sim" grava o que o classificador
   * reconstruiu, podendo trocar receita por despesa em silêncio. O caminho
   * seguro é sempre o mesmo: resolve de novo, guarda um pendente novo, e
   * pergunta de novo, exatamente como na primeira mensagem.
   */
  const resolvido: LancamentoResolvido = { entry_type: entryType, amount, category, vendor, description };
  if (temMemoria) {
    await savePendingFinance(tenant_id, user_id!, {
      parameters: resolvido,
      aguardando: "confirmacao",
    });
  }
  return {
    reply_text: `Entendi: ${entryType === "income" ? "receita" : "despesa"} de ${reaisBr(amount)}, categoria ${category}${vendor ? `, ${vendor}` : ""}. Confirma o lançamento?`,
    requires_confirmation: true,
    auxiliary_data: { amount, category, vendor, description, tipo: entryType },
    report_url: null,
    action_taken: `${intent}:aguardando_confirmacao`,
  };
};
