import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { listarProducoesAction, produzirAction } from "@/lib/actions/emporio-producao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/production  ?establishment_id= &emporio_product_id= &status=ativa|cancelada
 * POST /api/v1/emporio/production  registra a produção na loja (chave de operação, Q70): wrapper fino.
 */

const schema = z.object({
  operation_key: z.string({ error: "Falta a chave da operação." }).trim().min(1, "Falta a chave da operação."),
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  emporio_product_id: z.string({ error: "Escolha o produto." }).min(1, "Escolha o produto."),
  produced_qty: z.number({ error: "Informe a quantidade produzida." }),
  sealed: z
    .array(
      z.object({
        presentation_id: z.string({ error: "Escolha a apresentação." }).min(1, "Escolha a apresentação."),
        packages: z.number({ error: "Informe quantas embalagens." }),
      }),
    )
    .nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  return respostaDaAction(
    await listarProducoesAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      emporio_product_id: sp.get("emporio_product_id") ?? undefined,
      status: status === "ativa" || status === "cancelada" ? status : undefined,
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

  const res = await produzirAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  // Chave repetida: a produção já gravada, 200, sem escrever nada.
  const { replayed, ...producao } = res.data;
  return apiOk(producao, {}, replayed ? undefined : { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
