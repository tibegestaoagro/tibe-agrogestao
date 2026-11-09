import { z } from "zod";
import { apiErroDeZod, apiError } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import {
  arquivarAdquirenteAction,
  editarAdquirenteAction,
  reativarAdquirenteAction,
} from "@/lib/actions/emporio-cartoes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/card-acquirers/:id  { name?, archived? }: só OWNER e gerente geral. */

const schema = z.object({
  name: z.string({ error: "Dê um nome à adquirente." }).trim().min(1, "Dê um nome à adquirente.").optional(),
  archived: z.boolean({ error: "Informe se a adquirente fica arquivada." }).optional(),
});

type Props = { params: Promise<{ id: string }> };

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const { name, archived } = parsed.data;
  if (name === undefined && archived === undefined) {
    return apiError("VALIDATION_ERROR", "Informe o que mudar: name ou archived.", 422);
  }

  if (name !== undefined) {
    const r = await editarAdquirenteAction(g.db, g.user, id, { name });
    if (!r.ok || archived === undefined) return respostaDaAction(r);
  }
  return respostaDaAction(
    archived
      ? await arquivarAdquirenteAction(g.db, g.user, id)
      : await reativarAdquirenteAction(g.db, g.user, id),
  );
}

export const PATCH = withApi(PATCHHandler);
