import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lógica de negócio de FinancialCategory (Módulo 28, spec §3). Mesmo padrão
 * de AnimalCategory (Módulo 25): cada tenant nasce com a lista padrão
 * abaixo, separada por tipo (receita/despesa), pode renomear/desativar/
 * adicionar depois. `FinancialEntry.category` continua texto livre: esta
 * lista é só a fonte da sugestão no painel.
 */

type EntryTypeInput = "income" | "expense";

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Ração",
  "Combustível",
  "Mão de obra",
  "Manutenção",
  "Insumos",
  "Veterinário",
  "Outros",
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  "Venda de animal",
  "Venda de lote",
  "Faturamento de serviço",
  "Outros",
] as const;

async function provisionDefaults(db: TenantPrismaClient): Promise<void> {
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    const exists = await db.financialCategory.findFirst({ where: { name, entry_type: "expense" } });
    if (!exists) {
      await db.financialCategory.create({ data: scoped({ name, entry_type: "expense" }) });
    }
  }
  for (const name of DEFAULT_INCOME_CATEGORIES) {
    const exists = await db.financialCategory.findFirst({ where: { name, entry_type: "income" } });
    if (!exists) {
      await db.financialCategory.create({ data: scoped({ name, entry_type: "income" }) });
    }
  }
}

/** Lista as categorias do tenant, provisionando a lista padrão na primeira leitura. */
export async function listFinancialCategoriesAction(
  db: TenantPrismaClient,
  opts?: { entry_type?: EntryTypeInput; activeOnly?: boolean },
) {
  const count = await db.financialCategory.count();
  if (count === 0) {
    await provisionDefaults(db);
  }
  return db.financialCategory.findMany({
    where: {
      ...(opts?.entry_type ? { entry_type: opts.entry_type } : {}),
      ...(opts?.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ entry_type: "asc" }, { name: "asc" }],
  });
}

export async function createFinancialCategoryAction(
  db: TenantPrismaClient,
  input: { name: string; entry_type: EntryTypeInput },
): Promise<ActionResult<{ id: string; name: string; entry_type: string; active: boolean }>> {
  const name = input.name.trim();
  if (!name) return fail("VALIDATION_ERROR", "Nome da categoria é obrigatório", 422);

  const dup = await db.financialCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, entry_type: input.entry_type },
  });
  if (dup) {
    return fail("DUPLICATE_CATEGORY", `Já existe uma categoria de ${input.entry_type === "income" ? "receita" : "despesa"} '${name}'`, 409);
  }

  const created = await db.financialCategory.create({
    data: scoped({ name, entry_type: input.entry_type }),
  });
  return ok({ id: created.id, name: created.name, entry_type: created.entry_type, active: created.active });
}

export async function updateFinancialCategoryAction(
  db: TenantPrismaClient,
  id: string,
  input: { name?: string; active?: boolean },
): Promise<ActionResult<{ id: string; name: string; active: boolean }>> {
  const category = await db.financialCategory.findFirst({ where: { id } });
  if (!category) return fail("NOT_FOUND", "Categoria não encontrada", 404);

  const data: { name?: string; active?: boolean } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return fail("VALIDATION_ERROR", "Nome da categoria é obrigatório", 422);
    const dup = await db.financialCategory.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        entry_type: category.entry_type,
        id: { not: id },
      },
    });
    if (dup) {
      return fail("DUPLICATE_CATEGORY", `Já existe uma categoria '${name}'`, 409);
    }
    data.name = name;
  }
  if (input.active !== undefined) data.active = input.active;

  const updated = await db.financialCategory.update({ where: { id }, data });
  return ok({ id: updated.id, name: updated.name, active: updated.active });
}
