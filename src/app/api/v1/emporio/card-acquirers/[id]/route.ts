import { z } from "zod";
import { apiErroDeZod, apiError } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarAdquirenteAction } from "@/lib/actions/emporio-cartoes";
import { diaComMensagem, guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * PATCH /api/v1/emporio/card-acquirers/:id  { name?, archived?, business_day_rule?, refunds_mdr_on_cancel?,
 * auto_anticipation_enabled?, auto_anticipation_pct_month?, auto_anticipation_business_days?, auto_anticipation_since? }:
 * só OWNER e gerente geral. Nome, configuração e arquivamento valem numa transação só.
 */

const schema = z.object({
  name: z.string({ error: "Dê um nome à adquirente." }).trim().min(1, "Dê um nome à adquirente.").optional(),
  archived: z.boolean({ error: "Informe se a adquirente fica arquivada." }).optional(),
  business_day_rule: z.enum(["proximo_dia_util", "dias_corridos"], { error: "Escolha como a adquirente conta o prazo." }).optional(),
  refunds_mdr_on_cancel: z.boolean({ error: "Informe se o cancelamento devolve a taxa." }).optional(),
  auto_anticipation_enabled: z.boolean({ error: "Informe se a antecipação automática está ligada." }).optional(),
  auto_anticipation_pct_month: z.number({ error: "Informe a taxa da antecipação automática, ao mês." }).nullable().optional(),
  auto_anticipation_business_days: z.number({ error: "Informe o prazo da antecipação automática, em dias úteis." }).optional(),
  auto_anticipation_since: diaComMensagem("Informe a data inicial da antecipação automática.").nullable().optional(),
});

type Props = { params: Promise<{ id: string }> };

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  if (Object.values(parsed.data).every((v) => v === undefined)) {
    return apiError("VALIDATION_ERROR", "Informe o que mudar.", 422);
  }

  return respostaDaAction(await editarAdquirenteAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
