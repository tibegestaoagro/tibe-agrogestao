import type { DefaultSession } from "next-auth";

/** Papel do usuário de tenant (espelha o enum UserRole do Prisma). */
export type AppUserRole = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";

/** Papel de equipe da plataforma (espelha o enum PlatformRole do Prisma, Módulo 6). */
export type PlatformSessionRole = "MASTER_ADMIN" | "EQUIPE";

// Mesmo pacote "next-auth" é usado pelas DUAS instâncias (tenant e plataforma:
// ver lib/auth.ts / lib/platform-auth.ts), então a augmentação de tipo é
// necessariamente global às duas. Os campos de tenant (`tenant_id`, `role`) e os
// de plataforma (`platform_user_id`, `platform_role`) são mutuamente exclusivos
// em runtime: uma sessão de tenant nunca seta os de plataforma e vice-versa. A
// separação real (o que impede uma sessão vazar para o outro lado) é o cookie:
// cada instância usa um nome de cookie diferente (ver platform-auth.config.ts),
// então cada `auth()` só enxerga a sessão do seu próprio tipo.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenant_id: string;
      role: AppUserRole;
      platform_user_id?: string;
      platform_role?: PlatformSessionRole;
    } & DefaultSession["user"];
  }

  interface User {
    tenant_id?: string;
    role?: AppUserRole;
    platform_user_id?: string;
    platform_role?: PlatformSessionRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenant_id?: string;
    role?: AppUserRole;
    platform_user_id?: string;
    platform_role?: PlatformSessionRole;
  }
}
