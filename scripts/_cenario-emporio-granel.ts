import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do granel em qualquer peso e do atacado na mesma saca (Modulo 39, Q319 a Q324)
 * para o roteiro `scripts/navegador/emporio-granel.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Gr " (lojas e produtos):
 *   - "Gr Loja" com o Caixa 1 ABERTO, e "Gr Loja 2" (so destino de transferencia);
 *   - Produto A "Gr Ração 15kg": em SACA (conteudo 15 kg), com a "Saca 15 kg" fechada e o "GRANEL" avulso de
 *     0,068 saca (o 1,02 kg que o "confira" deve marcar), preco por loja nas duas, custo de R$ 90,00 a saca
 *     e implantacao de 10 sacas na Gr Loja;
 *   - Produto B "Gr Farelo 40kg": em QUILO, com duas fechadas de 40 kg ("Saca 40 kg" e "ATACADO", precos
 *     diferentes) e a avulsa "Quilo" (1 kg), implantacao de 10 sacas na "Saca 40 kg" na Gr Loja;
 *   - Produto C "Gr Milho C 15kg": em SACA de 15 kg, sem estoque (a recusa da Q322 pela tela).
 * Apaga antes tudo o que rodadas anteriores criaram, inclusive movimentos de caixa por `sale_id` das vendas do
 * cenario (uma rodada sabotada pode deixar movimento fora das lojas). Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Gr ";

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({
    // sale_id: o dinheiro de uma rodada sabotada pode ter caido em caixa de outra fixture, fora de `lojas`.
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.stockTransfer.deleteMany({ where: { tenant_id, OR: [{ origin_establishment_id: { in: lojas } }, { destination_establishment_id: { in: lojas } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.cashHandover.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashRegister.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
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
  return { lojas: lojas.length, vendas: vendas.length, produtos: produtos.length };
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);
  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });

  const limpos = await limpar(tenant_id);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixaActions = await import("@/lib/actions/emporio-caixa");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };
  const loja2 = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 2`, max_discount_pct: 10 }), "loja 2") as { id: string };

  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
  if (!registro) throw new Error("A Gr Loja nasceu sem o Caixa 1.");
  exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
  await abrirTurnoDeTeste(db, dono, loja.id);

  const produto = async (name: string, input: Record<string, unknown>) =>
    (exigir(await cat.criarProdutoEmporioAction(db, dono, { name, category_id: categoria.id, ...input } as never), name) as { id: string }).id;
  const apresentacao = async (produtoId: string, name: string, base_qty: number, is_sealed_package: boolean) => {
    // O produto em saca ja nasce com a apresentacao da saca (Q123): reaproveita se for a mesma.
    const existente = await prisma.productPresentation.findFirst({ where: { tenant_id, emporio_product_id: produtoId, name } });
    if (existente && Number(existente.base_qty) === base_qty && existente.is_sealed_package === is_sealed_package) return existente.id;
    return (exigir(await cat.criarApresentacaoAction(db, dono, produtoId, { name, base_qty, is_sealed_package } as never), name) as { id: string }).id;
  };
  const preco = async (presentation_id: string, price: number) =>
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id, price }), "preco");

  // A: saca de 15 kg com GRANEL de 0,068 saca (1,02 kg).
  const A = await produto(`${PREFIXO}Ração 15kg`, { base_unit: "saca", content_qty: 15, content_unit: "quilograma" });
  const aSaca = await apresentacao(A, "Saca 15 kg", 1, true);
  const aGranel = await apresentacao(A, "GRANEL", 0.068, false);
  for (const loj of [loja, loja2]) {
    for (const [id, p] of [[aSaca, 150], [aGranel, 2.4]] as const) {
      exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loj.id, presentation_id: id, price: p }), "preco A");
    }
  }
  await prisma.emporioProduct.update({ where: { id: A }, data: { reference_cost: 90 } });
  exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: A, sealed: [{ presentation_id: aSaca, packages: 10 }], loose_qty: 0, unit_cost: 90 } as never), "implantar A");

  // B: quilo com duas fechadas de 40 kg e a avulsa "Quilo".
  const B = await produto(`${PREFIXO}Farelo 40kg`, { base_unit: "quilograma" });
  const bSaca = await apresentacao(B, "Saca 40 kg", 40, true);
  const bAtac = await apresentacao(B, "ATACADO", 40, true);
  const bQuilo = await apresentacao(B, "Quilo", 1, false);
  await preco(bSaca, 120);
  await preco(bAtac, 110);
  await preco(bQuilo, 4);
  exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: B, sealed: [{ presentation_id: bSaca, packages: 10 }], loose_qty: 0, unit_cost: 3 } as never), "implantar B");

  // C: saca de 15 kg sem estoque (a recusa da fracao que nao fecha, Q322).
  const C = await produto(`${PREFIXO}Milho C 15kg`, { base_unit: "saca", content_qty: 15, content_unit: "quilograma" });
  await apresentacao(C, "Saca 15 kg", 1, true);

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s),", limpos.produtos, "produto(s)");
  console.log("Lojas:", loja.id, loja2.id, "| A:", A, "B:", B, "C:", C);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
