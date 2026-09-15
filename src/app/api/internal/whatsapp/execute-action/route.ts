import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { log } from "@/lib/log";
import { isIntent } from "@/lib/whatsapp-intents";
import { executarIntencao } from "@/lib/actions/executar-intencao";
import { withApi } from "@/lib/route";

/**
 * POST /api/internal/whatsapp/execute-action (spec 3.5)
 *
 * Recebe a intenção já classificada pelo LLM (no N8N) e roteia para a lógica de
 * negócio existente dos Módulos 1/2 (src/lib/actions/*), sem duplicar.
 *
 * Campos aditivos ao contrato da spec (documentados no plano do Módulo 3):
 * - message_text (opcional): texto bruto da mensagem, usado para log fiel em
 *   AgentConversationLog e, quando presente, como a ÚNICA fonte de
 *   confirmação e recusa ("sim"/"não", leitura estrita de `detectConfirmation`).
 * - confirmed (opcional): só vale quando a chamada vem SEM `message_text`;
 *   com texto, é ignorado (ver o cálculo de `confirmed` em `executarIntencao`).
 *
 * Idempotência por `wamid#intenção`, log de conversa, `detectConfirmation` e
 * `routeIntent` vivem no núcleo `executarIntencao`
 * (src/lib/actions/executar-intencao.ts, Task 7 da Fase 2), reusado pelo
 * turno que executa vários pedidos de uma mensagem. Esta rota só autentica,
 * valida o corpo, confere tenant x usuário e resolve usuário/contato/perfis.
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

  // user_id é sempre revalidado no banco: nunca confiamos na role vinda do caller.
  const user = await db.user.findFirst({ where: { id: user_id, active: true } });
  if (!user) {
    return apiError("INVALID_USER", "Usuário não encontrado ou inativo neste tenant", 404);
  }

  const contact = await db.whatsAppContact.findFirst({ where: { user_id: user.id } });
  const profiles = await db.tenantProfile.findMany({ where: { active: true } });
  const activeProfiles = profiles.map((p) => p.profile_type);

  const resultado = await executarIntencao({
    db,
    tenant_id,
    user: { id: user.id, role: user.role },
    contato_id: contact?.id ?? null,
    activeProfiles,
    intent,
    parameters,
    message_text: message_text ?? null,
    confirmed_do_corpo: parsed.data.confirmed ?? null,
    provider_message_id: parsed.data.provider_message_id ?? null,
    registrar_entrada: true,
  });

  const resposta = {
    reply_text: resultado.reply_text,
    requires_confirmation: resultado.requires_confirmation,
    auxiliary_data: resultado.auxiliary_data,
    report_url: resultado.report_url,
    // Extensão aditiva (2026-07-30): o N8N usa isso para decidir o que NÃO
    // reescrever no humanizador. Pergunta de formulário e pedido de
    // esclarecimento são textos precisos que guiam uma máquina de estados:
    // mudar a redação deles muda o gatilho da conversa.
    action_taken: resultado.action_taken,
  };

  return apiOk(resposta);
}

export const POST = withApi(POSTHandler);
