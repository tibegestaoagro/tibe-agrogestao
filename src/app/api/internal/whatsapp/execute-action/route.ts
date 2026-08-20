import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { log } from "@/lib/log";
import type { Prisma } from "@/generated/prisma/client";
import { isIntent } from "@/lib/whatsapp-intents";
import { detectConfirmation } from "@/lib/actions/confirmation";
import { logInbound, logOutbound } from "@/lib/actions/conversation-log";
import { routeIntent } from "@/lib/actions/whatsapp-router";
import { withApi } from "@/lib/route";

/**
 * POST /api/internal/whatsapp/execute-action (spec 3.5)
 *
 * Recebe a intenção já classificada pelo LLM (no N8N) e roteia para a lógica de
 * negócio existente dos Módulos 1/2 (src/lib/actions/*), sem duplicar.
 *
 * Campos aditivos ao contrato da spec (documentados no plano do Módulo 3):
 * - message_text (opcional): texto bruto da mensagem, usado para log fiel em
 *   AgentConversationLog e como fallback de interpretação de confirmação
 *   ("sim"/"não") independente do LLM.
 * - confirmed (opcional): quando o N8N já resolveu que o usuário confirmou a
 *   ação pendente, reenviando a MESMA intenção+parâmetros originais.
 */

const schema = z.object({
  tenant_id: z.string().min(1),
  user_id: z.string().min(1),
  intent: z.string(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  message_text: z.string().nullish(),
  confirmed: z.boolean().nullish(),
  /**
   * `wamid` da mensagem no provider, para tornar a execução idempotente.
   *
   * Opcional porque o n8n ainda não manda: sem ele, o comportamento é o de
   * antes, sem proteção contra reprocessamento. É um campo que ele já tem no
   * payload do webhook, e passar adiante é uma edição de um nó. Enquanto isso
   * não acontece, o log registra que a chamada veio sem chave.
   */
  provider_message_id: z.string().min(1).nullish(),
});

async function POSTHandler(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      "Corpo inválido: tenant_id, user_id e intent são obrigatórios",
      422,
    );
  }
  const { tenant_id, user_id, parameters, message_text } = parsed.data;
  const intent = isIntent(parsed.data.intent) ? parsed.data.intent : "ambigua";

  /**
   * O `tenant_id` do CORPO deixou de ser autoridade (2026-08-20).
   *
   * Esta é a única rota de escrita do sistema que recebia o tenant do caller,
   * e o único guardião era um segredo estático compartilhado com uma
   * instância n8n externa. Quem tivesse esse valor escrevia em qualquer
   * fazenda, escolhendo o alvo no corpo da requisição.
   *
   * `User.id` é cuid globalmente único, então dá para resolver o tenant a
   * partir dele e exigir que os dois batam. O segredo continua sendo a
   * autenticação, mas deixou de ser a autorização: agora, mesmo vazado, ele
   * só alcança o tenant a que o usuário informado realmente pertence.
   *
   * A leitura usa o client base de propósito: é o mesmo caso estrutural de
   * `resolve-contact`, que precisa achar a qual tenant algo pertence ANTES de
   * saber o tenant.
   */
  const dono = await prisma.user.findUnique({
    where: { id: user_id },
    select: { tenant_id: true },
  });
  if (!dono || dono.tenant_id !== tenant_id) {
    log.warn("execute-action recusado: tenant_id do corpo nao bate com o dono do user_id", {
      route: "/api/internal/whatsapp/execute-action",
      code: "TENANT_MISMATCH",
      intent,
      status: 403,
    });
    return apiError(
      "TENANT_MISMATCH",
      "O usuário informado não pertence a este tenant",
      403,
    );
  }

  const db = prismaForTenant(tenant_id);

  /**
   * Replay da MESMA mensagem devolve a resposta da primeira vez, sem executar
   * nada de novo.
   *
   * Sem isto, um retry do n8n gravava a mesma venda de gado, o mesmo
   * lançamento e a mesma saída de estoque outra vez. A checagem vem antes de
   * qualquer escrita, inclusive antes do log de entrada, porque replay não é
   * mensagem nova e não deve engordar o histórico da conversa.
   */
  const providerMessageId = parsed.data.provider_message_id ?? null;
  if (providerMessageId) {
    const anterior = await db.agentRequest.findFirst({
      where: { provider_message_id: providerMessageId },
    });
    if (anterior) {
      log.info("execute-action: replay respondido pelo registro anterior", {
        route: "/api/internal/whatsapp/execute-action",
        intent: anterior.intent,
        code: "REPLAY",
      });
      return apiOk(anterior.response as Record<string, unknown>);
    }
  } else {
    log.warn("execute-action sem provider_message_id: sem protecao contra reprocessamento", {
      route: "/api/internal/whatsapp/execute-action",
      intent,
      code: "SEM_CHAVE_DE_IDEMPOTENCIA",
    });
  }

  // user_id é sempre revalidado no banco: nunca confiamos na role vinda do caller.
  const user = await db.user.findFirst({ where: { id: user_id, active: true } });
  if (!user) {
    return apiError("INVALID_USER", "Usuário não encontrado ou inativo neste tenant", 404);
  }

  const contact = await db.whatsAppContact.findFirst({ where: { user_id: user.id } });
  const profiles = await db.tenantProfile.findMany({ where: { active: true } });
  const activeProfiles = profiles.map((p) => p.profile_type);

  if (contact) {
    await logInbound(db, {
      whatsapp_contact_id: contact.id,
      content: message_text ?? `[${intent}] ${JSON.stringify(parameters)}`,
      intent,
    });
  }

  const confirmationSignal = detectConfirmation(message_text);
  const confirmed = parsed.data.confirmed === true || confirmationSignal === "yes";
  /**
   * Recusa vem do TEXTO, não de `confirmed: false`.
   *
   * `confirmed` significa "o produtor confirmou": `false` é a AUSÊNCIA de
   * confirmação, não uma negativa. Tratar os dois como a mesma coisa era um
   * erro de leitura com consequência real, porque o guia do n8n manda o
   * classificador emitir o campo em TODA mensagem: um `false` de rotina em
   * "usei 2 sacas de sal no curral" cancelava o registro. Antes doía menos
   * (virava pergunta repetida); com a regra de que "não" cancela sempre,
   * passou a custar o gesto inteiro.
   */
  const explicitNo = confirmationSignal === "no";

  const result = await routeIntent(db, {
    tenant_id,
    role: user.role,
    activeProfiles,
    intent,
    parameters,
    user_id: user.id,
    message_text: message_text ?? null,
    confirmed,
    explicitNo,
  });

  if (contact) {
    await logOutbound(db, {
      whatsapp_contact_id: contact.id,
      content: result.reply_text,
      intent,
      action_taken: result.action_taken,
    });
  }

  const resposta = {
    reply_text: result.reply_text,
    requires_confirmation: result.requires_confirmation,
    auxiliary_data: result.auxiliary_data,
    report_url: result.report_url,
    // Extensão aditiva (2026-07-30): o N8N usa isso para decidir o que NÃO
    // reescrever no humanizador. Pergunta de formulário e pedido de
    // esclarecimento são textos precisos que guiam uma máquina de estados:
    // mudar a redação deles muda o gatilho da conversa.
    action_taken: result.action_taken,
  };

  if (providerMessageId) {
    // Grava DEPOIS de executar, para que uma execução que falhou no meio possa
    // ser tentada de novo. E a colisão é ignorada de propósito: se duas
    // chamadas idênticas correram juntas, as duas fizeram o mesmo trabalho e a
    // segunda só perdeu a corrida de registrar.
    try {
      await db.agentRequest.create({
        data: scoped({
          provider_message_id: providerMessageId,
          intent,
          // `auxiliary_data` é `Record<string, unknown>`, e `unknown` não casa
          // com o tipo de entrada de coluna Json. O valor É serializável (é o
          // mesmo objeto que sai na resposta HTTP), então o que falta é dizer
          // isso ao compilador, não mudar o dado.
          response: resposta as unknown as Prisma.InputJsonValue,
        }),
      });
    } catch (e) {
      if ((e as { code?: unknown })?.code !== "P2002") throw e;
    }
  }

  return apiOk(resposta);
}

export const POST = withApi(POSTHandler);
