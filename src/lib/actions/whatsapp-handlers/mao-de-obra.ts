import type { PayFrequency } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma";
import {
  listWorkers,
  createWorker,
  confirmWorkerPayment,
  recordWorkerAdvance,
  type WorkerView,
} from "@/lib/actions/workers";
import {
  savePendingWorker,
  loadPendingWorker,
  clearPendingWorker,
  aplicarRespostaMaoDeObra,
  type CampoMaoDeObra,
  type GestoMaoDeObra,
} from "@/lib/actions/worker-pending";
import { ask, failReply, str, type Handler, type RouterResult } from "./shared";
import { lerNumeroBr } from "./parsers";

/**
 * Mão de obra pelo WhatsApp (Módulo 33, §32 do documento do cliente).
 *
 * Três conversas, as três do §32: cadastrar o trabalhador fixo ("João é meu
 * vaqueiro e ganha 2.500 por mês"), confirmar o pagamento ("Paguei o João
 * hoje") e registrar adiantamento ("Dei 500 reais adiantado para o João").
 *
 * O CLASSIFICADOR DO N8N NÃO FOI TOCADO (decisão do usuário: o agente fica
 * congelado até o sistema estar revisado). As três intenções existem, são
 * roteadas e são testadas, e ficam esperando o dia em que o classificador
 * aprender a emiti-las. Mesmo estado de `evento.ts`, `permuta.ts`,
 * `confinamento.ts` e `leite.ts`.
 *
 * AS TRÊS REGRAS QUE NÃO PODEM AFROUXAR, todas herdadas de defeitos reais:
 *
 * 1. **"não"/"cancela" cancela, e é a PRIMEIRA coisa checada.** Em 2026-08-18,
 *    no estoque, "não, deixa pra lá" gravou a compra recusada de R$ 1.200.
 * 2. **O "sim" executa o que foi MOSTRADO**, lido do pedido guardado, nunca o
 *    que o classificador remontou da própria resposta do assistente.
 * 3. **Confirmação sempre**, nas três conversas. O §32 mostra o TIBÉ
 *    perguntando "Deseja registrar" em todos os exemplos, e aqui cada gesto
 *    mexe em DINHEIRO: um cadastro errado cria conta a pagar recorrente.
 *
 * ⚠️ E uma quarta, própria desta área: **este caminho é fechado a OPERADOR**.
 * A matriz de `mao_de_obra` dá acesso só a OWNER e ADMIN, e o roteador aplica
 * isso antes de chegar aqui. É deliberado: salário não deve entrar por um
 * canal onde o autor é só um número de telefone.
 */

const FREQUENCIAS: Record<string, PayFrequency> = {
  mes: "mensal",
  mensal: "mensal",
  mensalmente: "mensal",
  quinzena: "quinzenal",
  quinzenal: "quinzenal",
  semana: "semanal",
  semanal: "semanal",
  dia: "diaria",
  diaria: "diaria",
  diária: "diaria",
};

const FRASE_DA_FREQUENCIA: Record<PayFrequency, string> = {
  mensal: "por mês",
  quinzenal: "por quinzena",
  semanal: "por semana",
  diaria: "por dia",
  outra: "por período",
};

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizar(termo: string): string {
  // Filtro por código numérico, não regex de caractere combinante: o próprio
  // caractere é invisível no editor e some numa cópia distraída (armadilha que
  // este projeto já pagou para aprender).
  const semAcento = Array.from(termo.toLowerCase().normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
  return semAcento.replace(/\s+/g, " ").trim();
}

/** Lê a frequência dita na conversa. Sem correspondência, devolve `null`. */
function lerFrequencia(bruto: string | null): PayFrequency | null {
  if (!bruto) return null;
  const alvo = normalizar(bruto);
  for (const [chave, valor] of Object.entries(FREQUENCIAS)) {
    if (alvo.includes(normalizar(chave))) return valor;
  }
  return null;
}

/**
 * Acha o trabalhador citado, sem inventar.
 *
 * ⚠️ AMBIGUIDADE PERGUNTA, nunca escolhe o primeiro. É o defeito que
 * `resolverPasto` tem e está registrado na `docs/agents/dividas.md` §3.3: uma
 * fazenda com "João da Silva" e "João Pereira" faria "paguei o João" cair no
 * primeiro, em silêncio, e o pagamento do mês de uma pessoa iria para a ficha
 * de outra. Este caminho nasce sem esse defeito.
 */
async function resolverTrabalhador(
  db: TenantPrismaClient,
  nome: string,
): Promise<{ ok: true; worker: WorkerView } | { ok: false; resposta: RouterResult }> {
  const todos = await listWorkers(db, { status: "ativo" });
  const alvo = normalizar(nome);
  const achados = todos.filter((w) => normalizar(w.name).includes(alvo));

  if (achados.length === 0) {
    if (todos.length === 0) {
      return {
        ok: false,
        resposta: ask(
          `Você ainda não tem ninguém cadastrado, então não consigo achar "${nome}". ` +
            "Me diga quem é e quanto ganha, ou cadastre no painel, em Mão de Obra.",
        ),
      };
    }
    const nomes = todos.map((w) => `- ${w.name} (${w.role})`).join("\n");
    return {
      ok: false,
      resposta: ask(`Não achei "${nome}" na sua equipe. Quem você tem:\n${nomes}`),
    };
  }
  if (achados.length > 1) {
    const nomes = achados.map((w) => `- ${w.name} (${w.role})`).join("\n");
    return { ok: false, resposta: ask(`Tenho mais de um com esse nome. Qual deles?\n${nomes}`) };
  }
  return { ok: true, worker: achados[0] };
}

async function cancelar(
  intent: string,
  tenantId: string,
  userId: string | undefined,
): Promise<RouterResult> {
  if (userId) await clearPendingWorker(tenantId, userId);
  return {
    reply_text: "Tudo bem, não registrei nada.",
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:cancelado`,
  };
}

/**
 * Prepara o pedido: aplica o cancelamento, recupera o pendente quando o
 * produtor disse "sim", e junta a resposta quando ele respondeu uma pergunta.
 *
 * Copiado em espírito de `leite.ts`, que já tinha resolvido a mesma sequência.
 */
async function abrirConversa(
  gesto: GestoMaoDeObra,
  ctx: {
    tenant_id: string;
    user_id?: string;
    parameters: Record<string, unknown>;
    confirmed: boolean;
  },
): Promise<
  | { parar: RouterResult }
  | {
      parameters: Record<string, unknown>;
      guardar: (aguardando: CampoMaoDeObra) => Promise<void>;
      limpar: () => Promise<void>;
    }
> {
  const temMemoria = !!ctx.user_id;
  const pendente = temMemoria ? await loadPendingWorker(ctx.tenant_id, ctx.user_id!) : null;
  let parameters = ctx.parameters;

  if (ctx.confirmed) {
    if (!temMemoria) {
      return {
        parar: ask(
          "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
            "Me conte de novo o que você precisa.",
        ),
      };
    }
    if (pendente?.gesto === gesto && pendente.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else {
      return {
        parar: ask(
          "Não tenho nenhum registro de mão de obra esperando confirmação. Me conte de novo.",
        ),
      };
    }
  } else if (pendente?.gesto === gesto && pendente.aguardando !== "confirmacao") {
    const juntos = aplicarRespostaMaoDeObra(pendente, ctx.parameters);
    if (juntos) parameters = juntos;
  }

  return {
    parameters,
    guardar: async (aguardando: CampoMaoDeObra) => {
      if (temMemoria) {
        await savePendingWorker(ctx.tenant_id, ctx.user_id!, { parameters, aguardando, gesto });
      }
    },
    limpar: async () => {
      if (temMemoria) await clearPendingWorker(ctx.tenant_id, ctx.user_id!);
    },
  };
}

// ── §32: cadastro do trabalhador fixo ────────────────────────────────────

/**
 * "João é meu vaqueiro e ganha 2.500 por mês."
 *
 * O §4 é a régua: o produtor não deve precisar de mais do que essa frase.
 * Nome, função, valor e frequência bastam; tudo o mais fica para o painel.
 */
export const registrarTrabalhador: Handler = async (ctx) => {
  const intent = "registrar_trabalhador";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("cadastro", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const nome = str(parameters.nome) ?? str(parameters.name);
  if (!nome) {
    await guardar("nome");
    return ask("Qual o nome do trabalhador?");
  }

  const funcao = str(parameters.funcao) ?? str(parameters.role);
  if (!funcao) {
    await guardar("funcao");
    return ask(`O que ${nome} faz na fazenda? (vaqueiro, tratorista, caseiro...)`);
  }

  const valor = lerNumeroBr(parameters.valor ?? parameters.amount);
  if (valor === null || valor <= 0) {
    await guardar("valor");
    return ask(`Quanto ${nome} recebe?`);
  }

  const frequencia =
    lerFrequencia(str(parameters.frequencia) ?? str(parameters.pay_frequency)) ?? null;
  if (!frequencia) {
    await guardar("frequencia");
    return ask(`${nome} recebe esse valor por mês, por quinzena, por semana ou por dia?`);
  }

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    return {
      reply_text:
        `Deseja cadastrar ${nome} como ${funcao}, com pagamento de ` +
        `${moeda(valor)} ${FRASE_DA_FREQUENCIA[frequencia]}?`,
      requires_confirmation: true,
      auxiliary_data: { nome, funcao, valor, frequencia },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const res = await createWorker(ctx.db, {
    name: nome,
    role: funcao,
    type: "fixo",
    pay_frequency: frequencia,
    pay_amount: valor,
  });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  const proximo = res.data.proximo_pagamento;
  return {
    reply_text:
      `✅ ${res.data.name} cadastrado como ${res.data.role}, ` +
      `${moeda(valor)} ${FRASE_DA_FREQUENCIA[frequencia]}.` +
      (proximo
        ? `\nPróximo pagamento: ${moeda(proximo.amount)} em ` +
          `${new Date(proximo.due_date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}.`
        : ""),
    requires_confirmation: false,
    auxiliary_data: { worker_id: res.data.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};

// ── §32: pagamento ───────────────────────────────────────────────────────

/**
 * "Paguei o João hoje."
 *
 * O §8 é explícito sobre o que acontece: o TIBÉ pergunta "Deseja registrar o
 * pagamento de R$ 2.500 referente ao pagamento mensal de João?" e SÓ ENTÃO
 * grava. Sem previsão pendente, a action recusa em vez de inventar um valor, e
 * a recusa vira a resposta.
 */
export const registrarPagamentoTrabalhador: Handler = async (ctx) => {
  const intent = "registrar_pagamento_trabalhador";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("pagamento", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const nome = str(parameters.nome) ?? str(parameters.name);
  if (!nome) {
    await guardar("nome");
    return ask("Quem você pagou?");
  }

  const achado = await resolverTrabalhador(ctx.db, nome);
  if (!achado.ok) return achado.resposta;
  const worker = achado.worker;

  const informado = lerNumeroBr(parameters.valor ?? parameters.amount);
  const previsto = worker.proximo_pagamento?.amount ?? null;
  const valor = informado ?? previsto;

  if (valor === null) {
    return ask(
      `Não tenho pagamento previsto para ${worker.name}, e você não me disse o valor. ` +
        "Quanto você pagou?",
    );
  }

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    return {
      reply_text:
        `Deseja registrar o pagamento de ${moeda(valor)} para ${worker.name}` +
        (informado === null && worker.pay_frequency
          ? `, referente ao pagamento ${FRASE_DA_FREQUENCIA[worker.pay_frequency]}?`
          : "?"),
      requires_confirmation: true,
      auxiliary_data: { worker_id: worker.id, valor },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const res = await confirmWorkerPayment(ctx.db, {
    worker_id: worker.id,
    amount: informado,
  });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  return {
    reply_text:
      `✅ Pagamento de ${moeda(res.data.pago)} para ${worker.name} registrado.` +
      (res.data.proxima_previsao
        ? `\nPróximo: ${new Date(res.data.proxima_previsao).toLocaleDateString("pt-BR", { timeZone: "UTC" })}.`
        : ""),
    requires_confirmation: false,
    auxiliary_data: { worker_id: worker.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};

// ── §32: adiantamento ────────────────────────────────────────────────────

/**
 * "Dei 500 reais adiantado para o João."
 *
 * O §9 pede que o adiantamento fique SEPARADO do pagamento normal, e é o que a
 * action faz: lançamento próprio, sem encostar na previsão do mês.
 */
export const registrarAdiantamento: Handler = async (ctx) => {
  const intent = "registrar_adiantamento";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("adiantamento", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const nome = str(parameters.nome) ?? str(parameters.name);
  if (!nome) {
    await guardar("nome");
    return ask("Para quem foi o adiantamento?");
  }

  const achado = await resolverTrabalhador(ctx.db, nome);
  if (!achado.ok) return achado.resposta;
  const worker = achado.worker;

  const valor = lerNumeroBr(parameters.valor ?? parameters.amount);
  if (valor === null || valor <= 0) {
    await guardar("valor");
    return ask(`Quanto você adiantou para ${worker.name}?`);
  }

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    return {
      reply_text: `Deseja registrar um adiantamento de ${moeda(valor)} para ${worker.name}?`,
      requires_confirmation: true,
      auxiliary_data: { worker_id: worker.id, valor },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const res = await recordWorkerAdvance(ctx.db, { worker_id: worker.id, amount: valor });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  return {
    reply_text:
      `✅ Adiantamento de ${moeda(res.data.amount)} para ${worker.name} registrado.` +
      (worker.proximo_pagamento
        ? `\nO pagamento previsto continua ${moeda(worker.proximo_pagamento.amount)}: ` +
          "o adiantamento fica separado, e você desconta na hora de pagar se quiser."
        : ""),
    requires_confirmation: false,
    auxiliary_data: { worker_id: worker.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};
