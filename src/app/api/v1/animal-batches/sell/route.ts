import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { sellFromCategoryAction } from "@/lib/actions/animal-batches";

/**
 * POST /api/v1/animal-batches/sell    venda de quantidade dentro de uma
 *                                      categoria, com FIFO automático entre
 *                                      lotes (spec 25 §2.5): recusa se a
 *                                      quantidade pedida exceder a disponível.
 */

const sellSchema = z.object({
  category_id: z.string().min(1, "Categoria é obrigatória"),
  quantity: z.number().int().positive("Quantidade deve ser um inteiro positivo"),
  value: z.number().nonnegative().nullish(),
  occurred_at: z.string().datetime().nullish(),
});

export async function POST(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = sellSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { category_id, quantity, value, occurred_at } = parsed.data;

  const result = await sellFromCategoryAction(g.db, {
    category_id,
    quantity,
    value: value ?? null,
    occurred_at: occurred_at ? new Date(occurred_at) : null,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
