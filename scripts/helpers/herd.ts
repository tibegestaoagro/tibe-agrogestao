import { scoped, type TenantPrismaClient } from "@/lib/prisma";

/**
 * Ajuda os scripts de teste a criar rebanho no modelo único (2026-08-04).
 *
 * Existe porque a unificação tornou `category_id` obrigatório, e os testes
 * que só queriam "um animal com brinco" passariam a repetir a criação da
 * categoria 17 vezes. Aqui a categoria é criada uma vez por tenant e
 * reaproveitada.
 *
 * `createTestAnimal` cria um lote de 1 cabeça COM brinco (o caso de quem
 * trabalha com brinco); `createTestBatch` cria um lote por categoria, sem
 * brinco.
 */

// Guarda a PROMESSA, não o id resolvido: com o valor, duas chamadas dentro
// de um `Promise.all` veem o cache vazio ao mesmo tempo e as duas tentam
// criar a categoria, batendo no índice único (P2002). Guardando a promessa,
// a segunda chamada espera a primeira.
const categoriaPorTenant = new Map<string, Promise<string>>();

function categoriaPadrao(db: TenantPrismaClient, tenantId: string): Promise<string> {
  const cached = categoriaPorTenant.get(tenantId);
  if (cached) return cached;
  const promessa = (async () => {
    const existing = await db.animalCategory.findFirst({ where: { name: "Teste" } });
    if (existing) return existing.id;
    try {
      const criada = await db.animalCategory.create({ data: scoped({ name: "Teste" }) });
      return criada.id;
    } catch {
      // Corrida com outro processo: alguém criou entre a busca e a criação.
      const agora = await db.animalCategory.findFirst({ where: { name: "Teste" } });
      if (!agora) throw new Error("categoria de teste não pôde ser criada");
      return agora.id;
    }
  })();
  categoriaPorTenant.set(tenantId, promessa);
  return promessa;
}

export async function createTestAnimal(
  db: TenantPrismaClient,
  tenantId: string,
  input: {
    ear_tag: string;
    property_id: string;
    breed?: string | null;
    sex?: "male" | "female" | null;
    average_weight?: number | null;
    category_id?: string;
  },
) {
  return db.animalBatch.create({
    data: scoped({
      category_id: input.category_id ?? (await categoriaPadrao(db, tenantId)),
      property_id: input.property_id,
      quantity: 1,
      ear_tag: input.ear_tag,
      breed: input.breed ?? null,
      sex: input.sex ?? null,
      average_weight: input.average_weight ?? null,
    }),
  });
}

export async function createTestBatch(
  db: TenantPrismaClient,
  tenantId: string,
  input: { property_id: string; quantity: number; category_id?: string },
) {
  return db.animalBatch.create({
    data: scoped({
      category_id: input.category_id ?? (await categoriaPadrao(db, tenantId)),
      property_id: input.property_id,
      quantity: input.quantity,
    }),
  });
}

/**
 * Remove um tenant de teste JUNTO com o rebanho dele.
 *
 * Necessário desde a unificação (2026-08-04): `AnimalBatch` referencia
 * `AnimalCategory` e `Property` com `onDelete: Restrict` (correto no
 * domínio: não se apaga uma categoria que tem animais). Isso faz
 * `tenant.delete()` sozinho falhar por violação de chave estrangeira,
 * dependendo da ordem em que o Postgres processa a cascata, deixando
 * tenant órfão que quebra a execução seguinte com documento duplicado.
 */
export async function deleteTestTenants(tenantIds: string[]) {
  const { prisma } = await import("@/lib/prisma");
  for (const tenant_id of tenantIds) {
    await prisma.animalWeightLog.deleteMany({ where: { tenant_id } });
    await prisma.animalVaccination.deleteMany({ where: { tenant_id } });
    await prisma.animalMovement.deleteMany({ where: { tenant_id } });
    await prisma.animalBatch.deleteMany({ where: { tenant_id } });
    await prisma.tenant.deleteMany({ where: { id: tenant_id } });
  }
  categoriaPorTenant.clear();
}
