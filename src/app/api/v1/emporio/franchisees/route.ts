import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { cadastrarFranqueadoAction, listarFranqueadosAction } from "@/lib/actions/emporio-franqueados";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/franchisees?q=&include_archived=1: os franqueados da conta, com o saldo de crédito.
 * POST /api/v1/emporio/franchisees: cadastro curto (nome e telefone). A regra vive na action.
 */

const schema = z.object({
  name: z.string({ error: "Informe o nome do franqueado." }).trim().min(1, "Informe o nome do franqueado.").max(200),
  phone: z.string({ error: "Informe o telefone do franqueado." }).trim().min(1, "Informe o telefone do franqueado.").max(40),
  document: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const p = new URL(request.url).searchParams;
  const arquivados = p.get("include_archived") === "1" || p.get("include_archived") === "true";
  return respostaDaAction(await listarFranqueadosAction(g.db, g.user, { q: p.get("q") ?? undefined, arquivados }));
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await cadastrarFranqueadoAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
