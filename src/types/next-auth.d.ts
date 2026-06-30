import type { DefaultSession } from "next-auth";

/** Papel do usuário de tenant (espelha o enum UserRole do Prisma). */
export type AppUserRole = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenant_id: string;
      role: AppUserRole;
    } & DefaultSession["user"];
  }

  interface User {
    tenant_id: string;
    role: AppUserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenant_id: string;
    role: AppUserRole;
  }
}
