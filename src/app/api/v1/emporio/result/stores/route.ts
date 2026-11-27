import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { respostaCsv } from "@/lib/csv";
import { csvDoResultadoPorLoja } from "@/lib/emporio/csv-estatisticas";
import { resultadoPorLojaAction } from "@/lib/actions/emporio-resultado";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/result/stores  ?month=AAAA-MM &establishment_id= &format=json|csv  o resultado do mês loja por loja, dentro do alcance de quem pede. */

const schema = z.object({
  format: z.enum(["json", "csv"], { error: "Escolha json ou csv." }).optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({ format: sp.get("format") ?? undefined });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const res = await resultadoPorLojaAction(g.db, g.user, {
    month: sp.get("month") ?? "",
    establishment_id: sp.get("establishment_id") ?? undefined,
  });
  if (parsed.data.format === "csv" && res.ok) return respostaCsv(csvDoResultadoPorLoja(res.data), "resultado-por-loja", new Date());
  return respostaDaAction(res);
}

export const GET = withApi(GETHandler);
