import { prisma } from "@/lib/prisma";
import { getCancellationWindow } from "@/lib/billing-access";

/**
 * Reflete no `Tenant.archived_at` a fase em que cada assinatura cancelada
 * está (spec 2026-08-04). Roda no cron diário que já existe.
 *
 * **Isto NÃO decide acesso.** Quem decide é `getBillingAccess()`, que calcula
 * a fase a partir das datas a cada request. Este varredor só materializa o
 * estado para o painel da plataforma poder listar e filtrar sem recalcular a
 * régua em SQL. A separação é deliberada: se o acesso dependesse deste
 * campo, um cron que falhou ou atrasou daria acesso indevido, e uma tarefa
 * de bookkeeping viraria parte do controle de segurança.
 *
 * Usa o client base porque precisa varrer TODOS os tenants antes de saber de
 * qual tenant se trata, mesma necessidade estrutural do job diário de
 * alertas (ver `CLAUDE.md`, seção de isolamento).
 *
 * `archived_at` só é escrito quando MUDA, para não reescrever a mesma data
 * todo dia e perder a informação de quando o arquivamento começou de fato.
 */
export async function sweepCanceledSubscriptions(): Promise<{
  archived: number;
  unarchived: number;
  pending_decision: number;
}> {
  const subs = await prisma.subscription.findMany({
    where: { status: "canceled" },
    select: {
      tenant_id: true,
      next_due_date: true,
      canceled_at: true,
      created_at: true,
      tenant: { select: { archived_at: true } },
    },
  });

  let archived = 0;
  let pending_decision = 0;

  for (const sub of subs) {
    const { phase, archive_starts_at } = getCancellationWindow(sub);
    if (phase === "expired") pending_decision += 1;
    if (phase === "paid_period") continue; // ainda pagando: nada a arquivar

    if (!sub.tenant.archived_at) {
      await prisma.tenant.update({
        where: { id: sub.tenant_id },
        data: { archived_at: archive_starts_at },
      });
      archived += 1;
    }
  }

  // Reativou depois de cancelar: o arquivamento deixou de valer. Sem isto, um
  // cliente que voltou continuaria marcado como arquivado no painel.
  const revived = await prisma.tenant.updateMany({
    where: {
      archived_at: { not: null },
      subscription: { status: { in: ["active", "overdue"] } },
    },
    data: { archived_at: null },
  });

  return { archived, unarchived: revived.count, pending_decision };
}

/**
 * Tenants cuja janela de 60 dias acabou e que esperam decisão humana da
 * Pleno (apagar, anonimizar ou manter). Decisão do usuário: o fim da janela
 * NÃO apaga dado sozinho. Apagar cliente é irreversível, e automatizar isso
 * significa que um erro de data ou um cron rodando duas vezes apaga a
 * fazenda inteira de alguém sem ninguém no circuito.
 */
export async function listTenantsPendingDecision() {
  const subs = await prisma.subscription.findMany({
    where: { status: "canceled" },
    select: {
      tenant_id: true,
      plan: true,
      next_due_date: true,
      canceled_at: true,
      created_at: true,
      tenant: { select: { id: true, name: true, archived_at: true } },
    },
  });

  return subs
    .map((sub) => ({ sub, window: getCancellationWindow(sub) }))
    .filter(({ window }) => window.phase === "expired")
    .map(({ sub, window }) => ({
      tenant_id: sub.tenant_id,
      name: sub.tenant.name,
      plan: sub.plan,
      archive_ended_at: window.archive_ends_at,
    }))
    .sort((a, b) => a.archive_ended_at.getTime() - b.archive_ended_at.getTime());
}
