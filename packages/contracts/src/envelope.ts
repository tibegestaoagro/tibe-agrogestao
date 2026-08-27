import { z } from "zod";

/**
 * Envelope de resposta da API (PRD secao 10.3, implementado em
 * `src/lib/api.ts`):
 *
 *   sucesso -> { data, meta }
 *   erro    -> { error: { code, message } }
 *
 * `meta` esta SEMPRE presente numa resposta de sucesso: `apiOk()` a preenche
 * com `{}` quando a rota nao passa nada. Varios exemplos de `/docs/api` a
 * omitem por brevidade, mas o servidor nunca omite, entao aqui ela e
 * obrigatoria.
 */

/** `meta` sem forma conhecida: aceita qualquer chave, nao valida nada. */
export const metaRecordSchema = z.record(z.string(), z.unknown());
export type MetaRecord = z.infer<typeof metaRecordSchema>;

export type ApiOk<T> = { data: T; meta: Record<string, unknown> };
export type ApiError = {
  error: { code: string; message: string; field?: string };
};
export type ApiResponse<T> = ApiOk<T> | ApiError;

/**
 * `code` e string livre de proposito. O catalogo em `errors.ts` cobre os
 * codigos que as rotas deste pacote emitem hoje, mas um codigo novo nao pode
 * fazer o cliente falhar ao ler a resposta de erro.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /**
     * Qual campo do formulario o servidor recusou.
     *
     * Opcional de proposito: a maioria dos erros nao pertence a campo nenhum
     * (rede, permissao, conflito, excecao). Quem nao le esta chave continua
     * funcionando exatamente como antes, que e o que torna a extensao
     * aditiva.
     *
     * O nome e o do campo NA API (`quantity`, `ear_tag`), nunca o do estado
     * da tela: e assim que o painel casa a recusa com o campo sem precisar de
     * um tradutor no meio.
     */
    field: z.string().optional(),
  }),
});

/**
 * Monta o schema de uma resposta de sucesso.
 *
 * Sem o segundo argumento, `meta` fica livre. Com ele, `meta` ganha forma
 * (ex: `{ total }`). Nos dois casos chaves desconhecidas sao descartadas em
 * vez de rejeitadas, que e o comportamento padrao do `z.object`: extensoes
 * aditivas ao contrato (campos novos em `meta` ou em `data`) continuam sem
 * quebrar quem ja consome.
 */
export function apiOkSchema<D extends z.ZodType>(
  data: D,
): z.ZodObject<{ data: D; meta: typeof metaRecordSchema }>;
export function apiOkSchema<D extends z.ZodType, M extends z.ZodType>(
  data: D,
  meta: M,
): z.ZodObject<{ data: D; meta: M }>;
export function apiOkSchema(data: z.ZodType, meta?: z.ZodType) {
  return z.object({ data, meta: meta ?? metaRecordSchema });
}

/** `meta: { total }`, a forma mais comum nas rotas de listagem. */
export const totalMetaSchema = z.object({
  total: z.number().int().nonnegative(),
});
export type TotalMeta = z.infer<typeof totalMetaSchema>;

/** Discrimina sucesso de erro sem precisar olhar o status HTTP. */
export function isApiError(value: unknown): value is ApiError {
  return apiErrorSchema.safeParse(value).success;
}
