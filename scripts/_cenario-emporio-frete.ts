import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";
import { abrirTurnoDeTeste } from "./_emporio-turno";

/**
 * Monta, no banco LOCAL, o cenario do frete, da origem e da edicao de venda do
 * Meu Emporio (Modulo 39, Q244 a Q249) para o roteiro
 * `scripts/navegador/emporio-frete-ecommerce.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Frete ":
 *   - "Frete Loja" (ponto de venda), com o turno do Caixa 1 aberto sem troco e
 *     a regra "Vendeu, Pagou" de 10% (a comissao do Resultado);
 *   - "Frete Ração": Quilo a R$ 20,00, 100 kg avulsos a R$ 10,00;
 *   - duas vendas ja lancadas pela action: a do e-commerce com frete (5 kg, R$
 *     100,00 de itens, R$ 20,00 de frete, R$ 120,00 em dinheiro) e a do balcao
 *     sem frete (5 kg, R$ 100,00 em dinheiro), que o roteiro edita.
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Frete ";

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((d) => d.id);
  const lancamentos = (await prisma.financialEntry.findMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...devolucoes] } }] },
    select: { id: true },
  })).map((l) => l.id);

  // Outro cenário (projeção, F4a) pode ter rateado despesa fixa nestas lojas: a ocorrência e o split seguram a loja.
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashMovement.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  // A contagem de abertura do turno segura a loja: sai antes dela.
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  // A despesa do "Vendeu, Pagou" aponta para a venda e para a regra.
  await prisma.saleVariableExpense.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  // A venda nova da edição aponta para a antiga (e a da troca, para a devolução).
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { exchange_return_id: null } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { tenant_id, return_id: { in: devolucoes } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { tenant_id, id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  return { lojas, vendas, produtos, emporio };
}

async function limparVendasELojas(tenant_id: string, lojas: string[], vendas: string[], produtos: string[], emporio: string[]) {
  // A substituição liga uma venda à outra: desliga antes de apagar.
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { replaces_sale_id: null } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.variableExpenseRule.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
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

  const velho = await limpar(tenant_id);
  await limparVendasELojas(tenant_id, velho.lojas, velho.vendas, velho.produtos, velho.emporio);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const desp = await import("@/lib/actions/emporio-despesas");
  const vend = await import("@/lib/actions/emporio-vendas");
  const cli = await import("@/lib/actions/emporio-clientes");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };

  const racao = (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "racao") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 100, unit_cost: 10 } as never), "estoque da racao");

  exigir(await desp.criarRegraVariavelAction(db, ator, { establishment_id: loja.id, name: "Frete Comissão 10%", kind: "percentual", value: 10 } as never), "regra");
  const turno = await abrirTurnoDeTeste(db, ator, loja.id);

  const cf = (await cli.garantirConsumidorFinal(db)).id;
  const itens = [{ emporio_product_id: racao, presentation_id: quilo, quantity: 5 }];
  const lancar = async (chave: string, extra: Record<string, unknown>, dinheiro: number) =>
    exigir(
      await vend.venderAction(db, ator, {
        operation_key: `cenario-frete-${chave}-${Date.now()}`,
        establishment_id: loja.id,
        customer_id: cf,
        items: itens,
        payments: [{ kind: "dinheiro", amount: dinheiro }],
        cash_register_id: turno.cash_register_id,
        ...extra,
      } as never),
      `venda ${chave}`,
    ) as { id: string; number: number };
  const ecommerce = await lancar("ecom", { freight_amount: 20, origin: "ecommerce" }, 120);
  const balcao = await lancar("balcao", {}, 100);

  console.log("Conta do seed:", tenant_id, "| limpos:", velho.lojas.length, "loja(s),", velho.vendas.length, "venda(s)");
  console.log("Loja:", loja.id, "Ração:", racao, "Venda e-commerce:", ecommerce.id, "Venda balcão:", balcao.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
