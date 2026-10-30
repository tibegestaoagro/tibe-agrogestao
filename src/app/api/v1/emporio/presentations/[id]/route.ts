import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarApresentacaoAction } from "@/lib/actions/emporio-catalogo";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/presentations/:id */

const schema = z.object({
  name: z.string({ error: "Informe o nome da apresentação." }).trim().min(1, "Informe o nome da apresentação.").optional(),
  base_qty: z.number({ error: "Informe a quantidade na unidade-base." }).gt(0, "A quantidade deve ser maior que zero.").optional(),
  content_qty: z.number({ error: "Informe a quantidade do conteúdo." }).gt(0, "A quantidade deve ser maior que zero.").optional(),
  is_sealed_package: z.boolean().optional(),
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

  return respostaDaAction(await editarApresentacaoAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
