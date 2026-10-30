import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarProdutoEmporioAction, lerProdutoEmporioAction } from "@/lib/actions/emporio-catalogo";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET e PATCH /api/v1/emporio/products/:id (id do EmporioProduct). */

const pct = z.number().min(0, "Use um valor entre 0 e 1000.").max(1000, "Use um valor entre 0 e 1000.");

const editarSchema = z.object({
  brand: z.string().nullish(),
  manufacturer: z.string().nullish(),
  internal_code: z.string().nullish(),
  species: z.array(z.string(), { error: "Escolha as espécies da lista." }).optional(),
  // Fixos depois de criado: passam pelo schema para a action recusar no campo, com a explicação.
  content_qty: z.number({ error: "O conteúdo deve ser um número." }).nullish(),
  content_unit: z.string().nullish(),
  reference_cost: z.number().min(0, "O custo não pode ser negativo.").nullish(),
  track_sealed: z.boolean({ error: "Informe sim, não ou automático." }).nullish(),
  track_lot: z.boolean().optional(),
  track_expiry: z.boolean().optional(),
  expense_pct: pct.nullish(),
  profit_pct: pct.nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerProdutoEmporioAction(g.db, g.user, id));
}

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = editarSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await editarProdutoEmporioAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
