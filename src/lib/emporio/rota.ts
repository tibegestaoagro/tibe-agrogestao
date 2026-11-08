import { z } from "zod";
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

/** Um dia `AAAA-MM-DD` de query string, como `Date` à meia-noite UTC. `campo` é `de` ou `ate`, só para a mensagem. */
export const diaIso = (campo: string) =>
  z
    .string({ error: `Informe a data ${campo === "de" ? "inicial" : "final"}.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida (AAAA-MM-DD).")
    .refine((v) => {
      const t = Date.parse(`${v}T00:00:00Z`);
      // O Date.parse aceita 2026-02-31 e rola para março: só vale a data que volta igual.
      return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
    }, "Informe uma data válida (AAAA-MM-DD).")
    .transform((v) => new Date(`${v}T00:00:00Z`));
