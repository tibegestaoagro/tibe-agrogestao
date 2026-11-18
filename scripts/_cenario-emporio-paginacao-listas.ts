import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da paginacao das listas do Meu Emporio (dividas 5.26 e 5.27, Q366 e Q367) para o
 * roteiro `scripts/navegador/emporio-paginacao-listas.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Pag ". Cada lista numa loja propria, para filtrar por `?loja=`:
 *   - "Pag Vendas": 45 vendas (pela venderAction), uma por hora, sold_at distinto;
 *   - "Pag Compras": 45 compras (insert direto), uma por dia a partir de 2026-01-01 (a tela mostra a data);
 *   - "Pag Transf Origem" e "Pag Transf Destino": 45 transferencias (insert direto), uma por dia a partir de 2026-01-01;
 *   - "Pag Producao": 25 producoes de "Pag Prod" (insert direto), uma por hora;
 *   - "Pag Caixa": 45 movimentos de caixa (valores 200 a 244) e 45 sangrias pendentes (valores 500 a 544, criadas em
 *     2020, as mais antigas da conta, para a ordem crescente se ler pelo valor);
 *   - "Pag Curva": 1 venda de 3 produtos de R$ 10,00 em 2026-03-10 (a curva ABC de tres itens iguais).
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local: `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Pag ";
const DIA_ISO = "2026-03-10";
const HORA = 3_600_000;
const DIA = 86_400_000;

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
  const transferenciasDeCaixa = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas, ...lancamentos, ...lojas, ...emporio, ...apresentacoes] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: ondeHaDinheiro } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferenciasDeCaixa } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] } });
  await prisma.productionEntry.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockTransfer.deleteMany({ where: { tenant_id, OR: [{ origin_establishment_id: { in: lojas } }, { destination_establishment_id: { in: lojas } }] } });
  await prisma.emporioPurchase.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
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
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = async (nome: string) => (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}${nome}` } as never), nome) as { id: string }).id;
  const caixaDe = async (id: string) => {
    await abrirTurnoDeTeste(db, dono, id);
    return (await prisma.cashRegister.findFirstOrThrow({ where: { establishment_id: id, number: 1 } })).id;
  };

  type Prod = { id: string; pres: string };
  const produto = async (nome: string, preco: number, custo: number, lojas: string[]): Promise<Prod> => {
    const p = exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}${nome}`, category_id: categoria.id, base_unit: "quilograma" } as never), nome) as { id: string };
    const a = exigir(await cat.criarApresentacaoAction(db, dono, p.id, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), `${nome} quilo`) as { id: string };
    for (const l of lojas) {
      exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: a.id, price: preco }), `${nome} preco`);
      exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: l, emporio_product_id: p.id, sealed: [], loose_qty: 10000, unit_cost: custo } as never), `${nome} estoque`);
    }
    return { id: p.id, pres: a.id };
  };
  const cliente = async (nome: string) => (await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${nome}`, person_kind: "pf", phone: "34990000125" } as never })).id;

  const agora = Date.now();
  let seq = 0;
  const chave = (p: string) => `cenario-pag-${p}-${agora}-${(seq += 1)}`;

  // --- Vendas: 45, uma por hora ---------------------------------------------------------------------------------
  const lojaVendas = await loja("Vendas");
  const caixaVendas = await caixaDe(lojaVendas);
  const prodVendas = await produto("Vendas Prod", 10, 5, [lojaVendas]);
  const cli = await cliente("Cliente");
  for (let k = 0; k < 45; k += 1) {
    const v = exigir(
      await vendas.venderAction(db, dono, {
        operation_key: chave("venda"),
        establishment_id: lojaVendas,
        cash_register_id: caixaVendas,
        customer_id: cli,
        items: [{ emporio_product_id: prodVendas.id, presentation_id: prodVendas.pres, quantity: 1, unit_price: 10 }],
        payments: [{ kind: "dinheiro", amount: 10 }],
      } as never),
      `venda ${k}`,
    ) as { id: string };
    await prisma.emporioSale.update({ where: { id: v.id }, data: { sold_at: new Date(agora - (45 - k) * HORA) } });
  }

  // --- Compras: 45, uma por dia ---------------------------------------------------------------------------------
  const lojaCompras = await loja("Compras");
  for (let k = 0; k < 45; k += 1) {
    await prisma.emporioPurchase.create({
      data: { tenant_id, establishment_id: lojaCompras, operation_key: chave("compra"), purchased_at: new Date(Date.UTC(2026, 0, 1 + k, 12)) },
    });
  }

  // --- Transferencias: 45, uma por dia --------------------------------------------------------------------------
  const lojaOrigem = await loja("Transf Origem");
  const lojaDestino = await loja("Transf Destino");
  for (let k = 0; k < 45; k += 1) {
    await prisma.stockTransfer.create({
      data: {
        tenant_id, origin_establishment_id: lojaOrigem, destination_establishment_id: lojaDestino,
        operation_key: chave("transf"), sent_at: new Date(Date.UTC(2026, 0, 1 + k, 15)),
      },
    });
  }

  // --- Producoes: 25 de um produto, uma por hora ----------------------------------------------------------------
  const lojaProducao = await loja("Producao");
  const prodProducao = await produto("Prod", 10, 5, [lojaProducao]);
  for (let k = 0; k < 25; k += 1) {
    await prisma.productionEntry.create({
      data: {
        tenant_id, establishment_id: lojaProducao, emporio_product_id: prodProducao.id, operation_key: chave("prod"),
        produced_qty: 1, composition_snapshot: [], created_at: new Date(agora - (25 - k) * HORA),
      },
    });
  }

  // --- Caixa: 45 movimentos e 45 sangrias pendentes -------------------------------------------------------------
  const lojaCaixa = await loja("Caixa");
  const caixaCaixa = await caixaDe(lojaCaixa);
  const sessao = await prisma.cashSession.findFirstOrThrow({ where: { open_register_id: caixaCaixa }, select: { id: true } });
  for (let k = 0; k < 45; k += 1) {
    await prisma.cashMovement.create({
      data: {
        tenant_id, establishment_id: lojaCaixa, direction: "entrada", amount: 200 + k, origin: "implantacao",
        occurred_at: new Date(agora - (45 - k) * 60_000 - DIA), cash_register_id: caixaCaixa,
      },
    });
    await prisma.cashHandover.create({
      data: {
        tenant_id, establishment_id: lojaCaixa, cash_register_id: caixaCaixa, cash_session_id: sessao.id, kind: "sangria",
        amount: 500 + k, operation_key: chave("entrega"), created_by_user_id: owner.id, created_at: new Date(Date.UTC(2020, 0, 1, k)),
      },
    });
  }

  // --- Curva: tres produtos de faturamento igual ----------------------------------------------------------------
  const lojaCurva = await loja("Curva");
  const caixaCurva = await caixaDe(lojaCurva);
  const tres: Prod[] = [];
  for (let k = 0; k < 3; k += 1) tres.push(await produto(`Igual ${k}`, 10, 5, [lojaCurva]));
  const vc = exigir(
    await vendas.venderAction(db, dono, {
      operation_key: chave("curva"),
      establishment_id: lojaCurva,
      cash_register_id: caixaCurva,
      customer_id: cli,
      items: tres.map((p) => ({ emporio_product_id: p.id, presentation_id: p.pres, quantity: 1, unit_price: 10 })),
      payments: [{ kind: "dinheiro", amount: 30 }],
    } as never),
    "venda da curva",
  ) as { id: string };
  await prisma.emporioSale.update({ where: { id: vc.id }, data: { sold_at: new Date(`${DIA_ISO}T15:00:00Z`) } });

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Dia da curva:", DIA_ISO);
  console.log("Lojas: vendas", lojaVendas, "| compras", lojaCompras, "| transf destino", lojaDestino, "| producao", lojaProducao, "| caixa", lojaCaixa, "| curva", lojaCurva);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
