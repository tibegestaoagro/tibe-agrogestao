import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { saldoInicialCaixaAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio } from "@/lib/emporio/rota";
import { dataIso } from "@/lib/emporio/venda-schema";

/** POST /api/v1/emporio/cash/opening  saldo inicial da gaveta de uma loja OU de uma conta, uma vez só: wrapper fino. */

const schema = z.object({
  establishment_id: z.string().nullish(),
  bank_account_id: z.string().nullish(),
  amount: z.number({ error: "Informe o saldo inicial." }),
  occurred_at: dataIso.nullish(),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const res = await saldoInicialCaixaAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
