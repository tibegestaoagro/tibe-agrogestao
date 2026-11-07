import { apiError, apiOk } from "@/lib/api";
import { withApi } from "@/lib/route";
import { buscarFornecedoresAction } from "@/lib/actions/emporio-fornecedores";
import { guardEmporio } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/suppliers/search?q=&id=&page=&per_page=: a busca de fornecedor da Compra (nome,
 * CPF/CNPJ ou telefone), com a última compra de cada um. A regra vive na action.
 */
async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;

  const p = new URL(request.url).searchParams;
  const res = await buscarFornecedoresAction(g.db, g.user, {
    q: p.get("q") ?? undefined,
    id: p.get("id") ?? undefined,
    pagina: Number(p.get("page")) || undefined,
    por_pagina: Number(p.get("per_page")) || undefined,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  const { itens, total, pagina, por_pagina, poucos_digitos } = res.data;
  return apiOk(itens, { total, page: pagina, per_page: por_pagina, poucos_digitos });
}

export const GET = withApi(GETHandler);
