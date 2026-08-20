import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getNegotiation, serializeNegotiation } from "@/lib/actions/negotiations";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/negotiations/:id   detalhe da negociação (Módulo 31, §17.10)
 *
 * Devolve o envelope com os filhos e os totais do §15 (principal, custos
 * adicionais, total da compra, líquido da venda). A SITUAÇÃO do §16 vem
 * derivada dos filhos, nunca de um campo: ver o comentário no schema.
 *
 * Não existe PATCH aqui de propósito. O §17.9 pede recálculo ao editar, e a
 * decisão do módulo foi que editar é CANCELAR e refazer: uma edição que mude
 * quantidade ou valor teria que desfazer filhos que já podem ter virado
 * dinheiro pago ou animal vendido.
 */
async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const negociacao = await getNegotiation(g.db, params.id);
  if (!negociacao) return apiError(...ApiErrors.NOT_FOUND);

  return apiOk(serializeNegotiation(negociacao));
}

export const GET = withApi(GETHandler);
