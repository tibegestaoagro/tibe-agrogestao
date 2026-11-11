import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do credito do franqueado do Meu Emporio (Modulo 39, Q300 a Q309)
 * para o roteiro `scripts/navegador/emporio-franqueado.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Fq ":
 *   - "Fq Loja", com o Caixa 1 ABERTO (saldo inicial de R$ 100,00, turno aberto pelo Dono);
 *   - "Fq Racao" (R$ 60,00 o quilo) e "Fq Sal" (R$ 40,00 o quilo), 500 kg de cada: com um quilo
 *     de cada e credito de R$ 10,00 o papel do cliente sai 66,00 e 44,00;
 *   - NENHUM franqueado: o roteiro cadastra pela tela.
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo (franqueados, pagamentos,
 * vendas, orcamentos, caixa). Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Fq ";

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const franqueados = (await prisma.emporioFranchisee.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((f) => f.id);
  const pagamentos = (await prisma.emporioFranchiseePayment.findMany({ where: { tenant_id, franchisee_id: { in: franqueados } }, select: { id: true } })).map((p) => p.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { franchisee_payment_id: { in: pagamentos } }] },
  });
  await prisma.emporioFranchiseePayment.deleteMany({ where: { tenant_id, id: { in: pagamentos } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  // O orcamento so sai depois das vendas: a venda guarda `quote_id` com Restrict.
  await prisma.emporioQuote.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioFranchisee.deleteMany({ where: { tenant_id, id: { in: franqueados } } });
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
  return { lojas: lojas.length, vendas: vendas.length, franqueados: franqueados.length };
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
  const caixaActions = await import("@/lib/actions/emporio-caixa");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };

  async function produto(nome: string, preco: number, estoque: number) {
    const id = (exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}${nome}`, category_id: categoria!.id, base_unit: "quilograma" } as never), nome) as { id: string }).id;
    const ap = (exigir(await cat.criarApresentacaoAction(db, dono, id, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), `quilo de ${nome}`) as { id: string }).id;
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: preco }), `preco de ${nome}`);
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: id, sealed: [], loose_qty: estoque, unit_cost: 5 } as never),
      `estoque de ${nome}`,
    );
    return id;
  }
  const racao = await produto("Ração", 60, 500);
  const sal = await produto("Sal", 40, 500);

  // O troco do Caixa 1 e o turno aberto: sem turno aberto nao ha venda nem pagamento pela gaveta.
  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
  if (!registro) throw new Error(`A loja ${loja.id} nasceu sem o Caixa 1.`);
  exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
  await abrirTurnoDeTeste(db, dono, loja.id);

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s),", limpos.franqueados, "franqueado(s)");
  console.log("Loja:", loja.id, "Racao:", racao, "Sal:", sal);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
