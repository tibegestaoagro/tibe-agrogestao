import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import {
  createLinkedEntry,
  runSerializableTenantTransaction,
} from "@/lib/financial";
import { decToNum } from "@/lib/serialize";
import { computeGmd } from "@/lib/livestock";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lógica de negócio do Rebanho, extraída das rotas HTTP (M1) para ser reusada
 * também pelo agente WhatsApp (M3 execute-action). Única fonte de verdade:
 * nenhuma rota deve duplicar esta lógica (spec 3.5).
 */

// ── Cadastro de animal ──────────────────────────────────────────────

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

// ── Pesagem ──────────────────────────────────────────────────────────

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

// ── Vacinação ────────────────────────────────────────────────────────

export async function addVaccinationAction(
  db: TenantPrismaClient,
  input: {
    animal_id: string;
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

  const animal = await db.animal.findFirst({ where: { id: input.animal_id } });
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
          animal_id: input.animal_id,
          vaccine_id: input.vaccine_id,
          applied_at: appliedDate,
          next_due_at: nextDue,
          cost: input.cost ?? null,
        }),
      });

      const prevision = await tx.financialEntry.findFirst({
        where: {
          related_id: `${input.animal_id}:${input.vaccine_id}`,
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
          related_id: input.animal_id,
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

// ── Movimentação ─────────────────────────────────────────────────────

export async function addMovementAction(
  db: TenantPrismaClient,
  input: {
    animal_id: string;
    movement_type: "purchase" | "sale" | "transfer" | "death";
    from_property_id?: string | null;
    to_property_id?: string | null;
    value?: number | null;
    notes?: string | null;
    occurred_at?: Date | null;
  },
): Promise<ActionResult<{ movement_type: string; value: number | null }>> {
  const animal = await db.animal.findFirst({ where: { id: input.animal_id } });
  if (!animal) return fail("NOT_FOUND", "Animal não encontrado", 404);

  const occurred = input.occurred_at ?? new Date();
  let from_property_id = input.from_property_id ?? null;
  const to_property_id = input.to_property_id ?? null;

  if (input.movement_type === "transfer") {
    if (!to_property_id) {
      return fail(
        "VALIDATION_ERROR",
        "Transferência exige a propriedade de destino",
        422,
      );
    }
    const dest = await db.property.findFirst({ where: { id: to_property_id } });
    if (!dest) return fail("INVALID_PROPERTY", "Propriedade de destino inválida", 422);
    from_property_id = from_property_id ?? animal.property_id;
  }

  await db.animalMovement.create({
    data: scoped({
      animal_id: input.animal_id,
      movement_type: input.movement_type,
      from_property_id,
      to_property_id,
      value: input.value ?? null,
      notes: input.notes ?? null,
      occurred_at: occurred,
    }),
  });

  const animalUpdate: Record<string, unknown> = {};
  if (input.movement_type === "sale") animalUpdate.status = "sold";
  if (input.movement_type === "death") animalUpdate.status = "deceased";
  if (input.movement_type === "transfer") animalUpdate.property_id = to_property_id;
  if (Object.keys(animalUpdate).length > 0) {
    await db.animal.update({ where: { id: input.animal_id }, data: animalUpdate });
  }

  if (input.value != null && input.value > 0) {
    if (input.movement_type === "sale") {
      await createLinkedEntry(db, {
        entry_type: "income",
        category: "Venda de animal",
        amount: input.value,
        related_module: "rebanho",
        related_id: input.animal_id,
        occurred_at: occurred,
      });
    } else if (input.movement_type === "purchase") {
      await createLinkedEntry(db, {
        entry_type: "expense",
        category: "Compra de animal",
        amount: input.value,
        related_module: "rebanho",
        related_id: input.animal_id,
        occurred_at: occurred,
      });
    }
  }

  return ok({ movement_type: input.movement_type, value: input.value ?? null });
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
      ...(propertyId ? { animal: { property_id: propertyId } } : {}),
    },
    orderBy: { next_due_at: "asc" },
    include: {
      animal: { select: { ear_tag: true } },
      vaccine: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    animal_id: r.animal_id,
    vaccine_id: r.vaccine_id,
    ear_tag: r.animal?.ear_tag ?? null,
    vaccine_name: r.vaccine?.name ?? null,
    last_applied_at: r.applied_at,
    next_due_at: r.next_due_at!,
    days_remaining: Math.ceil((r.next_due_at!.getTime() - now.getTime()) / 86_400_000),
  }));
}

/**
 * Série mensal do tamanho do rebanho ativo, para o gráfico "Evolução do
 * rebanho" (briefing de layout, Fase 2). Não existe snapshot histórico
 * gravado: reconstrói cada ponto por diferença (animais já cadastrados até
 * o fim do mês, menos os que já saíram por venda/morte até lá), mesmo
 * espírito de `calculatePendingDaysOverdue` (status computado, nunca
 * armazenado).
 */
export async function getHerdEvolution(
  db: TenantPrismaClient,
  opts: { months: number; propertyId?: string | null },
): Promise<{ month: string; count: number }[]> {
  const now = new Date();
  const points: { month: string; count: number }[] = [];
  // Filtra pela propriedade ATUAL do animal (Animal.property_id): uma
  // transferência entre propriedades não é reconstruída retroativamente
  // aqui, mesma aproximação já aceita no resto do módulo (sem histórico de
  // property_id por data).
  const propertyFilter = opts.propertyId ? { property_id: opts.propertyId } : {};

  for (let i = opts.months - 1; i >= 0; i--) {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const [registered, departed] = await Promise.all([
      db.animal.count({ where: { created_at: { lte: monthEnd }, ...propertyFilter } }),
      db.animalMovement.count({
        where: {
          movement_type: { in: ["sale", "death"] },
          occurred_at: { lte: monthEnd },
          ...(opts.propertyId ? { animal: { property_id: opts.propertyId } } : {}),
        },
      }),
    ]);
    points.push({
      month: monthEnd.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      count: Math.max(registered - departed, 0),
    });
  }

  return points;
}

// ── Consulta (leitura, usado pelo agente WhatsApp) ──────────────────

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
