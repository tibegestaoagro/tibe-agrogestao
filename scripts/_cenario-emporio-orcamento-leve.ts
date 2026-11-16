import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do orcamento com total na tela e cadastro leve e do
 * endereco pelo CEP (Modulo 39, Q335 a Q340) para o roteiro
 * `scripts/navegador/emporio-orcamento-leve-e-cep.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Ol ":
 *   - "Ol Loja" com o Caixa 1 aberto;
 *   - "Ol Ração" (R$ 20,00 o quilo, 500 kg);
 *   - clientes SO com nome e telefone: "Ol Pessoa" (PF) e "Ol Empresa" (PJ), sem CPF,
 *     CNPJ nem endereco.
 * Apaga antes so o que tem o prefixo "Ol " (lojas, produtos, clientes, orcamentos e
 * vendas dessas lojas). Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Ol ";

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
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { quote_id: null, replaces_sale_id: null } });
  await prisma.emporioQuote.updateMany({ where: { tenant_id, establishment_id: { in: lojas } }, data: { sale_id: null, based_on_quote_id: null } });
  await prisma.emporioQuoteItem.deleteMany({ where: { tenant_id, quote: { establishment_id: { in: lojas } } } });
  await prisma.emporioQuote.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, name: { startsWith: PREFIXO } } });
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
  return { lojas: lojas.length, vendas: vendas.length };
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
  const produtoId = (exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, dono, produtoId, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
  exigir(
    await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: produtoId, sealed: [], loose_qty: 500, unit_cost: 5 } as never),
    "estoque",
  );
  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
  if (!registro) throw new Error(`A loja ${loja.id} nasceu sem o Caixa 1.`);
  exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
  await abrirTurnoDeTeste(db, dono, loja.id);

  await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Pessoa`, person_kind: "pf", phone: "38991234567" } as never });
  await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Empresa`, person_kind: "pj", phone: "3832210000" } as never });

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
