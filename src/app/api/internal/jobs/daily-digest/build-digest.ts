import type { TenantPrismaClient } from "@/lib/prisma";
import type { ProfileType } from "@/lib/tenant-context";
import { listUpcomingVaccinations } from "@/lib/actions/animal-vaccinations";
import { listPendingEntries } from "@/lib/actions/financial-reports";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { reaisBr } from "@/lib/numero-br";

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
): Promise<DigestContent | null> {
  const [balance, pendingAlerts, upcomingVaccinations, payable, receivable] = await Promise.all([
    getBalanceAction(db, null),
    db.alert.count({ where: { status: "pending" } }),
    // Vacina só faz sentido sob o perfil fazenda (mesmo filtro que resumo.ts aplica ao escopo "rebanho").
    activeProfiles.includes("fazenda") ? listUpcomingVaccinations(db, 7) : Promise.resolve([]),
    listPendingEntries(db, { entry_type: "expense" }),
    listPendingEntries(db, { entry_type: "income" }),
  ]);

  /**
   * O que PEDE AÇÃO, e é só isso que justifica interromper alguém.
   *
   * O saldo do mês ficava aqui dentro e entrava sempre, então esta lista nunca
   * ficava vazia e o resumo saía todo santo dia, mesmo num dia em que nada
   * aconteceu, dizendo só "Saldo do mês R$ 0,00". Notificação diária que não
   * pede nada é o caminho mais curto para a pessoa desligar o canal, e aí o
   * alerta crítico passa a chegar num canal que ela já aprendeu a ignorar.
   */
  const acoes: string[] = [];

  const overduePayable = payable.filter((e) => e.days_overdue !== null).length;
  if (overduePayable > 0) {
    acoes.push(plural(overduePayable, "conta vencida", "contas vencidas"));
  } else if (payable.length > 0) {
    acoes.push(plural(payable.length, "conta a pagar", "contas a pagar"));
  }

  if (receivable.length > 0) {
    acoes.push(plural(receivable.length, "conta a receber", "contas a receber"));
  }

  if (upcomingVaccinations.length > 0) {
    acoes.push(plural(upcomingVaccinations.length, "vacina próxima", "vacinas próximas"));
  }

  if (pendingAlerts > 0) {
    acoes.push(plural(pendingAlerts, "alerta pendente", "alertas pendentes"));
  }

  if (acoes.length === 0) return null;

  // O saldo acompanha, mas nunca é o motivo do resumo existir.
  const saldo = balance.ok ? ` Saldo do mês: ${reaisBr(balance.data.balance)}.` : "";
  const resumo = acoes.join(", ");

  return {
    pushTitle: "Resumo do dia no Tibé",
    // Corpo de notificação é truncado pelo sistema: aqui só o que pede ação.
    pushBody: capitalize(resumo),
    whatsappText: `Resumo do dia: ${resumo}.${saldo}`,
  };
}

/** "1 conta vencida", "3 contas vencidas". O `(s)` ficava feio na notificação. */
function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}
