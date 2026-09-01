import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { cancelMilkMovement } from "@/lib/actions/milk-ledger";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/milk/storage/:id/cancel   cancela uma movimentação de leite.
 *
 * Cancela, não apaga (§37.11). Cancelar uma ENTRADA pode deixar o saldo
 * negativo, quando o leite que entrou já saiu: isso é aceito de propósito,
 * porque recusar prenderia o produtor a um registro que ele sabe estar errado.
 * A tela mostra o saldo real, e o caminho de conserto é o ajuste.
 *
 * ⚠️ A retirada do §21 grava UMA LINHA POR DONO. Cancelar uma delas desfaz a
 * baixa daquele dono, não a retirada inteira: é o comportamento certo para
 * corrigir um número, e quem quiser desfazer tudo cancela linha por linha.
 */
async function POSTHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const result = await cancelMilkMovement(g.db, id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk({
    id: result.data.id,
    movement_type: result.data.movement_type,
    liters: result.data.liters,
    occurred_at: result.data.occurred_at.toISOString(),
    canceled: result.data.canceled_at != null,
    canceled_at: isoOrNull(result.data.canceled_at),
  });
}

export const POST = withApi(POSTHandler);
