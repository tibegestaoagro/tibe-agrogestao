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

/**
 * As 26 categorias do §21 do documento da Área Financeiro (9 receita, 17
 * despesa), literais como o cliente escreveu. Até a fase 35.1 eram 11, e as
 * antigas que não têm equivalente aqui (Ração, Insumos, Veterinário e afins)
 * continuam existindo nos tenants que já as receberam: o provisionamento
 * ACRESCENTA o que falta e nunca apaga nem renomeia o que já está lá, porque
 * do lado de fora não há como distinguir uma padrão antiga de uma que o
 * produtor renomeou.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Compra de animais",
  "Alimentação animal",
  "Sal e suplementos",
  "Sementes",
  "Adubos e corretivos",
  "Medicamentos e vacinas",
  "Combustíveis",
  "Máquinas e manutenção",
  "Mão de obra",
  "Serviços terceirizados",
  "Confinamento/Boitel",
  "Cercas",
  "Energia",
  "Fretes e transportes",
  "Arrendamento",
  "Administração",
  "Outras despesas",
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  "Venda de animais",
  "Venda de leite",
  "Venda de produtos",
  "Serviços com máquinas",
  "Outros serviços",
  "Pastagem para terceiros",
  "Arrendamento recebido",
  "Venda de máquinas e equipamentos",
  "Outras receitas",
] as const;

const CHAVE = (name: string, entryType: string) => `${entryType}:${name.trim().toLowerCase()}`;

/**
 * Cria as padrão que faltam. Roda em TODA listagem, não só na primeira: é
 * assim que tenant antigo recebe categoria nova sem migração de dados. O
 * custo é uma query a mais, e nenhuma escrita quando nada falta.
 */
async function provisionDefaults(db: TenantPrismaClient): Promise<void> {
  const existentes = await db.financialCategory.findMany({
    select: { name: true, entry_type: true },
  });
  const jaTem = new Set(existentes.map((c) => CHAVE(c.name, c.entry_type)));

  const faltando = [
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ name, entry_type: "income" as const })),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name, entry_type: "expense" as const })),
  ].filter((c) => !jaTem.has(CHAVE(c.name, c.entry_type)));

  if (faltando.length === 0) return;
  await db.financialCategory.createMany({ data: faltando.map((c) => scoped(c)) });
}

/** Lista as categorias do tenant, acrescentando as padrão que ainda faltarem. */
export async function listFinancialCategoriesAction(
  db: TenantPrismaClient,
  opts?: { entry_type?: EntryTypeInput; activeOnly?: boolean },
) {
  await provisionDefaults(db);
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
