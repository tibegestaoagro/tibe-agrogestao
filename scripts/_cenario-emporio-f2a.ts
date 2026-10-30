import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";
import { TODAS_AS_CHAVES } from "./_emporio-papel";

/**
 * Monta, no banco LOCAL, o cenario da F2a do Meu Empório (Modulo 39) para o
 * roteiro `scripts/navegador/emporio-f2a.py`. Nao e suite.
 *
 * Na conta do seed: recurso ligado para a conta inteira, o OPERADOR da F1, e
 * uma loja e um produto proprios ("F2a Loja", "F2a Ração", saca de 10 kg
 * fechada e quilo, custo de referencia 9). Apaga antes tudo o que rodadas
 * anteriores criaram com o prefixo "F2a ", filhos antes dos pais.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "F2a ";
const EMAIL_OPERADOR = "operador-emporio@teste.local";

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);
  await prisma.user.upsert({
    where: { email: EMAIL_OPERADOR },
    update: { active: true, role: "OPERADOR", tenant_id, emporio_role: "vendedor", emporio_keys: [...TODAS_AS_CHAVES] },
    create: { tenant_id, email: EMAIL_OPERADOR, name: "Operador do Empório", role: "OPERADOR", emporio_role: "vendedor", emporio_keys: [...TODAS_AS_CHAVES], password_hash: "sem-senha" },
  });

  // Limpeza: lojas e produtos com o prefixo, e tudo o que aponta para eles.
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const compras = (await prisma.emporioPurchase.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, related_module: "emporio", related_id: { in: compras } } });
  await prisma.emporioPurchaseItem.deleteMany({ where: { tenant_id, purchase_id: { in: compras } } });
  await prisma.emporioPurchase.deleteMany({ where: { tenant_id, id: { in: compras } } });
  await prisma.shoppingItem.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, product_id: { in: produtos } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });

  const { criarEstabelecimentoAction, criarProdutoEmporioAction, criarApresentacaoAction } = await import("@/lib/actions/emporio-catalogo");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const loja = await criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, kind: "ponto_venda" } as never);
  if (!loja.ok) throw new Error(`loja: ${loja.message}`);
  // F6b: o Vendedor só vê a loja que tem.
  const operador = await prisma.user.findUnique({ where: { email: EMAIL_OPERADOR }, select: { id: true } });
  if (operador) await prisma.userEstablishment.create({ data: { tenant_id, user_id: operador.id, establishment_id: loja.data.id } });
  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");
  const produto = await criarProdutoEmporioAction(db, ator, {
    name: `${PREFIXO}Ração`,
    category_id: categoria.id,
    base_unit: "quilograma",
    reference_cost: 9,
  } as never);
  if (!produto.ok) throw new Error(`produto: ${produto.message}`);
  const pid = (produto.data as { id: string }).id;
  for (const a of [
    { name: "Saca 10 kg", base_qty: 10, is_sealed_package: true },
    { name: "Quilo", base_qty: 1, is_sealed_package: false },
  ]) {
    const r = await criarApresentacaoAction(db, ator, pid, a as never);
    if (!r.ok) throw new Error(`apresentacao ${a.name}: ${r.message}`);
  }

  console.log("Conta do seed:", tenant_id, "recurso ligado para a conta inteira");
  console.log("Loja:", (loja.data as { id: string }).id, "Produto do Empório:", pid);
  console.log("Limpos:", lojas.length, "loja(s),", produtos.length, "produto(s),", compras.length, "compra(s)");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
