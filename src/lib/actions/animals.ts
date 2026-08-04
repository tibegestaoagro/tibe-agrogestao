import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { computeGmd } from "@/lib/livestock";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lógica de negócio do Rebanho, extraída das rotas HTTP (M1) para ser reusada
 * também pelo agente WhatsApp (M3 execute-action). Única fonte de verdade:
 * nenhuma rota deve duplicar esta lógica (spec 3.5).
 *
 * Desde 2026-08-04 existe UM modelo só (`AnimalBatch`): rebanho é sempre
 * categoria + quantidade, e o brinco é opcional. Quem trabalha com brinco
 * cadastra um lote de 1 cabeça. Este arquivo guarda a busca, a contagem e o
 * resumo. O CADASTRO vive em `animal-batches.ts`,
 * junto com a venda por categoria: era a duplicação que a unificação
 * eliminou. Os outros sub-domínios ficam em `animal-weights.ts`,
 * `animal-vaccinations.ts`, `animal-movements.ts` e `herd-evolution.ts`.
 */

/** Busca o lote pelo brinco (único por tenant quando preenchido). */
export async function findBatchByEarTag(db: TenantPrismaClient, ear_tag: string) {
  return db.animalBatch.findFirst({
    where: { ear_tag: { equals: ear_tag, mode: "insensitive" } },
    include: { property: { select: { name: true } }, category: { select: { name: true } } },
  });
}

/**
 * Total de CABEÇAS no rebanho, não de lotes: um lote vale `quantity` cabeças.
 * Contar linhas daria um número silenciosamente errado depois da unificação
 * de 2026-08-04 (um lote de 20 valeria 1).
 */
export async function countActiveAnimals(db: TenantPrismaClient, propertyId?: string | null) {
  const agg = await db.animalBatch.aggregate({
    where: { quantity: { gt: 0 }, ...(propertyId ? { property_id: propertyId } : {}) },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

export async function getBatchSummaryAction(
  db: TenantPrismaClient,
  ear_tag: string,
): Promise<
  ActionResult<{
    ear_tag: string | null;
    category_name: string;
    quantity: number;
    breed: string | null;
    sex: string | null;
    property_name: string | null;
    average_weight: number | null;
    gmd: number | null;
    last_vaccination: {
      vaccine_name: string;
      applied_at: string;
      next_due_at: string | null;
    } | null;
  }>
> {
  const batch = await findBatchByEarTag(db, ear_tag);
  if (!batch) {
    return fail("NOT_FOUND", `Rebanho com brinco '${ear_tag}' não encontrado`, 404);
  }

  const [logs, lastVaccination] = await Promise.all([
    db.animalWeightLog.findMany({
      where: { batch_id: batch.id },
      orderBy: { measured_at: "asc" },
    }),
    db.animalVaccination.findFirst({
      where: { batch_id: batch.id },
      orderBy: { applied_at: "desc" },
      include: { vaccine: { select: { name: true } } },
    }),
  ]);

  return ok({
    ear_tag: batch.ear_tag,
    category_name: batch.category.name,
    quantity: batch.quantity,
    breed: batch.breed,
    sex: batch.sex,
    property_name: batch.property?.name ?? null,
    average_weight: decToNum(batch.average_weight),
    gmd: computeGmd(logs),
    last_vaccination: lastVaccination
      ? {
          vaccine_name: lastVaccination.vaccine?.name ?? "não informada",
          applied_at: lastVaccination.applied_at.toISOString(),
          next_due_at: lastVaccination.next_due_at
            ? lastVaccination.next_due_at.toISOString()
            : null,
        }
      : null,
  });
}
