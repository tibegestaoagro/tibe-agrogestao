import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { enviarTransferenciaAction, listarTransferenciasAction } from "@/lib/actions/emporio-transferencias";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/transfers  ?establishment_id= &status=em_transito|recebida|cancelada
 * POST /api/v1/emporio/transfers  envia a transferência (chave de operação): wrapper fino.
 */

const itemSchema = z.object({
  emporio_product_id: z.string({ error: "Escolha o produto." }).min(1, "Escolha o produto."),
  presentation_id: z.string().nullish(),
  packages: z.number({ error: "Informe as embalagens." }).nullish(),
  quantity: z.number({ error: "Informe a quantidade." }).nullish(),
});

const criarSchema = z.object({
  operation_key: z.string({ error: "Falta a chave da operação." }).trim().min(1, "Falta a chave da operação."),
  origin_establishment_id: z
    .string({ error: "Escolha a loja de origem." })
    .min(1, "Escolha a loja de origem."),
  destination_establishment_id: z
    .string({ error: "Escolha a loja de destino." })
    .min(1, "Escolha a loja de destino."),
  items: z.array(itemSchema, { error: "Inclua ao menos um item." }),
  notes: z.string().nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  return respostaDaAction(
    await listarTransferenciasAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      status: status === "em_transito" || status === "recebida" || status === "cancelada" ? status : undefined,
    }),
  );
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = criarSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const res = await enviarTransferenciaAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  // Chave repetida: a transferência já gravada, 200, sem escrever nada.
  const { replayed, ...transferencia } = res.data;
  return apiOk(transferencia, {}, replayed ? undefined : { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
