import "./_env-local";
import { prisma } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";
import { TODAS_AS_CHAVES } from "./_emporio-papel";

/**
 * Monta, no banco LOCAL, o cenario da F1 do Meu Empório (Modulo 39) para o
 * roteiro `scripts/navegador/emporio-f1.py`. Nao e suite.
 *
 * Na conta do seed: liga o recurso para a conta inteira (o operador precisa
 * ver), garante um OPERADOR sem senha utilizavel (a sessao vem do cookie) e
 * apaga o que rodadas anteriores do roteiro criaram, tudo com o prefixo "F1 ".
 *
 * O operador e Vendedor com todas as chaves (F6b) e nasce sem loja, porque as
 * lojas "F1 " so existem depois que o roteiro as cria: e ele que liga o
 * Vendedor a elas (passos 7 e 8). Vendedor sem loja nao ve nenhuma. A limpeza
 * apaga os vinculos junto com as lojas (cascata).
 *
 * Idempotente.
 */
exigirBancoLocal();

const EMAIL_OPERADOR = "operador-emporio@teste.local";
const PREFIXO = "F1 ";

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  // Vinculos que os cenarios de outras fases deixaram: o roteiro prova "so a Loja 1",
  // e uma loja antiga ligada ao mesmo email apareceria na tabela.
  const antigo = await prisma.user.findUnique({ where: { email: EMAIL_OPERADOR }, select: { id: true } });
  if (antigo) await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: antigo.id } });

  await prisma.user.upsert({
    where: { email: EMAIL_OPERADOR },
    update: { active: true, role: "OPERADOR", tenant_id, emporio_role: "vendedor", emporio_keys: [...TODAS_AS_CHAVES] },
    create: {
      tenant_id,
      email: EMAIL_OPERADOR,
      name: "Operador do Empório",
      role: "OPERADOR",
      emporio_role: "vendedor",
      emporio_keys: [...TODAS_AS_CHAVES],
      // Hash que nenhuma senha produz: ninguem entra por senha aqui.
      password_hash: "sem-senha",
    },
  });

  // Limpeza das rodadas anteriores, filhos antes dos pais (Product e RESTRICT).
  const produtos = await prisma.product.findMany({
    where: { tenant_id, name: { startsWith: PREFIXO } },
    select: { id: true },
  });
  const ids = produtos.map((p) => p.id);
  await prisma.stockMovement.deleteMany({ where: { tenant_id, product_id: { in: ids } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, product_id: { in: ids } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: ids } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, name: { startsWith: PREFIXO } } });

  console.log("Conta do seed:", tenant_id, "recurso ligado para a conta inteira");
  console.log("Operador:", EMAIL_OPERADOR);
  console.log("Limpos:", ids.length, "produto(s) com prefixo", JSON.stringify(PREFIXO));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
