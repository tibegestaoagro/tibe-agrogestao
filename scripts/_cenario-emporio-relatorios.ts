import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";
import { abrirTurnoDeTeste } from "./_emporio-turno";

/**
 * Monta, no banco LOCAL, o cenario dos relatorios por origem, da planilha e do
 * PDF, do grafico do fluxo, do custo do cartao e das contas sem vencimento do
 * Meu Emporio (Modulo 39, Q268 a Q273) para o roteiro
 * `scripts/navegador/emporio-relatorios-exportacao.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Rel " (e o sufixo " Rel" na adquirente):
 *   - "Rel Loja", com o turno do Caixa 1 aberto;
 *   - "Rel Ração": Quilo a R$ 20,00, 500 kg avulsos a R$ 10,00;
 *   - a conta "Rel Banco", com R$ 1.000,00, destino da taxa do cartao;
 *   - tres vendas de balcao: R$ 100,00 e R$ 100,00 em dinheiro e R$ 300,00 no
 *     credito parcelado 3x (Stone Rel, 3,5% em 30 dias: taxa de R$ 10,50),
 *     que e antecipado recebendo R$ 9,00 a menos (custo de R$ 9,00);
 *   - uma venda de e-commerce: R$ 300,00 de itens e R$ 30,00 de frete, em
 *     dinheiro (o faturamento do e-commerce NAO inclui o frete);
 *   - duas contas a pagar: R$ 9.000,00 daqui a 8 dias (a semana do saldo
 *     negativo) e R$ 80,00 sem data de vencimento (a da lista "Sem vencimento").
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Rel ";
const SUFIXO_ADQUIRENTE = " Rel";
const DIA = 86_400_000;

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const compras = (await prisma.emporioPurchase.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((d) => d.id);
  const conferencias = (await prisma.cashCount.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const antecipacoes = (await prisma.cardAnticipation.findMany({ where: { tenant_id, bank_account_id: { in: contas } }, select: { id: true } })).map((a) => a.id);
  const ondeHaDinheiro = [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }];
  const movimentos = await prisma.cashMovement.findMany({ where: { tenant_id, OR: ondeHaDinheiro }, select: { cash_transfer_id: true } });
  const transferencias = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...compras, ...devolucoes, ...conferencias, ...antecipacoes] } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...vendas, ...compras, ...lancamentos, ...lojas, ...antecipacoes] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: ondeHaDinheiro } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, id: { in: conferencias } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, OR: [{ sale_id: { in: vendas } }, { bank_account_id: { in: contas } }] } });
  await prisma.cardAnticipation.deleteMany({ where: { tenant_id, id: { in: antecipacoes } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { exchange_return_id: null } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { tenant_id, return_id: { in: devolucoes } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { tenant_id, id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioPurchaseItem.deleteMany({ where: { purchase_id: { in: compras } } });
  await prisma.emporioPurchase.deleteMany({ where: { tenant_id, id: { in: compras } } });
  await prisma.cardFeeRate.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardAcquirer.deleteMany({ where: { tenant_id, name: { endsWith: SUFIXO_ADQUIRENTE } } });
  await prisma.cashHandover.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashRegister.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  await prisma.bankAccount.deleteMany({ where: { tenant_id, id: { in: contas } } });
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

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const limpos = await limpar(tenant_id);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vend = await import("@/lib/actions/emporio-vendas");
  const cli = await import("@/lib/actions/emporio-clientes");
  const compras = await import("@/lib/actions/emporio-compras");
  const cartoes = await import("@/lib/actions/emporio-cartoes");
  const antecip = await import("@/lib/actions/emporio-antecipacao");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };
  const racao = (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "racao") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 500, unit_cost: 10 } as never), "estoque da racao");

  const conta = exigir(await cx.criarContaAction(db, ator, { name: `${PREFIXO}Banco`, bank: "Sicoob" }), "conta") as { id: string };
  exigir(await cx.saldoInicialCaixaAction(db, ator, { bank_account_id: conta.id, amount: 1000 }), "saldo inicial da conta");
  const turno = await abrirTurnoDeTeste(db, ator, loja.id);

  const adq = exigir(await cartoes.criarAdquirenteAction(db, ator, { name: `Stone${SUFIXO_ADQUIRENTE}` }), "adquirente") as { id: string };
  exigir(
    await cartoes.criarTaxaAction(db, ator, {
      establishment_id: loja.id,
      acquirer_id: adq.id,
      brand: "visa_master",
      kind: "credito_parcelado",
      installments_from: 2,
      installments_to: 12,
      fee_pct: 3.5,
      days: 30,
      bank_account_id: conta.id,
      valid_from: meioDia("2020-01-01"),
    } as never),
    "taxa do cartao",
  );

  const cf = (await cli.garantirConsumidorFinal(db)).id;
  const vender = async (chave: string, kg: number, pagamento: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    exigir(
      await vend.venderAction(db, ator, {
        operation_key: `cenario-rel-${chave}`,
        establishment_id: loja.id,
        customer_id: cf,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: kg }],
        payments: [pagamento],
        cash_register_id: turno.cash_register_id,
        ...extra,
      } as never),
      `venda ${chave}`,
    ) as { id: string };

  await vender("balcao-1", 5, { kind: "dinheiro", amount: 100 });
  await vender("balcao-2", 5, { kind: "dinheiro", amount: 100 });
  const cartao = await vender("balcao-cartao", 15, { kind: "credito_parcelado", amount: 300, installments: 3, acquirer_id: adq.id, brand: "visa_master" });
  await vender("ecommerce", 15, { kind: "dinheiro", amount: 330 }, { origin: "ecommerce", freight_amount: 30 });

  // A antecipacao com custo de R$ 9,00 (o previsto menos 9).
  const recs = await prisma.cardReceivable.findMany({ where: { tenant_id, sale_id: cartao.id } });
  const previsto = recs.reduce((s, r) => s + Math.round(Number(r.net_amount) * 100), 0);
  exigir(
    await antecip.anteciparAction(db, ator, { receivable_ids: recs.map((r) => r.id), operated_on: meioDia(hojeStr), received_net: (previsto - 900) / 100 } as never),
    "antecipacao",
  );

  // As duas contas a pagar: a com vencimento (a semana do saldo negativo) e a sem.
  const compra = async (chave: string, valor: number) =>
    exigir(
      await compras.criarCompraAction(db, ator, {
        operation_key: `cenario-rel-compra-${chave}`,
        establishment_id: loja.id,
        purchased_at: new Date(),
        received: false,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 1, item_total: valor }],
        payment: { kind: "a_prazo", due_date: meioDia(somaDias(hojeStr, 8)) },
      } as never),
      `compra ${chave}`,
    ) as { id: string };
  await compra("com-vencimento", 9000);
  const semData = await compra("sem-vencimento", 80);
  const entrada = await prisma.financialEntry.findFirst({ where: { tenant_id, related_module: "emporio", related_id: semData.id, entry_type: "expense" } });
  if (!entrada) throw new Error("A compra sem vencimento nao gerou conta a pagar.");
  await prisma.financialEntry.update({ where: { id: entrada.id }, data: { due_date: null } });

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id, "Conta:", conta.id, "Adquirente:", adq.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
