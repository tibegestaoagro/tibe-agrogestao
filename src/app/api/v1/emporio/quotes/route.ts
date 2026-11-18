import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { listarOrcamentosAction, salvarOrcamentoAction } from "@/lib/actions/emporio-orcamentos";
import { guardEmporio } from "@/lib/emporio/rota";
import { chaveDeOperacao, corpoDoOrcamentoSchema } from "@/lib/emporio/venda-schema";

/**
 * GET  /api/v1/emporio/quotes  ?establishment_id= &q= &situacao= &page= &per_page= (20, 40, 80, 100) &order= (desc|asc, por número) &limit= (antigo, sem page)  a lista paginada com busca; meta: total, page, per_page.
 * POST /api/v1/emporio/quotes  salva o orçamento (chave de operação): wrapper fino.
 */

const schema = corpoDoOrcamentoSchema.extend({
  /** Q309: o franqueado e o crédito dele; ausentes, "a partir deste" copia os da origem. */
  franchisee_id: z.string().nullish(),
  franchisee_credit: z
    .number({ error: "O crédito do franqueado deve ser um número." })
    .min(0, { error: "O crédito do franqueado não pode ser negativo." })
    .nullish(),
  /** Q326: o frete cobrado do cliente; ausente, a edição mantém o do orçamento e "a partir deste" copia o da origem. */
  freight_amount: z.number({ error: "O frete deve ser um número." }).min(0, { error: "O frete não pode ser negativo." }).nullish(),
  operation_key: chaveDeOperacao,
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  based_on_quote_id: z.string().nullish(),
});

const filtros = z.object({
  establishment_id: z.string().min(1).optional(),
  q: z.string().optional(),
  situacao: z
    .enum(["acompanhamento", "aberto", "vencido", "faturado", "cancelado", "todos"], {
      error: "Escolha a situação: acompanhamento, aberto, vencido, faturado, cancelado ou todos.",
    })
    .optional(),
  page: z.coerce.number({ error: "A página deve ser um número." }).int({ error: "A página deve ser um número inteiro." }).min(1, "A página começa em 1.").optional(),
  per_page: z.coerce
    .number({ error: "Escolha 20, 40, 80 ou 100 orçamentos por página." })
    .refine((n) => [20, 40, 80, 100].includes(n), { error: "Escolha 20, 40, 80 ou 100 orçamentos por página." })
    .optional(),
  order: z.enum(["asc", "desc"], { error: "Escolha a ordem: crescente (asc) ou decrescente (desc)." }).optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = filtros.safeParse({
    establishment_id: sp.get("establishment_id") ?? undefined,
    q: sp.get("q") ?? undefined,
    situacao: sp.get("situacao") ?? undefined,
    page: sp.get("page") ?? undefined,
    per_page: sp.get("per_page") ?? undefined,
    order: sp.get("order") ?? undefined,
  });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const limit = Number(sp.get("limit"));
  const res = await listarOrcamentosAction(g.db, g.user, {
    ...parsed.data,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  const { linhas, total, page, per_page } = res.data;
  return apiOk(linhas, { total, page, per_page });
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
