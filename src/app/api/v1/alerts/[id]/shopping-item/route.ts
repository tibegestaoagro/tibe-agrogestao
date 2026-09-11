import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { adicionarItemDoAlertaAction } from "@/lib/actions/shopping-items";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/alerts/:id/shopping-item
 *
 * §13 do Módulo 36: o alerta de estoque baixo vira item da Lista de Compra,
 * com o produto, a unidade e a categoria já preenchidos.
 *
 * ⚠️ **Só roda quando o produtor pede.** O documento é explícito que o sistema
 * não deve adicionar sozinho, e é por isso que isto é uma rota, e não um passo
 * da geração diária de alertas.
 *
 * A permissão é a de escrita no ESTOQUE (`rebanho`, perfil fazenda), e não a
 * de alertas: o que a chamada faz é criar um item de lista. Dispensar o alerta
 * é consequência, não o objetivo.
 */

const schema = z
  .object({
    /** §19.7: a resposta a "esse produto já está na sua lista, quer de novo?". */
    permitir_duplicata: z.boolean().optional(),
  })
  .optional();

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await adicionarItemDoAlertaAction(g.db, params.id, {
    created_by_user_id: g.user.id,
    permitirDuplicata: parsed.data?.permitir_duplicata,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
