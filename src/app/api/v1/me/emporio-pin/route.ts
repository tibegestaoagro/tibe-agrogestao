import { z } from "zod";
import { apiError, ApiErrors, apiErroDeZod } from "@/lib/api";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { definirMeuPinAction } from "@/lib/actions/emporio-autorizacao";
import { respostaDaAction } from "@/lib/emporio/rota";
import { readJson, recusaSeArquivado } from "@/lib/api-guard";
import { withApi } from "@/lib/route";

/**
 * PUT /api/v1/me/emporio-pin: o gestor define o PRÓPRIO PIN de autorização, confirmando a senha de
 * login. Só sessão, sem guard() de módulo (como a troca da própria senha): quem pode ter PIN é
 * decidido pela action, pelo papel lido do banco.
 */

const schema = z.object({
  pin: z.string({ error: "O PIN deve ter de 4 a 6 números." }).regex(/^\d{4,6}$/, "O PIN deve ter de 4 a 6 números."),
  password: z.string({ error: "Informe sua senha." }).min(1, "Informe sua senha."),
});

async function PUTHandler(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError(...ApiErrors.UNAUTHORIZED);
  const arquivado = await recusaSeArquivado(user.tenant_id);
  if (arquivado) return arquivado;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const db = await getTenantDb();
  return respostaDaAction(await definirMeuPinAction(db, { id: user.id, role: user.role }, parsed.data));
}

export const PUT = withApi(PUTHandler);
