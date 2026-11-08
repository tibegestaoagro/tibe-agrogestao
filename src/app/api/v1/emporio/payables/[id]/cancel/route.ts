import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { cancelarContaAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/payables/:id/cancel  { reason }  cancela uma conta sem pagamento: Financeiro, Gerente geral e Dono (o Gestor da loja recebe 403). */

const schema = z.object({
  reason: z.string({ error: "Diga o motivo do cancelamento." }).trim().min(1, "Diga o motivo do cancelamento."),
});

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await cancelarContaAction(g.db, g.user, { entry_id: id, reason: parsed.data.reason }));
}

export const POST = withApi(POSTHandler);
