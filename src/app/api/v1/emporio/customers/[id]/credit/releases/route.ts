import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { liberarFiadoAction } from "@/lib/actions/emporio-credito";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/customers/:id/credit/releases  { establishment_id, reason }
 * O Gestor da loja libera uma venda em fiado de cliente bloqueado, até o fim do dia, só naquela loja.
 */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha a loja da liberação." }).min(1, "Escolha a loja da liberação."),
  reason: z.string({ error: "Diga o motivo da liberação." }),
  operation_key: z.string().optional(),
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

  return respostaDaAction(await liberarFiadoAction(g.db, g.user, id, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
