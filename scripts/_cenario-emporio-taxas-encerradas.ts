import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";
import { abrirTurnoDeTeste } from "./_emporio-turno";

/**
 * Monta, no banco LOCAL, o cenario das taxas de cartao ENCERRADAS e da edicao de
 * venda (Meu Emporio, Modulo 39) para o roteiro
 * `scripts/navegador/emporio-taxas-encerradas.py`. Nao e suite. Reproduz a Central
 * do Milho de 18/11/2026: taxa que so valia nos dias das vendas antigas, e uma venda
 * no fiado que o cliente quer trocar para o debito.
 *
 * Na conta do seed, com o prefixo "Txe " (e o sufixo " Txe" na adquirente):
 *   - "Txe Loja", com o produto "Txe Milho" a R$ 52,00 o quilo e 100 kg de estoque;
 *   - a adquirente "STONE Txe" e as taxas da loja:
 *       debito Visa/Master 1,67%, de hoje-4 a hoje-2 (encerrada, SEM venda)
 *       debito Elo 2,00%, de hoje-7 a hoje-6 (encerrada, SEM venda)
 *       credito a vista Elo 3,00%, de hoje-5 a hoje-3 (encerrada, EM USO: venda de hoje-3)
 *       debito Visa/Master 1,49%, desde hoje-1 (vigente)
 *       debito Elo 2,50%, desde hoje-3 (vigente; cruza com a Elo de 2,00% se ela for estendida)
 *   - "Txe Paulo" em Contatos, com uma venda no FIADO de R$ 52,00 de hoje-2, num turno
 *     ja ENCERRADO; e um turno novo aberto agora, como em producao;
 *   - uma venda de R$ 52,00 de hoje-3 no credito a vista Elo (a que prende a taxa em uso).
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo. Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Txe ";
const SUFIXO_ADQUIRENTE = " Txe";
const DIA = 86_400_000;
const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const contatos = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((d) => d.id);
  const conferencias = (await prisma.cashCount.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const ondeHaDinheiro = [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }];
  const movimentos = await prisma.cashMovement.findMany({ where: { tenant_id, OR: ondeHaDinheiro }, select: { cash_transfer_id: true } });
  const transferencias = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];
  const lancamentos = (await prisma.financialEntry.findMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...devolucoes, ...conferencias] } }] },
    select: { id: true },
  })).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: ondeHaDinheiro } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, id: { in: conferencias } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  // A venda editada aponta para a que ela substitui (Restrict): solta o vinculo antes de apagar.
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { exchange_return_id: null, replaces_sale_id: null } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { tenant_id, return_id: { in: devolucoes } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { tenant_id, id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  // As taxas da loja saem com ela; a adquirente do roteiro (sufixo) sai depois, sem linha nenhuma.
  await prisma.cardFeeRate.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardAcquirer.deleteMany({ where: { tenant_id, name: { endsWith: SUFIXO_ADQUIRENTE } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
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
  const cartoes = await import("@/lib/actions/emporio-cartoes");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const turnos = await import("@/lib/actions/emporio-turno");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };
  const milho = (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}Milho`, category_id: categoria.id, base_unit: "quilograma" } as never), "milho") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, milho, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 52 }), "preco");
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: milho, sealed: [], loose_qty: 100, unit_cost: 40 } as never), "estoque");

  const conta = exigir(await caixa.criarContaAction(db, ator, { name: `${PREFIXO}Banco`, bank: "Sicoob" }), "conta") as { id: string };
  exigir(await caixa.definirContaPixAction(db, ator, loja.id, { bank_account_id: conta.id }), "conta pix");
  exigir(await caixa.saldoInicialCaixaAction(db, ator, { establishment_id: loja.id, amount: 200 } as never), "saldo inicial");
  const turno1 = await abrirTurnoDeTeste(db, ator, loja.id);

  const stone = exigir(await cartoes.criarAdquirenteAction(db, ator, { name: `STONE${SUFIXO_ADQUIRENTE}` }), "adquirente") as { id: string };
  const taxa = async (brand: string, kind: string, fee_pct: number, days: number, de: number, ate: number | null) =>
    exigir(
      await cartoes.criarTaxaAction(db, ator, {
        establishment_id: loja.id,
        acquirer_id: stone.id,
        brand,
        kind,
        installments_from: 1,
        installments_to: 1,
        fee_pct,
        days,
        bank_account_id: conta.id,
        valid_from: meioDia(somaDias(hojeStr, de)),
        valid_to: ate === null ? null : meioDia(somaDias(hojeStr, ate)),
      } as never),
      `taxa ${brand} ${kind}`,
    );
  await taxa("visa_master", "debito", 1.67, 1, -4, -2);
  await taxa("elo", "debito", 2, 1, -7, -6);
  await taxa("elo", "credito_vista", 3, 30, -5, -3);
  await taxa("visa_master", "debito", 1.49, 1, -1, null);
  await taxa("elo", "debito", 2.5, 1, -3, null);

  const paulo = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Paulo` } });
  const venda = async (chave: string, ha: number, payments: unknown[], customer_id?: string) =>
    exigir(
      await vendas.venderAction(db, ator, {
        operation_key: `cenario-txe-${chave}`,
        establishment_id: loja.id,
        cash_register_id: turno1.cash_register_id,
        ...(customer_id ? { customer_id } : {}),
        sold_at: new Date(`${somaDias(hojeStr, -ha)}T18:37:00Z`),
        items: [{ emporio_product_id: milho, presentation_id: quilo, quantity: 1 }],
        payments,
      } as never),
      `venda ${chave}`,
    ) as { id: string };
  const emUso = await venda("elo", 3, [{ kind: "credito_vista", amount: 52, brand: "elo", acquirer_id: stone.id }], paulo.id);
  const fiado = await venda("fiado", 2, [{ kind: "fiado", amount: 52, due_date: meioDia(somaDias(hojeStr, 28)) }], paulo.id);

  // O turno das vendas antigas ja fechou; o que existe agora e um turno novo, como em producao.
  const saldo = await caixa.saldoDoCaixa(db, turno1.cash_register_id);
  exigir(await turnos.encerrarTurnoAction(db, ator, turno1.id, { operation_key: "cenario-txe-encerra", counted: saldo / 100, malote_amount: 0 }), "encerrar turno");
  await abrirTurnoDeTeste(db, ator, loja.id);

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id, "STONE:", stone.id, "Fiado:", fiado.id, "Elo em uso:", emUso.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
