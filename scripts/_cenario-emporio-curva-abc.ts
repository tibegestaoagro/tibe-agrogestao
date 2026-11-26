import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { soltarDespesaFixa } from "./_cenario-despesa-fixa";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da curva ABC e da paginacao dos orcamentos do Meu Emporio (frente H, Q362 a Q365)
 * para o roteiro `scripts/navegador/emporio-curva-abc.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Abc ". Todas as vendas caem num dia passado FIXO (2026-03-10, 12h de Brasilia),
 * para nada de outras suites entrar no recorte quando o filtro e a loja do cenario:
 *   - "Abc Loja 1": 5 produtos com faturamento liquido 5000, 3000, 1000, 600 e 400 (total 10000):
 *       Abc Milho  : 5 x 1250 (devolve 1 x 1250, no mesmo dia) = 5000, custo 750/kg  -> lucro 2000
 *       Abc Soja   : 1 x 3000 = 3000, custo 1800                                      -> lucro 1200
 *       Abc Feijao : 2 x 500 = 1000 (uma para Ana, uma para o Consumidor final), custo 200 -> lucro 600
 *       Abc Arroz  : 1 x 600 = 600, SEM custo (unit_cost nulo)                        -> lucro 600
 *       Abc Trigo  : 1 x 400 = 400, custo 300 ESTIMADO                                -> lucro 100
 *     clientes: Abc Maria (Milho + Trigo = 5400, 1 venda), Abc Joao (Soja + Arroz = 3600, 1 venda), Abc Ana
 *     (Feijao = 500, 1 venda) e o Consumidor final (Feijao = 500, 1 venda);
 *   - "Abc Loja 2": 1 venda de 1 x Abc Milho (1250) para a Abc Maria, mesmo dia (a outra loja, que nao pode entrar);
 *   - "Abc Orcamentos": 45 orcamentos abertos (para a paginacao).
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local: `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Abc ";
const DIA_ISO = "2026-03-10";
/** Um dia só com venda devolvida inteira, na Loja 2: a curva sem vendas positivas. */
const DIA_ZERO_ISO = "2026-03-12";
const VENDIDA_EM = new Date(`${DIA_ISO}T15:00:00Z`);

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const apresentacoes = (
    await prisma.productPresentation.findMany({ where: { tenant_id, emporio_product_id: { in: emporio } }, select: { id: true } })
  ).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((d) => d.id);
  const clientes = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...devolucoes] } }] }, select: { id: true } })
  ).map((l) => l.id);
  const ondeHaDinheiro = [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { sale_id: { in: vendas } }];
  const movimentos = await prisma.cashMovement.findMany({ where: { tenant_id, OR: ondeHaDinheiro }, select: { cash_transfer_id: true } });
  const transferencias = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas, ...lancamentos, ...lojas, ...emporio, ...apresentacoes] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: ondeHaDinheiro } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await soltarDespesaFixa(prisma, { tenant_id, lojas, lancamentos });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } });
  await prisma.emporioQuote.updateMany({ where: { tenant_id, establishment_id: { in: lojas } }, data: { sale_id: null, based_on_quote_id: null } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { tenant_id, return_id: { in: devolucoes } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { tenant_id, id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioQuoteItem.deleteMany({ where: { tenant_id, quote: { establishment_id: { in: lojas } } } });
  await prisma.emporioQuote.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, id: { in: clientes } } });
  await prisma.cashHandover.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashRegister.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { presentation_id: { in: apresentacoes } }] } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, id: { in: apresentacoes } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await limparTaxasDeCenario(prisma, { tenant_id, establishment_ids: lojas });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  return { lojas: lojas.length, vendas: vendas.length };
}

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const limpos = await limpar(tenant_id);
  if (process.argv.includes("--limpar")) {
    console.log("Limpo o prefixo", JSON.stringify(PREFIXO), "na conta", tenant_id, "| lojas:", limpos.lojas, "vendas:", limpos.vendas);
    await prisma.$disconnect();
    return;
  }

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);
  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const orcamentos = await import("@/lib/actions/emporio-orcamentos");
  const clientes = await import("@/lib/actions/emporio-clientes");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = async (nome: string) => (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}${nome}` } as never), nome) as { id: string }).id;
  const loja1 = await loja("Loja 1");
  const loja2 = await loja("Loja 2");
  const lojaOrc = await loja("Orcamentos");
  const caixaDe = async (id: string) => {
    await abrirTurnoDeTeste(db, dono, id);
    return (await prisma.cashRegister.findFirstOrThrow({ where: { establishment_id: id, number: 1 } })).id;
  };
  const caixa1 = await caixaDe(loja1);
  const caixa2 = await caixaDe(loja2);

  type Prod = { id: string; pres: string };
  const produto = async (nome: string, preco: number, custo: number, lojas: string[]): Promise<Prod> => {
    const p = exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}${nome}`, category_id: categoria.id, base_unit: "quilograma" } as never), nome) as { id: string };
    const a = exigir(await cat.criarApresentacaoAction(db, dono, p.id, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), `${nome} quilo`) as { id: string };
    for (const l of lojas) {
      exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: a.id, price: preco }), `${nome} preco`);
      exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: l, emporio_product_id: p.id, sealed: [], loose_qty: 1000, unit_cost: custo } as never), `${nome} estoque`);
    }
    return { id: p.id, pres: a.id };
  };
  const duas = [loja1, loja2];
  const milho = await produto("Milho", 1250, 750, duas);
  const soja = await produto("Soja", 3000, 1800, duas);
  const feijao = await produto("Feijao", 500, 200, duas);
  const arroz = await produto("Arroz", 600, 300, duas);
  const trigo = await produto("Trigo", 400, 300, duas);

  const cliente = async (nome: string) => (await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${nome}`, person_kind: "pf", phone: "34990000124" } as never })).id;
  const maria = await cliente("Maria");
  const joao = await cliente("Joao");
  const ana = await cliente("Ana");
  const consumidor = (await clientes.garantirConsumidorFinal(db)).id;

  const agora = Date.now();
  let seq = 0;
  type Linha = { p: Prod; qty: number; preco: number };
  const vender = async (lojaId: string, caixa: string, cliente_id: string, linhas: Linha[], quando: Date = VENDIDA_EM) => {
    const total = linhas.reduce((s, l) => s + l.qty * l.preco, 0);
    const v = exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-abc-${agora}-${(seq += 1)}`,
        establishment_id: lojaId,
        cash_register_id: caixa,
        customer_id: cliente_id,
        items: linhas.map((l) => ({ emporio_product_id: l.p.id, presentation_id: l.p.pres, quantity: l.qty, unit_price: l.preco })),
        payments: [{ kind: "dinheiro", amount: total }],
      } as never),
      "venda",
    ) as { id: string };
    // Para nada de outras suites entrar no recorte: todas no mesmo dia passado.
    await prisma.emporioSale.update({ where: { id: v.id }, data: { sold_at: quando } });
    return v.id;
  };

  const vendaMaria = await vender(loja1, caixa1, maria, [
    { p: milho, qty: 5, preco: 1250 },
    { p: trigo, qty: 1, preco: 400 },
  ]);
  await vender(loja1, caixa1, joao, [
    { p: soja, qty: 1, preco: 3000 },
    { p: arroz, qty: 1, preco: 600 },
  ]);
  await vender(loja1, caixa1, ana, [{ p: feijao, qty: 1, preco: 500 }]);
  await vender(loja1, caixa1, consumidor, [{ p: feijao, qty: 1, preco: 500 }]);
  await vender(loja2, caixa2, maria, [{ p: milho, qty: 1, preco: 1250 }]);

  // Sem custo (Arroz) e custo estimado (Trigo): marcados na linha de venda, como o sistema faz quando nao sabia o custo.
  const itemDe = async (venda_id: string, produto_id: string) =>
    prisma.emporioSaleItem.findFirstOrThrow({ where: { sale_id: venda_id, emporio_product_id: produto_id } });
  await prisma.emporioSaleItem.updateMany({
    where: { tenant_id, emporio_product_id: arroz.id, sale: { establishment_id: loja1 } },
    data: { unit_cost: null },
  });
  await prisma.emporioSaleItem.updateMany({
    where: { tenant_id, emporio_product_id: trigo.id, sale: { establishment_id: loja1 } },
    data: { cost_estimated: true },
  });

  // A devolucao de 1 kg de Milho, no mesmo dia (o relatorio conta a devolucao pela data dela).
  const itemMilho = await itemDe(vendaMaria, milho.id);
  const dev = exigir(
    await vendas.devolverAction(db, dono, vendaMaria, {
      operation_key: `cenario-abc-dev-${agora}`,
      refund_kind: "dinheiro",
      cash_register_id: caixa1,
      items: [{ sale_item_id: itemMilho.id, quantity: 1 }],
    } as never),
    "devolucao",
  ) as { id: string };
  await prisma.emporioSaleReturn.update({ where: { id: dev.id }, data: { returned_at: new Date(`${DIA_ISO}T17:00:00Z`) } });

  // Dia sem vendas positivas (achado do juiz, 18/11): na Loja 2, em DIA_ZERO_ISO, 1 Soja vendida e devolvida
  // inteira no mesmo dia. A curva desse dia lista a Soja com R$ 0,00 e sai sem classes (sem o selo C).
  const vendaZero = await vender(loja2, caixa2, joao, [{ p: soja, qty: 1, preco: 3000 }], new Date(`${DIA_ZERO_ISO}T15:00:00Z`));
  const itemZero = await itemDe(vendaZero, soja.id);
  const devZero = exigir(
    await vendas.devolverAction(db, dono, vendaZero, {
      operation_key: `cenario-abc-dev-zero-${agora}`,
      refund_kind: "dinheiro",
      cash_register_id: caixa2,
      items: [{ sale_item_id: itemZero.id, quantity: 1 }],
    } as never),
    "devolucao do dia zero",
  ) as { id: string };
  await prisma.emporioSaleReturn.update({ where: { id: devZero.id }, data: { returned_at: new Date(`${DIA_ZERO_ISO}T17:00:00Z`) } });

  // 45 orcamentos numa loja so deles.
  const clienteOrc = await cliente("Cliente Orcamento");
  const milhoOrc = await produto("Milho Orc", 10, 5, [lojaOrc]);
  for (let k = 0; k < 45; k += 1) {
    exigir(
      await orcamentos.salvarOrcamentoAction(db, dono, {
        operation_key: `cenario-abc-orc-${agora}-${k}`,
        establishment_id: lojaOrc,
        customer_id: clienteOrc,
        items: [{ emporio_product_id: milhoOrc.id, presentation_id: milhoOrc.pres, quantity: 1 }],
      } as never),
      `orcamento ${k}`,
    );
  }
  const numeros = (await prisma.emporioQuote.findMany({ where: { establishment_id: lojaOrc }, select: { number: true } })).map((q) => q.number);

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Dia das vendas:", DIA_ISO, "| Loja 1:", loja1, "| Loja 2:", loja2, "| Orcamentos:", lojaOrc);
  console.log("Orcamentos: menor numero", Math.min(...numeros), "maior", Math.max(...numeros), "total", numeros.length);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
