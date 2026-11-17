import type { TenantPrismaClient } from "@/lib/prisma";

/**
 * O id do cliente padrão ("Consumidor final") da conta, para a tela não gerar link para a ficha
 * dele. Nenhuma view marca o padrão: a página server busca uma vez e repassa. Nulo se a conta ainda
 * não o tem.
 */
export async function idDoClientePadrao(db: TenantPrismaClient): Promise<string | null> {
  const c = await db.emporioCustomer.findFirst({ where: { system_key: "consumidor_final" }, select: { id: true } });
  return c?.id ?? null;
}
