import type { TenantPrismaClient } from "@/lib/prisma";
import type { AppUserRole } from "@/types/next-auth";
import type { ProfileType } from "@/lib/tenant-context";
import type { ActionResult } from "@/lib/actions/types";
import type { Intent } from "@/lib/whatsapp-intents";
import { lerNumeroBr } from "@/lib/numero-br";

/**
 * Tipos e helpers compartilhados pelos handlers de intenção do agente
 * WhatsApp (spec 3.5). Cada intenção vive em seu próprio módulo, agrupado
 * por domínio, em src/lib/actions/whatsapp-handlers/*: routeIntent(), em
 * whatsapp-router.ts, só checa permissão/perfil e despacha.
 */

/**
 * As intenções que GRAVAM sem pedir "sim": o uso de estoque (§10.3, o gesto
 * mais frequente e que não mexe em dinheiro) e os quatro registros de rebanho
 * que só descrevem um fato do animal (cadastro, peso, vacina e a previsão
 * dela). Nenhum dos cinco recebe `confirmed` no handler.
 *
 * ⚠️ **A lista nasceu com o uso de estoque só, e a catraca da seção 1c da
 * `m68` achou os outros quatro no mesmo dia.** A versão incompleta fazia a
 * guarda do turno parecer mais forte do que era.
 *
 * Existe como lista exportada, e não como comparação solta dentro de cada
 * arquivo, porque DOIS lugares distantes precisam concordar sobre ela: o
 * handler do estoque, que decide se `confirmed` quer dizer alguma coisa, e o
 * turno, que decide se pode empurrar uma mensagem duvidosa para dentro de um
 * campo pendente. Quando os dois duplicavam a regra, o turno abriu um caminho
 * de gravação sem confirmação que a revisão da Fase 4 reproduziu em banco:
 * "usei 2 sacas" / "Qual produto?" / "nem precisei do sal afinal" gravava o
 * uso. Handler novo que não confirmar entra AQUI, e as duas pontas andam
 * juntas.
 */
export const INTENCOES_QUE_GRAVAM_SEM_CONFIRMAR: readonly Intent[] = [
  "registrar_uso_estoque",
  "cadastrar_animal",
  "registrar_peso",
  "registrar_vacina",
  "registrar_previsao_vacina",
];

export type RouterResult = {
  reply_text: string;
  requires_confirmation: boolean;
  auxiliary_data: Record<string, unknown> | null;
  report_url: string | null;
  /** Uso interno (log), não faz parte do contrato de resposta HTTP. */
  action_taken: string;
  /**
   * A intenção depois dos desvios de `routeIntent` (venda do confinamento,
   * pendente de estoque...). Quando um fluxo ativo (cadastro assistido)
   * consome a mensagem, continua sendo a intenção da mensagem, não a do fluxo.
   */
  intent_final?: Intent;
};

/** Contexto passado a todo handler de intenção: mesmo formato para todos. */
export type HandlerCtx = {
  db: TenantPrismaClient;
  tenant_id: string;
  role: AppUserRole;
  activeProfiles: ProfileType[];
  parameters: Record<string, unknown>;
  /** true quando o N8N/usuário confirmou explicitamente a ação pendente. */
  confirmed: boolean;
  /** true quando o usuário recusou explicitamente ("não", "cancela"...). */
  explicitNo: boolean;
  /**
   * Quem mandou a mensagem. Opcional porque nem toda chamada interna resolve
   * usuário. Usado por handlers que guardam estado de conversa por pessoa,
   * como o pendente de rebanho (Módulo 30 §14).
   */
  user_id?: string;
};

export type Handler = (ctx: HandlerCtx) => Promise<RouterResult>;

export function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

/**
 * Era `Number()` cru, e "1.500" virava 1,5 no peso, na vacina, na remessa de
 * evento e na lista. O classificador repassa o número como o produtor falou.
 */
export function num(v: unknown): number | null {
  return lerNumeroBr(v);
}

export function ask(text: string, auxiliary: Record<string, unknown> | null = null): RouterResult {
  return {
    reply_text: text,
    requires_confirmation: false,
    auxiliary_data: auxiliary,
    report_url: null,
    action_taken: "clarification_requested",
  };
}

export function failReply(
  intent: string,
  result: Extract<ActionResult<unknown>, { ok: false }>,
): RouterResult {
  return {
    reply_text: `⚠️ ${result.message}`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:falhou:${result.code}`,
  };
}

/**
 * Fluxo de confirmação sim/não (spec 3.6) compartilhado pelas intenções que
 * pedem confirmação antes de executar. Devolve um RouterResult quando a
 * ação deve parar aqui (cancelada ou aguardando "sim"); devolve `null`
 * quando `confirmed` já é true e o chamador deve seguir com a ação de
 * verdade.
 */
export function confirmFlow(params: {
  intent: string;
  explicitNo: boolean;
  confirmed: boolean;
  question: string;
  auxiliary: Record<string, unknown>;
  cancelledText?: string;
}): RouterResult | null {
  if (params.explicitNo) {
    return {
      reply_text: params.cancelledText ?? "Ação cancelada.",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${params.intent}:cancelado`,
    };
  }
  if (!params.confirmed) {
    return {
      reply_text: params.question,
      requires_confirmation: true,
      auxiliary_data: params.auxiliary,
      report_url: null,
      action_taken: `${params.intent}:aguardando_confirmacao`,
    };
  }
  return null;
}

/**
 * Minúsculas, sem acento e sem espaço repetido, para comparar o que o produtor
 * ditou com o que está cadastrado.
 *
 * ⚠️ Existem cinco cópias locais disto (`confinamento`, `estoque`, `leite`,
 * `mao-de-obra`, `servico`). Esta é a versão compartilhada, e as outras devem
 * migrar para cá **quando o arquivo delas for aberto por outro motivo**: mexer
 * em cinco handlers estáveis só para unificar um helper é risco sem retorno.
 */
export function normalizarTermo(termo: string): string {
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
