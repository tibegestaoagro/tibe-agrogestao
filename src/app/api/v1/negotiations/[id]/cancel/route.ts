import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { cancelNegotiation, getNegotiation, serializeNegotiation } from "@/lib/actions/negotiations";

/**
 * POST /api/v1/negotiations/:id/cancel   cancela a negociação (§17.9)
 *
 * Cancelar recalcula tudo. Como saldo é sempre soma, "recalcular" é cancelar
 * os filhos: os movimentos param de contar no rebanho e os lançamentos deixam
 * de pesar no financeiro. A negociação permanece no histórico (§17.10).
 *
 * É POST em sub-rota, não DELETE, porque o recurso NÃO é removido e a
 * operação exige o motivo no corpo.
 *
 * O §17.9 pede alerta quando parte do item já foi movimentada: a action
 * recusa com 422 e explica quantos animais restam, em vez de cancelar em
 * cascata coisas que o produtor não pediu para desfazer.
 *
 * `dinheiro_pago` resolve, na mesma chamada, o que fazer com o que já saiu da
 * conta. Sem ele, o produtor teria que ir ao Financeiro num segundo passo, e a
 * tela de lá nem oferece ação para lançamento pago.
 */

const cancelSchema = z.object({
  reason: z.string().trim().min(1, "Informe o motivo do cancelamento").max(500),
  dinheiro_pago: z.enum(["mantem", "devolvido", "engano"]).nullish(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = cancelSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await cancelNegotiation(
    g.db,
    params.id,
    parsed.data.reason,
    parsed.data.dinheiro_pago ?? "mantem",
    g.user.id,
  );
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const detalhe = await getNegotiation(g.db, params.id);
  return apiOk(detalhe ? serializeNegotiation(detalhe) : { id: params.id }, {
    // Aditivo: a tela usa para dizer ao produtor o que aconteceu com o dinheiro.
    valor_pago_mantido: result.data.valor_pago_mantido,
    valor_estornado: result.data.valor_estornado,
  });
}
