import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { respostaCsv } from "@/lib/csv";
import { csvDoAPagarPorVencimento } from "@/lib/emporio/csv-financeiro";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { lerAPagarPorVencimentoAction } from "@/lib/actions/emporio-relatorios-financeiro";
import { diaIso, guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/reports/payables-by-due  ?establishment_id= &de= &ate= (AAAA-MM-DD; padrão: de hoje a hoje + 30)  o a pagar por semana e por nome. */

const DIA_MS = 86_400_000;

const schema = z.object({
  de: diaIso("de"),
  ate: diaIso("ate"),
  format: z.enum(["json", "csv"], { error: "Escolha json ou csv." }).optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const hoje = hojeEmBrasilia();
  const parsed = schema.safeParse({
    de: sp.get("de") ?? hoje.toISOString().slice(0, 10),
    ate: sp.get("ate") ?? new Date(hoje.getTime() + 30 * DIA_MS).toISOString().slice(0, 10),
    format: sp.get("format") ?? undefined,
  });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const res = await lerAPagarPorVencimentoAction(g.db, g.user, {
    establishment_id: sp.get("establishment_id") ?? undefined,
    de: parsed.data.de,
    ate: parsed.data.ate,
  });
  if (parsed.data.format === "csv" && res.ok) return respostaCsv(csvDoAPagarPorVencimento(res.data), "a-pagar-por-vencimento", new Date());
  return respostaDaAction(res);
}

export const GET = withApi(GETHandler);
