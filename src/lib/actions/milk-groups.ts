import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lotes leiteiros (Área Leite, §6). Ver docs/specs/module-32-area-leite.md.
 *
 * Model próprio e NÃO o `AnimalBatch`: o §37.3 mantém os animais do lote
 * leiteiro nas categorias já definidas no Rebanho, e o `AnimalBatch` É
 * categoria mais quantidade. Aqui não há cabeça nenhuma, só um rótulo com
 * fazenda: "vacas em maior produção", "recém-paridas".
 *
 * Arquiva, nunca apaga, pelo mesmo motivo de Property, Pasture e Contact: o
 * registro de produção do mês passado continua apontando para o lote.
 */

export type MilkGroupRecord = {
  id: string;
  property_id: string;
  name: string;
  notes: string | null;
  archived_at: Date | null;
};

export type CreateMilkGroupInput = {
  property_id: string;
  name: string;
  notes?: string | null;
};

export async function listMilkGroups(
  db: TenantPrismaClient,
  filtros: { property_id?: string; include_archived?: boolean } = {},
): Promise<MilkGroupRecord[]> {
  return db.milkGroup.findMany({
    where: {
      ...(filtros.property_id ? { property_id: filtros.property_id } : {}),
      ...(filtros.include_archived ? {} : { archived_at: null }),
    },
    orderBy: [{ archived_at: "asc" }, { name: "asc" }],
    select: {
      id: true,
      property_id: true,
      name: true,
      notes: true,
      archived_at: true,
    },
  });
}

export async function createMilkGroup(
  db: TenantPrismaClient,
  input: CreateMilkGroupInput,
): Promise<ActionResult<MilkGroupRecord>> {
  const name = input.name.trim();
  if (!name) {
    return fail("VALIDATION_ERROR", "O nome do lote é obrigatório.", 422, "name");
  }

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) {
    return fail("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");
  }
  if (property.archived_at) {
    return fail(
      "PROPERTY_ARCHIVED",
      "Não é possível cadastrar lote em fazenda arquivada.",
      422,
      "property_id",
    );
  }

  // Nome repetido na mesma fazenda é recusado, e não é preciosismo: o lote
  // existe para o produtor achar o registro depois, e dois "Recém-paridas" na
  // lista tornam a escolha um chute. Fazendas diferentes podem repetir.
  const repetido = await db.milkGroup.findFirst({
    where: { property_id: input.property_id, name, archived_at: null },
    select: { id: true },
  });
  if (repetido) {
    return fail(
      "DUPLICATE_GROUP",
      "Já existe um lote com esse nome nesta fazenda.",
      422,
      "name",
    );
  }

  const created = await db.milkGroup.create({
    data: scoped({
      property_id: input.property_id,
      name,
      notes: input.notes?.trim() || null,
    }),
    select: {
      id: true,
      property_id: true,
      name: true,
      notes: true,
      archived_at: true,
    },
  });

  return ok(created);
}

export async function setMilkGroupArchived(
  db: TenantPrismaClient,
  id: string,
  archived: boolean,
): Promise<ActionResult<MilkGroupRecord>> {
  const grupo = await db.milkGroup.findFirst({ where: { id }, select: { id: true } });
  if (!grupo) return fail("NOT_FOUND", "Lote não encontrado.", 404);

  const updated = await db.milkGroup.update({
    where: { id },
    data: { archived_at: archived ? new Date() : null },
    select: {
      id: true,
      property_id: true,
      name: true,
      notes: true,
      archived_at: true,
    },
  });

  return ok(updated);
}

/**
 * Confere que o lote existe e pertence à fazenda informada.
 *
 * Chamada pelos dois registros (lactação e produção) porque lote de outra
 * fazenda passando batido é o tipo de erro que só aparece meses depois, num
 * histórico que não fecha, sem ninguém saber de onde veio.
 */
export async function conferirLote(
  db: TenantPrismaClient,
  group_id: string,
  property_id: string,
): Promise<ActionResult<null>> {
  const grupo = await db.milkGroup.findFirst({
    where: { id: group_id },
    select: { property_id: true, archived_at: true },
  });
  if (!grupo) return fail("INVALID_GROUP", "Lote inválido.", 422, "group_id");
  if (grupo.property_id !== property_id) {
    return fail(
      "LOTE_DE_OUTRA_FAZENDA",
      "Este lote pertence a outra fazenda.",
      422,
      "group_id",
    );
  }
  if (grupo.archived_at) {
    return fail("GROUP_ARCHIVED", "Este lote está arquivado.", 422, "group_id");
  }
  return ok(null);
}
