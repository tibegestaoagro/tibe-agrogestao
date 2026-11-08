import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { listarPedidosDePagamentoAction } from "@/lib/actions/emporio-aprovacoes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/payment-requests?status=pendente|aprovado|recusado: os pedidos de aprovação de pagamento. */

const schema = z.object({
  status: z.enum(["pendente", "aprovado", "recusado"], { error: "Escolha um estado válido: pendente, aprovado ou recusado." }).optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;

  const status = new URL(request.url).searchParams.get("status");
  const parsed = schema.safeParse({ status: status || undefined });
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await listarPedidosDePagamentoAction(g.db, g.user, parsed.data));
}

export const GET = withApi(GETHandler);
