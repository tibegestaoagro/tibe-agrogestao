import type { TenantPrismaClient } from "@/lib/prisma";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";

/**
 * Meu Empório: quem pode autorizar um desconto numa loja. Os mesmos que a regra `gestor_da_loja`
 * deixa passar (o Dono, o Gerente geral e o Gestor ligado à loja), ativos. A lista da tela exige
 * também o PIN cadastrado; a conferência da action não, porque o PIN já foi conferido antes.
 */
const ONDE_GESTOR = (lojaId: string) => ({
  active: true,
  OR: [
    { role: "OWNER" as const },
    { emporio_role: "gerente_geral" as const },
    {
      emporio_role: "gestor" as const,
      user_establishments: { some: { establishment_id: lojaId } },
    },
  ],
});

export async function autorizadoresDaLoja(
  db: TenantPrismaClient,
  lojaId: string,
): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: { ...ONDE_GESTOR(lojaId), emporio_auth_pin_hash: { not: null } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function podeAutorizarNaLoja(db: TenantPrismaClient, userId: string, lojaId: string): Promise<boolean> {
  const contexto = await papelDoEmporio(db, { id: userId });
  return pode(contexto, "gestor_da_loja", lojaId);
}
