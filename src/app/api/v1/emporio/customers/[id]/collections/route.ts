import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { registrarCobrancaAction } from "@/lib/actions/emporio-credito";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/customers/:id/collections  { establishment_id?, message? }
 * Registra que o Financeiro cobrou o cliente pelo WhatsApp. Não envia nada.
 */

const schema = z.object({
  establishment_id: z.string().nullish(),
  message: z.string().max(1000).optional(),
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

  return respostaDaAction(await registrarCobrancaAction(g.db, g.user, id, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
