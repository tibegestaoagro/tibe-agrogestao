import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { pagarFranqueadoAction } from "@/lib/actions/emporio-franqueados";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/franchisees/:id/payments: paga parte ou todo o crédito do franqueado, saindo da
 * gaveta do turno aberto ou de uma conta (`paid_from`). Repetir `operation_key` devolve o mesmo pagamento.
 */

const schema = z.object({
  operation_key: z.string({ error: "Falta a chave da operação." }).trim().min(1, "Falta a chave da operação.").max(200),
  amount: z.number({ error: "Informe o valor do pagamento." }).positive("O valor do pagamento deve ser maior que zero."),
  paid_at: z.coerce.date({ error: "Informe uma data de pagamento válida." }).optional(),
  paid_from: z.object(
    {
      establishment_id: z.string().nullish(),
      bank_account_id: z.string().nullish(),
      cash_register_id: z.string().nullish(),
    },
    { error: "Diga de onde saiu o dinheiro: a gaveta da loja ou uma conta." },
  ),
  notes: z.string().trim().max(1000).nullish(),
});

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await pagarFranqueadoAction(g.db, g.user, id, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
