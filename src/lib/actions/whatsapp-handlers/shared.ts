import type { TenantPrismaClient } from "@/lib/prisma";
import type { AppUserRole } from "@/types/next-auth";
import type { ProfileType } from "@/lib/tenant-context";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Tipos e helpers compartilhados pelos handlers de intenção do agente
 * WhatsApp (spec 3.5). Cada intenção vive em seu próprio módulo, agrupado
 * por domínio, em src/lib/actions/whatsapp-handlers/*: routeIntent(), em
 * whatsapp-router.ts, só checa permissão/perfil e despacha.
 */

export type RouterResult = {
  reply_text: string;
  requires_confirmation: boolean;
  auxiliary_data: Record<string, unknown> | null;
  report_url: string | null;
  /** Uso interno (log), não faz parte do contrato de resposta HTTP. */
  action_taken: string;
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
};

export type Handler = (ctx: HandlerCtx) => Promise<RouterResult>;

export function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
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
