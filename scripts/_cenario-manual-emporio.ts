import "./_env-local";
import { prisma } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";

/**
 * Prepara, no banco LOCAL, as sessoes do roteiro `scripts/navegador/manual-emporio.py`.
 * Nao e suite, e nao monta a demonstracao: ela vem de
 * `npm run cenario:emporio-demo` (ver o cabecalho do roteiro).
 *
 * Os cenarios da F6b e do caixa com turno deixam a conta do seed no plano
 * "grupo" (5 assentos) e DESATIVAM todo usuario fora deles, inclusive a equipe
 * da demonstracao, cujas sessoes o manual usa. Aqui a equipe da demonstracao
 * volta a ser a ativa: o Dono e as quatro pessoas dela ocupam os 5 assentos, e
 * os demais ficam desativados, como aqueles cenarios fazem.
 *
 * Idempotente. So banco local: `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const EQUIPE_DA_DEMONSTRACAO = [
  "gerente.demo.emporio@example.com",
  "gestor.demo.emporio@example.com",
  "vendedor.centro.demo.emporio@example.com",
  // A Juliana: o email ficou o de vendedora, mas ela e o Caixa da Rodovia.
  // Aqui so se liga e desliga `active`: a funcao e as lojas sao do cenario.
  "vendedor.rodovia.demo.emporio@example.com",
];

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const equipe = await prisma.user.findMany({ where: { tenant_id, email: { in: EQUIPE_DA_DEMONSTRACAO } }, select: { id: true, email: true } });
  const faltam = EQUIPE_DA_DEMONSTRACAO.filter((e) => !equipe.some((u) => u.email === e));
  if (faltam.length > 0) {
    throw new Error(`A demonstracao nao esta montada (faltam ${faltam.join(", ")}): rode npm run cenario:emporio-demo -- --conta ${tenant_id} --confirmar`);
  }

  const mantidos = [owner.id, ...equipe.map((u) => u.id)];
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: mantidos } }, data: { active: false } });
  await prisma.user.updateMany({ where: { tenant_id, id: { in: mantidos } }, data: { active: true } });

  console.log("Conta do seed:", tenant_id, "| ativos: o Dono e a equipe da demonstracao");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
