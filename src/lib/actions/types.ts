/**
 * Resultado padrão das funções de "action" em src/lib/actions/*.
 * Reusado tanto pelas rotas HTTP (traduzido para apiOk/apiError) quanto pelo
 * endpoint interno do agente WhatsApp (traduzido para reply_text em português).
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; status: number; field?: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/**
 * `field` diz QUAL campo do formulário a recusa pertence, usando o nome do
 * campo na API (`quantity`, `ear_tag`). Ele atravessa a rota até o envelope de
 * erro, e é o que permite a tela mostrar a mensagem embaixo do campo em vez de
 * num rodapé genérico.
 *
 * Opcional porque a maioria das recusas não pertence a campo nenhum: permissão,
 * conflito de estado, registro que não existe. Nesses casos o rodapé é o lugar
 * certo, e inventar um campo seria pior.
 *
 * O agente WhatsApp ignora este dado de propósito: lá a resposta é uma frase,
 * não um formulário.
 */
export function fail(
  code: string,
  message: string,
  status = 422,
  field?: string,
): ActionResult<never> {
  return { ok: false, code, message, status, ...(field ? { field } : {}) };
}
