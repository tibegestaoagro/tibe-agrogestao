import { z } from "zod";
import { apiError, apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { anteciparAction, listarAntecipacoesAction } from "@/lib/actions/emporio-antecipacao";
import { diaComMensagem, diaIso, guardEmporio, paginaSchema, respostaDaAction, respostaPaginada } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/card-anticipations  ?de=AAAA-MM-DD&ate=AAAA-MM-DD&establishment_id= &page= &per_page= (20, 40, 80, 100) &order= (desc|asc)  as antecipações de cartão; meta: total, page, per_page.
 * O cursor antigo (before + before_id, só decrescente) segue valendo e, sem page, mantém o corte em 200.
 * POST /api/v1/emporio/card-anticipations  { receivable_ids, operated_on, received_net, notes? }: antecipa parcelas
 * (pontual); só quem gere a loja das parcelas ou cuida do dinheiro.
 */

const schema = z.object({
  receivable_ids: z.array(z.string({ error: "Escolha as parcelas para antecipar." }), { error: "Escolha as parcelas para antecipar." }),
  operated_on: diaComMensagem("Informe a data da operação."),
  received_net: z.number({ error: "Informe o valor que a adquirente pagou." }),
  notes: z.string({ error: "A observação deve ser um texto." }).nullish(),
});

const querySchema = z.object({
  de: diaIso("de").optional(),
  ate: diaIso("ate").optional(),
  before: diaIso("before").optional(),
  before_id: z.string({ error: "Informe o id do cursor." }).min(1).optional(),
}).merge(paginaSchema("antecipações"));

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const q = querySchema.safeParse({
    de: sp.get("de") ?? undefined,
    ate: sp.get("ate") ?? undefined,
    before: sp.get("before") ?? undefined,
    before_id: sp.get("before_id") ?? undefined,
    page: sp.get("page") ?? undefined,
    per_page: sp.get("per_page") ?? undefined,
    order: sp.get("order") ?? undefined,
  });
  if (!q.success) return apiErroDeZod(q.error);
  if ((q.data.before === undefined) !== (q.data.before_id === undefined)) {
    return apiError(
      "VALIDATION_ERROR",
      "O cursor leva before (AAAA-MM-DD) e before_id juntos.",
      422,
      q.data.before !== undefined ? "before_id" : "before",
    );
  }
  return respostaPaginada(
    await listarAntecipacoesAction(g.db, g.user, {
      page: q.data.page,
      per_page: q.data.per_page,
      order: q.data.order,
      de: q.data.de,
      ate: q.data.ate,
      before: q.data.before && q.data.before_id ? { operated_on: q.data.before, id: q.data.before_id } : undefined,
      establishment_id: sp.get("establishment_id") ?? undefined,
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

  return respostaDaAction(await anteciparAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
