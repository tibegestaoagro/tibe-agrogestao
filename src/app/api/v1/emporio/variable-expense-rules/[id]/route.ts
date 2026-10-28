import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarRegraVariavelAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/variable-expense-rules/:id  { name?, kind?, value?, payment_kind?, ..., archived? }: só OWNER e ADMIN. Mudar a regra não mexe nas vendas passadas. */

const schema = z.object({
  name: z.string({ error: "Dê um nome à regra." }).optional(),
  kind: z.string({ error: "Escolha o cálculo da regra." }).optional(),
  value: z.number({ error: "Informe o valor da regra." }).optional(),
  payment_kind: z.string().nullish(),
  emporio_product_id: z.string().nullish(),
  presentation_id: z.string().nullish(),
  packaging_emporio_product_id: z.string().nullish(),
  archived: z.boolean({ error: "Informe se a regra fica arquivada." }).optional(),
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

  return respostaDaAction(await editarRegraVariavelAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
