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
export async function getActivePropertyId(db: TenantPrismaClient): Promise<string | null> {
  const raw = cookies().get(ACTIVE_PROPERTY_COOKIE)?.value;
  if (!raw) return null;
  const property = await db.property.findFirst({ where: { id: raw, archived_at: null } });
  return property ? property.id : null;
}
