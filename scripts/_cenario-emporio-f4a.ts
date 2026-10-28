import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da F4a do Meu Empório (Modulo 39) para o
 * roteiro `scripts/navegador/emporio-f4a.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "F4a ", no mes atual:
 *   - "F4a Loja", com R$ 500,00 de saldo inicial na gaveta;
 *   - "F4a Ração": Quilo a R$ 20,00, 200 kg avulsos a R$ 10,00;
 *   - a regra "F4a Comissão" de 5% do valor;
 *   - tres vendas de 10 kg (R$ 200,00 cada, em dinheiro) e uma perda de 2 kg;
 *   - a despesa fixa "F4a Aluguel" de R$ 1.000,00, vencendo no dia 10.
 * O Resultado esperado: vendas 600, custo 300, "Vendeu, Pagou" 30, margem 270
 * (45%), perdas 20, fixas 1.000, resultado -750; ponto de equilibrio
 * 1.000 / 45% = R$ 2.222,22, faltando R$ 1.622,22.
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "F4a ";

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((d) => d.id);
  const modelos = (await prisma.fixedExpenseTemplate.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((m) => m.id);
  const lancamentos = (await prisma.financialEntry.findMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...devolucoes, ...modelos] } }] },
    select: { id: true },
  })).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.saleVariableExpense.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { tenant_id, OR: [{ template_id: { in: modelos } }, { establishment_id: { in: lojas } }] } });
  await prisma.fixedExpenseTemplate.deleteMany({ where: { tenant_id, id: { in: modelos } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { exchange_return_id: null } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { tenant_id, return_id: { in: devolucoes } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { tenant_id, id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.variableExpenseRule.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardFeeRule.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  return { lojas: lojas.length, vendas: vendas.length };
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
  const caixa = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const despesas = await import("@/lib/actions/emporio-despesas");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, kind: "ponto_venda" }), "loja") as { id: string };
  const racao = (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "racao") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 200, unit_cost: 10 } as never), "estoque");
  exigir(await caixa.saldoInicialCaixaAction(db, ator, { establishment_id: loja.id, amount: 500 } as never), "saldo inicial");

  exigir(await despesas.criarRegraVariavelAction(db, ator, { establishment_id: loja.id, name: `${PREFIXO}Comissão`, kind: "percentual", value: 5 }), "regra");

  for (let i = 0; i < 3; i++) {
    exigir(await vendas.venderAction(db, ator, {
      operation_key: `cenario-f4a-${Date.now()}-${i}`,
      establishment_id: loja.id,
      items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 10 }],
      payments: [{ kind: "dinheiro", amount: 200 }],
    } as never), `venda ${i + 1}`);
  }
  exigir(await est.registrarPerdaAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, quantity: 2, reason: "avaria" } as never), "perda");

  const agora = new Date();
  const inicioDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  exigir(await despesas.criarDespesaFixaAction(db, ator, {
    name: `${PREFIXO}Aluguel`,
    amount: 1000,
    due_day: 10,
    split_kind: "percentual",
    starts_on: inicioDoMes,
    splits: [{ establishment_id: loja.id, value: 100 }],
  }), "despesa fixa");

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id, "Ração:", racao);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
