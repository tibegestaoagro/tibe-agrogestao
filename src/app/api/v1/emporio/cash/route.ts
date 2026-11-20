import { withApi } from "@/lib/route";
import { lerCaixaAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/cash  ?establishment_id= &bank_account_id= &limit= &mov_page= &mov_per_page= (20, 40, 80, 100) &mov_order= (asc | desc, padrão desc)
 * saldos da gaveta e das contas, mais os movimentos. Só os movimentos paginam: `movimentos_total`, `movimentos_page` e
 * `movimentos_per_page` vêm no `data`. Sem `mov_page` nem `mov_per_page`, vale o corte antigo de `limit` (100).
 */

/** Número de query; ausente fica de fora, e o que não é número vai para a action, que recusa com o campo certo. */
function numeroDaQuery(sp: URLSearchParams, nome: string): number | undefined {
  const v = sp.get(nome);
  return v === null || v === "" ? undefined : Number(v);
}

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
      mov_page: numeroDaQuery(sp, "mov_page"),
      mov_per_page: numeroDaQuery(sp, "mov_per_page"),
      // Valor fora de asc/desc vai para a action, que recusa com 422 em mov_order.
      mov_order: (sp.get("mov_order") || undefined) as "asc" | "desc" | undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
