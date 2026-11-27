import { z } from "zod";
import { apiError, apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { respostaCsv } from "@/lib/csv";
import { csvDosParados, csvDosVendedores } from "@/lib/emporio/csv-estatisticas";
import { relatorioDeVendasAction } from "@/lib/actions/emporio-relatorios";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/reports/sales  ?from=AAAA-MM-DD &to=AAAA-MM-DD &establishment_id= &format=json|csv &relatorio=vendedores|parados
 * O relatório de vendas: Gestor da loja, Gerente geral e Dono. `format=csv` pede a planilha de um dos dois recortes.
 */

const schema = z.object({
  format: z.enum(["json", "csv"], { error: "Escolha json ou csv." }).optional(),
  relatorio: z.enum(["vendedores", "parados"], { error: "Escolha o relatório: vendedores ou parados." }).optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({ format: sp.get("format") ?? undefined, relatorio: sp.get("relatorio") ?? undefined });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const { format, relatorio } = parsed.data;
  if (format === "csv" && !relatorio) {
    return apiError("VALIDATION_ERROR", "Escolha o relatório da planilha: vendedores ou parados.", 422, "relatorio");
  }
  const res = await relatorioDeVendasAction(g.db, g.user, {
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    establishment_id: sp.get("establishment_id") ?? undefined,
  });
  if (format === "csv" && res.ok) {
    return relatorio === "vendedores"
      ? respostaCsv(csvDosVendedores(res.data), "vendas-por-vendedor", new Date())
      : respostaCsv(csvDosParados(res.data), "produtos-parados", new Date());
  }
  return respostaDaAction(res);
}

export const GET = withApi(GETHandler);
