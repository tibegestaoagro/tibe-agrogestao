import type { TenantPrismaClient } from "@/lib/prisma";

/**
 * Meu Empório, entrega 3: quem pode ser o vendedor de uma venda numa loja. É a
 * única definição da regra: a validação da venda e a lista da tela leem daqui.
 *
 * Pode: o Dono, o Gerente geral (veem todas as lojas), e o Gestor e o Vendedor
 * vinculados àquela loja. Não pode: o Caixa, quem é de outra loja, e quem está
 * desativado.
 */
export async function vendedoresDaLoja(
  db: TenantPrismaClient,
  establishmentId: string,
): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: {
      active: true,
      OR: [
        { role: "OWNER" },
        { emporio_role: "gerente_geral" },
        {
          emporio_role: { in: ["gestor", "vendedor"] },
          user_establishments: { some: { establishment_id: establishmentId } },
        },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
