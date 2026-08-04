import type { TenantPrismaClient } from "@/lib/prisma";

/**
 * Talhões com ciclo ativo (auditoria de arquitetura, 2026-08-04): extraído
 * porque o dashboard web e o `resumo` do WhatsApp calculavam a mesma
 * contagem com duas queries Prisma independentes, sem passar pelo seam de
 * actions.
 */
export async function countActivePlots(
  db: TenantPrismaClient,
  propertyId?: string | null,
) {
  return db.plot.count({
    where: {
      cycles: { some: { status: { in: ["planted", "growing"] } } },
      ...(propertyId ? { property_id: propertyId } : {}),
    },
  });
}
