import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { definirPrecoAction } from "@/lib/actions/emporio-catalogo";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PUT /api/v1/emporio/prices: upsert do preço de uma apresentação numa loja; null limpa. */

const pct = z.number().min(0, "Use um valor entre 0 e 1000.").max(1000, "Use um valor entre 0 e 1000.");

const schema = z.object({
  establishment_id: z.string({ error: "Informe o estabelecimento." }).min(1, "Informe o estabelecimento."),
  presentation_id: z.string({ error: "Informe a apresentação." }).min(1, "Informe a apresentação."),
  price: z.number().min(0, "O preço não pode ser negativo.").nullish(),
  expense_pct: pct.nullish(),
  profit_pct: pct.nullish(),
});

async function PUTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await definirPrecoAction(g.db, g.user, parsed.data));
}

export const PUT = withApi(PUTHandler);
