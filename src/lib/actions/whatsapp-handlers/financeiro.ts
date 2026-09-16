import type { ModuleKey } from "@/lib/permissions";
import { canAccess } from "@/lib/permissions";
import type { ProfileType } from "@/lib/tenant-context";
import type { TenantPrismaClient } from "@/lib/prisma";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { buildReportLink } from "@/lib/reports/report-link";
import { createManualEntryAction, markEntryPaidAction } from "@/lib/actions/financial-entries";
import { getClientSummaryAction } from "@/lib/actions/service-clients";
import { registrarPagamentoAction, resumoDePagamento } from "@/lib/actions/financial-payments";
import {
  contasEmAbertoDoContato,
  contasDaPessoa,
  type ContaEmAberto,
  type PessoaCandidata,
} from "@/lib/actions/contas-do-contato";
import { suggestCategory } from "@/lib/category-suggestions";
import { listFinancialCategoriesAction } from "@/lib/actions/financial-categories";
import { ask, failReply, str, num, normalizarTermo, type Handler, type RouterResult } from "./shared";
import { lerDinheiro, lerMes, lerData } from "./parsers";
import { reaisBr } from "@/lib/numero-br";
import { savePendingFinance, loadPendingFinance, clearPendingFinance } from "@/lib/actions/finance-pending";
import {
  savePendingRecebimento,
  loadPendingRecebimento,
  clearPendingRecebimento,
  aplicarRespostaRecebimento,
  type CampoRecebimento,
} from "@/lib/actions/recebimento-pending";

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
   * `num()` era `Number()` cru: "1.200,00" virava NaN e "60 mil" também. O
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

// ── Fase 5 (dinheiro que entra): dar baixa e consultar ──────────────────────

/**
 * "O João me pagou" / "a Fazenda Boa Vista pagou 500 dos 1500" (Fase 5,
 * Task 3, `task-3-brief.md`). O CLASSIFICADOR DO N8N NÃO FOI TOCADO (decisão
 * do usuário: o agente fica congelado até o sistema estar revisado). A
 * intenção existe, é roteada e é testada, e fica esperando o dia em que o
 * classificador aprender a emiti-la. Mesmo estado de `mao-de-obra.ts` e
 * `evento.ts`.
 *
 * AS MESMAS TRÊS REGRAS DE SEMPRE, herdadas de defeitos reais:
 *
 * 1. "não"/"cancela" cancela, e é a PRIMEIRA coisa checada (2026-08-18, no
 *    estoque, "não, deixa pra lá" gravou a compra recusada).
 * 2. O "sim" executa o que foi MOSTRADO, lido do pedido guardado, nunca o que
 *    o classificador remontou da própria resposta do assistente.
 * 3. Confirmação SEMPRE, qualquer valor: é dinheiro saindo do painel de
 *    contas a receber, e por isso a intenção não entra em
 *    `INTENCOES_QUE_GRAVAM_SEM_CONFIRMAR`.
 * 4. **O "sim" executa o `entry_id` guardado, nunca uma releitura da lista de
 *    contas em aberto** (G1, achado do juiz de 2026-09-16). Ver o comentário
 *    de `perguntarOuExecutarRecebimento` abaixo.
 *
 * `contasEmAbertoDoContato` desambigua homônimo (G2, mesma rodada): quando o
 * nome casa mais de um cliente ou contato, pergunta qual, no mesmo espírito de
 * `resolverTrabalhador` (`mao-de-obra.ts`) e `consultarCliente`
 * (`prestador.ts`). Nunca escolhe o primeiro em silêncio.
 */

async function cancelarRecebimento(
  intent: string,
  tenantId: string,
  userId: string | undefined,
): Promise<RouterResult> {
  if (userId) await clearPendingRecebimento(tenantId, userId);
  return {
    reply_text: "Tudo bem, não registrei nada.",
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:cancelado`,
  };
}

/**
 * Abre a conversa: aplica o "sim" (só do que foi guardado), junta a resposta
 * ao campo pendente, ou segue com o que chegou nesta mensagem. Mesmo molde de
 * `abrirConversa` em `mao-de-obra.ts`.
 */
async function abrirConversaRecebimento(ctx: {
  tenant_id: string;
  user_id?: string;
  parameters: Record<string, unknown>;
  confirmed: boolean;
}): Promise<
  | { parar: RouterResult }
  | {
      parameters: Record<string, unknown>;
      guardar: (aguardando: CampoRecebimento) => Promise<void>;
      limpar: () => Promise<void>;
    }
> {
  const temMemoria = !!ctx.user_id;
  const pendente = temMemoria ? await loadPendingRecebimento(ctx.tenant_id, ctx.user_id!) : null;
  let parameters = ctx.parameters;

  if (ctx.confirmed) {
    if (!temMemoria) {
      return {
        parar: ask(
          "Não consegui identificar quem está falando comigo, então não vou registrar nada. Me conte de novo o que você precisa.",
        ),
      };
    }
    if (pendente?.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else {
      return { parar: ask("Não tenho nenhum recebimento esperando confirmação. Me conte de novo.") };
    }
  } else if (pendente && pendente.aguardando !== "confirmacao") {
    const juntos = aplicarRespostaRecebimento(pendente, ctx.parameters);
    if (juntos) parameters = juntos;
  }

  return {
    parameters,
    guardar: async (aguardando) => {
      if (temMemoria) await savePendingRecebimento(ctx.tenant_id, ctx.user_id!, { parameters, aguardando });
    },
    limpar: async () => {
      if (temMemoria) await clearPendingRecebimento(ctx.tenant_id, ctx.user_id!);
    },
  };
}

function listaDeContas(contas: ContaEmAberto[]): string {
  return contas
    .map((c, i) => {
      const venc = c.due_date ? `, vence ${c.due_date.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : "";
      return `${i + 1}. ${reaisBr(c.saldo)}${venc} (${c.descricao})`;
    })
    .join("\n");
}

/** G2: a lista numerada de homônimos, para o produtor escolher qual. */
function listaDePessoas(candidatos: PessoaCandidata[]): string {
  return candidatos.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
}

/**
 * Pergunta a confirmação (primeira vez que a conta é conhecida) ou executa a
 * baixa (turnos seguintes: correção de valor, ou o "sim").
 *
 * G1 (achado do juiz, 2026-09-16): o `entryId` é sempre o que já foi
 * RESOLVIDO e MOSTRADO ao produtor, nunca uma releitura de
 * `contasEmAbertoDoContato`. A cada chamada, a conta é relida do banco PELO
 * ID, e se ela não estiver mais em aberto (foi paga, cancelada, ou nem existe
 * mais), a conversa é encerrada com um aviso em vez de gravar qualquer coisa.
 * É a garantia que faltava: o comentário do topo do arquivo diz "o 'sim'
 * executa o que foi MOSTRADO", e antes disto isso só valia para os
 * parâmetros, não para QUAL conta.
 */
async function perguntarOuExecutarRecebimento(
  db: TenantPrismaClient,
  confirmed: boolean,
  parameters: Record<string, unknown>,
  contatoNome: string,
  entryId: string,
  guardar: (aguardando: CampoRecebimento) => Promise<void>,
  limpar: () => Promise<void>,
  intent: string,
): Promise<RouterResult> {
  const entryAtual = await db.financialEntry.findFirst({ where: { id: entryId, status: "pending" } });
  if (!entryAtual) {
    await limpar();
    return ask(
      "Essa conta mudou desde a última vez (foi paga, cancelada, ou não existe mais). " +
        "Me conte de novo o que você quer registrar.",
    );
  }
  const { valor, saldo } = await resumoDePagamento(db, entryAtual);
  const informado = lerDinheiro(parameters, "valor", "amount");

  // Nunca aceita pagamento acima do saldo ATUAL: recusa e pergunta de novo,
  // sem requires_confirmation (não é uma confirmação, é uma correção).
  if (informado != null && informado > saldo) {
    parameters.entry_id = entryId;
    parameters.contato_resolvido = contatoNome;
    await guardar("valor");
    return ask(
      `O valor de ${reaisBr(informado)} é maior que o saldo desta conta, que é ${reaisBr(saldo)}. Quanto você quer registrar?`,
    );
  }

  if (!confirmed) {
    parameters.entry_id = entryId;
    parameters.contato_resolvido = contatoNome;
    await guardar("confirmacao");
    const pergunta =
      informado == null
        ? `${contatoNome} tem uma conta de ${reaisBr(valor)}, saldo ${reaisBr(saldo)}. Confirma que quitou tudo?`
        : `O saldo da conta de ${contatoNome} é ${reaisBr(saldo)}. Confirma o pagamento de ${reaisBr(informado)}?`;
    return {
      reply_text: pergunta,
      requires_confirmation: true,
      auxiliary_data: { contato: contatoNome, entry_id: entryId, saldo, valor: informado },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const dataLida = lerData(parameters, "data", "date");
  const paidAt = dataLida.tipo === "ok" ? dataLida.data : undefined;

  // `informado === null` quita a conta inteira (markEntryPaidAction, mesma
  // action do botão "Pagar" da tela); com valor, é pagamento parcial
  // (registrarPagamentoAction, mesma action da tela de Financeiro).
  const resultado =
    informado == null
      ? await markEntryPaidAction(db, entryAtual.id, paidAt)
      : await registrarPagamentoAction(db, entryAtual.id, { amount: informado, paid_at: paidAt });
  await limpar();
  if (!resultado.ok) return failReply(intent, resultado);

  return {
    reply_text: `✅ Recebimento de ${reaisBr(informado ?? saldo)} de ${contatoNome} registrado.`,
    requires_confirmation: false,
    auxiliary_data: { entry_id: entryAtual.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
}

export const registrarRecebimento: Handler = async (ctx) => {
  const intent = "registrar_recebimento";
  if (ctx.explicitNo) return cancelarRecebimento(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversaRecebimento(ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  // G1: a conta já foi resolvida e mostrada numa volta anterior (estamos
  // corrigindo o valor, ou confirmando com "sim"). Nunca mais reconsulta a
  // lista de contas em aberto a partir daqui: ver `perguntarOuExecutarRecebimento`.
  const entryIdGuardado = str(parameters.entry_id);
  const contatoJaResolvido = str(parameters.contato_resolvido);
  if (entryIdGuardado && contatoJaResolvido) {
    return perguntarOuExecutarRecebimento(
      ctx.db,
      ctx.confirmed,
      parameters,
      contatoJaResolvido,
      entryIdGuardado,
      guardar,
      limpar,
      intent,
    );
  }

  const nomeDito = str(parameters.contato) ?? str(parameters.nome);
  if (!nomeDito) {
    await guardar("contato");
    return ask("Quem pagou?");
  }

  let contatoNome: string;
  let contas: ContaEmAberto[];

  // G2: o nome já casou mais de uma pessoa numa volta anterior, e o produtor
  // acabou de escolher qual. Nunca casa o nome de novo: usa a pessoa
  // escolhida da lista que já foi mostrada.
  const candidatosGuardados = parameters.candidatos as PessoaCandidata[] | undefined;
  if (Array.isArray(candidatosGuardados) && candidatosGuardados.length > 0) {
    const escolhaPessoa = num(parameters.quem);
    if (escolhaPessoa == null || escolhaPessoa < 1 || escolhaPessoa > candidatosGuardados.length) {
      await guardar("quem");
      return ask(`Encontrei mais de um "${nomeDito}":\n${listaDePessoas(candidatosGuardados)}\nQual deles?`);
    }
    const pessoaEscolhida = candidatosGuardados[escolhaPessoa - 1];
    contatoNome = pessoaEscolhida.name;
    contas = await contasDaPessoa(ctx.db, pessoaEscolhida);
  } else {
    const achado = await contasEmAbertoDoContato(ctx.db, nomeDito);
    if (achado.estado === "nao_encontrado") {
      await limpar();
      return ask("Não achei nenhum cliente com esse nome. Como ele está cadastrado?");
    }
    if (achado.estado === "ambiguo") {
      parameters.candidatos = achado.candidatos;
      await guardar("quem");
      return ask(`Encontrei mais de um "${nomeDito}":\n${listaDePessoas(achado.candidatos)}\nQual deles?`);
    }
    contatoNome = achado.contato;
    contas = achado.contas;
  }

  if (contas.length === 0) {
    await limpar();
    return ask(`${contatoNome} não tem nenhuma conta em aberto comigo.`);
  }

  // Mais de uma conta: pergunta qual, numerada, antes de olhar valor. A
  // escolha entra pelo mesmo mecanismo de campo pendente que o nome usou.
  let conta = contas[0];
  if (contas.length > 1) {
    const escolha = num(parameters.escolha);
    if (escolha == null || escolha < 1 || escolha > contas.length) {
      await guardar("escolha");
      return ask(`${contatoNome} tem ${contas.length} contas em aberto:\n${listaDeContas(contas)}\nQual delas?`);
    }
    conta = contas[escolha - 1];
  }

  return perguntarOuExecutarRecebimento(
    ctx.db,
    ctx.confirmed,
    parameters,
    contatoNome,
    conta.id,
    guardar,
    limpar,
    intent,
  );
};

/**
 * "O João já pagou?" / "quanto o Zé Carlos ainda me deve": nunca grava, só lê.
 * Sem memória de conversa (é consulta, não escrita): homônimo é resolvido
 * pedindo um nome mais específico na próxima mensagem, mesmo padrão que
 * `consultarCliente` (`prestador.ts`) já usava.
 *
 * Decisão de produto de 16/09 (`consultar_cliente` saiu do classificador:
 * as duas perguntas "o que o cliente me deve" viravam intenções diferentes, e
 * o classificador errava entre elas): esta consulta responde as DUAS coisas
 * que antes ficavam em handlers separados, porque são coisas diferentes para
 * quem vai cobrar. `contasEmAbertoDoContato` dá o que já virou lançamento
 * pendente; quando a pessoa é cliente de serviço (`ServiceClient`),
 * `getClientSummaryAction` (mesma action de `consultarCliente`) dá o que já
 * foi feito e ainda não foi faturado. Contato de negócio (`Contact`) não tem
 * esse segundo número: só `ServiceClient` gera ordem de serviço.
 */
export const consultarRecebimento: Handler = async (ctx) => {
  const intent = "consultar_recebimento";
  const nome = str(ctx.parameters.contato) ?? str(ctx.parameters.nome);
  if (!nome) return ask("De quem você quer saber?");

  const achado = await contasEmAbertoDoContato(ctx.db, nome);
  if (achado.estado === "nao_encontrado") {
    return {
      reply_text: "Não achei nenhum cliente com esse nome. Como ele está cadastrado?",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${intent}:nao_encontrado`,
    };
  }
  if (achado.estado === "ambiguo") {
    return {
      reply_text: `Encontrei mais de um "${nome}": ${achado.candidatos.map((p) => p.name).join(", ")}. Qual deles?`,
      requires_confirmation: false,
      auxiliary_data: { candidatos: achado.candidatos },
      report_url: null,
      action_taken: `${intent}:ambiguo`,
    };
  }

  const naoFaturado =
    achado.pessoa.tipo === "cliente"
      ? await getClientSummaryAction(ctx.db, achado.pessoa.id)
      : null;
  const totalNaoFaturado = naoFaturado?.ok ? naoFaturado.data.total_pending : 0;

  const partes: string[] = [];
  if (achado.contas.length > 0) {
    partes.push(`Em aberto:\n${listaDeContas(achado.contas)}`);
  }
  if (totalNaoFaturado > 0) {
    partes.push(`Serviço já feito e ainda não faturado: ${reaisBr(totalNaoFaturado)}.`);
  }

  if (partes.length === 0) {
    return {
      reply_text: `${achado.contato} não tem nenhuma conta em aberto comigo.`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${intent}:sem_pendencia`,
    };
  }

  return {
    reply_text: `${achado.contato}:\n${partes.join("\n")}`,
    requires_confirmation: false,
    auxiliary_data: { contas: achado.contas, nao_faturado: totalNaoFaturado },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};
