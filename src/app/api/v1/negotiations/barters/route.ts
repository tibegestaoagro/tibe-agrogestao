import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { createBarter } from "@/lib/actions/barters";
import { barterSchema } from "@/lib/validation/negotiation";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/negotiations/barters   registra uma permuta (Módulo 31,
 *                                     missão 4, §12)
 *
 * Rota própria, e não mais um `type` em `POST /api/v1/negotiations`: o corpo é
 * de outra natureza. Lá existe uma lista de `itens` do mesmo tipo e um
 * `amount` que é o preço; aqui existem DOIS lados, cada um de um tipo
 * diferente, e o valor é a DIFERENÇA. Aceitá-la na rota geral significaria um
 * schema em que `itens` e `amount` mudam de sentido conforme o tipo.
 *
 * O §12.6 é o que a rota entrega: uma chamada só, e o Tibé atualiza rebanho,
 * estoque, máquinas e financeiro a partir dela.
 */

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = barterSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const d = parsed.data;

  const result = await createBarter(g.db, {
    property_id: d.property_id,
    entregue: d.entregue ?? null,
    recebido: d.recebido ?? null,
    diferenca: d.diferenca ?? null,
    contact_id: d.contact_id ?? null,
    contact_name: d.contact_name ?? null,
    occurred_at: d.occurred_at ? new Date(d.occurred_at) : null,
    pago: d.pago ?? false,
    due_date: d.due_date ? new Date(d.due_date) : null,
    parcelas: (d.parcelas ?? []).map((p) => ({
      due_date: new Date(p.due_date),
      amount: p.amount,
    })),
    notes: d.notes ?? null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
