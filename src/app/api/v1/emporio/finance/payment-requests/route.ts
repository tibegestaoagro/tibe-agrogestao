import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { listarPedidosDePagamentoAction } from "@/lib/actions/emporio-aprovacoes";
import { guardEmporio, paginaSchema, respostaPaginada } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/finance/payment-requests?status=pendente|aprovado|recusado|decididos: os pedidos de
 * aprovação de pagamento. Pendente e os estados paginam (`page`, `per_page`, `order`; Q366); `decididos` segue
 * pelo cursor (`before`, `before_id`). As linhas em `data`, e `meta: { total, page, per_page }`.
 */

const schema = paginaSchema("pedidos").extend({
  status: z.enum(["pendente", "aprovado", "recusado", "decididos"], { error: "Escolha um estado válido: pendente, aprovado, recusado ou decididos." }).optional(),
  before: z.string().datetime({ error: "Use uma data ISO8601." }).optional(),
  before_id: z.string({ error: "Informe o id do cursor." }).min(1).optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({
    status: sp.get("status") || undefined,
    before: sp.get("before") || undefined,
    before_id: sp.get("before_id") || undefined,
    page: sp.get("page") ?? undefined,
    per_page: sp.get("per_page") ?? undefined,
    order: sp.get("order") ?? undefined,
  });
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaPaginada(await listarPedidosDePagamentoAction(g.db, g.user, parsed.data));
}

export const GET = withApi(GETHandler);
