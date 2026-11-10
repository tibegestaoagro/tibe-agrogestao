import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario dos dois custos do Meu Emporio (Modulo 39,
 * Q293 a Q297) para o roteiro `scripts/navegador/emporio-dois-custos.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Dc ":
 *   - "Dc Loja" (base do preco sugerido nasce "maior");
 *   - "Dc Talco": Quilo, preco gravado R$ 10,00; implantacao de 5000 kg a 1,28,
 *     saida de 1108 kg (perda), compra de 100 kg a 2,35: saldo 3992, medio 1,31;
 *   - "Dc Aveia": Quilo, preco R$ 10,00; compra de 10 kg a 3,00 e depois a saida
 *     dos 10 kg: saldo zero com compra (Q297).
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo. Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Dc ";

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const compras = (await prisma.emporioPurchase.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: compras } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }] } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioPurchaseItem.deleteMany({ where: { tenant_id, purchase_id: { in: compras } } });
  await prisma.emporioPurchase.deleteMany({ where: { tenant_id, id: { in: compras } } });
  // O rateio e a ocorrencia de despesa fixa seguram a loja (Restrict).
  await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await limparTaxasDeCenario(prisma, { tenant_id, establishment_ids: lojas });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  return { lojas: lojas.length, compras: compras.length };
}

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const limpos = await limpar(tenant_id);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const compras = await import("@/lib/actions/emporio-compras");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };

  const novoProduto = async (nome: string) => {
    const id = (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}${nome}`, category_id: categoria.id, base_unit: "quilograma" } as never), nome) as { id: string }).id;
    const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, id, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
    exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 10 }), "preco");
    return { id, quilo };
  };
  const compra = async (chave: string, produto: { id: string; quilo: string }, qtd: number, total: number) =>
    exigir(
      await compras.criarCompraAction(db, ator, {
        operation_key: `cenario-dc-${chave}-${Date.now()}`,
        establishment_id: loja.id,
        purchased_at: new Date(),
        received: true,
        freight: 0,
        items: [{ emporio_product_id: produto.id, presentation_id: produto.quilo, quantity: qtd, item_total: total }],
        payment: { kind: "a_prazo", due_date: new Date(Date.now() + 30 * 86_400_000) },
      } as never),
      `compra ${chave}`,
    );
  const perda = async (produto: { id: string }, quantity: number) =>
    exigir(await est.registrarPerdaAction(db, ator, { establishment_id: loja.id, emporio_product_id: produto.id, quantity, reason: "outro" }), "perda");

  // Caso real do TALCO/ GEL: 5000 a 1,28, saem 1108, entram 100 a 2,35.
  const talco = await novoProduto("Talco");
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: talco.id, sealed: [], loose_qty: 5000, unit_cost: 1.28 } as never), "implantacao");
  await perda(talco, 1108);
  await compra("talco", talco, 100, 235);

  // Saldo zero depois de uma compra (Q297).
  const aveia = await novoProduto("Aveia");
  await compra("aveia", aveia, 10, 30);
  await perda(aveia, 10);

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.compras, "compra(s)");
  console.log("Loja:", loja.id, "Talco:", talco.id, "Aveia:", aveia.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
