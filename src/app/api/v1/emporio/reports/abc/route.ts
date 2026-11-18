import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { curvaAbcAction } from "@/lib/actions/emporio-relatorios";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/reports/abc  ?from= &to= &establishment_id= &kind=products|customers &measure=revenue|profit
 * A curva ABC de produtos ou de clientes: mesmo guard do relatório de vendas; `measure=profit` exige a permissão do Resultado.
 */

const filtros = z.object({
  kind: z.enum(["products", "customers"], { error: "Escolha a curva: products ou customers." }),
  measure: z.enum(["revenue", "profit"], { error: "Escolha a medida: revenue ou profit." }),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = filtros.safeParse({ kind: sp.get("kind") ?? undefined, measure: sp.get("measure") ?? undefined });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(
    await curvaAbcAction(g.db, g.user, {
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
      establishment_id: sp.get("establishment_id") ?? undefined,
      ...parsed.data,
    }),
  );
}

export const GET = withApi(GETHandler);
