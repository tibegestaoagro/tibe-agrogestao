import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { alterarMembroAction, tirarDoEmporioAction } from "@/lib/actions/emporio-equipe";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH e DELETE /api/v1/emporio/team/:userId. DELETE tira a pessoa do Empório (não da conta). */

const alterarSchema = z.object({
  emporio_role: z
    .enum(["gerente_geral", "gestor", "vendedor"], {
      error: "Escolha a função: gerente geral, gestor ou vendedor.",
    })
    .optional(),
  establishment_ids: z.array(z.string(), { error: "Escolha pelo menos uma loja." }).optional(),
  emporio_keys: z.array(z.string(), { error: "As chaves precisam ser uma lista." }).optional(),
  emporio_only: z.boolean().optional(),
});

type Props = { params: Promise<{ userId: string }> };

async function PATCHHandler(request: Request, props: Props) {
  const { userId } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = alterarSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await alterarMembroAction(g.db, g.user, userId, parsed.data));
}

async function DELETEHandler(_request: Request, props: Props) {
  const { userId } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  return respostaDaAction(await tirarDoEmporioAction(g.db, g.user, userId));
}

export const PATCH = withApi(PATCHHandler);
export const DELETE = withApi(DELETEHandler);
