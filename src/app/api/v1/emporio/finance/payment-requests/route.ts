import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { listarPedidosDePagamentoAction } from "@/lib/actions/emporio-aprovacoes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/payment-requests?status=pendente|aprovado|recusado: os pedidos de aprovação de pagamento. */

const schema = z.object({
  status: z.enum(["pendente", "aprovado", "recusado", "decididos"], { error: "Escolha um estado válido: pendente, aprovado, recusado ou decididos." }).optional(),
  before: z.string().datetime({ error: "Use uma data ISO8601." }).optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;

  const status = new URL(request.url).searchParams.get("status");
  const before = new URL(request.url).searchParams.get("before");
  const parsed = schema.safeParse({ status: status || undefined, before: before || undefined });
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await listarPedidosDePagamentoAction(g.db, g.user, parsed.data));
}

export const GET = withApi(GETHandler);
