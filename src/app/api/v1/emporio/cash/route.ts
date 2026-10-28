import { withApi } from "@/lib/route";
import { lerCaixaAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/cash  ?establishment_id= &bank_account_id= &limit=  saldos da gaveta e das contas, mais os movimentos. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get("limit"));
  return respostaDaAction(
    await lerCaixaAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      bank_account_id: sp.get("bank_account_id") ?? undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
