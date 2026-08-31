import { NextResponse } from "next/server";
import type { z } from "zod";
import { instalarMensagensDeZodEmPortugues, recusaDeZod } from "@/lib/erros-de-zod";

// Toda rota importa este modulo, entao o mapa de mensagens fica de pe antes de
// qualquer `safeParse`: import roda no carregar, o handler roda depois.
instalarMensagensDeZodEmPortugues();

/**
 * Helpers de resposta de API no padrão do PRD seção 10.3:
 *   sucesso → { data, meta }
 *   erro    → { error: { code, message } }
 */

export function apiOk<T>(
  data: T,
  meta: Record<string, unknown> = {},
  init?: ResponseInit,
) {
  return NextResponse.json({ data, meta }, init);
}

/**
 * `field` diz QUAL campo do formulario foi recusado, e por isso usa o nome da
 * API (`quantity`, `ear_tag`), nao o do estado da tela. A chave so aparece
 * quando existe: mandar `field: undefined` sujaria toda resposta de erro que
 * nao pertence a campo nenhum, que sao a maioria.
 */
export function apiError(
  code: string,
  message: string,
  status = 400,
  field?: string,
) {
  return NextResponse.json(
    { error: field ? { code, message, field } : { code, message } },
    { status },
  );
}

/**
 * A recusa do Zod virando resposta, com a frase em português e o campo junto.
 *
 * Substitui `apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422)`,
 * que era a linha das 71 rotas e tinha dois defeitos: mostrava o texto default
 * do Zod (em inglês) e perdia o `field`, jogando no rodapé do painel uma
 * recusa que pertencia a um campo. O porquê inteiro está em `erros-de-zod.ts`.
 */
export function apiErroDeZod(error: z.ZodError) {
  const r = recusaDeZod(error);
  return apiError(r.code, r.message, r.status, r.field);
}

/** Códigos de erro comuns reutilizados entre rotas. */
export const ApiErrors = {
  UNAUTHORIZED: ["UNAUTHORIZED", "Não autenticado", 401] as const,
  FORBIDDEN: ["FORBIDDEN", "Sem permissão para esta ação", 403] as const,
  VALIDATION: ["VALIDATION_ERROR", "Dados inválidos", 422] as const,
  NOT_FOUND: ["NOT_FOUND", "Recurso não encontrado", 404] as const,
};
