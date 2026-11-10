import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { respostaCsv } from "@/lib/csv";
import { csvDoAReceberPorIdade } from "@/lib/emporio/csv-financeiro";
import { lerAReceberPorIdadeAction } from "@/lib/actions/emporio-relatorios-financeiro";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/reports/receivables-aging  ?establishment_id= &format=json|csv  o a receber por cliente e faixa de atraso (retrato de hoje). */

const schema = z.object({ format: z.enum(["json", "csv"], { error: "Escolha json ou csv." }).optional() });

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({ format: sp.get("format") ?? undefined });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const res = await lerAReceberPorIdadeAction(g.db, g.user, { establishment_id: sp.get("establishment_id") ?? undefined });
  if (parsed.data.format === "csv" && res.ok) return respostaCsv(csvDoAReceberPorIdade(res.data), "a-receber-por-idade", new Date());
  return respostaDaAction(res);
}

export const GET = withApi(GETHandler);
