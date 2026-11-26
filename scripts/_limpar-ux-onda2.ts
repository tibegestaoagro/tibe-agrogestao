import "./_env-local";
import { prisma } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";

/**
 * Tira da conta do seed (banco LOCAL) o pedido de pagamento pendente que o cenario
 * `_cenario-emporio-ux-onda2.ts` deixa: a lista de Aprovacoes passa a ter uma linha a
 * mais, e roteiros que contam pedidos (emporio-paginacao-listas) saem do eixo.
 * Uso: `npx tsx scripts/_limpar-ux-onda2.ts`. So banco local.
 */
exigirBancoLocal();

async function main() {
  const gestor = await prisma.user.findUnique({ where: { email: "ux-gestor-a@teste.local" } });
  if (!gestor) {
    console.log("Sem o gestor do cenario Ux: nada a limpar.");
    return;
  }
  const r = await prisma.emporioPaymentRequest.deleteMany({ where: { tenant_id: gestor.tenant_id, requested_by_user_id: gestor.id } });
  console.log(`Pedidos de pagamento do cenario Ux apagados: ${r.count}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
