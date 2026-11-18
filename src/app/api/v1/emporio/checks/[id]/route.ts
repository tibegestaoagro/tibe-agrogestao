import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { completarChequeAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { dataIso } from "@/lib/emporio/venda-schema";

/**
 * PATCH /api/v1/emporio/checks/:id  { number?, bank?, good_for?, holder_name? }: completa ou corrige um cheque
 * recebido (Dono, Gerente geral, Financeiro e o Gestor da loja do cheque; a action confere).
 */

const schema = z.object({
  number: z.string({ error: "O número do cheque é inválido." }).nullish(),
  bank: z.string({ error: "O banco do cheque é inválido." }).nullish(),
  good_for: dataIso.nullish(),
  holder_name: z.string({ error: "O nome do titular é inválido." }).nullish(),
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

  return respostaDaAction(await completarChequeAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
