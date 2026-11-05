import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { listarOrcamentosAction, salvarOrcamentoAction } from "@/lib/actions/emporio-orcamentos";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { chaveDeOperacao, corpoDoOrcamentoSchema } from "@/lib/emporio/venda-schema";

/**
 * GET  /api/v1/emporio/quotes  ?establishment_id= &q= &situacao= &limit=  a lista com busca.
 * POST /api/v1/emporio/quotes  salva o orçamento (chave de operação): wrapper fino.
 */

const schema = corpoDoOrcamentoSchema.extend({
  operation_key: chaveDeOperacao,
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
});

const filtros = z.object({
  establishment_id: z.string().min(1).optional(),
  q: z.string().optional(),
  situacao: z
    .enum(["acompanhamento", "aberto", "vencido", "faturado", "todos"], {
      error: "Escolha a situação: acompanhamento, aberto, vencido, faturado ou todos.",
    })
    .optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = filtros.safeParse({
    establishment_id: sp.get("establishment_id") ?? undefined,
    q: sp.get("q") ?? undefined,
    situacao: sp.get("situacao") ?? undefined,
  });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const limit = Number(sp.get("limit"));
  return respostaDaAction(
    await listarOrcamentosAction(g.db, g.user, {
      ...parsed.data,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    }),
  );
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const res = await salvarOrcamentoAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  // Chave repetida: o orçamento já gravado, 200, sem escrever nada.
  const { replayed, ...orcamento } = res.data;
  return apiOk(orcamento, {}, replayed ? undefined : { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
