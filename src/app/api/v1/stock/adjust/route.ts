import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { stockAdjustSchema } from "@/lib/validation/stock";
import { adjustStock } from "@/lib/actions/stock-ledger";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/stock/adjust   ajuste de estoque (Módulo 31, §10.6)
 *
 * O corpo traz `corrected_balance`: o que EXISTE de verdade, contado pelo
 * produtor. Quem calcula a diferença é o sistema, e é de propósito: pedir a
 * diferença obrigaria quem está com o produto na mão a fazer a conta que a
 * ferramenta existe para fazer, e é exatamente aí que nasce o erro de sinal.
 *
 * Saldo igual ao atual responde `NO_CHANGE` (422) em vez de gravar um movimento
 * de zero: o produtor conferiu e estava certo, e o histórico não ganha nada com
 * uma linha que não mudou nada.
 */
async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = stockAdjustSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const d = parsed.data;

  const result = await adjustStock(g.db, {
    product_id: d.product_id,
    property_id: d.property_id,
    corrected_balance: d.corrected_balance,
    reason: d.reason ?? null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
