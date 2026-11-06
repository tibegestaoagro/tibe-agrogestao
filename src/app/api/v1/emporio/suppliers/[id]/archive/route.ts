import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { arquivarFornecedorAction } from "@/lib/actions/emporio-fornecedores";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * PATCH /api/v1/emporio/suppliers/:id/archive: arquiva ou desarquiva o fornecedor.
 * As compras dele continuam; ele só sai das listas e das escolhas.
 */

const schema = z.object({ archived: z.boolean().default(true) });

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await arquivarFornecedorAction(g.db, g.user, id, parsed.data.archived));
}

export const PATCH = withApi(PATCHHandler);
