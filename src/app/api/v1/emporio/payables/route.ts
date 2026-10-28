import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { listarContasAPagarAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { dataIso } from "@/lib/emporio/venda-schema";

/** GET /api/v1/emporio/payables  ?establishment_id= &status=pending|paid|cancelled|all &de= &ate= (vencimento) &limit=  as contas a pagar do "Vendeu, Pagou" e das despesas fixas: só OWNER e ADMIN. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const de = sp.get("de") ? dataIso.safeParse(sp.get("de")) : null;
  const ate = sp.get("ate") ? dataIso.safeParse(sp.get("ate")) : null;
  if ((de && !de.success) || (ate && !ate.success)) {
    return apiErroDeZod((de && !de.success ? de : (ate as { error: z.ZodError })).error);
  }
  const limit = Number(sp.get("limit"));
  return respostaDaAction(
    await listarContasAPagarAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      status: status === "pending" || status === "paid" || status === "cancelled" || status === "all" ? status : undefined,
      de: de?.success ? de.data : undefined,
      ate: ate?.success ? ate.data : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
