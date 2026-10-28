import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { listarVendasAction, venderAction } from "@/lib/actions/emporio-vendas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { chaveDeOperacao, corpoDaVendaSchema, dataIso } from "@/lib/emporio/venda-schema";

/**
 * GET  /api/v1/emporio/sales  ?establishment_id= &contact_id= &status=concluida|cancelada &de= &ate= &limit=
 * POST /api/v1/emporio/sales  registra a venda (chave de operação): wrapper fino.
 */

const schema = corpoDaVendaSchema.extend({
  operation_key: chaveDeOperacao,
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const de = sp.get("de") ? dataIso.safeParse(sp.get("de")) : null;
  const ate = sp.get("ate") ? dataIso.safeParse(sp.get("ate")) : null;
  if ((de && !de.success) || (ate && !ate.success)) return apiErroDeZod((de && !de.success ? de : (ate as { error: z.ZodError })).error);
  const limit = Number(sp.get("limit"));
  return respostaDaAction(
    await listarVendasAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      contact_id: sp.get("contact_id") ?? undefined,
      status: status === "concluida" || status === "cancelada" ? status : undefined,
      de: de?.success ? de.data : undefined,
      ate: ate?.success ? ate.data : undefined,
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

  const res = await venderAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  // Chave repetida: a venda já gravada, 200, sem escrever nada.
  const { replayed, ...venda } = res.data;
  return apiOk(venda, {}, replayed ? undefined : { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
