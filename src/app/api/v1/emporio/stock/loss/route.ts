import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { MOTIVOS_DE_PERDA, registrarPerdaAction } from "@/lib/actions/emporio-estoque";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/stock/loss: perda ou avaria, com motivo de lista fixa. */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  emporio_product_id: z.string({ error: "Escolha o produto." }).min(1, "Escolha o produto."),
  package_state: z.enum(["lacrado", "avulso"], { error: "O estado deve ser lacrado ou avulso." }).nullish(),
  presentation_id: z.string().nullish(),
  quantity: z.number({ error: "Informe a quantidade." }),
  reason: z.enum(MOTIVOS_DE_PERDA, {
    error: "Escolha o motivo: vencido, avaria, furto, consumo próprio ou outro.",
  }),
  notes: z.string().trim().max(500).nullish(),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await registrarPerdaAction(g.db, g.user, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
