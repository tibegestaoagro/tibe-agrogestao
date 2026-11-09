import { z } from "zod";
import { BANDEIRAS } from "@/lib/emporio/cartao";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarTaxaAction, removerTaxaAction } from "@/lib/actions/emporio-cartoes";
import { diaComMensagem, guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
const BRANDS_COM_CORINGA = [...BANDEIRAS, "qualquer"] as const;

/**
 * PATCH /api/v1/emporio/card-fee-rates/:id  edita uma linha que nenhuma venda usou (em uso: 409 `RATE_IN_USE`).
 * DELETE /api/v1/emporio/card-fee-rates/:id  ?encerrar=1  remove; em uso, só encerra (vale até ontem).
 */


const schema = z.object({
  brand: z.enum(BRANDS_COM_CORINGA, { error: "Escolha a bandeira." }).optional(),
  kind: z.string({ error: "Escolha a modalidade do cartão." }).min(1, "Escolha a modalidade do cartão.").optional(),
  installments_from: z.number({ error: "Informe a primeira parcela da faixa." }).optional(),
  installments_to: z.number({ error: "Informe a última parcela da faixa." }).optional(),
  fee_pct: z.number({ error: "Informe a taxa em porcentagem." }).optional(),
  fee_fixed: z.number({ error: "Informe o valor fixo em reais." }).optional(),
  days: z.number({ error: "Informe o prazo em dias." }).optional(),
  bank_account_id: z.string({ error: "Escolha a conta que recebe o cartão." }).min(1, "Escolha a conta que recebe o cartão.").optional(),
  valid_from: diaComMensagem("Informe a data em que a taxa começa a valer.").optional(),
  valid_to: diaComMensagem("Informe a data em que a taxa deixa de valer.").nullish(),
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

  return respostaDaAction(await editarTaxaAction(g.db, g.user, id, parsed.data));
}

async function DELETEHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  const enc = new URL(request.url).searchParams.get("encerrar");
  return respostaDaAction(await removerTaxaAction(g.db, g.user, id, { encerrar: enc === "1" || enc === "true" }));
}

export const PATCH = withApi(PATCHHandler);
export const DELETE = withApi(DELETEHandler);
