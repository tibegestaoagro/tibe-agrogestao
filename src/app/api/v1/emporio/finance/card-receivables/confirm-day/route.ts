import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { conferirDiaAction } from "@/lib/actions/emporio-conferencia-cartao";
import { diaEmTexto, guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/finance/card-receivables/confirm-day
 * { bank_account_id, acquirer_id, effective_on, received_total, establishment_id?, notes? }: confere as parcelas
 * não conferidas de uma conta, uma adquirente e uma data, repartindo a diferença entre elas (frente B, Q350).
 * Com `establishment_id`, só as parcelas daquela loja (a tela filtrada por loja confere o que mostra).
 */

const schema = z.object({
  bank_account_id: z.string({ error: "Escolha a conta." }).trim().min(1, "Escolha a conta."),
  acquirer_id: z.string({ error: "Escolha a adquirente." }).trim().min(1, "Escolha a adquirente."),
  effective_on: diaEmTexto,
  received_total: z
    .number({ error: "Informe o total que caiu, zero ou mais." })
    .min(0, "Informe o total que caiu, zero ou mais."),
  establishment_id: z.string({ error: "A loja deve ser um texto." }).trim().min(1, "Escolha a loja.").optional(),
  notes: z.string({ error: "A observação deve ser um texto." }).trim().max(500, "A observação tem até 500 caracteres.").optional(),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await conferirDiaAction(g.db, g.user, parsed.data));
}

export const POST = withApi(POSTHandler);
