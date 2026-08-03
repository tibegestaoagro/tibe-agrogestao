import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry } from "@/lib/financial";
import { decToNum } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lógica de negócio de Machine/MachineMaintenance (Módulo 26). Sem exclusão:
 * mudar `status` é o único jeito de "remover" uma máquina da operação ativa,
 * mesmo motivo de usuário/animal (preserva histórico de manutenção e
 * despesa ligada).
 */

const MACHINE_STATUSES = ["active", "maintenance", "sold", "inactive"] as const;
export type MachineStatusInput = (typeof MACHINE_STATUSES)[number];

export function serializeMachine(m: {
  id: string;
  property_id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  acquired_at: Date | null;
  acquisition_cost: unknown;
  hour_meter: unknown;
  status: string;
  next_maintenance_at: Date | null;
  created_at: Date;
}) {
  return {
    id: m.id,
    property_id: m.property_id,
    name: m.name,
    type: m.type,
    brand: m.brand,
    model: m.model,
    year: m.year,
    acquired_at: m.acquired_at?.toISOString() ?? null,
    acquisition_cost: decToNum(m.acquisition_cost),
    hour_meter: decToNum(m.hour_meter),
    status: m.status,
    next_maintenance_at: m.next_maintenance_at?.toISOString() ?? null,
    created_at: m.created_at.toISOString(),
  };
}

export function serializeMaintenance(mm: {
  id: string;
  machine_id: string;
  performed_at: Date;
  description: string;
  cost: unknown;
  next_due_at: Date | null;
  created_at: Date;
}) {
  return {
    id: mm.id,
    machine_id: mm.machine_id,
    performed_at: mm.performed_at.toISOString(),
    description: mm.description,
    cost: decToNum(mm.cost),
    next_due_at: mm.next_due_at?.toISOString() ?? null,
    created_at: mm.created_at.toISOString(),
  };
}

export async function createMachineAction(
  db: TenantPrismaClient,
  input: {
    property_id: string;
    name: string;
    type: string;
    brand?: string | null;
    model?: string | null;
    year?: number | null;
    acquired_at?: Date | null;
    acquisition_cost?: number | null;
    hour_meter?: number | null;
  },
): Promise<ActionResult<{ id: string }>> {
  if (!input.name.trim()) return fail("VALIDATION_ERROR", "Nome é obrigatório", 422);
  if (!input.type.trim()) return fail("VALIDATION_ERROR", "Tipo é obrigatório", 422);
  if (input.acquisition_cost != null && input.acquisition_cost < 0) {
    return fail("VALIDATION_ERROR", "O custo de aquisição não pode ser negativo", 422);
  }

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Propriedade inválida", 422);
  if (property.archived_at) {
    return fail("PROPERTY_ARCHIVED", "Não é possível cadastrar máquina em propriedade arquivada", 422);
  }

  const acquiredAt = input.acquired_at ?? new Date();

  const machine = await db.machine.create({
    data: scoped({
      property_id: input.property_id,
      name: input.name.trim(),
      type: input.type.trim(),
      brand: input.brand ?? null,
      model: input.model ?? null,
      year: input.year ?? null,
      acquired_at: input.acquired_at ?? null,
      acquisition_cost: input.acquisition_cost ?? null,
      hour_meter: input.hour_meter ?? null,
    }),
  });

  if (input.acquisition_cost != null && input.acquisition_cost > 0) {
    await createLinkedEntry(db, {
      entry_type: "expense",
      category: `Aquisição de máquina - ${machine.name}`,
      amount: input.acquisition_cost,
      related_module: "maquinas",
      related_id: machine.id,
      occurred_at: acquiredAt,
    });
  }

  return ok({ id: machine.id });
}

export async function updateMachineAction(
  db: TenantPrismaClient,
  machineId: string,
  input: {
    name?: string;
    type?: string;
    brand?: string | null;
    model?: string | null;
    year?: number | null;
    hour_meter?: number | null;
    status?: MachineStatusInput;
  },
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.machine.findFirst({ where: { id: machineId } });
  if (!existing) return fail("NOT_FOUND", "Máquina não encontrada", 404);

  if (input.status && !MACHINE_STATUSES.includes(input.status)) {
    return fail("VALIDATION_ERROR", "Status inválido", 422);
  }

  await db.machine.update({
    where: { id: machineId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.type !== undefined ? { type: input.type.trim() } : {}),
      ...(input.brand !== undefined ? { brand: input.brand } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.hour_meter !== undefined ? { hour_meter: input.hour_meter } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  return ok({ id: machineId });
}

/**
 * Registra uma manutenção. Com custo, gera despesa vinculada à MANUTENÇÃO
 * (não à máquina): várias manutenções na mesma máquina não devem colidir no
 * `related_id`. Com `next_due_at`, atualiza `Machine.next_maintenance_at`
 * (substitui o valor anterior: só a manutenção mais recente importa para o
 * alerta, spec 4 do Módulo 26).
 */
export async function registerMaintenanceAction(
  db: TenantPrismaClient,
  machineId: string,
  input: {
    performed_at?: Date | null;
    description: string;
    cost?: number | null;
    next_due_at?: Date | null;
  },
): Promise<ActionResult<{ id: string }>> {
  const machine = await db.machine.findFirst({ where: { id: machineId } });
  if (!machine) return fail("NOT_FOUND", "Máquina não encontrada", 404);

  if (!input.description.trim()) {
    return fail("VALIDATION_ERROR", "Descrição é obrigatória", 422);
  }
  if (input.cost != null && input.cost < 0) {
    return fail("VALIDATION_ERROR", "O custo não pode ser negativo", 422);
  }

  const performedAt = input.performed_at ?? new Date();

  const maintenance = await db.machineMaintenance.create({
    data: scoped({
      machine_id: machineId,
      performed_at: performedAt,
      description: input.description.trim(),
      cost: input.cost ?? null,
      next_due_at: input.next_due_at ?? null,
    }),
  });

  if (input.next_due_at !== undefined) {
    await db.machine.update({
      where: { id: machineId },
      data: { next_maintenance_at: input.next_due_at },
    });
  }

  if (input.cost != null && input.cost > 0) {
    await createLinkedEntry(db, {
      entry_type: "expense",
      category: `Manutenção - ${machine.name}`,
      amount: input.cost,
      related_module: "maquinas",
      related_id: maintenance.id,
      occurred_at: performedAt,
    });
  }

  return ok({ id: maintenance.id });
}

export async function listMachinesAction(db: TenantPrismaClient) {
  return db.machine.findMany({ orderBy: { created_at: "desc" } });
}

export async function getMachineWithMaintenancesAction(db: TenantPrismaClient, machineId: string) {
  return db.machine.findFirst({
    where: { id: machineId },
    include: { maintenances: { orderBy: { performed_at: "desc" } } },
  });
}
