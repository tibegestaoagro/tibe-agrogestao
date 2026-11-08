import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { carimbarLinhaAction, descarimbarLinhaAction } from "@/lib/actions/emporio-financeiro";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST   /api/v1/emporio/finance/statement/reconcile  { kind: "movimento"|"cartao", id }: carimba a linha do extrato da conta.
 * DELETE /api/v1/emporio/finance/statement/reconcile  { kind, id }: tira o carimbo.
 */

const schema = z.object({
  kind: z.enum(["movimento", "cartao"], { error: "Escolha o tipo da linha: movimento ou cartão." }),
  id: z.string({ error: "Escolha a linha." }).trim().min(1, "Escolha a linha."),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(await carimbarLinhaAction(g.db, g.user, parsed.data));
}

async function DELETEHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(await descarimbarLinhaAction(g.db, g.user, parsed.data));
}

export const POST = withApi(POSTHandler);
export const DELETE = withApi(DELETEHandler);
