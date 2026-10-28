import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { criarContaAction, listarContasAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, incluirArquivados, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/bank-accounts  ?incluir_arquivados=1  só OWNER e ADMIN
 * POST /api/v1/emporio/bank-accounts  cadastra a conta: wrapper fino.
 */

const schema = z.object({
  name: z.string({ error: "Dê um nome à conta." }).trim().min(1, "Dê um nome à conta."),
  bank: z.string().nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await listarContasAction(g.db, g.user, { incluir_arquivadas: incluirArquivados(request) }));
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const res = await criarContaAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
