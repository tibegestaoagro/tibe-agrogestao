import { apiError, apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { requireFeatureApi } from "@/lib/features";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Cabeçalho comum das rotas do Meu Empório: sessão, permissão, perfil
 * `emporio` ativo e recurso liberado (404 quando desligado). Existe só para
 * as doze rotas da F1 não repetirem as mesmas seis linhas.
 */
export async function guardEmporio(modo: "read" | "write") {
  const g = await guard("emporio", modo, { profile: "emporio" });
  if ("error" in g) return g;
  const recusa = await requireFeatureApi(g.user, "emporio");
  if (recusa) return recusa;
  return g;
}

export function respostaDaAction<T>(res: ActionResult<T>, status = 200) {
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, status === 200 ? undefined : { status });
}

/** `?incluir_arquivados=1` (ou `true`). */
export function incluirArquivados(request: Request): boolean {
  const v = new URL(request.url).searchParams.get("incluir_arquivados");
  return v === "1" || v === "true";
}
