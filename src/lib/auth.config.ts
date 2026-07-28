import type { NextAuthConfig } from "next-auth";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Config edge-safe do NextAuth (sem Prisma/bcrypt): usada pelo middleware de
 * proteção de rotas (Edge runtime). A lógica de credenciais (DB + bcrypt) vive em
 * lib/auth.ts, que roda em Node runtime.
 */

// Rotas públicas (não exigem sessão de TENANT). "/plataforma" tem sua própria
// proteção (sessão de PlatformUser), aplicada manualmente em middleware.ts:
// aqui só precisa ficar de fora da checagem de sessão de tenant.
const PUBLIC_PATHS = ["/", "/login", "/criar-conta", "/faq", "/sitemap.xml", "/robots.txt"];
const PUBLIC_PREFIXES = ["/planos", "/politicas", "/docs", "/plataforma"];

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // o provider de credenciais é injetado em lib/auth.ts
  callbacks: {
    // Protege todas as rotas exceto as públicas e as de /api/auth.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      // Rotas de API fazem a própria autenticação no handler (sessão em /api/v1,
      // secret em /api/webhooks, NextAuth em /api/auth). Não redirecionar aqui:
      // assim retornam o contrato de erro correto (401 JSON) em vez de 307.
      if (pathname.startsWith("/api")) return true;
      const isPublic =
        PUBLIC_PATHS.includes(pathname) ||
        PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
      if (isPublic) return true;
      return !!auth?.user; // não logado → NextAuth redireciona para /login
    },
    // Propaga tenant_id e role para o token JWT.
    jwt({ token, user }) {
      if (user) {
        token.tenant_id = (user as { tenant_id: string }).tenant_id;
        token.role = (user as { role: AppUserRole }).role;
      }
      return token;
    },
    // Expõe tenant_id e role na sessão.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.tenant_id = token.tenant_id as string;
        session.user.role = token.role as AppUserRole;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
