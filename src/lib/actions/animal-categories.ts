import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lógica de negócio de AnimalCategory (Módulo 25, spec seção 2.3). Categorias
 * são customizáveis por tenant: cada tenant nasce com a lista padrão abaixo,
 * mas pode renomear, desativar ou adicionar categorias depois. Mesmo padrão
 * de vacinas padrão do M0 (src/lib/vaccines.ts, provisionDefaultVaccines).
 */
export const DEFAULT_ANIMAL_CATEGORIES = [
  "Bezerro",
  "Bezerra",
  "Garrote",
  "Novilha",
  "Vaca",
  "Boi",
  "Touro",
] as const;

/** Cria as categorias padrão do tenant (idempotente: não duplica). */
export async function provisionDefaultAnimalCategories(
  db: TenantPrismaClient,
): Promise<void> {
  for (const name of DEFAULT_ANIMAL_CATEGORIES) {
    const exists = await db.animalCategory.findFirst({ where: { name } });
    if (!exists) {
      await db.animalCategory.create({ data: scoped({ name }) });
    }
  }
}

/**
 * Lista as categorias do tenant, provisionando a lista padrão na primeira
 * leitura se o tenant ainda não tiver nenhuma categoria. Isso cobre "nasce
 * com lista padrão pré-populada" (spec 2.3) sem exigir um gatilho dedicado
 * na criação do tenant, que fica fora do escopo de arquivos desta rodada
 * (ver relatório final do Módulo 25 sobre o ponto de integração ideal).
 */
export async function listCategoriesAction(
  db: TenantPrismaClient,
  opts?: { activeOnly?: boolean },
) {
  const count = await db.animalCategory.count();
  if (count === 0) {
    await provisionDefaultAnimalCategories(db);
  }
  return db.animalCategory.findMany({
    where: opts?.activeOnly ? { active: true } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function createCategoryAction(
  db: TenantPrismaClient,
  input: { name: string },
): Promise<ActionResult<{ id: string; name: string; active: boolean }>> {
  const name = input.name.trim();
  if (!name) return fail("VALIDATION_ERROR", "Nome da categoria é obrigatório", 422);

  const dup = await db.animalCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (dup) {
    return fail("DUPLICATE_CATEGORY", `Já existe uma categoria '${name}'`, 409);
  }

  const created = await db.animalCategory.create({ data: scoped({ name }) });
  return ok({ id: created.id, name: created.name, active: created.active });
}

export async function updateCategoryAction(
  db: TenantPrismaClient,
  id: string,
  input: { name?: string; active?: boolean },
): Promise<ActionResult<{ id: string; name: string; active: boolean }>> {
  const category = await db.animalCategory.findFirst({ where: { id } });
  if (!category) return fail("NOT_FOUND", "Categoria não encontrada", 404);

  const data: { name?: string; active?: boolean } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return fail("VALIDATION_ERROR", "Nome da categoria é obrigatório", 422);
    const dup = await db.animalCategory.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, id: { not: id } },
    });
    if (dup) {
      return fail("DUPLICATE_CATEGORY", `Já existe uma categoria '${name}'`, 409);
    }
    data.name = name;
  }
  if (input.active !== undefined) data.active = input.active;

  const updated = await db.animalCategory.update({ where: { id }, data });
  return ok({ id: updated.id, name: updated.name, active: updated.active });
}

/**
 * Busca categoria ATIVA pelo nome (exato, senão contém), case-insensitive.
 * Usado pelo agente WhatsApp (registrar_lote_animal): categoria não
 * reconhecida faz o agente perguntar, nunca criar uma nova sozinho (spec 4).
 */
export async function findActiveCategoryByName(db: TenantPrismaClient, name: string) {
  const exact = await db.animalCategory.findFirst({
    where: { active: true, name: { equals: name, mode: "insensitive" } },
  });
  if (exact) return exact;
  return db.animalCategory.findFirst({
    where: { active: true, name: { contains: name, mode: "insensitive" } },
  });
}
