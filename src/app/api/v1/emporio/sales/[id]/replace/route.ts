import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarVendaAction } from "@/lib/actions/emporio-vendas";
import { guardEmporio } from "@/lib/emporio/rota";
import { chaveDeOperacao, corpoDaVendaSchema } from "@/lib/emporio/venda-schema";

/**
 * POST /api/v1/emporio/sales/:id/replace  { operation_key, ...corpo da venda, reason? }
 * Editar a venda (Q249): cancela a antiga e registra a nova numa transação só. Só OWNER e ADMIN.
 */

const schema = corpoDaVendaSchema.extend({
  /** Q301, Q305: o franqueado e o crédito dele; ausentes, a venda nova herda os da antiga. */
  franchisee_id: z.string().nullish(),
  franchisee_credit: z
    .number({ error: "O crédito do franqueado deve ser um número." })
    .min(0, { error: "O crédito do franqueado não pode ser negativo." })
    .nullish(),
  operation_key: chaveDeOperacao,
  reason: z.string().trim().nullish(),
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

  const res = await editarVendaAction(g.db, g.user, id, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  // Chave repetida: a venda nova já gravada, 200, sem escrever nada.
  const { replayed, ...venda } = res.data;
  return apiOk(venda, {}, replayed ? undefined : { status: 201 });
}

export const POST = withApi(POSTHandler);
