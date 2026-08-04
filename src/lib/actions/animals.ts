import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { computeGmd } from "@/lib/livestock";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lógica de negócio do Rebanho, extraída das rotas HTTP (M1) para ser reusada
 * também pelo agente WhatsApp (M3 execute-action). Única fonte de verdade:
 * nenhuma rota deve duplicar esta lógica (spec 3.5).
 *
 * Este arquivo guarda o ANIMAL em si (cadastro, busca, contagem, resumo). Os
 * outros três sub-domínios do rebanho saíram daqui na auditoria de
 * 2026-08-04, quando o arquivo tinha 478 linhas e quatro razões diferentes
 * para mudar:
 *   - `animal-weights.ts`       pesagem e GMD
 *   - `animal-vaccinations.ts`  vacinação, vacinas e próximas doses
 *   - `animal-movements.ts`     compra, venda, transferência, morte
 *   - `herd-evolution.ts`       série histórica do gráfico do dashboard
 */

export async function createAnimalAction(
  db: TenantPrismaClient,
  input: {
    ear_tag: string;
    breed: string;
    sex: "male" | "female";
    property_id: string;
    birth_date?: Date | null;
    initial_weight?: number | null;
  },
): Promise<ActionResult<{ id: string; ear_tag: string; current_weight: number | null }>> {
  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Propriedade inválida", 422);
  if (property.archived_at) {
    return fail(
      "PROPERTY_ARCHIVED",
      "Não é possível cadastrar animal em propriedade arquivada",
      422,
    );
  }

  const dup = await db.animal.findFirst({ where: { ear_tag: input.ear_tag } });
  if (dup) {
    return fail(
      "DUPLICATE_EAR_TAG",
      `Já existe um animal com o brinco '${input.ear_tag}' neste tenant`,
      409,
    );
  }

  const birth = input.birth_date ?? null;

  let animal;
  try {
    animal = await db.animal.create({
      data: scoped({
        ear_tag: input.ear_tag,
        breed: input.breed,
        sex: input.sex,
        property_id: input.property_id,
        birth_date: birth,
        current_weight: input.initial_weight ?? null,
      }),
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return fail(
        "DUPLICATE_EAR_TAG",
        `Já existe um animal com o brinco '${input.ear_tag}' neste tenant`,
        409,
      );
    }
    throw e;
  }

  if (input.initial_weight != null) {
    await db.animalWeightLog.create({
      data: scoped({
        animal_id: animal.id,
        weight: input.initial_weight,
        measured_at: birth ?? new Date(),
      }),
    });
  }

  return ok({
    id: animal.id,
    ear_tag: animal.ear_tag,
    current_weight: decToNum(animal.current_weight),
  });
}

/** Busca animal pelo brinco (único por tenant). */
export async function findAnimalByEarTag(db: TenantPrismaClient, ear_tag: string) {
  return db.animal.findFirst({
    where: { ear_tag: { equals: ear_tag, mode: "insensitive" } },
    include: { property: { select: { name: true } } },
  });
}

/**
 * Animais ativos (auditoria de arquitetura, 2026-08-04): extraído porque o
 * dashboard web e o `resumo` do WhatsApp calculavam a mesma contagem com
 * duas queries Prisma independentes, sem passar pelo seam de actions.
 */
export async function countActiveAnimals(
  db: TenantPrismaClient,
  propertyId?: string | null,
) {
  return db.animal.count({
    where: { status: "active", ...(propertyId ? { property_id: propertyId } : {}) },
  });
}

export async function getAnimalSummaryAction(
  db: TenantPrismaClient,
  ear_tag: string,
): Promise<
  ActionResult<{
    ear_tag: string;
    breed: string | null;
    sex: string;
    status: string;
    property_name: string | null;
    current_weight: number | null;
    gmd: number | null;
    last_vaccination: {
      vaccine_name: string;
      applied_at: string;
      next_due_at: string | null;
    } | null;
  }>
> {
  const animal = await findAnimalByEarTag(db, ear_tag);
  if (!animal) {
    return fail("NOT_FOUND", `Animal com brinco '${ear_tag}' não encontrado`, 404);
  }

  const logs = await db.animalWeightLog.findMany({
    where: { animal_id: animal.id },
    orderBy: { measured_at: "asc" },
  });

  const lastVaccination = await db.animalVaccination.findFirst({
    where: { animal_id: animal.id },
    orderBy: { applied_at: "desc" },
    include: { vaccine: { select: { name: true } } },
  });

  return ok({
    ear_tag: animal.ear_tag,
    breed: animal.breed,
    sex: animal.sex,
    status: animal.status,
    property_name: animal.property?.name ?? null,
    current_weight: decToNum(animal.current_weight),
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
