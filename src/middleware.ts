import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

/**
 * Middleware de proteção de rotas (Edge runtime). Usa apenas a config edge-safe
 * (sem Prisma/bcrypt). A regra de acesso está em authConfig.callbacks.authorized,
 * que roda ANTES da função abaixo (bloqueia/redireciona sem sessão antes dela
 * ser chamada). "/plataforma" está em PUBLIC_PREFIXES (authConfig): não passa
 * pela checagem de sessão de TENANT; a proteção dela (sessão de PlatformUser,
 * Módulo 6) é feita manualmente abaixo, via `getToken` lendo o cookie próprio
 * (`tibe-platform-session`) com o secret próprio (`PLATFORM_AUTH_SECRET`): não
 * a instância NextAuth de tenant. Isso mantém as duas sessões genuinamente
 * desacopladas: nenhuma delas consegue autenticar o lado do outro.
 *
 * Também propaga o pathname atual via header `x-pathname`: o layout do
 * dashboard (Node runtime, com Prisma) usa isso para decidir se bloqueia por
 * inadimplência (spec 5.7/5.8) sem duplicar a consulta ao banco aqui no Edge.
 */
const { auth } = NextAuth(authConfig);

export const middleware = auth(async (req) => {
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
