import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { closeEventConsignment } from "@/lib/actions/event-consignments";
import { getNegotiation, serializeNegotiation } from "@/lib/actions/negotiations";
import { eventCloseSchema } from "@/lib/validation/negotiation";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/negotiations/:id/close-event   encerra a remessa (§8.2, §17.8)
 *
 * O produtor informa quantos venderam, quantos voltaram e quantos seguiram
 * para outro destino. Duas recusas importam mais que as outras:
 *
 * - `DESTINOS_NAO_BATEM` (422, campo `quantity`): a soma dos três não é igual
 *   ao que está na remessa. Nada se move.
 * - `VENDA_SEM_VALOR` / `VALOR_SEM_VENDA` (422, campo `amount`): venda sem
 *   valor tira gado do rebanho sem gerar receita, e valor sem venda cria
 *   receita sem contrapartida no rebanho.
 *
 * É POST em sub-rota, e não PATCH na negociação, porque o encerramento não é
 * edição de campo: é um evento que grava movimentações e dinheiro.
 */

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = eventCloseSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const d = parsed.data;

  const result = await closeEventConsignment(g.db, params.id, {
    vendidos: d.vendidos ?? 0,
    retornados: d.retornados ?? 0,
    outro_destino: d.outro_destino
      ? {
          quantity: d.outro_destino.quantity,
          type: d.outro_destino.type,
          counterparty_name: d.outro_destino.counterparty_name ?? null,
          location_name: d.outro_destino.location_name ?? null,
          city: d.outro_destino.city ?? null,
          expected_end_at: d.outro_destino.expected_end_at
            ? new Date(d.outro_destino.expected_end_at)
            : null,
        }
      : null,
    amount: d.amount ?? null,
    pago: d.pago ?? false,
    due_date: d.due_date ? new Date(d.due_date) : null,
    parcelas: (d.parcelas ?? []).map((p) => ({
      due_date: new Date(p.due_date),
      amount: p.amount,
    })),
    custos: d.custos ?? [],
    occurred_at: d.occurred_at ? new Date(d.occurred_at) : null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const detalhe = await getNegotiation(g.db, params.id);
  return apiOk(detalhe ? serializeNegotiation(detalhe) : { id: params.id }, {
    // Aditivo: a tela usa para levar o produtor à estadia nova quando parte
    // das cabeças seguiu para outro destino.
    nova_estadia_id: result.data.nova_estadia_id,
    encerrada: result.data.encerrada,
  });
}

export const POST = withApi(POSTHandler);
