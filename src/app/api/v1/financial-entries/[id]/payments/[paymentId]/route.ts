import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { cancelarPagamentoAction } from "@/lib/actions/financial-payments";
import { withApi } from "@/lib/route";

/**
 * DELETE /api/v1/financial-entries/:id/payments/:paymentId
 *
 * Desfaz um pagamento registrado por engano. A conta volta a dever o que
 * voltou a faltar, e sai de "paga" se deixar de estar coberta.
 */

async function DELETEHandler(
  _request: Request,
  props: { params: Promise<{ id: string; paymentId: string }> },
) {
  const params = await props.params;
  const g = await guard("financeiro", "write");
  if ("error" in g) return g.error;

  // O `id` da conta vem na URL e precisa bater com o dono do pagamento: sem
  // isso, um paymentId de outra conta do mesmo tenant seria aceito por uma URL
  // que diz outra coisa.
  const pagamento = await g.db.financialPayment.findFirst({
    where: { id: params.paymentId },
  });
  if (!pagamento || pagamento.entry_id !== params.id) {
    return apiError("NOT_FOUND", "Pagamento não encontrado", 404);
  }

  const result = await cancelarPagamentoAction(g.db, params.paymentId);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const { entry_id, ...resumo } = result.data;
  return apiOk({ entry_id }, resumo);
}

export const DELETE = withApi(DELETEHandler);
