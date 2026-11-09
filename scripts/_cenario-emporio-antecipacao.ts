import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { VIGENCIA_DESDE_SEMPRE } from "@/lib/emporio/cartao";

/**
 * Monta, no banco LOCAL, o cenario da antecipacao de recebiveis do cartao (Meu
 * Emporio, Modulo 39, entregas 2 e 3 do cartao) para o roteiro
 * `scripts/navegador/emporio-antecipacao.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Ant " (e o sufixo " Ant" nas adquirentes):
 *   - "Ant Loja" (ponto de venda), com o turno do Caixa 1 aberto;
 *   - "Ant Ração": Quilo a R$ 20,00, 100 kg avulsos a R$ 10,00;
 *   - a conta bancaria "Ant Banco", conta PIX da loja e destino das duas taxas;
 *   - "Stone Ant": dias corridos, sem antecipacao (o roteiro liga o proximo dia
 *     util pela tela), Visa/Master parcelado 2 a 12x: 3% em 30 dias;
 *   - "Rede Ant": dias corridos, sem antecipacao (o roteiro liga a automatica
 *     pela tela), Elo parcelado 2 a 12x: 3% mais R$ 1,00 fixo, em 30 dias.
 * Nenhuma venda: o roteiro vende pelo balcao. Apaga antes tudo o que rodadas
 * anteriores criaram com o prefixo, inclusive as antecipacoes e as despesas.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Ant ";
const SUFIXO_ADQUIRENTE = " Ant";

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((d) => d.id);
  const conferencias = (await prisma.cashCount.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const antecipacoes = (await prisma.cardAnticipation.findMany({ where: { tenant_id, bank_account_id: { in: contas } }, select: { id: true } })).map((a) => a.id);
  const ondeHaDinheiro = [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }];
  const movimentos = await prisma.cashMovement.findMany({ where: { tenant_id, OR: ondeHaDinheiro }, select: { cash_transfer_id: true } });
  const transferencias = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];
  const lancamentos = (await prisma.financialEntry.findMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...devolucoes, ...conferencias, ...antecipacoes] } }] },
    select: { id: true },
  })).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: ondeHaDinheiro } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, id: { in: conferencias } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
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
  await prisma.cardFeeRate.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardAcquirer.deleteMany({ where: { tenant_id, name: { endsWith: SUFIXO_ADQUIRENTE } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
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
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const limpos = await limpar(tenant_id);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixa = await import("@/lib/actions/emporio-caixa");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };

  const racao = (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "racao") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 100, unit_cost: 10 } as never), "estoque da racao");

  const conta = exigir(await caixa.criarContaAction(db, ator, { name: `${PREFIXO}Banco`, bank: "Sicoob" }), "conta") as { id: string };
  exigir(await caixa.definirContaPixAction(db, ator, loja.id, { bank_account_id: conta.id }), "conta pix");
  exigir(await caixa.saldoInicialCaixaAction(db, ator, { establishment_id: loja.id, amount: 200 } as never), "saldo inicial");
  await abrirTurnoDeTeste(db, ator, loja.id);

  // O padrao do banco e o proximo dia util: o cenario parte de dias corridos para o roteiro mudar pela tela.
  const stone = await prisma.cardAcquirer.create({ data: { tenant_id, name: `Stone${SUFIXO_ADQUIRENTE}`, business_day_rule: "dias_corridos", updated_by_user_id: owner.id } });
  const rede = await prisma.cardAcquirer.create({ data: { tenant_id, name: `Rede${SUFIXO_ADQUIRENTE}`, business_day_rule: "dias_corridos", updated_by_user_id: owner.id } });
  const linhas = [
    { acquirer_id: stone.id, brand: "visa_master", fee_fixed: 0 },
    { acquirer_id: rede.id, brand: "elo", fee_fixed: 1 },
  ] as const;
  for (const l of linhas) {
    await prisma.cardFeeRate.create({
      data: {
        tenant_id,
        establishment_id: loja.id,
        acquirer_id: l.acquirer_id,
        brand: l.brand,
        kind: "credito_parcelado",
        installments_from: 2,
        installments_to: 12,
        fee_pct: 3,
        fee_fixed: l.fee_fixed,
        days: 30,
        bank_account_id: conta.id,
        valid_from: new Date(VIGENCIA_DESDE_SEMPRE),
        valid_to: null,
        updated_by_user_id: owner.id,
      },
    });
  }

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id, "Ração:", racao, "Conta:", conta.id, "Stone:", stone.id, "Rede:", rede.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
