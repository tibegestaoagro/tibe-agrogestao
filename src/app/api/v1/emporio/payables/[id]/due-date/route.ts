import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { adiarVencimentoContaAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { dataIso } from "@/lib/emporio/venda-schema";

/** PATCH /api/v1/emporio/payables/:id/due-date  { due_date }  adia o vencimento de uma conta pendente: Financeiro, Gerente geral e Dono (o Gestor da loja recebe 403). */

const schema = z.object({
  due_date: dataIso,
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

  return respostaDaAction(await adiarVencimentoContaAction(g.db, g.user, { entry_id: id, due_date: parsed.data.due_date }));
}

export const PATCH = withApi(PATCHHandler);
