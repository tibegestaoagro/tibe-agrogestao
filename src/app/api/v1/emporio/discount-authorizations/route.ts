import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { autorizarDescontoAction } from "@/lib/actions/emporio-autorizacao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/discount-authorizations: o gestor digita o PIN e recebe a autorização assinada (15 min). */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha a loja." }).min(1, "Escolha a loja."),
  authorizer_user_id: z.string({ error: "Escolha quem autoriza." }).min(1, "Escolha quem autoriza."),
  pin: z.string({ error: "Informe o PIN." }).min(1, "Informe o PIN."),
  discount_pct: z
    .number({ error: "Informe o desconto." })
    .min(0, "O desconto deve ficar entre 0 e 100%.")
    .max(100, "O desconto deve ficar entre 0 e 100%."),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await autorizarDescontoAction(g.db, g.user, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
