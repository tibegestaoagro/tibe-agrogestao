import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { platformAuthConfig } from "@/lib/platform-auth.config";

/**
 * Instância completa do NextAuth v5 para PlatformUser (Node runtime, Módulo
 * 6). Espelha lib/auth.ts, mas resolvendo contra PlatformUser em vez de User
 * — nunca deve tocar tenant_id em lugar nenhum deste arquivo.
 */
export const {
  handlers: platformHandlers,
  auth: platformAuth,
  signIn: platformSignIn,
  signOut: platformSignOut,
} = NextAuth({
  ...platformAuthConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email.trim() : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const platformUser = await prisma.platformUser.findUnique({ where: { email } });
        if (!platformUser || !platformUser.active) return null;

        const ok = await bcrypt.compare(password, platformUser.password_hash);
        if (!ok) return null;

        return {
          id: platformUser.id,
          name: platformUser.name,
          email: platformUser.email,
          platform_user_id: platformUser.id,
          platform_role: platformUser.role,
        };
      },
    }),
  ],
});
