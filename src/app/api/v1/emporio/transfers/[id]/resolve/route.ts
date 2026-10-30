import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { resolverDiferencaAction } from "@/lib/actions/emporio-transferencias";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/transfers/:id/resolve  { operation_key, resolution, reason }: Gestor do destino, Gerente geral ou Dono (Q131). */

const schema = z.object({
  operation_key: z.string({ error: "Falta a chave da operação." }).trim().min(1, "Falta a chave da operação."),
  resolution: z.enum(["perda_no_caminho", "nao_enviada"], {
    error: "Diga como resolver: perda no caminho ou não foi enviada.",
  }),
  reason: z.string({ error: "Diga o motivo da resolução." }).trim().min(1, "Diga o motivo da resolução."),
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

  return respostaDaAction(await resolverDiferencaAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
