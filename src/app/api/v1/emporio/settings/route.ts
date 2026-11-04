import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { lerConfiguracoesAction, salvarConfiguracoesAction } from "@/lib/actions/emporio-configuracoes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET e PATCH /api/v1/emporio/settings: wrapper fino, a regra vive na action. */

const editarSchema = z.object({
  quote_validity_days: z.number({ error: "A validade deve ser de 1 a 365 dias." }).optional(),
  quote_footer: z.string({ error: "O rodapé aceita até 500 caracteres." }).nullish(),
  sale_footer: z.string({ error: "O rodapé aceita até 500 caracteres." }).nullish(),
  receipt_width: z.number({ error: "Escolha a largura da bobina: 80 ou 58 mm." }).optional(),
});

async function GETHandler() {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerConfiguracoesAction(g.db, g.user));
}

async function PATCHHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = editarSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await salvarConfiguracoesAction(g.db, g.user, parsed.data));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
