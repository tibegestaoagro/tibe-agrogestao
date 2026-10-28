import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { transferirCaixaAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio } from "@/lib/emporio/rota";
import { chaveDeOperacao } from "@/lib/emporio/venda-schema";

/** POST /api/v1/emporio/cash/transfers  dinheiro mudando de caixa (gaveta ou conta), sem tocar no Financeiro. */

const ponta = (campo: string) =>
  z.object(
    {
      establishment_id: z.string().nullish(),
      bank_account_id: z.string().nullish(),
    },
    { error: campo },
  );

const schema = z.object({
  operation_key: chaveDeOperacao,
  from: ponta("Diga de onde sai o dinheiro."),
  to: ponta("Diga para onde vai o dinheiro."),
  amount: z.number({ error: "Informe o valor da transferência." }),
  notes: z.string().nullish(),
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const res = await transferirCaixaAction(g.db, g.user, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  // Chave repetida: a transferência já gravada, 200, sem escrever nada.
  const { replayed, ...transferencia } = res.data;
  return apiOk(transferencia, {}, replayed ? undefined : { status: 201 });
}

export const POST = withApi(POSTHandler);
