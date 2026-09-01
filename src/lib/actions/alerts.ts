import type { Prisma } from "@/generated/prisma/client";
import { scoped, prisma, prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { listUpcomingVaccinations } from "@/lib/actions/animal-vaccinations";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { isAlertTypeEnabled } from "@/lib/actions/alert-preferences";
import { getStockBalance } from "@/lib/actions/stock-ledger";
import { descreverQuantidade } from "@/lib/stock/units";

/**
 * Geração de alertas (spec 4.9/4.10). Idempotência por
 * (alert_type, related_module, related_id): se já existe um Alert para o
 * mesmo evento, não cria outro: é o que garante "não duplicar em execuções
 * consecutivas". Para `low_balance`, que não tem uma entidade natural para
 * amarrar, usamos a semana ISO corrente como `related_id` sintético: assim o
 * mesmo mecanismo de idempotência também garante "no máximo um por semana",
 * sem precisar de uma regra especial.
 */

const VACCINE_DAYS = 15;
const HARVEST_DAYS = 7;
const BILL_DAYS = 3;
const TRIAL_ENDING_DAYS = 2; // spec 5.8
const MAINTENANCE_DAYS = 15; // Módulo 26: mesma janela de vaccine_due (peça/mecânico também leva tempo)

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // segunda = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

type AlertType = "vaccine_due" | "harvest_near" | "bill_due" | "low_balance" | "trial_ending" | "maintenance_due" | "task_reminder" | "low_stock";
// O RelatedModule do Prisma, IMPORTADO, não espelhado à mão: ver o comentário
// gêmeo no topo de `src/lib/financial.ts`. Espelho escrito à mão já ficou para
// trás duas vezes neste projeto, e um alerta com o módulo errado é um lembrete
// que aponta para a tela errada.
import type { RelatedModule } from "@/generated/prisma/enums";
type AlertEnsureClient = {
  alert: {
    findFirst(args: Prisma.AlertFindFirstArgs): Promise<{ id: string } | null>;
    create(args: Prisma.AlertCreateArgs): Promise<{ id: string }>;
  };
};

export function buildBillDueMessage(params: {
  entry_type: "income" | "expense";
  category: string | null;
  amount: number;
  due_date: Date;
  now: Date;
}): string {
  const days = Math.ceil(
    (params.due_date.getTime() - params.now.getTime()) / 86_400_000,
  );
  const kind = params.entry_type === "income" ? "receber" : "pagar";
  return `💰 Conta a ${kind}: ${params.category ?? "lançamento"} de R$ ${params.amount.toFixed(2)} vence em ${days} dia(s).`;
}

/**
 * Chave de deduplicação do alerta: o alvo mais o DIA.
 *
 * O dia entra porque alerta aqui é recorrente por natureza (vacina que vence
 * de novo no ciclo seguinte é o caso de 50 dos 67 alertas existentes). Sem a
 * janela, o mesmo alvo nunca mais seria avisado.
 */
export function alertDedupKey(params: {
  alert_type: AlertType;
  related_module: RelatedModule;
  related_id: string;
  dia: Date;
}): string {
  const dia = params.dia.toISOString().slice(0, 10);
  return `${params.alert_type}|${params.related_module}|${params.related_id}|${dia}`;
}

/** Cria o Alert se ainda não existir um igual no mesmo dia. Retorna se criou. */
async function ensureAlert(
  db: AlertEnsureClient,
  params: {
    alert_type: AlertType;
    related_module: RelatedModule;
    related_id: string;
    message: string;
  },
): Promise<boolean> {
  const agora = new Date();
  const dedup_key = alertDedupKey({ ...params, dia: agora });

  // A checagem por leitura continua, porque ela evita a ida ao banco no caso
  // comum e mantém a resposta rápida. O que mudou é que ela deixou de ser a
  // ÚNICA garantia: `findFirst` seguido de `create` é racy, e dois jobs
  // concorrentes criavam dois alertas iguais sem nada impedir. Agora existe
  // `@@unique([tenant_id, dedup_key])`, e a colisão é tratada abaixo.
  const existing = await db.alert.findFirst({ where: { dedup_key } });
  if (existing) return false;

  try {
    await db.alert.create({
      data: scoped({
        alert_type: params.alert_type,
        related_module: params.related_module,
        related_id: params.related_id,
        message: params.message,
        status: "pending" as const,
        scheduled_for: agora,
        dedup_key,
      }),
    });
  } catch (e) {
    // P2002 aqui não é erro: é a corrida perdida, e o outro lado já criou o
    // alerta. Engolir qualquer outro código esconderia defeito de verdade.
    if ((e as { code?: unknown })?.code === "P2002") return false;
    throw e;
  }
  return true;
}

/**
 * Revalida uma conta candidata e cria seu alerta dentro da mesma transação
 * serializável. O callback opcional existe somente como seam de teste para
 * pausar a execução depois da leitura elegível e reproduzir corridas.
 */
export async function ensureBillDueAlertForEntry(
  db: TenantPrismaClient,
  entryId: string,
  options: {
    now: Date;
    billLimit: Date;
    afterEligibleRead?: () => Promise<void>;
  },
): Promise<boolean> {
  return runSerializableTenantTransaction(db, async (tx) => {
    const entry = await tx.financialEntry.findFirst({
      where: {
        id: entryId,
        status: "pending",
        due_date: { gte: options.now, lte: options.billLimit },
      },
    });
    if (!entry || !entry.due_date) return false;

    await options.afterEligibleRead?.();
    return ensureAlert(tx, {
      alert_type: "bill_due",
      related_module: entry.related_module ?? "geral",
      related_id: entry.id,
      message: buildBillDueMessage({
        entry_type: entry.entry_type,
        category: entry.category,
        amount: decToNum(entry.amount) ?? 0,
        due_date: entry.due_date,
        now: options.now,
      }),
    });
  });
}

/** Gera os alertas do dia para UM tenant (as 4 verificações da spec 4.10). */
export async function generateAlertsForTenant(tenantId: string): Promise<{ created: number }> {
  const db = prismaForTenant(tenantId);
  const now = new Date();
  let created = 0;

  // 1. Vacinas vencendo em até 15 dias.
  if (await isAlertTypeEnabled(db, "vaccine_due")) {
    const vaccinations = await listUpcomingVaccinations(db, VACCINE_DAYS);
    for (const v of vaccinations) {
      const didCreate = await ensureAlert(db, {
        alert_type: "vaccine_due",
        related_module: "rebanho",
        related_id: v.id,
        message: `🐄 Atenção: a vacina ${v.vaccine_name ?? "?"} do animal ${v.ear_tag ?? v.batch_id} vence em ${v.days_remaining} dia(s).`,
      });
      if (didCreate) created++;
    }
  }

  // 2. Ciclos de lavoura com colheita prevista em até 7 dias.
  if (await isAlertTypeEnabled(db, "harvest_near")) {
    const harvestLimit = new Date(now.getTime() + HARVEST_DAYS * 86_400_000);
    const cycles = await db.cropCycle.findMany({
      where: {
        status: { in: ["planted", "growing"] },
        expected_harvest_at: { gte: now, lte: harvestLimit },
      },
      include: { plot: { select: { name: true } } },
    });
    for (const c of cycles) {
      const days = Math.ceil((c.expected_harvest_at!.getTime() - now.getTime()) / 86_400_000);
      const didCreate = await ensureAlert(db, {
        alert_type: "harvest_near",
        related_module: "lavoura",
        related_id: c.id,
        message: `🌾 Colheita de ${c.crop_name} (talhão ${c.plot?.name ?? "?"}) prevista para daqui a ${days} dia(s).`,
      });
      if (didCreate) created++;
    }
  }

  // 3. Contas a pagar/receber vencendo em até 3 dias.
  if (await isAlertTypeEnabled(db, "bill_due")) {
    const billLimit = new Date(now.getTime() + BILL_DAYS * 86_400_000);
    const bills = await db.financialEntry.findMany({
      where: { status: "pending", due_date: { gte: now, lte: billLimit } },
      select: { id: true },
    });
    for (const b of bills) {
      const didCreate = await ensureBillDueAlertForEntry(db, b.id, {
        now,
        billLimit,
      });
      if (didCreate) created++;
    }
  }

  // 4. Saldo do mês corrente negativo: no máximo 1 alerta por semana (via related_id = semana ISO).
  if (await isAlertTypeEnabled(db, "low_balance")) {
    const balance = await getBalanceAction(db, null);
    if (balance.ok && balance.data.balance < 0) {
      const didCreate = await ensureAlert(db, {
        alert_type: "low_balance",
        related_module: "geral",
        related_id: isoWeekKey(now),
        message: `⚠️ Saldo do mês está negativo: R$ ${balance.data.balance.toFixed(2)}.`,
      });
      if (didCreate) created++;
    }
  }

  // 5. Trial vencendo em até 2 dias, sem assinatura ainda (spec 5.8).
  if (await isAlertTypeEnabled(db, "trial_ending")) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, trial_ends_at: true },
    });
    if (tenant?.status === "trial" && tenant.trial_ends_at) {
      const daysLeft = Math.ceil((tenant.trial_ends_at.getTime() - now.getTime()) / 86_400_000);
      if (daysLeft >= 0 && daysLeft <= TRIAL_ENDING_DAYS) {
        const hasSubscription = (await db.subscription.findFirst({})) !== null;
        if (!hasSubscription) {
          const didCreate = await ensureAlert(db, {
            alert_type: "trial_ending",
            related_module: "geral",
            related_id: tenantId, // um trial só termina uma vez: idempotente por natureza
            message: `⏳ Seu período de teste do Tibé termina em ${daysLeft} dia(s). Assine um plano em Configurações → Assinatura para não perder o acesso.`,
          });
          if (didCreate) created++;
        }
      }
    }
  }

  // 6. Máquinas com manutenção prevista em até 15 dias (Módulo 26).
  if (await isAlertTypeEnabled(db, "maintenance_due")) {
    const maintenanceLimit = new Date(now.getTime() + MAINTENANCE_DAYS * 86_400_000);
    const machines = await db.machine.findMany({
      where: {
        status: { not: "sold" },
        next_maintenance_at: { gte: now, lte: maintenanceLimit },
      },
    });
    for (const m of machines) {
      const days = Math.ceil((m.next_maintenance_at!.getTime() - now.getTime()) / 86_400_000);
      const didCreate = await ensureAlert(db, {
        alert_type: "maintenance_due",
        related_module: "maquinas",
        related_id: m.id,
        message: `🔧 Manutenção de ${m.name} prevista para daqui a ${days} dia(s).`,
      });
      if (didCreate) created++;
    }
  }

  // 7. Tarefas com lembrete para hoje (Módulo 27). Dispara NO DIA marcado,
  // não com antecedência (mecanismo diferente dos 6 anteriores): janela é o
  // próprio dia corrente, 00h-23h59.
  if (await isAlertTypeEnabled(db, "task_reminder")) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);
    const tasks = await db.task.findMany({
      where: {
        status: "pending",
        remind: true,
        reminded_at: null,
        due_date: { gte: todayStart, lte: todayEnd },
      },
    });
    for (const t of tasks) {
      const didCreate = await ensureAlert(db, {
        alert_type: "task_reminder",
        related_module: "geral",
        related_id: t.id,
        message: `📌 Lembrete de hoje: ${t.title}.`,
      });
      if (didCreate) created++;
      // Marca mesmo se ensureAlert não criou (já existia um igual): a tarefa
      // não deve voltar a ser candidata em execuções futuras do cron.
      await db.task.update({ where: { id: t.id }, data: { reminded_at: now } });
    }
  }

  // 8. Produtos que atingiram o estoque mínimo (Módulo 31, §10.8).
  if (await isAlertTypeEnabled(db, "low_stock")) {
    created += await gerarAlertasDeEstoqueMinimo(db, now);
  }

  return { created };
}

/**
 * §10.8: "o sistema poderá emitir um aviso quando o saldo atingir esse limite".
 *
 * Três decisões que o parágrafo não resolve:
 *
 * 1. **Só alerta produto que JÁ TEVE movimentação.** Um produto recém-cadastrado
 *    com mínimo definido e nenhuma compra está em zero por não ter começado, não
 *    por ter acabado. Sem esta regra, o tenant que cadastrasse 20 produtos numa
 *    tarde receberia 20 avisos no dia seguinte, e o primeiro contato do produtor
 *    com o recurso seria uma enxurrada que ele desligaria na hora. Sai de graça:
 *    `getStockBalance` só devolve posição de quem tem movimento.
 * 2. **Compara o total do tenant, não o saldo de cada fazenda.** `minimum_stock`
 *    é um campo do PRODUTO, então só existe um número para comparar. Um produto
 *    zerado na Fazenda A com 50 na B não avisa: a decisão de carregar o caminhão
 *    é logística, e o documento não pede alerta por fazenda.
 * 3. **No máximo um aviso por produto por semana**, pela mesma mecânica do
 *    `low_balance`: estoque baixo é uma CONDIÇÃO que dura dias, não um evento.
 *    Com o `product_id` puro como chave, o produtor receberia um aviso na vida e
 *    nunca mais; com a semana junto, ele volta a ser avisado enquanto o problema
 *    existir, sem virar cobrança diária.
 */
export async function gerarAlertasDeEstoqueMinimo(
  db: TenantPrismaClient,
  now: Date,
): Promise<number> {
  const produtos = await db.product.findMany({
    where: { archived_at: null, minimum_stock: { not: null } },
    select: { id: true, name: true, unit: true, minimum_stock: true },
  });
  if (produtos.length === 0) return 0;

  const posicoes = await getStockBalance(db, {});
  const semana = isoWeekKey(now);
  let criados = 0;

  for (const p of produtos) {
    const doProduto = posicoes.filter((s) => s.product_id === p.id);
    if (doProduto.length === 0) continue; // nunca movimentou: ver decisão 1

    const saldo = Math.round(doProduto.reduce((s, x) => s + x.quantity, 0) * 1000) / 1000;
    const minimo = decToNum(p.minimum_stock) ?? 0;
    if (saldo > minimo) continue;

    const didCreate = await ensureAlert(db, {
      alert_type: "low_stock",
      related_module: "geral",
      related_id: `${p.id}:${semana}`,
      message:
        saldo === 0
          ? `📦 ${p.name} acabou no estoque.`
          : `📦 ${p.name} está acabando: restam ${descreverQuantidade(saldo, p.unit)} e seu mínimo é ${descreverQuantidade(minimo, p.unit)}.`,
    });
    if (didCreate) criados++;
  }

  return criados;
}

/**
 * Gera alertas para TODOS os tenants ativos (trial|active). Único ponto do
 * sistema, fora do agente WhatsApp, que legitimamente usa o client Prisma
 * base para listar tenants antes de escopar por tenant: ver CLAUDE.md.
 */
export async function generateAllAlerts(): Promise<{ tenants: number; alertsCreated: number }> {
  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["trial", "active"] } },
    select: { id: true },
  });

  let alertsCreated = 0;
  for (const t of tenants) {
    const { created } = await generateAlertsForTenant(t.id);
    alertsCreated += created;
  }
  return { tenants: tenants.length, alertsCreated };
}
