import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";
import { abrirTurnoDeTeste } from "./_emporio-turno";

/**
 * Monta, no banco LOCAL, o cenario do boleto e do titular do cheque do Meu
 * Emporio (Modulo 39, Q278 a Q284) para o roteiro
 * `scripts/navegador/emporio-boleto.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Bol ":
 *   - "Bol Loja" (ponto de venda) com o turno do Caixa 1 aberto;
 *   - "Bol Ração": Quilo a R$ 20,00, 200 kg avulsos a R$ 10,00;
 *   - a conta bancaria "Bol Banco";
 *   - os clientes "Bol Maria" e "Bol Joao" (o roteiro vende para eles) e
 *     "Bol Atrasado", com uma venda de R$ 40,00 de 10 dias atras em um boleto
 *     numero "ATRASO-1" que venceu ha 3 dias (o filtro Vencidos).
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo. Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Bol ";

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const contatos = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((d) => d.id);
  const conferencias = (await prisma.cashCount.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const ondeHaDinheiro = [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }, { sale_id: { in: vendas } }];
  const movimentos = await prisma.cashMovement.findMany({ where: { tenant_id, OR: ondeHaDinheiro }, select: { cash_transfer_id: true } });
  const transferencias = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...devolucoes, ...conferencias] } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: ondeHaDinheiro } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, id: { in: conferencias } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  // O boleto aponta para o pagamento da venda, o pagamento financeiro e a conta.
  await prisma.emporioBoleto.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { exchange_return_id: null } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { tenant_id, return_id: { in: devolucoes } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { tenant_id, id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
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
  await prisma.bankAccount.deleteMany({ where: { tenant_id, id: { in: contas } } });
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, id: { in: contatos } } });
  return { lojas: lojas.length, vendas: vendas.length };
}

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000);

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
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

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };
  const racao = (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "racao") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 200, unit_cost: 10 } as never), "estoque");
  const conta = exigir(await caixa.criarContaAction(db, ator, { name: `${PREFIXO}Banco`, bank: "Sicoob" }), "conta") as { id: string };
  await abrirTurnoDeTeste(db, ator, loja.id);

  const maria = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Maria` } });
  const joao = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Joao` } });
  const atrasado = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Atrasado` } });

  // Vendida ha 10 dias, vencida ha 3: o boleto nao pode vencer antes do dia da venda.
  exigir(
    await vendas.venderAction(db, ator, {
      operation_key: `cenario-boleto-atraso-${Date.now()}`,
      establishment_id: loja.id,
      sold_at: diasAtras(10),
      customer_id: atrasado.id,
      items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 2 }],
      payments: [{ kind: "boleto", amount: 40, boleto: { due_on: diasAtras(3), number: "ATRASO-1" } }],
    } as never),
    "venda com boleto vencido",
  );

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id, "Conta:", conta.id, "Maria:", maria.id, "Joao:", joao.id, "Atrasado:", atrasado.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
