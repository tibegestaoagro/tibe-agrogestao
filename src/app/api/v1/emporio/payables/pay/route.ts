import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { pagarDespesasAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { dataIso } from "@/lib/emporio/venda-schema";

/** POST /api/v1/emporio/payables/pay  paga várias contas de uma vez, saindo da gaveta de uma loja ou de uma conta: só OWNER e ADMIN. */

const schema = z.object({
  entry_ids: z.array(z.string({ error: "Escolha as contas." }), { error: "Escolha as contas para pagar." }),
  paid_at: dataIso.nullish(),
  from: z.object(
    {
      establishment_id: z.string().nullish(),
      bank_account_id: z.string().nullish(),
    },
    { error: "Diga de onde sai o dinheiro." },
  ),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await pagarDespesasAction(g.db, g.user, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
