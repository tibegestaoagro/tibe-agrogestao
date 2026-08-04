import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { decToNum } from "@/lib/serialize";

/**
 * GET /api/v1/animals/:id/cost-summary   (spec 1.6)
 * Soma os FinancialEntry de DESPESA vinculados ao animal (vacinas, insumos, manejo)
 * e calcula o custo médio mensal desde a entrada do animal na propriedade.
 *
 * "Entrada" = data da movimentação de compra; se não houver, created_at do animal.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const animal = await g.db.animalBatch.findFirst({ where: { id: params.id } });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  // Despesas vinculadas ao animal.
  const expenses = await g.db.financialEntry.findMany({
    where: {
      related_module: "rebanho",
      related_id: params.id,
      entry_type: "expense",
    },
    select: { amount: true },
  });
  const total = expenses.reduce((sum, e) => sum + (decToNum(e.amount) ?? 0), 0);

  // Data de entrada: compra mais antiga, senão created_at.
  const purchase = await g.db.animalMovement.findFirst({
    where: { batch_id: params.id, movement_type: "purchase" },
    orderBy: { occurred_at: "asc" },
    select: { occurred_at: true },
  });
  const since = purchase?.occurred_at ?? animal.created_at;

  const months = Math.max(
    1,
    (Date.now() - since.getTime()) / (30.4375 * 86_400_000),
  );
  const monthlyAvg = Number((total / months).toFixed(2));

  return apiOk({
    batch_id: params.id,
    total_cost: Number(total.toFixed(2)),
    monthly_avg_cost: monthlyAvg,
    since: since.toISOString(),
    months: Number(months.toFixed(2)),
  });
}
