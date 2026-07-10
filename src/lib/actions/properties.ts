import type { TenantPrismaClient } from "@/lib/prisma";

/** Propriedades ativas (não arquivadas) do tenant. */
export async function listActiveProperties(db: TenantPrismaClient) {
  return db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } });
}

/** Busca propriedade ativa por nome (exato, senão contém), case-insensitive. */
export async function findActivePropertyByName(db: TenantPrismaClient, name: string) {
  const exact = await db.property.findFirst({
    where: { archived_at: null, name: { equals: name, mode: "insensitive" } },
  });
  if (exact) return exact;
  return db.property.findFirst({
    where: { archived_at: null, name: { contains: name, mode: "insensitive" } },
  });
}
