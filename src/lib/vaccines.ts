import { scoped, type TenantPrismaClient } from "@/lib/prisma";

/**
 * Catálogo básico de vacinas (spec 1.4). Intervalos padrão em dias: ajustáveis
 * por tenant depois. São tenant-scoped, então provisionadas por tenant.
 */
export const DEFAULT_VACCINES: { name: string; default_interval_days: number }[] = [
  { name: "Aftosa", default_interval_days: 180 },
  { name: "Brucelose", default_interval_days: 365 },
  { name: "Raiva", default_interval_days: 365 },
  { name: "Clostridiose", default_interval_days: 365 },
];

/**
 * Cria as vacinas padrão para o tenant (idempotente: não duplica). Chamado ao
 * ativar o perfil Fazenda e no seed do tenant Da Mata.
 */
export async function provisionDefaultVaccines(
  db: TenantPrismaClient,
): Promise<void> {
  for (const v of DEFAULT_VACCINES) {
    const exists = await db.vaccine.findFirst({ where: { name: v.name } });
    if (!exists) {
      await db.vaccine.create({ data: scoped(v) });
    }
  }
}
