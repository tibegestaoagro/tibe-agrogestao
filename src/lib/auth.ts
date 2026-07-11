import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/rate-limit";

/**
 * Instância completa do NextAuth v5 (Node runtime).
 * Provider de credenciais (email + senha) com verificação bcrypt.
 *
 * O contrato POST /api/auth/login do Módulo 0 é atendido pelo fluxo nativo do
 * NextAuth (rota /api/auth/callback/credentials). A forma { data: { user } } é a
 * representação conceitual da sessão; em sucesso a sessão carrega id, name, email,
 * role e tenant_id.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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

        if (!(await checkLoginRateLimit("tenant", email))) return null;

        // Email é globalmente único → resolve um único usuário/tenant.
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return null;

        await resetLoginRateLimit("tenant", email);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tenant_id: user.tenant_id,
          role: user.role,
        };
      },
    }),
  ],
});
