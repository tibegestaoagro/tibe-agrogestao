import type { EmailLogType } from "@/generated/prisma/enums";

/**
 * Tipos do seam de notificação (Onda 2, plano de arquitetura seção 2.4).
 * notify() é o único ponto de entrada: quem chama descreve conteúdo e
 * urgência, nunca escolhe canal. A política de quais canais tentar mora
 * dentro de src/lib/notify/index.ts.
 */

export type NotifyUrgency = "critical" | "digest";

/**
 * Quem recebe WhatsApp/email: canais de destinatário único. Push NÃO usa
 * este destinatário: é por INSCRIÇÃO (todo aparelho inscrito no tenant
 * recebe, ver PushSubscription no schema), então mais de um usuário/aparelho
 * pode ser notificado por push a partir da mesma chamada de notify().
 * `phone` pode ser null (nem todo usuário tem telefone cadastrado); `email`
 * é sempre presente (campo obrigatório em User).
 */
export type NotifyRecipient = {
  tenant_id: string;
  user_id: string;
  phone: string | null;
  email: string;
};

export type NotifyContent = {
  /** Título curto da notificação do sistema (push). */
  pushTitle: string;
  /** Corpo curto, uma linha: notificação do sistema, não mensagem de WhatsApp. */
  pushBody: string;
  /** Caminho do painel aberto ao clicar na notificação. Default: "/dashboard". */
  pushUrl?: string;
  /** Texto enviado por WhatsApp (mensagem completa, como hoje). */
  whatsappText: string;
  /**
   * Assunto/HTML do email. Omitido = canal de email nunca é tentado, mesmo
   * em urgency "critical" (defensivo; hoje todo chamador crítico preenche).
   * Em urgency "digest" este campo é sempre ignorado, mesmo se vier
   * preenchido: resumo diário nunca sai por email (decisão de produto, não
   * um detalhe de implementação).
   */
  email?: { subject: string; html: string; type?: EmailLogType };
};

export type NotifyChannelResult = { attempted: boolean; ok: boolean };

export type NotifyPushResult = NotifyChannelResult & {
  /**
   * Quantas inscrições de push ativas o tenant tinha ANTES deste envio.
   * É existência, não sucesso de entrega, o que decide o fallback para
   * WhatsApp em urgency "digest" (ver notify()): uma inscrição presente cuja
   * entrega falhou não cai para WhatsApp.
   */
  subscriptions: number;
  sent: number;
  failed: number;
};

export type NotifyResult = {
  /** true assim que QUALQUER canal tentado respondeu ok. */
  delivered: boolean;
  push: NotifyPushResult;
  whatsapp: NotifyChannelResult;
  email: NotifyChannelResult;
};
