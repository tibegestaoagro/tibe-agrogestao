import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { criarAdquirenteAction, listarAdquirentesAction } from "@/lib/actions/emporio-cartoes";
import { diaComMensagem, guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/card-acquirers  ?incluir_arquivadas=1  as adquirentes da conta.
 * POST /api/v1/emporio/card-acquirers  { name, business_day_rule?, refunds_mdr_on_cancel?, auto_anticipation_enabled?, auto_anticipation_pct_month?, auto_anticipation_business_days?, auto_anticipation_since? }: só OWNER e gerente geral.
 */

const schema = z.object({
  name: z.string({ error: "Dê um nome à adquirente." }).trim().min(1, "Dê um nome à adquirente."),
  business_day_rule: z.enum(["proximo_dia_util", "dias_corridos"], { error: "Escolha como a adquirente conta o prazo." }).optional(),
  refunds_mdr_on_cancel: z.boolean({ error: "Informe se o cancelamento devolve a taxa." }).optional(),
  auto_anticipation_enabled: z.boolean({ error: "Informe se a antecipação automática está ligada." }).optional(),
  auto_anticipation_pct_month: z.number({ error: "Informe a taxa da antecipação automática, ao mês." }).nullable().optional(),
  auto_anticipation_business_days: z.number({ error: "Informe o prazo da antecipação automática, em dias úteis." }).optional(),
  auto_anticipation_since: diaComMensagem("Informe a data inicial da antecipação automática.").nullable().optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const v = new URL(request.url).searchParams.get("incluir_arquivadas");
  return respostaDaAction(
    await listarAdquirentesAction(g.db, g.user, { incluir_arquivadas: v === "1" || v === "true" }),
  );
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await criarAdquirenteAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
