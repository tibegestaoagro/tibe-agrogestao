import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { recordConfinementFeeding } from "@/lib/actions/confinement";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/confinement/stays/:id/feeding   registra alimentação (§10, §11, §12)
 *
 * Produto do catálogo (`product_id`) vira `StockMovement` de `utilizacao`
 * vinculado à estadia, e o saldo do estoque cai. Sem `product_id` (produto
 * fora do catálogo), o pedido é aceito sem tocar em estoque: ver a nota em
 * `recordConfinementFeeding` sobre o que isso NÃO grava hoje.
 */

const feedingSchema = z.object({
  quantity: z.number().positive("A quantidade utilizada precisa ser maior que zero"),
  product_id: z.string().min(1).nullish(),
  product_name: z.string().trim().max(200).nullish(),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = feedingSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const input = parsed.data;

  const result = await recordConfinementFeeding(g.db, {
    stay_id: id,
    quantity: input.quantity,
    product_id: input.product_id ?? null,
    product_name: input.product_name ?? null,
    occurred_at: input.occurred_at ? new Date(input.occurred_at) : null,
    notes: input.notes ?? null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
