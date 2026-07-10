import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

/**
 * Middleware de proteção de rotas (Edge runtime). Usa apenas a config edge-safe
 * (sem Prisma/bcrypt). A regra de acesso está em authConfig.callbacks.authorized,
 * que roda ANTES da função abaixo (bloqueia/redireciona sem sessão antes dela
 * ser chamada).
 *
 * Também propaga o pathname atual via header `x-pathname` — o layout do
 * dashboard (Node runtime, com Prisma) usa isso para decidir se bloqueia por
 * inadimplência (spec 5.7/5.8) sem duplicar a consulta ao banco aqui no Edge.
 */
const { auth } = NextAuth(authConfig);

export const middleware = auth((req) => {
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
