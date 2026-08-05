import { API_BASE_URL } from "@/lib/config";

/**
 * Transporte HTTP cru para a API do Tibé. Este módulo NÃO sabe nada sobre
 * sessão/token: só monta a requisição, decodifica o envelope JSON
 * (`{ data, meta }` ou `{ error: { code, message } }`, ver src/lib/api.ts no
 * back-end) e devolve os dois pedaços crus (`res`, `body`) para quem chamou
 * decidir o que fazer. A orquestração de identidade (anexar
 * `Authorization`, renovar em 401, etc.) mora em `src/lib/auth-context.tsx`,
 * de propósito, para manter este arquivo simples e testável sozinho.
 */

/** Erro de API já traduzido do envelope de erro do back-end. */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Lançado quando a sessão não pôde ser renovada (refresh token ausente,
 * expirado, revogado ou já usado). Quem chama deve tratar como logout: o
 * `AuthProvider` já derruba o estado de sessão sozinho antes de lançar isto,
 * então normalmente a tela só precisa parar o próprio carregamento e deixar
 * a navegação (guiada pelo estado de auth) trocar para a tela de login.
 */
export class AuthExpiredError extends Error {
  constructor() {
    super("Sessão expirada. Entre novamente.");
    this.name = "AuthExpiredError";
  }
}

export type RequestOptions = Omit<RequestInit, "body"> & {
  /** Corpo já como objeto: este módulo cuida do `JSON.stringify`. */
  json?: unknown;
};

/**
 * Chamada HTTP crua contra `${API_BASE_URL}${path}`. Nunca lança por causa
 * de um corpo de erro do próprio Tibé (`res.ok === false` só vira valor de
 * retorno, não exceção): só propaga exceção de falha de rede de verdade
 * (sem conexão, DNS, timeout), que quem chama trata separadamente.
 */
export async function rawRequest(
  path: string,
  init?: RequestOptions,
): Promise<{ res: Response; body: unknown }> {
  const { json, headers, ...rest } = init ?? {};
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

/**
 * Traduz QUALQUER erro em texto que o produtor entenda, em pt-BR.
 *
 * Existe porque o `fetch` do React Native lança `TypeError: Network request
 * failed` (inglês, e sem dizer o que fazer), e esse texto apareceu na tela
 * durante o teste com modo avião. Mensagem de erro é interface: "Network
 * request failed" não diz a quem está no pasto que o problema é o sinal.
 *
 * Erros do próprio Tibé já vêm em pt-BR do back-end e passam intactos.
 */
export function toUserMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof AuthExpiredError) return e.message;
  const raw = e instanceof Error ? e.message : '';
  if (/network request failed|failed to fetch|timeout|abort/i.test(raw)) {
    return 'Sem conexão com a internet. Verifique o sinal e tente de novo.';
  }
  return 'Não foi possível concluir agora. Tente de novo.';
}

/** Traduz um corpo de erro `{ error: { code, message } }` para `ApiError`, com fallback em pt-BR. */
export function toApiError(body: unknown, status: number): ApiError {
  const errorBody = body as { error?: { code?: string; message?: string } } | null;
  return new ApiError(
    errorBody?.error?.code ?? "UNKNOWN_ERROR",
    errorBody?.error?.message ?? "Erro inesperado. Tente novamente.",
    status,
  );
}
