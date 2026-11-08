import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { salvarAlcadaAction } from "@/lib/actions/emporio-configuracoes";
import { LIMITE_MAXIMO_DE_FIADO } from "@/lib/emporio/fiado";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/settings/approval  { payment_approval_limit: number | null }: o teto sem aprovação (só Dono e Gerente geral). */

const MENSAGEM = "O teto deve ser de R$ 0,01 a R$ 99.999.999,99, ou vazio para não ter teto.";

const schema = z.object({
  payment_approval_limit: z
    .number({ error: MENSAGEM })
    .min(0.01, MENSAGEM)
    .max(LIMITE_MAXIMO_DE_FIADO, MENSAGEM)
    .nullable(),
});

async function PATCHHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await salvarAlcadaAction(g.db, g.user, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
