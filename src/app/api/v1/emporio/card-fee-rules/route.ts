import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { definirRegraCartaoAction, listarRegrasCartaoAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/card-fee-rules  ?establishment_id=  as taxas de cartão das lojas visíveis.
 * PUT /api/v1/emporio/card-fee-rules  cria ou substitui a regra da loja para a forma: só OWNER e ADMIN.
 */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  kind: z.string({ error: "Escolha a forma do cartão." }).min(1, "Escolha a forma do cartão."),
  fee_pct: z.number({ error: "Informe a taxa em porcentagem." }),
  days: z.number({ error: "Informe o prazo em dias." }),
  bank_account_id: z.string({ error: "Escolha a conta que recebe o cartão." }).min(1, "Escolha a conta que recebe o cartão."),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await listarRegrasCartaoAction(g.db, g.user, { establishment_id: sp.get("establishment_id") ?? undefined }),
  );
}

async function PUTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await definirRegraCartaoAction(g.db, g.user, parsed.data));
}

export const GET = withApi(GETHandler);
export const PUT = withApi(PUTHandler);
