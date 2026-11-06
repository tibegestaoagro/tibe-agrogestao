/**
 * Roda uma funcao como se estivesse dentro de uma requisicao do Next, com (ou
 * sem) header `Authorization`.
 *
 * As suites chamam os route handlers direto, sem subir servidor, entao nao ha
 * escopo de requisicao: `headers()` lanca. Quem depende disso e o adapter de
 * token em `src/lib/tenant-context.ts`, que le o Bearer do aplicativo movel.
 *
 * O armazenamento e interno do Next e mudou de nome e de lugar no Next 16
 * (`requestAsyncStorage` em `client/components/request-async-storage.external`
 * virou `workUnitAsyncStorage` em `server/app-render/work-unit-async-storage.external`,
 * agora com um campo `type` discriminando request de prerender e de cache).
 * Isso quebrou duas suites de uma vez, o que e o motivo de existir este
 * arquivo: quando o caminho mudar de novo, muda aqui, num lugar so.
 */
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";

type Store = Parameters<typeof workUnitAsyncStorage.run>[0];
type Work = Parameters<typeof workAsyncStorage.run>[0];

/**
 * O Next 16 exige os DOIS armazenamentos: `headers()` le o de trabalho para
 * saber a rota e o modo de render, e so entao o de requisicao. Com apenas um,
 * a mensagem e "headers was called outside a request scope", que despista.
 */
function storeDeTrabalho(): Work {
  return {
    isStaticGeneration: false,
    page: "/",
    route: "/",
    cacheLifeProfiles: {},
    useCacheTimeout: 0,
    staticPageGenerationTimeout: 0,
    forceStatic: false,
    dynamicShouldError: false,
    afterContext: { after: () => {}, run: async (_: unknown, fn: () => unknown) => fn() },
  } as unknown as Work;
}

/**
 * O store de cookies e draft mode ficam vazios. A sessao de cookie, quando a
 * suite precisa dela, vai no header `cookie`: e de la que o `auth()` do
 * NextAuth a le (ver `withCookie`).
 */
function storeDeRequisicao(token: string | null, cookie?: string): Store {
  const cookiesVazios = { get: () => undefined, getAll: () => [], has: () => false };
  const cabecalhos: Record<string, string> = {};
  if (token) cabecalhos.authorization = `Bearer ${token}`;
  if (cookie) {
    cabecalhos.cookie = cookie;
    cabecalhos.host = "localhost:3000";
    cabecalhos["x-forwarded-proto"] = "http";
  }
  return {
    type: "request",
    phase: "render",
    url: { pathname: "/", search: "" },
    headers: new Headers(cabecalhos),
    cookies: cookiesVazios,
    mutableCookies: { ...cookiesVazios, set: () => {} },
    userspaceMutableCookies: { ...cookiesVazios, set: () => {} },
    draftMode: { isEnabled: false },
    rootParams: {},
    implicitTags: { tags: [], expirationsByCacheKind: new Map() },
    resumeDataCache: null,
  } as unknown as Store;
}

export function withBearer<T>(token: string | null, fn: () => Promise<T>): Promise<T> {
  return workAsyncStorage.run(storeDeTrabalho(), () =>
    workUnitAsyncStorage.run(storeDeRequisicao(token), fn),
  );
}

/**
 * Como `withBearer`, mas com a sessao do painel: `cookie` e o header inteiro
 * (`authjs.session-token=...`, de `_sessao-cookie.ts`). E o caminho do JWT de
 * 7 dias, que nao passa pelo Bearer.
 */
export function withCookie<T>(cookie: string, fn: () => Promise<T>): Promise<T> {
  return workAsyncStorage.run(storeDeTrabalho(), () =>
    workUnitAsyncStorage.run(storeDeRequisicao(null, cookie), fn),
  );
}
