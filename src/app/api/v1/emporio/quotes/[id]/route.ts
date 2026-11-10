import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarOrcamentoAction, lerOrcamentoAction } from "@/lib/actions/emporio-orcamentos";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { corpoDoOrcamentoSchema } from "@/lib/emporio/venda-schema";

/**
 * GET   /api/v1/emporio/quotes/:id  o orçamento com itens, preço de hoje, saldo e situação.
 * PATCH /api/v1/emporio/quotes/:id  edita o orçamento aberto ou vencido (Q285): wrapper fino.
 */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerOrcamentoAction(g.db, g.user, id));
}

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = corpoDoOrcamentoSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await editarOrcamentoAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
