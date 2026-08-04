import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";

/** Propriedades ativas (não arquivadas) do tenant. */
export async function listActiveProperties(db: TenantPrismaClient) {
  return db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } });
}

/**
 * Soma das áreas dos pastos ativos de uma propriedade x tamanho total da
 * fazenda (doc "Minha Fazenda" §6): usada pra exibir a soma na tela e pro
 * aviso de "soma dos pastos maior que o total" (aviso apenas, nunca bloqueia
 * salvar: decisão do usuário, 2026-08-04).
 */
export async function getPastureAreaSummary(db: TenantPrismaClient, propertyId: string) {
  const [property, pastures] = await Promise.all([
    db.property.findFirst({ where: { id: propertyId }, select: { area_hectares: true } }),
    db.pasture.findMany({ where: { property_id: propertyId, archived_at: null }, select: { area_hectares: true } }),
  ]);

  const total_area = decToNum(property?.area_hectares ?? null);
  const distributed_area = pastures.reduce((sum, p) => sum + (decToNum(p.area_hectares) ?? 0), 0);
  const over_allocated = total_area != null && distributed_area > total_area;

  return {
    total_area,
    distributed_area,
    remaining_area: total_area != null ? total_area - distributed_area : null,
    over_allocated,
  };
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
