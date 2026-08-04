import { perRequestCache } from "@/lib/per-request-cache";
import { cookies } from "next/headers";
import type { TenantPrismaClient } from "@/lib/prisma";

/**
 * Propriedade ativa escolhida no seletor do topo (briefing de layout,
 * docs/design/briefing-novo-layout.md, seção 12). Preferência de sessão via
 * cookie, não um campo no banco: qual propriedade estou olhando agora não é
 * dado de negócio.
 */
export const ACTIVE_PROPERTY_COOKIE = "tibe_active_property_id";

/**
 * Lê a propriedade ativa do cookie e revalida contra o tenant atual: nunca
 * confia cegamente no valor (cookie de outra sessão/tenant, ou propriedade
 * já arquivada, vira "todas as propriedades", nunca um erro). A query em si
 * já é escopada pelo client do tenant, então não há vazamento cross-tenant
 * possível mesmo num cookie forjado; é só uma questão de o filtro "sumir"
 * graciosamente se o id não for mais válido.
 */
/**
 * ⚠️ Único ponto do projeto memoizado por uma chave de OBJETO (o client
 * Prisma), a armadilha que `session-gate.ts` evita de propósito ao usar
 * strings. Funciona porque `prismaForTenant()` devolve sempre a mesma
 * instância para um tenant (cache em `globalThis`, ver prisma.ts), então a
 * identidade é estável dentro do request. Se um dia esse cache do client
 * sair, isto vira um no-op silencioso: perde a memoização, não corrompe
 * nada (clients de tenants diferentes são objetos diferentes, então nunca
 * colidem). Preferi não trocar a assinatura só por isso; se trocar, use o
 * `tenantId` como chave.
 */
export const getActivePropertyId = perRequestCache(async function getActivePropertyId(
  db: TenantPrismaClient,
): Promise<string | null> {
  const raw = cookies().get(ACTIVE_PROPERTY_COOKIE)?.value;
  if (!raw) return null;
  const property = await db.property.findFirst({
    where: { id: raw, archived_at: null },
    select: { id: true },
  });
  return property ? property.id : null;
});
