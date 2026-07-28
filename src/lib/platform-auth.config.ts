import type { NextAuthConfig } from "next-auth";
import type { PlatformSessionRole } from "@/types/next-auth";

/**
 * Config edge-safe do NextAuth para PlatformUser (Módulo 6, task 6.2): sem
 * Prisma/bcrypt, usada pelo middleware (Edge runtime). Instância
 * COMPLETAMENTE separada da de tenant (lib/auth.config.ts): cookie próprio
 * (`tibe-platform-session`) e secret próprio (`PLATFORM_AUTH_SECRET`): uma
 * sessão de tenant nunca é lida por aqui, e vice-versa, mesmo que os dois
 * cookies existam no mesmo navegador ao mesmo tempo.
 */
export const platformAuthConfig = {
  // next-auth (não o @auth/core cru) assume basePath "/api/auth" por padrão
  // quando NEXTAUTH_URL/AUTH_URL não tem path: precisa ser explícito aqui,
  // senão o parser de action (@auth/core) não reconhece /api/platform-auth/*
  // e derruba toda requisição com UnknownAction.
  basePath: "/api/platform-auth",
  session: { strategy: "jwt" },
  pages: { signIn: "/plataforma/login" },
  secret: process.env.PLATFORM_AUTH_SECRET,
  cookies: {
    sessionToken: {
      name: "tibe-platform-session",
      options: { httpOnly: true, sameSite: "lax", path: "/" },
    },
  },
  providers: [], // o provider de credenciais é injetado em lib/platform-auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.platform_user_id = (user as { platform_user_id: string }).platform_user_id;
        token.platform_role = (user as { platform_role: PlatformSessionRole }).platform_role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.platform_user_id = token.platform_user_id as string;
        session.user.platform_role = token.platform_role as PlatformSessionRole;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
