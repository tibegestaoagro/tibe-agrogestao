import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { cancelMilkCharge } from "@/lib/actions/milk-storage";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/milk/charges/:id/cancel   cancela a cobrança do §22.
 *
 * Cancela TAMBÉM o lançamento financeiro que ela gerou, e os dois juntos
 * sempre: foi exatamente aqui que o confinamento errou em 31/08, deixando a
 * conta viva depois do cancelamento. O lançamento vira `cancelled` em vez de
 * ser apagado, porque o DRE do mês em que ele existiu precisa continuar
 * contando a história como ela aconteceu.
 */
async function POSTHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const result = await cancelMilkCharge(g.db, id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk({
    id: result.data.id,
    owner_id: result.data.owner_id,
    amount: result.data.amount,
    financial_entry_id: result.data.financial_entry_id,
    canceled: result.data.canceled_at != null,
    canceled_at: isoOrNull(result.data.canceled_at),
  });
}

export const POST = withApi(POSTHandler);
