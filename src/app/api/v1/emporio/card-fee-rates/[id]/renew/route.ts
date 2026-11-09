import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { novaVigenciaAction } from "@/lib/actions/emporio-cartoes";
import { diaComMensagem, guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/card-fee-rates/:id/renew  { valid_from, ...o que muda }: encerra a linha na véspera e cria a nova. */

const schema = z.object({
  valid_from: diaComMensagem("Informe a data em que a nova taxa começa a valer."),
  fee_pct: z.number({ error: "Informe a taxa em porcentagem." }).optional(),
  fee_fixed: z.number({ error: "Informe o valor fixo em reais." }).optional(),
  days: z.number({ error: "Informe o prazo em dias." }).optional(),
  bank_account_id: z.string({ error: "Escolha a conta que recebe o cartão." }).min(1, "Escolha a conta que recebe o cartão.").optional(),
  installments_from: z.number({ error: "Informe a primeira parcela da faixa." }).optional(),
  installments_to: z.number({ error: "Informe a última parcela da faixa." }).optional(),
});

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await novaVigenciaAction(g.db, g.user, id, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
