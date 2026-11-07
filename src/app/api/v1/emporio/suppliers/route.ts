import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { cadastrarFornecedorAction, listarFornecedoresAction } from "@/lib/actions/emporio-fornecedores";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/suppliers?q=&archived=1&page=&per_page=: a lista de fornecedores do Empório.
 * POST /api/v1/emporio/suppliers: cadastra o de fora (só o nome é obrigatório) ou o de propriedade
 * (`kind: "propriedade"` com `property_id`). A regra vive na action.
 */

const texto = z.string().trim().max(200).nullish();

const schema = z.object({
  kind: z.enum(["propriedade", "externo"]).optional(),
  property_id: z.string().nullish(),
  name: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(40).nullish(),
  city: z.string().trim().max(120).nullish(),
  person_kind: z.enum(["pf", "pj"]).nullish(),
  document: texto,
  state_registration: texto,
  address_zip: texto,
  address_street: texto,
  address_number: texto,
  address_complement: texto,
  address_district: texto,
  address_state: texto,
  notes: z.string().trim().max(1000).nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;

  const p = new URL(request.url).searchParams;
  const res = await listarFornecedoresAction(g.db, g.user, {
    q: p.get("q") ?? undefined,
    arquivados: p.get("archived") === "1" || p.get("archived") === "true",
    pagina: Number(p.get("page")) || undefined,
    por_pagina: Number(p.get("per_page")) || undefined,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  const { itens, total, pagina, por_pagina, poucos_digitos } = res.data;
  return apiOk(itens, { total, page: pagina, per_page: por_pagina, poucos_digitos });
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await cadastrarFornecedorAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
