import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { authConfig, ehCaminhoPublico } from "@/lib/auth.config";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { DESTINO_DO_SO_DA_LOJA, paginaPermitidaAoSoDaLoja } from "@/lib/emporio/paginas-do-so-da-loja";
import { prismaForTenant } from "@/lib/prisma";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Proxy de proteção de rotas. A sessão usa só a config edge-safe (sem bcrypt);
 * no Next 16 o proxy roda em Node, e é isso que permite à trava do só da loja,
 * no fim do arquivo, ler o papel no banco.
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

  const bloqueio = await bloqueioDoSoDaLoja(req.auth?.user, pathname);
  if (bloqueio) return NextResponse.redirect(new URL(bloqueio, req.url));

  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname);
  return res;
});

/**
 * Trava de PÁGINA do só da loja (Módulo 39, F6b, Q120). Mora aqui, e não no
 * layout do painel, porque o layout do App Router não roda de novo na
 * navegação por link: com a trava só no layout, um Vendedor que seguisse um
 * link interno até `/financeiro` recebia a página da fazenda inteira (as
 * páginas leem o banco direto, sem passar pela API). O proxy recebe toda
 * requisição de página, inclusive a da navegação suave, e no Next 16 roda em
 * Node, então pode ler o papel no banco. Provado pelo roteiro `emporio-f6b`.
 *
 * Lista do que é PERMITIDO (`paginaPermitidaAoSoDaLoja`): página nova nasce
 * fechada para ele. As páginas fora do painel que o gate de sessão usa
 * (trocar senha, escolher plano, onboarding) ficam de fora da trava.
 */
const FORA_DO_PAINEL = ["/trocar-senha", "/escolher-plano", "/onboarding"];

async function bloqueioDoSoDaLoja(
  user: { id?: string; tenant_id?: string; role?: AppUserRole } | undefined,
  pathname: string,
): Promise<string | null> {
  if (!user?.id || !user.tenant_id || user.role === "OWNER") return null;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || ehCaminhoPublico(pathname)) return null;
  if (FORA_DO_PAINEL.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  if (paginaPermitidaAoSoDaLoja(pathname)) return null;
  const { soDaLoja } = await papelDoEmporio(prismaForTenant(user.tenant_id), { id: user.id, role: user.role });
  return soDaLoja ? DESTINO_DO_SO_DA_LOJA : null;
}

export const config = {
  // Roda em tudo, exceto assets estáticos e arquivos de imagem.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
