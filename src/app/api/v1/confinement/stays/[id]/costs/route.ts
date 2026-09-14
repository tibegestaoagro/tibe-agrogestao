import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { recordConfinementCost } from "@/lib/actions/confinement";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/confinement/stays/:id/costs   custo avulso do lote (§13, §14)
 *
 * Vira despesa no Financeiro ligada ao lote, e por isso entra no "Custo
 * acumulado". A prazo, `due_date` é obrigatória (`VENCIMENTO_OBRIGATORIO`).
 */

const costSchema = z.object({
  category: z.string().trim().min(1, "Escolha o tipo de custo").max(100),
  amount: z.number().positive("Informe o valor do custo"),
  pago: z.boolean().optional(),
  due_date: z.string().datetime({ message: "Data inválida" }).nullish(),
});

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = costSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const input = parsed.data;

  const result = await recordConfinementCost(g.db, {
    stay_id: id,
    category: input.category,
    amount: input.amount,
    pago: input.pago ?? false,
    due_date: input.due_date ? new Date(input.due_date) : null,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
