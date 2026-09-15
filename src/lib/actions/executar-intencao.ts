import type { Prisma } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma";
import { scoped } from "@/lib/prisma";
import type { AppUserRole } from "@/types/next-auth";
import type { ProfileType } from "@/lib/tenant-context";
import type { Intent } from "@/lib/whatsapp-intents";
import { log } from "@/lib/log";
import { detectConfirmation } from "@/lib/actions/confirmation";
import { logInbound, logOutbound } from "@/lib/actions/conversation-log";
import { routeIntent } from "@/lib/actions/whatsapp-router";
import { atualizarCursor } from "@/lib/agente/cursor";

/**
 * Núcleo de execução de uma intenção do agente WhatsApp (Task 7 da Fase 2).
 *
 * Extraído de POST /api/internal/whatsapp/execute-action (spec 3.5) para ser
 * reusado pelo turno, que executa vários pedidos de uma mesma mensagem: cada
 * pedido chama `executarIntencao` uma vez. Idempotência por
 * `wamid#intenção`, log de entrada, `detectConfirmation`, `routeIntent`, log
 * de saída e gravação do `AgentRequest`, tudo o que a rota fazia depois de
 * achar o usuário, sem mudar comportamento.
 */
export type EntradaDaIntencao = {
  db: TenantPrismaClient;
  tenant_id: string;
  user: { id: string; role: AppUserRole };
  contato_id: string | null;
  activeProfiles: ProfileType[];
  intent: Intent;
  parameters: Record<string, unknown>;
  message_text: string | null;
  confirmed_do_corpo: boolean | null;
  provider_message_id: string | null;
  /** O turno registra a entrada uma vez só, antes de executar os pedidos. */
  registrar_entrada: boolean;
};

export type SaidaDaIntencao = {
  reply_text: string;
  requires_confirmation: boolean;
  auxiliary_data: Record<string, unknown> | null;
  report_url: string | null;
  action_taken: string;
  intent_final: Intent;
  replay: boolean;
};

export async function executarIntencao(e: EntradaDaIntencao): Promise<SaidaDaIntencao> {
  const {
    db,
    tenant_id,
    user,
    contato_id,
    activeProfiles,
    intent,
    parameters,
    message_text,
    confirmed_do_corpo,
    provider_message_id,
    registrar_entrada,
  } = e;

  /**
   * Replay da MESMA mensagem devolve a resposta da primeira vez, sem executar
   * nada de novo.
   *
   * Sem isto, um retry do n8n gravava a mesma venda de gado, o mesmo
   * lançamento e a mesma saída de estoque outra vez. A checagem vem antes de
   * qualquer escrita, inclusive antes do log de entrada, porque replay não é
   * mensagem nova e não deve engordar o histórico da conversa.
   */
  /**
   * A chave inclui a intenção: uma mensagem com dois pedidos ("quantos animais
   * e o que tenho a pagar") chega em duas chamadas com o MESMO wamid, uma por
   * intenção. Chavear só pelo wamid fazia a segunda intenção ser tratada como
   * replay da primeira e devolver a resposta errada, sem executar nada.
   */
  const chaveIdempotencia = provider_message_id ? `${provider_message_id}#${intent}` : null;
  if (chaveIdempotencia) {
    const anterior = await db.agentRequest.findFirst({
      where: { provider_message_id: chaveIdempotencia },
    });
    if (anterior) {
      log.info("execute-action: replay respondido pelo registro anterior", {
        route: "/api/internal/whatsapp/execute-action",
        intent: anterior.intent,
        code: "REPLAY",
      });
      const resposta = anterior.response as Record<string, unknown>;
      return {
        reply_text: resposta.reply_text as string,
        requires_confirmation: resposta.requires_confirmation as boolean,
        auxiliary_data: (resposta.auxiliary_data as Record<string, unknown> | null) ?? null,
        report_url: (resposta.report_url as string | null) ?? null,
        action_taken: resposta.action_taken as string,
        intent_final: intent,
        replay: true,
      };
    }
  } else {
    log.warn("execute-action sem provider_message_id: sem protecao contra reprocessamento", {
      route: "/api/internal/whatsapp/execute-action",
      intent,
      code: "SEM_CHAVE_DE_IDEMPOTENCIA",
    });
  }

  if (registrar_entrada && contato_id) {
    await logInbound(db, {
      whatsapp_contact_id: contato_id,
      content: message_text ?? `[${intent}] ${JSON.stringify(parameters)}`,
      intent,
    });
  }

  const confirmationSignal = detectConfirmation(message_text);
  /**
   * Com texto, o TEXTO decide a confirmação; `confirmed` do n8n só vale quando
   * a chamada vem sem `message_text`.
   *
   * O classificador marca `confirmed: true` em frases como "ok, anota 500 de
   * diesel", que a leitura estrita de `detectConfirmation` não aceita como
   * "sim": com o OU antigo, a flag furava a regra e a frase executava o
   * pendente guardado (a despesa de antes), jogando fora o pedido novo.
   */
  const temTexto = !!message_text?.trim();
  const confirmed =
    confirmationSignal !== "no" &&
    (temTexto ? confirmationSignal === "yes" : confirmed_do_corpo === true);
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

  const inicio = Date.now();
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

  if (contato_id) {
    await logOutbound(db, {
      whatsapp_contact_id: contato_id,
      content: result.reply_text,
      intent,
      action_taken: result.action_taken,
    });
  }

  /**
   * O cursor só é atualizado AQUI, no caminho que executou de verdade (nunca
   * no replay, que devolve antes de chegar neste ponto): o turno (tarefa
   * futura) lê o cursor mas não grava, senão duas leituras da mesma resposta
   * atualizariam o relógio duas vezes.
   */
  await atualizarCursor({
    tenantId: tenant_id,
    userId: user.id,
    intentFinal: result.intent_final ?? intent,
    resposta: result.reply_text,
    inicio,
    db,
  });

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

  if (chaveIdempotencia) {
    // Grava DEPOIS de executar, para que uma execução que falhou no meio possa
    // ser tentada de novo. E a colisão é ignorada de propósito: se duas
    // chamadas idênticas correram juntas, as duas fizeram o mesmo trabalho e a
    // segunda só perdeu a corrida de registrar.
    try {
      await db.agentRequest.create({
        data: scoped({
          provider_message_id: chaveIdempotencia,
          intent,
          // `auxiliary_data` é `Record<string, unknown>`, e `unknown` não casa
          // com o tipo de entrada de coluna Json. O valor É serializável (é o
          // mesmo objeto que sai na resposta HTTP), então o que falta é dizer
          // isso ao compilador, não mudar o dado.
          response: resposta as unknown as Prisma.InputJsonValue,
        }),
      });
    } catch (err) {
      if ((err as { code?: unknown })?.code !== "P2002") throw err;
    }
  }

  return { ...resposta, intent_final: result.intent_final ?? intent, replay: false };
}
