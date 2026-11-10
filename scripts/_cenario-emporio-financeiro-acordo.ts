import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do acordo de fiado, da alcada de pagamento e
 * do carimbo do Meu Emporio (entrega 3 do financeiro das lojas, plano
 * 2026-11-08) para o roteiro `scripts/navegador/emporio-financeiro-acordo.py`.
 * Nao e suite.
 *
 * Na conta do seed, com o prefixo "Aco ":
 *   - o recurso ligado para a conta inteira;
 *   - duas lojas, "Aco Loja 1" e "Aco Loja 2", a primeira com turno aberto;
 *   - aco-gestor@teste.local: Gestor da Loja 1;
 *   - aco-caixa@teste.local: Caixa da Loja 1, com o Caixa 1 ABERTO;
 *   - aco-casa@teste.local: Financeiro (sem loja, so do Emporio);
 *   - aco-gerente@teste.local: Gerente geral;
 *   - a conta bancaria "Aco Banco", com saldo inicial de R$ 5.000,00 e como conta
 *     do Pix e do cartao da Loja 1;
 *   - "Aco Devedor": dois fiados vencidos na Loja 1 (R$ 80,00 ha 20 dias e
 *     R$ 50,00 ha 5 dias), o que o bloqueia ate o acordo;
 *   - "Aco Atrasado": um acordo de R$ 40,00 em uma parcela vencida ha 20 dias
 *     (a parcela vencida bloqueia o fiado novo);
 *   - "Aco Fornecedor": tres contas a pagar (R$ 300,00, R$ 900,00 e R$ 700,00,
 *     todas daqui a 10 dias);
 *   - a alcada de pagamento em R$ 500,00;
 *   - uma venda de R$ 100,00 no cartao a vista, com a parcela na conta.
 *
 * Os assentos: o plano "grupo" tem 5; Dono, Gestor, Caixa, Financeiro e Gerente
 * cabem, e os demais usuarios da conta do seed ficam desativados.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Aco ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  financeiro: "aco-casa@teste.local",
  gestor: "aco-gestor@teste.local",
  caixa: "aco-caixa@teste.local",
  gerente: "aco-gerente@teste.local",
};
const DIA = 86_400_000;

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const compras = (await prisma.emporioPurchase.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const fornecedores = (await prisma.emporioSupplier.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((f) => f.id);
  const clientes = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const usuarios = (await prisma.user.findMany({ where: { tenant_id, email: { in: Object.values(EMAILS) } }, select: { id: true } })).map((u) => u.id);
  const acordos = (await prisma.emporioCreditAgreement.findMany({ where: { tenant_id, customer_id: { in: clientes } }, select: { id: true } })).map((a) => a.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: {
        tenant_id,
        OR: [
          { establishment_id: { in: lojas } },
          { related_id: { in: [...vendas, ...compras] } },
          { emporio_customer_id: { in: clientes } },
          { emporio_supplier_id: { in: fornecedores } },
          { agreement_id: { in: acordos } },
        ],
      },
      select: { id: true },
    })
  ).map((l) => l.id);
  const pedidos = (
    await prisma.emporioPaymentRequest.findMany({
      where: { tenant_id, OR: [{ requested_by_user_id: { in: usuarios } }, { entry_ids: { hasSome: lancamentos } }] },
      select: { id: true },
    })
  ).map((p) => p.id);

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas, ...compras, ...acordos, ...pedidos, ...lancamentos] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.emporioPaymentRequest.deleteMany({ where: { tenant_id, id: { in: pedidos } } });
  await prisma.emporioCreditRelease.deleteMany({ where: { tenant_id, OR: [{ customer_id: { in: clientes } }, { establishment_id: { in: lojas } }] } });
  await prisma.cashMovement.deleteMany({
    where: {
      tenant_id,
      OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }],
    },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioCreditAgreement.deleteMany({ where: { tenant_id, id: { in: acordos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioQuote.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioPurchaseItem.deleteMany({ where: { purchase_id: { in: compras } } });
  await prisma.emporioPurchase.deleteMany({ where: { tenant_id, id: { in: compras } } });
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, id: { in: clientes } } });
  await prisma.emporioSupplier.deleteMany({ where: { tenant_id, id: { in: fornecedores } } });
  await prisma.cashHandover.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashRegister.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await limparTaxasDeCenario(prisma, { tenant_id, establishment_ids: lojas });
  // O rateio e a ocorrência de despesa fixa seguram a loja (Restrict); ver a dívida 2.68.
  await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  await prisma.bankAccount.deleteMany({ where: { tenant_id, id: { in: contas } } });
}

async function usuario(tenant_id: string, email: string, name: string, extra: Record<string, unknown>) {
  const dados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_keys: [] as string[], ...extra };
  return prisma.user.upsert({
    where: { email },
    update: dados,
    create: { ...dados, email, name, password_hash: SENHA_INUTIL },
  });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  await limpar(tenant_id);
  if (process.argv.includes("--limpar")) {
    // So apaga: o manual fotografa a lista de clientes e as aprovacoes sem os dados de teste.
    await prisma.emporioSettings.updateMany({ where: { tenant_id }, data: { payment_approval_limit: null } });
    console.log("Limpo o prefixo", JSON.stringify(PREFIXO), "na conta", tenant_id);
    await prisma.$disconnect();
    return;
  }

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Aco Gestor", { emporio_role: "gestor", emporio_only: false });
  const caixa = await usuario(tenant_id, EMAILS.caixa, "Aco Caixa", { emporio_role: "caixa", emporio_only: false });
  const financeiro = await usuario(tenant_id, EMAILS.financeiro, "Aco Financeiro", papelFinanceiro());
  const gerente = await usuario(tenant_id, EMAILS.gerente, "Aco Gerente", { emporio_role: "gerente_geral", emporio_only: false });

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, caixa.id, financeiro.id, gerente.id] } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  // Os padroes do fiado e a alcada: o teto de R$ 500,00 e o que faz a conta de R$ 900,00 esperar aprovacao.
  await prisma.emporioSettings.upsert({
    where: { tenant_id },
    update: { fiado_due_days: 30, fiado_block_after_days: 15, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: 500 },
    create: { tenant_id, fiado_due_days: 30, fiado_block_after_days: 15, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: 500 },
  });

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const compras = await import("@/lib/actions/emporio-compras");
  const acordos = await import("@/lib/actions/emporio-acordos");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja1 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1` }), "loja 1") as { id: string }).id;
  const loja2 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 2` }), "loja 2") as { id: string }).id;
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: gestor.id, establishment_id: loja1 },
      { tenant_id, user_id: caixa.id, establishment_id: loja1 },
    ],
  });

  const racao = (
    exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }
  ).id;
  const quilo = (
    exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }
  ).id;
  for (const l of [loja1, loja2]) {
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: quilo, price: 10 }), "preco");
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: l, emporio_product_id: racao, sealed: [], loose_qty: 1000, unit_cost: 4 } as never),
      "estoque",
    );
  }

  // O dinheiro: a conta com R$ 5.000,00 (Pix e cartao da Loja 1) e o turno aberto da Loja 1.
  const conta = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Banco`, bank: "Banco Aco" }), "conta") as { id: string }).id;
  exigir(await cx.saldoInicialCaixaAction(db, dono, { bank_account_id: conta, amount: 5000 }), "saldo inicial da conta");
  const turno1 = await abrirTurnoDeTeste(db, dono, loja1);
  exigir(await cx.definirContaPixAction(db, dono, loja1, { bank_account_id: conta }), "conta do Pix");
  exigir(
    await cx.definirRegraCartaoAction(db, dono, { establishment_id: loja1, kind: "credito_vista", fee_pct: 2, days: 1, bank_account_id: conta }),
    "regra de cartao",
  );

  const cliente = (nome: string) => prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${nome}`, person_kind: "pf", phone: "34998761234" } as never });
  const devedor = await cliente("Devedor");
  const atrasado = await cliente("Atrasado");
  const fornecedor = await prisma.emporioSupplier.create({ data: { tenant_id, kind: "externo", name: `${PREFIXO}Fornecedor` } as never });

  const fiado = async (chave: string, clienteId: string, qty: number, valor: number, venceEm: number, vendidaHa: number) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-aco-${chave}`,
        establishment_id: loja1,
        cash_register_id: turno1.cash_register_id,
        customer_id: clienteId,
        sold_at: new Date(Date.now() - vendidaHa * DIA),
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: qty }],
        payments: [{ kind: "fiado", amount: valor, due_date: meioDia(somaDias(hojeStr, venceEm)) }],
      } as never),
      `venda ${chave}`,
    );

  // O Aco Devedor: dois fiados vencidos (20 dias e 5 dias), o que o bloqueia ate o acordo.
  // O de 5 dias primeiro: com o de 20 dias ja gravado, o bloqueio recusaria o segundo.
  await fiado("devedor-50", devedor.id, 5, 50, -5, 10);
  await fiado("devedor-80", devedor.id, 8, 80, -20, 25);

  // O Aco Atrasado: um acordo de uma parcela, que o cenario envelhece para 20 dias de atraso
  // (a rota nao aceita data passada, e a parcela vencida e o que bloqueia o fiado novo).
  await fiado("atrasado-40", atrasado.id, 4, 40, 10, 2);
  const origemAtrasado = await prisma.financialEntry.findFirst({
    where: { tenant_id, emporio_customer_id: atrasado.id, entry_type: "income", status: "pending" },
    select: { id: true },
  });
  if (!origemAtrasado) throw new Error("O fiado do Aco Atrasado nao gerou lancamento.");
  const acordo = exigir(
    await acordos.fazerAcordoAction(db, dono, atrasado.id, { entry_ids: [origemAtrasado.id], installments: [{ due_date: hojeStr, amount: 40 }] }),
    "acordo do Aco Atrasado",
  ) as { id: string };
  await prisma.financialEntry.updateMany({ where: { tenant_id, agreement_id: acordo.id, status: { not: "cancelled" }, entry_type: "income" }, data: { due_date: meioDia(somaDias(hojeStr, -20)) } });

  // As contas a pagar do Aco Fornecedor (daqui a 10 dias).
  for (const [chave, valor] of [["300", 300], ["900", 900], ["700", 700]] as const) {
    exigir(
      await compras.criarCompraAction(db, dono, {
        operation_key: `cenario-aco-compra-${chave}`,
        establishment_id: loja1,
        supplier_id: fornecedor.id,
        purchased_at: new Date(),
        received: false,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 1, item_total: valor }],
        payment: { kind: "a_prazo", due_date: meioDia(somaDias(hojeStr, 10)) },
      } as never),
      `compra ${chave}`,
    );
  }

  // A venda no cartao a vista, ontem: a parcela cai hoje na conta e fica sem carimbo.
  exigir(
    await vendas.venderAction(db, dono, {
      operation_key: "cenario-aco-cartao",
      establishment_id: loja1,
      cash_register_id: turno1.cash_register_id,
      customer_id: devedor.id,
      sold_at: new Date(Date.now() - 1 * DIA),
      items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 10 }],
      payments: [{ kind: "credito_vista", amount: 100 }],
    } as never),
    "venda no cartao",
  );

  const cartao = await prisma.cardReceivable.findFirst({ where: { tenant_id, bank_account_id: conta, canceled_at: null } });
  if (!cartao) throw new Error("A venda no cartao nao gerou parcela a receber.");

  console.log("Conta do seed:", tenant_id);
  console.log("Lojas:", loja1, loja2, "Conta:", conta, "Parcela de cartao em:", cartao.expected_on.toISOString().slice(0, 10), "(hoje:", hojeStr + ")");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
