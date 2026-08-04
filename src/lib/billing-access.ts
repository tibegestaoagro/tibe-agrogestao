import { perRequestCache } from "@/lib/per-request-cache";
import { prisma } from "@/lib/prisma";
import { getTenantRecord } from "@/lib/tenant-record";

/**
 * Controle de acesso por inadimplência (spec 5.7/5.8), 3 estágios: mesma
 * regra para assinatura em atraso e para trial vencido sem assinatura:
 *
 *   dias em atraso < 5   → acesso total
 *   5 <= dias < 15        → leitura liberada, escrita bloqueada
 *   dias >= 15             → bloqueio total (só a página de assinatura)
 *
 * CANCELAMENTO segue uma régua própria (spec 2026-08-04), porque quem
 * cancela não é inadimplente: pagou o que devia e escolheu sair.
 *
 *   até o fim do período pago       → acesso total
 *   os 60 dias seguintes             → leitura liberada, escrita bloqueada
 *   depois disso                      → bloqueio total
 *
 * A leitura durante os 60 dias é deliberada: o rebanho, o financeiro e o
 * histórico são do cliente, e portabilidade do próprio dado é direito do
 * titular na LGPD, não cortesia. Decisão do usuário, ver
 * `getCancellationWindow` abaixo para o que acontece no fim da janela.
 */

export type BillingAccess = "full" | "read_only" | "blocked";

/** Duração do trial self-service (spec 5.11), usada por /api/v1/signup ao criar o Tenant. */
export const TRIAL_DAYS = 14;

/** Janela de leitura após o fim do período pago de quem cancelou. */
export const ARCHIVE_WINDOW_DAYS = 60;

const READ_ONLY_AFTER_DAYS = 5;
const BLOCKED_AFTER_DAYS = 15; // 5 + 10, conforme definido com o usuário

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / 86_400_000;
}

function tierFromDaysOverdue(days: number): BillingAccess {
  if (days < READ_ONLY_AFTER_DAYS) return "full";
  if (days < BLOCKED_AFTER_DAYS) return "read_only";
  return "blocked";
}

/** O que precisamos saber de uma assinatura para situá-la na linha do tempo. */
type CancellationInput = {
  next_due_date: Date | null;
  canceled_at: Date | null;
  created_at: Date;
};

export type CancellationWindow = {
  /** Início da janela de 60 dias: o fim do período pago, ou o cancelamento. */
  archive_starts_at: Date;
  /** Fim da janela: passado isto, o tenant fica bloqueado indefinidamente. */
  archive_ends_at: Date;
  /** Fase atual: período pago, janela de leitura, ou depois dela. */
  phase: "paid_period" | "archived" | "expired";
};

/**
 * Situa uma assinatura cancelada na linha do tempo, sem tocar no banco: é
 * função pura para poder ser testada e reusada pelo cron e pelo painel da
 * plataforma sem repetir a regra em três lugares.
 *
 * A âncora é o MAIOR entre o fim do período pago e a data do cancelamento.
 * Quem cancela em dia tem período pago pela frente e a janela só começa
 * quando ele acaba; quem cancela já vencido não tem nada a honrar, e a
 * janela começa na hora. Sem esse `max`, o segundo caso ganharia uma janela
 * que já nasceu vencida, bloqueando na hora quem talvez só queira exportar.
 *
 * `canceled_at` é nulo em assinaturas canceladas antes desta spec (nenhuma
 * existia quando ela foi escrita) e em dado de teste antigo: aí cai no
 * vencimento e, na falta dele, na criação.
 */
export function getCancellationWindow(sub: CancellationInput): CancellationWindow {
  const canceledAt = sub.canceled_at ?? sub.next_due_date ?? sub.created_at;
  const paidUntil = sub.next_due_date;
  const startsAt =
    paidUntil && paidUntil.getTime() > canceledAt.getTime() ? paidUntil : canceledAt;
  const endsAt = new Date(startsAt.getTime() + ARCHIVE_WINDOW_DAYS * 86_400_000);

  const now = Date.now();
  const phase =
    now < startsAt.getTime() ? "paid_period" : now < endsAt.getTime() ? "archived" : "expired";

  return { archive_starts_at: startsAt, archive_ends_at: endsAt, phase };
}

/**
 * Memoizado por `tenantId`, por request (ver o aviso em
 * per-request-cache.ts): o layout do dashboard chamava isto a cada render,
 * junto com o gate de sessão, refazendo as mesmas leituras.
 */
export const getBillingAccess = perRequestCache(async function getBillingAccess(
  tenantId: string,
): Promise<BillingAccess> {
  const [tenant, subscription] = await Promise.all([
    getTenantRecord(tenantId),
    prisma.subscription.findUnique({
      where: { tenant_id: tenantId },
      select: { status: true, next_due_date: true, canceled_at: true, created_at: true },
    }),
  ]);
  if (!tenant) return "blocked";

  if (subscription) {
    if (subscription.status === "active") return "full";
    if (subscription.status === "canceled") {
      // A fase é calculada a partir das datas, NÃO de um campo que o cron
      // preenche: um cron que falhou ou atrasou não pode ser o que decide
      // se alguém tem acesso. O cron só reflete esta mesma regra em
      // `Tenant.archived_at`, para o painel da plataforma enxergar.
      const { phase } = getCancellationWindow(subscription);
      if (phase === "paid_period") return "full";
      if (phase === "archived") return "read_only";
      return "blocked";
    }
    // overdue
    const since = subscription.next_due_date ?? subscription.created_at;
    return tierFromDaysOverdue(daysSince(since));
  }

  // Sem assinatura: regra de trial.
  if (tenant.status === "trial" && tenant.trial_ends_at) {
    if (Date.now() < tenant.trial_ends_at.getTime()) return "full"; // trial ainda vigente
    return tierFromDaysOverdue(daysSince(tenant.trial_ends_at));
  }

  // Sem assinatura e sem trial rastreado (ex: tenant seedado manualmente): não bloqueia.
  return "full";
});

/**
 * Campos que acompanham uma transição de status da assinatura.
 *
 * Mora aqui, junto de quem LÊ `canceled_at`, porque três lugares diferentes
 * escrevem status (`cancelSubscriptionAction`, o webhook do Asaas e a
 * mudança manual do master_admin) e a data precisa acompanhar os três. Com o
 * helper ao lado do leitor, a regra de preenchimento e a de interpretação
 * ficam no mesmo arquivo, em vez de o campo depender de cada chamador
 * lembrar de setá-lo.
 *
 * Sair de `canceled` LIMPA a data: uma assinatura reativada não carrega a
 * marca de um cancelamento que deixou de valer, que apareceria como
 * arquivamento fantasma no painel da plataforma.
 */
export function subscriptionStatusData<T extends string>(
  status: T,
): { status: T; canceled_at: Date | null } {
  return { status, canceled_at: status === "canceled" ? new Date() : null };
}

/** Rotas que continuam acessíveis mesmo com acesso "blocked" (regularização). */
const BILLING_EXEMPT_PATH_PREFIXES = [
  "/configuracoes/assinatura",
  "/api/v1/billing",
  "/api/webhooks/asaas",
];

export function isBillingExemptPath(pathname: string): boolean {
  return BILLING_EXEMPT_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}
