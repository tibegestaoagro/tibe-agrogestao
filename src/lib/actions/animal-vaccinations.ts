import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { decToNum } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Vacinação: aplicação, catálogo de vacinas e próximas doses. Separado de
 * `animals.ts` na auditoria de 2026-08-04 (ver comentário lá).
 */

export async function addVaccinationAction(
  db: TenantPrismaClient,
  input: {
    batch_id: string;
    vaccine_id: string;
    applied_at?: Date | null;
    interval_days?: number | null;
    cost?: number | null;
  },
): Promise<
  ActionResult<{
    vaccine_name: string;
    next_due_at: Date | null;
    reconciled?: { previous_amount: number; new_amount: number };
    pending_prevision_amount?: number;
  }>
> {
  if (input.cost != null && input.cost < 0) {
    return fail(
      "VALIDATION_ERROR",
      "O custo da vacinação não pode ser negativo",
      422,
    );
  }

  const animal = await db.animalBatch.findFirst({ where: { id: input.batch_id } });
  if (!animal) return fail("NOT_FOUND", "Animal não encontrado", 404);

  const vaccine = await db.vaccine.findFirst({ where: { id: input.vaccine_id } });
  if (!vaccine) return fail("INVALID_VACCINE", "Vacina inválida", 422);

  const appliedDate = input.applied_at ?? new Date();
  const interval = input.interval_days ?? vaccine.default_interval_days ?? null;
  const nextDue =
    interval != null ? new Date(appliedDate.getTime() + interval * 86_400_000) : null;

  const transactionResult = await runSerializableTenantTransaction(
    db,
    async (tx) => {
      await tx.animalVaccination.create({
        data: scoped({
          batch_id: input.batch_id,
          vaccine_id: input.vaccine_id,
          applied_at: appliedDate,
          next_due_at: nextDue,
          cost: input.cost ?? null,
        }),
      });

      const prevision = await tx.financialEntry.findFirst({
        where: {
          related_id: `${input.batch_id}:${input.vaccine_id}`,
          entry_type: "expense",
          status: "pending",
        },
      });
      let reconciled:
        | { previous_amount: number; new_amount: number }
        | undefined;
      let pendingPrevisionAmount: number | undefined;

      if (prevision && input.cost != null) {
        const previousAmount = decToNum(prevision.amount) ?? 0;
        await tx.alert.updateMany({
          where: {
            alert_type: "bill_due",
            related_id: prevision.id,
            status: "pending",
          },
          data: { status: "dismissed" },
        });
        await tx.financialEntry.update({
          where: { id: prevision.id },
          data: {
            amount: input.cost,
            status: "paid",
            paid_at: new Date(),
          },
        });
        reconciled = {
          previous_amount: previousAmount,
          new_amount: input.cost,
        };
      } else if (prevision) {
        pendingPrevisionAmount = decToNum(prevision.amount) ?? 0;
      } else if (input.cost != null && input.cost > 0) {
        await createLinkedEntry(tx, {
          entry_type: "expense",
          category: `Vacinação - ${vaccine.name}`,
          amount: input.cost,
          related_module: "rebanho",
          related_id: input.batch_id,
          occurred_at: appliedDate,
        });
      }

      return { reconciled, pendingPrevisionAmount };
    },
  );

  return ok({
    vaccine_name: vaccine.name,
    next_due_at: nextDue,
    ...(transactionResult.reconciled
      ? { reconciled: transactionResult.reconciled }
      : {}),
    ...(transactionResult.pendingPrevisionAmount !== undefined
      ? { pending_prevision_amount: transactionResult.pendingPrevisionAmount }
      : {}),
  });
}

/** Busca vacina por nome (exato, senão contém), case-insensitive. */
export async function findVaccineByName(db: TenantPrismaClient, name: string) {
  const exact = await db.vaccine.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (exact) return exact;
  return db.vaccine.findFirst({ where: { name: { contains: name, mode: "insensitive" } } });
}

/** Vacinações com next_due_at nos próximos N dias (spec 1.4, reusado pelo Módulo 4). */
export async function listUpcomingVaccinations(
  db: TenantPrismaClient,
  days: number,
  propertyId?: string | null,
) {
  const now = new Date();
  const limit = new Date(now.getTime() + days * 86_400_000);

  const rows = await db.animalVaccination.findMany({
    where: {
      next_due_at: { gte: now, lte: limit },
      ...(propertyId ? { batch: { property_id: propertyId } } : {}),
    },
    orderBy: { next_due_at: "asc" },
    include: {
      batch: { select: { ear_tag: true } },
      vaccine: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    batch_id: r.batch_id,
    vaccine_id: r.vaccine_id,
    ear_tag: r.animal?.ear_tag ?? null,
    vaccine_name: r.vaccine?.name ?? null,
    last_applied_at: r.applied_at,
    next_due_at: r.next_due_at!,
    days_remaining: Math.ceil((r.next_due_at!.getTime() - now.getTime()) / 86_400_000),
  }));
}
