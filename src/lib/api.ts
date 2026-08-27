import { NextResponse } from "next/server";

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

/** Códigos de erro comuns reutilizados entre rotas. */
export const ApiErrors = {
  UNAUTHORIZED: ["UNAUTHORIZED", "Não autenticado", 401] as const,
  FORBIDDEN: ["FORBIDDEN", "Sem permissão para esta ação", 403] as const,
  VALIDATION: ["VALIDATION_ERROR", "Dados inválidos", 422] as const,
  NOT_FOUND: ["NOT_FOUND", "Recurso não encontrado", 404] as const,
};
