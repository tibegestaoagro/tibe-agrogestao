import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import {
  EMPORIO_BASE_UNITS,
  criarProdutoEmporioAction,
  listarProdutosEmporioAction,
} from "@/lib/actions/emporio-catalogo";
import { guardEmporio, incluirArquivados, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET e POST /api/v1/emporio/products. O POST aceita `{ product_id, base_unit }`
 * (usar produto da fazenda) ou `{ name, category_id, base_unit, brand? }`.
 */

const schema = z.object({
  product_id: z.string().optional(),
  name: z.string().trim().optional(),
  category_id: z.string().optional(),
  brand: z.string().trim().max(120).nullish(),
  base_unit: z.enum(EMPORIO_BASE_UNITS, { error: "Escolha a unidade-base: quilograma, litro ou unidade." }),
  reference_cost: z.number().min(0, "O custo não pode ser negativo.").nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(
    await listarProdutosEmporioAction(g.db, g.user, { incluir_arquivados: incluirArquivados(request) }),
  );
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await criarProdutoEmporioAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
