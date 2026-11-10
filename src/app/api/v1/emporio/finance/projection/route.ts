import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { respostaCsv } from "@/lib/csv";
import { csvDaProjecao } from "@/lib/emporio/csv-financeiro";
import { lerFluxoProjetadoAction } from "@/lib/actions/emporio-projecao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/projection  ?establishment_id= &days=30|60|90 (padrão 30)  o fluxo de caixa projetado, por semana. */

const schema = z.object({
  days: z.coerce
    .number({ error: "Escolha 30, 60 ou 90 dias." })
    .pipe(z.union([z.literal(30), z.literal(60), z.literal(90)], { error: "Escolha 30, 60 ou 90 dias." })),
  format: z.enum(["json", "csv"], { error: "Escolha json ou csv." }).optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({ days: sp.get("days") ?? 30, format: sp.get("format") ?? undefined });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const res = await lerFluxoProjetadoAction(g.db, g.user, {
    establishment_id: sp.get("establishment_id") ?? undefined,
    days: parsed.data.days,
  });
  if (parsed.data.format === "csv" && res.ok) return respostaCsv(csvDaProjecao(res.data), "projecao-de-caixa", new Date());
  return respostaDaAction(res);
}

export const GET = withApi(GETHandler);
