import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { cadastrarClienteAction, listarClientesAction } from "@/lib/actions/emporio-clientes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/customers: cadastra o cliente do Empório (PF ou PJ), na tabela própria
 * do Empório, fora de Contatos. A regra (formato e obrigatórios por tipo) vive na action.
 */

const texto = z.string().trim().max(200).nullish();

const schema = z.object({
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).nullish(),
  city: z.string().trim().max(120).nullish(),
  person_kind: z.enum(["pf", "pj"]).nullish(),
  document: texto,
  state_registration: texto,
  birth_date: texto,
  responsible_name: texto,
  address_zip: texto,
  address_street: texto,
  address_number: texto,
  address_complement: texto,
  address_district: texto,
  address_state: texto,
  delivery_zip: texto,
  delivery_street: texto,
  delivery_number: texto,
  delivery_complement: texto,
  delivery_district: texto,
  delivery_city: texto,
  delivery_state: texto,
  notes: z.string().trim().max(1000).nullish(),
});

/** GET /api/v1/emporio/customers?q=&archived=1&page=&per_page=: a lista, com `meta.total`. */
async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;

  const p = new URL(request.url).searchParams;
  const arquivados = p.get("archived") === "1" || p.get("archived") === "true";
  const res = await listarClientesAction(g.db, g.user, {
    q: p.get("q") ?? undefined,
    arquivados,
    pagina: Number(p.get("page")) || undefined,
    por_pagina: Number(p.get("per_page")) || undefined,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  const { itens, total, pagina, por_pagina } = res.data;
  return apiOk(itens, { total, page: pagina, per_page: por_pagina });
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await cadastrarClienteAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
