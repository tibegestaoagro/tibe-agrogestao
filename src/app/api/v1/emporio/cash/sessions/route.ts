import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { abrirTurnoAction, listarTurnosAction } from "@/lib/actions/emporio-turno";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { chaveDeOperacao } from "@/lib/emporio/venda-schema";

/**
 * GET  /api/v1/emporio/cash/sessions  ?establishment_id= &status=open|closed  os turnos das lojas visíveis.
 * POST /api/v1/emporio/cash/sessions  abre o turno de um caixa com o troco contado (e o reforço da gerência).
 */

const schema = z.object({
  operation_key: chaveDeOperacao,
  cash_register_id: z.string({ error: "Escolha o caixa." }).min(1, "Escolha o caixa."),
  counted: z.number({ error: "Informe quanto há na gaveta." }),
  justification: z.string().nullish(),
  reinforcement: z.number({ error: "Informe o reforço do troco." }).nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await listarTurnosAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      status: sp.get("status") ?? undefined,
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

  const res = await abrirTurnoAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  // Chave repetida: o turno já aberto, 200, sem escrever nada.
  const { replayed, ...turno } = res.data;
  return apiOk(turno, {}, replayed ? undefined : { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
