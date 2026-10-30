import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import {
  criarEstabelecimentoAction,
  listarEstabelecimentosAction,
} from "@/lib/actions/emporio-catalogo";
import { guardEmporio, incluirArquivados, respostaDaAction } from "@/lib/emporio/rota";

/** GET e POST /api/v1/emporio/establishments: wrapper fino, a regra vive na action. */

const pct = z.number().min(0, "Use um valor entre 0 e 1000.").max(1000, "Use um valor entre 0 e 1000.");

const criarSchema = z.object({
  name: z.string({ error: "Informe o nome do estabelecimento." }).trim().min(1, "Informe o nome do estabelecimento."),
  address: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(120).nullish(),
  responsible_user_id: z.string().nullish(),
  allow_negative_stock: z.boolean().optional(),
  max_discount_pct: z.number().min(0, "Use um valor entre 0 e 100.").max(100, "Use um valor entre 0 e 100.").nullish(),
  default_expense_pct: pct.nullish(),
  default_profit_pct: pct.nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(
    await listarEstabelecimentosAction(g.db, g.user, { incluir_arquivados: incluirArquivados(request) }),
  );
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = criarSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await criarEstabelecimentoAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
