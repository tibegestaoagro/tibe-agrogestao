import { apiError, apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { buscarCepAction } from "@/lib/actions/cep";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/cep/[cep]: endereço de um CEP (Q337 a Q339). Qualquer usuário logado do tenant,
 * inclusive a pessoa só da loja, e tenant em atraso de pagamento: é leitura de dado público.
 * Mesmo gate de "alertas"+"read" das notificações, porque não existe ModuleKey para isto
 * e todo papel lê esse módulo.
 */
async function GETHandler(_request: Request, props: { params: Promise<{ cep: string }> }) {
  const g = await guard("alertas", "read", { lojaOk: true });
  if ("error" in g) return g.error;

  const { cep } = await props.params;
  const res = await buscarCepAction(g.user, cep);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}
export const GET = withApi(GETHandler);
