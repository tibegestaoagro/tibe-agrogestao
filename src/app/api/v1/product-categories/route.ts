import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { ensureProductCategories, listProductCategories } from "@/lib/actions/products";

/**
 * GET /api/v1/product-categories  as categorias de produto (Módulo 31, §9.1)
 *
 * Semeia as 15 categorias do documento no primeiro acesso do tenant e devolve
 * a lista. Semear na LEITURA, e não na migração, faz tenant novo e antigo
 * receberem o mesmo tratamento sem tocar em dado de produção; `ensure` é
 * idempotente e barato (um `count` quando já existem).
 *
 * Só leitura: criar categoria própria não está no §9.1 e não foi pedido.
 *
 * O guard usa o módulo "rebanho" pelo mesmo motivo de Minha Fazenda: o PRD §5.2
 * não define um `ModuleKey` para Estoque, e as negociações que alimentam o
 * estoque já vivem sob essa chave. Um recorte próprio criaria a situação de
 * alguém poder comprar um produto e não poder ver onde ele foi parar.
 */
export async function GET() {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const criadas = await ensureProductCategories(g.db);
  const categorias = await listProductCategories(g.db);

  return apiOk(categorias, { seeded: criadas });
}
