import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { FAIXAS_DE_COBRANCA, listarCobrancaAction } from "@/lib/actions/emporio-credito";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/finance/collections  ?establishment_id= &faixa=1-15|16-30|31-60|60+
 * A lista de cobrança do fiado vencido, com a mensagem e o link do WhatsApp: só o Financeiro, o Gerente geral e o Dono.
 */

const query = z.object({
  establishment_id: z.string().min(1).optional(),
  faixa: z.enum(FAIXAS_DE_COBRANCA, { error: "Escolha uma faixa de atraso válida." }).optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = query.safeParse({
    establishment_id: sp.get("establishment_id") ?? undefined,
    faixa: sp.get("faixa") ?? undefined,
  });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(await listarCobrancaAction(g.db, g.user, parsed.data));
}

export const GET = withApi(GETHandler);
