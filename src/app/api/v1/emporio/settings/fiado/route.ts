import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { salvarConfiguracoesDoFiadoAction } from "@/lib/actions/emporio-configuracoes";
import { LIMITE_MAXIMO_DE_FIADO } from "@/lib/emporio/fiado";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/settings/fiado: wrapper fino, a regra vive na action. */

const schema = z.object({
  fiado_due_days: z.number({ error: "O prazo padrão deve ser de 1 a 365 dias." }).optional(),
  fiado_block_after_days: z.number({ error: "O bloqueio deve ser de 1 a 365 dias de atraso." }).optional(),
  fiado_default_limit: z
    .number({ error: "O limite padrão deve ser de zero a R$ 99.999.999,99." })
    .min(0, "O limite padrão deve ser de zero a R$ 99.999.999,99.")
    .max(LIMITE_MAXIMO_DE_FIADO, "O limite padrão deve ser de zero a R$ 99.999.999,99.")
    .nullish(),
  fiado_collection_message: z.string({ error: "A mensagem de cobrança aceita até 500 caracteres." }).nullish(),
});

async function PATCHHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await salvarConfiguracoesDoFiadoAction(g.db, g.user, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
