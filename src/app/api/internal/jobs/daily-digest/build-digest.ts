import type { TenantPrismaClient } from "@/lib/prisma";
import type { ProfileType } from "@/lib/tenant-context";
import { listUpcomingVaccinations } from "@/lib/actions/animal-vaccinations";
import { listPendingEntries } from "@/lib/actions/financial-reports";
import { getBalanceAction } from "@/lib/actions/financial-summary";

export type DigestContent = {
  pushTitle: string;
  pushBody: string;
  whatsappText: string;
};

/**
 * Conteúdo do resumo diário (Onda 2, notify() com urgency "digest"). Reusa as
 * mesmas consultas que whatsapp-handlers/resumo.ts já usa (listUpcomingVaccinations,
 * listPendingEntries, getBalanceAction, contagem de Alert pendente): não
 * duplica regra de negócio, só monta um corpo mais curto. Uma notificação do
 * sistema não é uma mensagem de WhatsApp: uma linha resumindo o que importa,
 * o clique abre o painel para o resto.
 */
export async function buildDailyDigest(
  db: TenantPrismaClient,
  activeProfiles: ProfileType[],
): Promise<DigestContent> {
  const [balance, pendingAlerts, upcomingVaccinations, payable, receivable] = await Promise.all([
    getBalanceAction(db, null),
    db.alert.count({ where: { status: "pending" } }),
    // Vacina só faz sentido sob o perfil fazenda (mesmo filtro que resumo.ts aplica ao escopo "rebanho").
    activeProfiles.includes("fazenda") ? listUpcomingVaccinations(db, 7) : Promise.resolve([]),
    listPendingEntries(db, { entry_type: "expense" }),
    listPendingEntries(db, { entry_type: "income" }),
  ]);

  const parts: string[] = [];

  if (balance.ok) {
    parts.push(`saldo do mês R$ ${balance.data.balance.toFixed(2)}`);
  }

  const overduePayable = payable.filter((e) => e.days_overdue !== null).length;
  if (overduePayable > 0) {
    parts.push(`${overduePayable} conta(s) vencida(s)`);
  } else if (payable.length > 0) {
    parts.push(`${payable.length} conta(s) a pagar`);
  }

  if (receivable.length > 0) {
    parts.push(`${receivable.length} a receber`);
  }

  if (upcomingVaccinations.length > 0) {
    parts.push(`${upcomingVaccinations.length} vacina(s) próxima(s)`);
  }

  if (pendingAlerts > 0) {
    parts.push(`${pendingAlerts} alerta(s) pendente(s)`);
  }

  const summary = parts.length > 0 ? parts.join(", ") : "tudo em dia por aqui";

  return {
    pushTitle: "Resumo do dia no Tibé",
    pushBody: capitalize(summary),
    whatsappText: `Resumo do dia: ${summary}.`,
  };
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}
