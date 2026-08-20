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
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/faq",
  "/sitemap.xml",
  "/robots.txt",
  // PWA (Onda 1, agente A3): precisam ser alcançáveis por visitante deslogado,
  // senão a instalação quebra fora do painel. Agora que o middleware volta a
  // bloquear de verdade (2026-08-01), esta lista passou a ter efeito real.
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
];
// `/criar-conta` virou prefixo (Módulo 19): as etapas 2 e 3 são sub-rotas
// (`/criar-conta/whatsapp`, `/criar-conta/email`) e, como caminho exato, o
// middleware mandaria o visitante pro /login no meio do cadastro.
//
// O casamento é por SEGMENTO, não por texto (2026-08-20): com `startsWith`
// cru, qualquer rota futura que apenas começasse com um destes textos nasceria
// pública sem ninguém decidir isso. `/docsinterno` entrava por causa de
// `/docs`. Nenhuma rota assim existe hoje, e a suíte `test:m39` existe para
// que criar uma seja uma decisão em vez de um acidente.
const PUBLIC_PREFIXES = [
  "/planos",
  "/politicas",
  "/docs",
  "/plataforma",
  "/esqueci-senha",
  "/criar-conta",
];

/**
 * Sessão de 7 dias (2026-07-30), substituindo o default herdado de 30 dias do
 * NextAuth, que nunca foi uma decisão. Uma sessão esquecida ou roubada expira
 * em uma semana em vez de um mês. Mesmo valor na instância da plataforma.
 */
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export const authConfig = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
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
        PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
