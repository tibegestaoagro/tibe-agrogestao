import { alertDedupKey, buildBillDueMessage } from "@/lib/actions/alerts";
import { createManualEntryAction } from "@/lib/actions/financial-entries";
import { ok, type ActionResult } from "@/lib/actions/types";
import { runSerializableTenantTransaction } from "@/lib/financial";
import type { TenantPrismaClient } from "@/lib/prisma";

export async function upsertVaccinationForecastAction(
  db: TenantPrismaClient,
  input: {
    batch_id: string;
    vaccine_id: string;
    vaccine_name: string;
    ear_tag: string;
    cost: number;
    due_date: Date;
  },
): Promise<ActionResult<{ id: string; updated: boolean }>> {
  const relatedId = `${input.batch_id}:${input.vaccine_id}`;
  const outcome = await runSerializableTenantTransaction(db, async (tx) => {
    const existing = await tx.financialEntry.findFirst({
      where: {
        related_id: relatedId,
        entry_type: "expense",
        status: "pending",
      },
    });
    if (existing) {
      const dueDateChanged =
        existing.due_date?.getTime() !== input.due_date.getTime();
      const costChanged = Number(existing.amount) !== input.cost;
      if (dueDateChanged) {
        const previousAlerts = await tx.alert.findMany({
          where: {
            alert_type: "bill_due",
            related_id: existing.id,
          },
        });
        for (const alert of previousAlerts) {
          const novoRelatedId = `${existing.id}:superseded:${alert.id}`;
          await tx.alert.update({
            where: { id: alert.id },
            data: {
              related_id: novoRelatedId,
              // A `dedup_key` DERIVA do `related_id`, então renomear um sem o
              // outro deixaria a chave original ocupada pelo alerta antigo, e
              // o alerta da data nova nunca seria criado. O reagendamento
              // existe justamente para liberar aquela chave.
              dedup_key: alertDedupKey({
                alert_type: "bill_due",
                related_module: alert.related_module ?? "geral",
                related_id: novoRelatedId,
                dia: alert.scheduled_for ?? alert.created_at,
              }),
              ...(alert.status === "pending"
                ? { status: "dismissed" as const }
                : {}),
            },
          });
        }
      } else if (costChanged) {
        await tx.alert.updateMany({
          where: {
            alert_type: "bill_due",
            related_id: existing.id,
            status: "pending",
          },
          data: {
            message: buildBillDueMessage({
              entry_type: "expense",
              category: existing.category,
              amount: input.cost,
              due_date: input.due_date,
              now: new Date(),
            }),
          },
        });
      }
      await tx.financialEntry.update({
        where: { id: existing.id },
        data: { amount: input.cost, due_date: input.due_date },
      });
      return {
        ok: true as const,
        entryId: existing.id,
        updated: true,
      };
    }

    const result = await createManualEntryAction(tx, {
      entry_type: "expense",
      category: `Vacinação prevista - ${input.vaccine_name} (brinco ${input.ear_tag})`,
      amount: input.cost,
      due_date: input.due_date,
      related_id: relatedId,
    });
    if (!result.ok) {
      return { ok: false as const, error: result };
    }
    return {
      ok: true as const,
      entryId: result.data.id,
      updated: false,
    };
  });

  return outcome.ok
    ? ok({ id: outcome.entryId, updated: outcome.updated })
    : outcome.error;
}
