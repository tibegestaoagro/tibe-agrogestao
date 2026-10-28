import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da F2b do Meu Empório (Modulo 39) para o
 * roteiro `scripts/navegador/emporio-f2b.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "F2b ":
 *   - "F2b Central" (central) e "F2b Loja" (ponto de venda);
 *   - na Central, estoque inicial de Milho 300 kg a 2, Soja 150 kg a 4 e
 *     Nucleo 30 kg a 10, e de Sal 10 sacas de 10 kg a 9;
 *   - "F2b Ração" com a composicao do aceite (65, 29 e 6 para 100 kg).
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "F2b ";

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const transferencias = (await prisma.stockTransfer.findMany({
    where: { tenant_id, OR: [{ origin_establishment_id: { in: lojas } }, { destination_establishment_id: { in: lojas } }] },
    select: { id: true },
  })).map((t) => t.id);
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.stockTransferItem.deleteMany({ where: { tenant_id, transfer_id: { in: transferencias } } });
  await prisma.stockTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.productionEntry.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { emporio_product_id: { in: emporio } }] } });
  await prisma.compositionItem.deleteMany({ where: { tenant_id, OR: [{ component_emporio_product_id: { in: emporio } }, { composition: { emporio_product_id: { in: emporio } } }] } });
  await prisma.composition.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.shoppingItem.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  return { lojas: lojas.length, produtos: produtos.length };
}

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const limpos = await limpar(tenant_id);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const prod = await import("@/lib/actions/emporio-producao");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const central = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Central`, kind: "central" } as never), "central") as { id: string };
  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, kind: "ponto_venda" } as never), "loja") as { id: string };

  const novo = async (nome: string) =>
    (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}${nome}`, category_id: categoria.id, base_unit: "quilograma" } as never), nome) as { id: string }).id;

  const milho = await novo("Milho");
  const soja = await novo("Soja");
  const nucleo = await novo("Núcleo");
  const racao = await novo("Ração");
  const sal = await novo("Sal");
  const saca = exigir(await cat.criarApresentacaoAction(db, ator, sal, { name: "Saca 10 kg", base_qty: 10, is_sealed_package: true } as never), "saca") as { id: string };
  exigir(await cat.criarApresentacaoAction(db, ator, sal, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo");

  for (const [id, qtd, custo] of [[milho, 300, 2], [soja, 150, 4], [nucleo, 30, 10]] as const) {
    exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: central.id, emporio_product_id: id, sealed: [], loose_qty: qtd, unit_cost: custo } as never), `estoque ${id}`);
  }
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: central.id, emporio_product_id: sal, sealed: [{ presentation_id: saca.id, packages: 10 }], loose_qty: 0, unit_cost: 9 } as never), "estoque do sal");

  exigir(await prod.definirComposicaoAction(db, ator, racao, {
    reference_qty: 100,
    items: [
      { component_emporio_product_id: milho, quantity: 65 },
      { component_emporio_product_id: soja, quantity: 29 },
      { component_emporio_product_id: nucleo, quantity: 6 },
    ],
  } as never), "composicao");

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.produtos, "produto(s)");
  console.log("Central:", central.id, "Loja:", loja.id, "Ração:", racao, "Sal:", sal);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
