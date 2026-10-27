import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { PAYMENT_KINDS, criarCompraAction, listarComprasAction } from "@/lib/actions/emporio-compras";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/purchases  ?establishment_id= &status=pendente|recebida|cancelada &contact_id=
 * POST /api/v1/emporio/purchases  cria a compra (chave de operação, Q70): wrapper fino.
 */

const data = z
  .string({ error: "Informe uma data válida." })
  .refine((v) => !Number.isNaN(Date.parse(v)), "Informe uma data válida.")
  .transform((v) => new Date(v));

const itemSchema = z.object({
  emporio_product_id: z.string({ error: "Escolha o produto." }).min(1, "Escolha o produto."),
  presentation_id: z.string().nullish(),
  quantity: z.number({ error: "Informe a quantidade." }),
  item_total: z.number({ error: "Informe o valor do item." }),
});

const criarSchema = z.object({
  operation_key: z.string({ error: "Falta a chave da operação." }).trim().min(1, "Falta a chave da operação."),
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  contact_id: z.string().nullish(),
  purchased_at: data,
  received: z.boolean({ error: "Informe se a mercadoria já chegou." }),
  freight: z.number().nullish(),
  items: z.array(itemSchema, { error: "Inclua ao menos um item." }),
  payment: z.object(
    {
      kind: z.enum(PAYMENT_KINDS, { error: "Escolha como a compra foi paga." }),
      due_date: data.nullish(),
      down_payment: z.number().nullish(),
      installments: z.array(z.object({ amount: z.number(), due_date: data })).nullish(),
    },
    { error: "Informe o pagamento." },
  ),
  notes: z.string().nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  return respostaDaAction(
    await listarComprasAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      contact_id: sp.get("contact_id") ?? undefined,
      status: status === "pendente" || status === "recebida" || status === "cancelada" ? status : undefined,
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

  const res = await criarCompraAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  // Chave repetida: a compra já gravada, 200, sem escrever nada.
  const { replayed, ...compra } = res.data;
  return apiOk(compra, {}, replayed ? undefined : { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
