import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import {
  getPositions,
  HERD_OWNERS,
  HERD_SITUATIONS,
  type HerdPositionFilter,
} from "@/lib/actions/herd-ledger";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/herd/positions   saldo do rebanho por posição (Módulo 30)
 *
 * Uma posição é `categoria x fazenda x pasto x situação x dono`, e a
 * quantidade é sempre a SOMA das movimentações não canceladas: nunca um campo
 * gravado. Devolve a lista crua porque tudo que o §11 pede (total geral,
 * machos, fêmeas, por categoria, por fazenda, por pasto) é derivável dela com
 * as 12 categorias de `@/lib/herd/categories`.
 *
 * `meta.total_quantity` soma o que o filtro devolveu. O total do rebanho
 * PRÓPRIO é a consulta com `?owner=proprio`: sem isso, animais de terceiro na
 * fazenda entrariam na conta.
 *
 * Filtros (todos opcionais): category_id, property_id, pasture_id, situation,
 * owner. Filtrar por "posição sem pasto" não é exposto aqui de propósito: a
 * tela lista tudo e agrupa, e a action continua suportando o caso para quem
 * chama por dentro.
 */
async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const params = new URL(request.url).searchParams;
  const filter: HerdPositionFilter = {};

  const categoryId = params.get("category_id");
  if (categoryId) filter.category_id = categoryId;

  const propertyId = params.get("property_id");
  if (propertyId) filter.property_id = propertyId;

  const pastureId = params.get("pasture_id");
  if (pastureId) filter.pasture_id = pastureId;

  const situation = params.get("situation");
  if (situation && (HERD_SITUATIONS as readonly string[]).includes(situation)) {
    filter.situation = situation as HerdPositionFilter["situation"];
  }

  const owner = params.get("owner");
  if (owner && (HERD_OWNERS as readonly string[]).includes(owner)) {
    filter.owner = owner as HerdPositionFilter["owner"];
  }

  const positions = await getPositions(g.db, filter);
  // Posição zerada (tudo que entrou já saiu) não é informação para o produtor.
  const withBalance = positions.filter((p) => p.quantity !== 0);

  return apiOk(withBalance, {
    total: withBalance.length,
    total_quantity: withBalance.reduce((sum, p) => sum + p.quantity, 0),
  });
}

export const GET = withApi(GETHandler);
