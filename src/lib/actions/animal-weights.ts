import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { computeGmd } from "@/lib/livestock";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Pesagem do animal e GMD (ganho médio diário). Separado de `animals.ts` na
 * auditoria de 2026-08-04: eram 4 sub-domínios do rebanho (cadastro, pesagem,
 * vacinação, movimentação) num arquivo de 478 linhas.
 */

export async function addWeightLogAction(
  db: TenantPrismaClient,
  input: { animal_id: string; weight: number; measured_at?: Date | null },
): Promise<ActionResult<{ weight: number; current_weight: number | null; gmd: number | null }>> {
  const animal = await db.animal.findFirst({ where: { id: input.animal_id } });
  if (!animal) return fail("NOT_FOUND", "Animal não encontrado", 404);

  await db.animalWeightLog.create({
    data: scoped({
      animal_id: input.animal_id,
      weight: input.weight,
      measured_at: input.measured_at ?? new Date(),
    }),
  });

  const logs = await db.animalWeightLog.findMany({
    where: { animal_id: input.animal_id },
    orderBy: { measured_at: "desc" },
  });
  const latestWeight = decToNum(logs[0]?.weight);

  await db.animal.update({
    where: { id: input.animal_id },
    data: { current_weight: latestWeight ?? input.weight },
  });

  return ok({
    weight: input.weight,
    current_weight: latestWeight ?? input.weight,
    gmd: computeGmd(logs),
  });
}
