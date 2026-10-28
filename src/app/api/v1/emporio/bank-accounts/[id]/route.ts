import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarContaAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/bank-accounts/:id  { name?, bank?, archived? }: só OWNER e ADMIN. */

const schema = z.object({
  name: z.string({ error: "Dê um nome à conta." }).trim().min(1, "Dê um nome à conta.").optional(),
  bank: z.string().nullish(),
  archived: z.boolean({ error: "Informe se a conta fica arquivada." }).optional(),
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

  return respostaDaAction(await editarContaAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
