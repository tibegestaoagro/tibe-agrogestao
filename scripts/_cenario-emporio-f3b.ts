import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da F3b do Meu Empório (Modulo 39) para o
 * roteiro `scripts/navegador/emporio-f3b.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "F3b ":
 *   - "F3b Loja" (ponto de venda), com R$ 200,00 de saldo inicial na gaveta;
 *   - "F3b Ração": Quilo a R$ 20,00, 100 kg avulsos a R$ 10,00;
 *   - a conta bancaria "F3b Banco", conta PIX da loja, e as regras de cartao:
 *     debito 2% em 1 dia, credito a vista 3% em 30 dias, parcelado 4% em 30;
 *   - uma venda de R$ 100,00 no credito feita ha 40 dias: a parcela de
 *     R$ 97,00 ja caiu na conta (o aceite da baixa na data);
 *   - o cliente "F3b Maria" em Contatos.
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "F3b ";

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const contatos = (await prisma.contact.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((d) => d.id);
  const conferencias = (await prisma.cashCount.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const movimentos = await prisma.cashMovement.findMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] },
    select: { cash_transfer_id: true },
  });
  const transferencias = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];
  const lancamentos = (await prisma.financialEntry.findMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...devolucoes, ...conferencias] } }] },
    select: { id: true },
  })).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, id: { in: conferencias } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  // A venda nova da troca aponta para a devolucao, e a devolucao para a venda.
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { exchange_return_id: null } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { tenant_id, return_id: { in: devolucoes } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { tenant_id, id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.cardFeeRule.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  await prisma.bankAccount.deleteMany({ where: { tenant_id, id: { in: contas } } });
  await prisma.contact.deleteMany({ where: { tenant_id, id: { in: contatos } } });
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
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, kind: "ponto_venda", max_discount_pct: 10 }), "loja") as { id: string };

  const racao = (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "racao") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 100, unit_cost: 10 } as never), "estoque da racao");

  const conta = exigir(await caixa.criarContaAction(db, ator, { name: `${PREFIXO}Banco`, bank: "Sicoob" }), "conta") as { id: string };
  exigir(await caixa.definirContaPixAction(db, ator, loja.id, { bank_account_id: conta.id }), "conta pix");
  for (const [kind, fee_pct, days] of [["debito", 2, 1], ["credito_vista", 3, 30], ["credito_parcelado", 4, 30]] as const) {
    exigir(await caixa.definirRegraCartaoAction(db, ator, { establishment_id: loja.id, kind, fee_pct, days, bank_account_id: conta.id } as never), `regra ${kind}`);
  }
  exigir(await caixa.saldoInicialCaixaAction(db, ator, { establishment_id: loja.id, amount: 200 } as never), "saldo inicial");

  const quarentaDiasAtras = new Date(Date.now() - 40 * 86_400_000);
  exigir(await vendas.venderAction(db, ator, {
    operation_key: `cenario-f3b-${Date.now()}`,
    establishment_id: loja.id,
    sold_at: quarentaDiasAtras,
    items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 5 }],
    payments: [{ kind: "credito_vista", amount: 100 }],
  } as never), "venda antiga no credito");

  const maria = await prisma.contact.create({ data: { tenant_id, name: `${PREFIXO}Maria` } });

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id, "Ração:", racao, "Conta:", conta.id, "Maria:", maria.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
