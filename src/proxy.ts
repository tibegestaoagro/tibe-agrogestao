import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

/**
 * Middleware de proteção de rotas (Edge runtime). Usa apenas a config edge-safe
 * (sem Prisma/bcrypt).
 *
 * ⚠️ CORREÇÃO (2026-08-01): quando `auth()` recebe uma função (a forma usada
 * aqui, necessária para propagar `x-pathname`), o next-auth NUNCA invoca
 * `authConfig.callbacks.authorized` para decidir bloquear/redirecionar: ele
 * roda `authorized` só para calcular um valor que é **descartado** sempre que
 * existe um "userMiddlewareOrRoute" (a função abaixo), e chama essa função
 * incondicionalmente (confirmado em `node_modules/next-auth/lib/index.js`,
 * função `handleAuth`: o branch `else if (!authorized)` é código morto neste
 * modo). Documentação antiga deste arquivo afirmava o oposto ("roda ANTES da
 * função abaixo"), o que nunca foi verdade desde a reestruturação para HOF: o
 * middleware não bloqueava NADA por sessão de tenant, só as páginas que fazem
 * seu próprio `redirect()` continuavam protegidas. Corrigido chamando
 * `authConfig.callbacks.authorized` explicitamente abaixo, usando `req.auth`
 * (já resolvido pelo próprio next-auth antes de chamar esta função).
 *
 * Consequência disso, em 2026-08-20: `next-auth` passou a ser fixado na versão
 * EXATA no `package.json` (sem `^`). O comportamento acima é de um beta, não
 * está em contrato estável, e um bump de patch trazido por um `npm install`
 * numa terça pode reabrir exatamente este buraco sem nenhum aviso. Subir de
 * versão aqui é decisão consciente, com o teste de sessão rodando junto.
 *
 * "/plataforma" está em PUBLIC_PREFIXES (authConfig): não passa pela checagem
 * de sessão de TENANT; a proteção dela (sessão de PlatformUser, Módulo 6) é
 * feita manualmente abaixo, via `getToken` lendo o cookie próprio
 * (`tibe-platform-session`) com o secret próprio (`PLATFORM_AUTH_SECRET`): não
 * a instância NextAuth de tenant. Isso mantém as duas sessões genuinamente
 * desacopladas: nenhuma delas consegue autenticar o lado do outro.
 *
 * Também propaga o pathname atual via header `x-pathname`: o layout do
 * dashboard (Node runtime, com Prisma) usa isso para decidir se bloqueia por
 * inadimplência (spec 5.7/5.8) sem duplicar a consulta ao banco aqui no Edge.
 */
const { auth } = NextAuth(authConfig);

export const proxy = auth(async (req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/plataforma")) {
    if (pathname === "/plataforma/login") return NextResponse.next();

    const platformToken = await getToken({
      req,
      secret: process.env.PLATFORM_AUTH_SECRET,
      cookieName: "tibe-platform-session",
    });
    if (!platformToken?.platform_user_id) {
      return NextResponse.redirect(new URL("/plataforma/login", req.url));
    }
    return NextResponse.next();
  }

  // Gate de sessão de tenant: next-auth não chama isso sozinho neste modo
  // (ver comentário acima), então invocamos explicitamente.
  const isAuthorized = await authConfig.callbacks.authorized({
    auth: req.auth,
    request: req,
  });
  if (!isAuthorized) {
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/login";
    signInUrl.search = "";
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname);
  return res;
});

export const config = {
  // Roda em tudo, exceto assets estáticos e arquivos de imagem.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
