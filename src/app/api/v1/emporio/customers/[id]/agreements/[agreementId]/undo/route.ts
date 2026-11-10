import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { desfazerAcordoAction } from "@/lib/actions/emporio-acordos";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/customers/:id/agreements/:agreementId/undo  { reason }
 * Desfaz um acordo de fiado sem movimento (só Dono e Financeiro). Q275.
 */

const schema = z.object({
  reason: z
    .string({ error: "Diga por que o acordo está sendo desfeito." })
    .trim()
    .min(1, "Diga por que o acordo está sendo desfeito.")
    .max(500, "O motivo deve ter no máximo 500 caracteres."),
});

type Props = { params: Promise<{ id: string; agreementId: string }> };

async function POSTHandler(request: Request, props: Props) {
  const { agreementId } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await desfazerAcordoAction(g.db, g.user, agreementId, parsed.data));
}

export const POST = withApi(POSTHandler);
