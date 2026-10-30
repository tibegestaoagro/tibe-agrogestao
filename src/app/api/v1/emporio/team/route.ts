import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { cadastrarMembroAction, listarEquipeAction } from "@/lib/actions/emporio-equipe";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET e POST /api/v1/emporio/team: wrapper fino, a regra vive na action. */

const FUNCAO = z.enum(["gerente_geral", "gestor", "vendedor"], {
  error: "Escolha a função: gerente geral, gestor ou vendedor.",
});

const cadastrarSchema = z.object({
  name: z.string({ error: "Informe o nome." }).trim().min(1, "Informe o nome."),
  email: z.string({ error: "Informe o email." }).trim().email("Informe um email válido."),
  phone: z.string().trim().nullish(),
  emporio_role: FUNCAO,
  establishment_ids: z.array(z.string(), { error: "Escolha pelo menos uma loja." }).optional(),
  emporio_keys: z.array(z.string(), { error: "As chaves precisam ser uma lista." }).optional(),
  emporio_only: z.boolean().optional(),
});

async function GETHandler() {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await listarEquipeAction(g.db, g.user));
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = cadastrarSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await cadastrarMembroAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
