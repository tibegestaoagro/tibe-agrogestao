"use client";

/** Helpers de chamada à API a partir de componentes client. */

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; field?: string };

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      code: json?.error?.code ?? "ERROR",
      message: json?.error?.message ?? "Erro inesperado",
      // Conferido em vez de repassado: resposta de erro pode vir de qualquer
      // borda (proxy, CDN, rota antiga), e um `field` que nao seja string
      // viraria chave de objeto estranha no painel.
      field: typeof json?.error?.field === "string" ? json.error.field : undefined,
    };
  }
  return { ok: true, data: json?.data as T };
}

export const apiPost = <T>(url: string, body?: unknown) =>
  request<T>("POST", url, body);
export const apiPut = <T>(url: string, body?: unknown) =>
  request<T>("PUT", url, body);
export const apiPatch = <T>(url: string, body?: unknown) =>
  request<T>("PATCH", url, body);
export const apiGet = <T>(url: string) => request<T>("GET", url);
