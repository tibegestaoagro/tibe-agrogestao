import { withApi } from "@/lib/route";
import { listarHistoricoAction } from "@/lib/actions/emporio-historico";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/history
 *   ?user_id= &establishment_id= &de= &ate= &action= &cursor= &limite=
 * O Histórico do Empório (Q134), do mais novo para o mais antigo. Wrapper fino:
 * os filtros são validados na action (a mesma regra serve ao WhatsApp), que
 * recusa no campo com 422.
 */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await listarHistoricoAction(g.db, g.user, {
      user_id: sp.get("user_id"),
      establishment_id: sp.get("establishment_id"),
      de: sp.get("de"),
      ate: sp.get("ate"),
      action: sp.get("action"),
      cursor: sp.get("cursor"),
      limite: sp.get("limite"),
    }),
  );
}

export const GET = withApi(GETHandler);
