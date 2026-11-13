import type { TenantPrismaClient } from "@/lib/prisma";

/**
 * Q311, Q318: a conta vale para o PIX desta loja? Nunca, se ela não recebe PIX;
 * senão, quando é de todas as lojas ou quando a loja está na lista dela. Fica fora de `emporio-caixa.ts` porque a
 * venda também usa, e `emporio-caixa.ts` já importa de `emporio-vendas.ts`.
 */
export async function contaPixDisponivelParaLoja(db: TenantPrismaClient, contaId: string, lojaId: string): Promise<boolean> {
  const c = await db.bankAccount.findFirst({ where: { id: contaId }, select: { receives_pix: true, pix_all_establishments: true } });
  if (!c || !c.receives_pix) return false;
  if (c.pix_all_establishments) return true;
  const linha = await db.bankAccountPixEstablishment.findFirst({
    where: { bank_account_id: contaId, establishment_id: lojaId },
    select: { id: true },
  });
  return !!linha;
}
