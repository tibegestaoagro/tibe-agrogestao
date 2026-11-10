import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da projecao, dos relatorios do dinheiro e do
 * rateio automatico do Meu Emporio (entrega 4 do financeiro das lojas, plano
 * 2026-11-08) para o roteiro `scripts/navegador/emporio-financeiro-projecao.py`.
 * Nao e suite.
 *
 * Na conta do seed, com o prefixo "Pro ":
 *   - o recurso ligado para a conta inteira;
 *   - "Pro Loja 1" (80 m2, 3 funcionarios) e "Pro Loja 2" (sem area, 1 funcionario);
 *   - pro-gestor@teste.local: Gestor da Loja 1 so;
 *   - pro-casa@teste.local: Financeiro (sem loja, so do Emporio);
 *   - a conta "Pro Banco", com R$ 5.000,00 e como conta do Pix das duas lojas e
 *     do cartao (credito a vista, 10 dias) da Loja 1;
 *   - vendas concluidas no MES ANTERIOR: Loja 1 R$ 300,00 e Loja 2 R$ 100,00 (a
 *     base do rateio por faturamento);
 *   - "Pro Devedor": fiado de R$ 80,00 vencido ha 20 dias e outro de R$ 60,00 que
 *     vence daqui a 20 dias (os dois na Loja 1);
 *   - uma venda de R$ 100,00 no cartao com a parcela daqui a 10 dias (Loja 1);
 *   - um cheque de R$ 70,00 "bom para" daqui a 40 dias (Loja 1);
 *   - "Pro Fornecedor": uma conta de R$ 200,00 daqui a 8 dias (Loja 1).
 *
 * Os assentos: o plano "grupo" tem 5; Dono, Gestor e Financeiro cabem, e os
 * demais usuarios da conta do seed ficam desativados.
 *
 * Apaga antes o que rodadas anteriores criaram, inclusive os modelos de despesa
 * fixa "Pro " e as contas que eles geraram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Pro ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  financeiro: "pro-casa@teste.local",
  gestor: "pro-gestor@teste.local",
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
  const modelos = (await prisma.fixedExpenseTemplate.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((m) => m.id);
  const ocorrencias = await prisma.fixedExpenseOccurrence.findMany({ where: { tenant_id, template_id: { in: modelos } }, select: { id: true, financial_entry_id: true } });
  const entradasDasFixas = ocorrencias.map((o) => o.financial_entry_id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: {
        tenant_id,
        OR: [
          { establishment_id: { in: lojas } },
          { related_id: { in: [...vendas, ...compras] } },
          { emporio_customer_id: { in: clientes } },
          { emporio_supplier_id: { in: fornecedores } },
          { id: { in: entradasDasFixas } },
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
    where: {
      tenant_id,
      OR: [{ target_id: { in: [...clientes, ...vendas, ...compras, ...pedidos, ...lancamentos, ...modelos, ...lojas] } }, { establishment_id: { in: lojas } }],
    },
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
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { tenant_id, template_id: { in: modelos } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id, template_id: { in: modelos } } });
  await prisma.fixedExpenseTemplate.deleteMany({ where: { tenant_id, id: { in: modelos } } });
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
    // So apaga: o manual fotografa a lista de clientes e as despesas sem os dados de teste.
    console.log("Limpo o prefixo", JSON.stringify(PREFIXO), "na conta", tenant_id);
    await prisma.$disconnect();
    return;
  }

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Pro Gestor", { emporio_role: "gestor", emporio_only: false });
  const financeiro = await usuario(tenant_id, EMAILS.financeiro, "Pro Financeiro", papelFinanceiro());

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, financeiro.id] } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  // Sem teto de pagamento e com os padroes do fiado: o fiado vencido nao pode bloquear a venda de montagem.
  await prisma.emporioSettings.upsert({
    where: { tenant_id },
    update: { fiado_due_days: 30, fiado_block_after_days: 15, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null },
    create: { tenant_id, fiado_due_days: 30, fiado_block_after_days: 15, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null },
  });

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const compras = await import("@/lib/actions/emporio-compras");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja1 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1`, area_m2: 80, employees_count: 3 } as never), "loja 1") as { id: string }).id;
  const loja2 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 2`, employees_count: 1 } as never), "loja 2") as { id: string }).id;
  await prisma.userEstablishment.create({ data: { tenant_id, user_id: gestor.id, establishment_id: loja1 } });

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

  // O dinheiro: a conta com R$ 5.000,00, o Pix das duas lojas e o cartao da Loja 1 (credito a vista em 10 dias).
  const conta = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Banco`, bank: "Banco Pro" }), "conta") as { id: string }).id;
  exigir(await cx.saldoInicialCaixaAction(db, dono, { bank_account_id: conta, amount: 5000 }), "saldo inicial da conta");
  const turno1 = await abrirTurnoDeTeste(db, dono, loja1);
  const turno2 = await abrirTurnoDeTeste(db, dono, loja2);
  exigir(await cx.definirContaPixAction(db, dono, loja1, { bank_account_id: conta }), "conta do Pix da Loja 1");
  exigir(await cx.definirContaPixAction(db, dono, loja2, { bank_account_id: conta }), "conta do Pix da Loja 2");
  exigir(
    await cx.definirRegraCartaoAction(db, dono, { establishment_id: loja1, kind: "credito_vista", fee_pct: 2, days: 10, bank_account_id: conta }),
    "regra de cartao",
  );

  const devedor = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Devedor`, person_kind: "pf", phone: "34998761234" } as never });
  // O cheque pede cliente de verdade (nao o Consumidor final): as vendas sem fiado saem em nome do Pro Cliente.
  const comprador = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Cliente`, person_kind: "pf", phone: "34998761235" } as never });
  const fornecedor = await prisma.emporioSupplier.create({ data: { tenant_id, kind: "externo", name: `${PREFIXO}Fornecedor` } as never });

  const vender = async (chave: string, loja: string, turno: { cash_register_id: string }, qty: number, pagamento: Record<string, unknown>, vendidaHa: number, clienteId: string = comprador.id) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-pro-${chave}`,
        establishment_id: loja,
        cash_register_id: turno.cash_register_id,
        customer_id: clienteId,
        sold_at: new Date(Date.now() - vendidaHa * DIA),
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: qty }],
        payments: [pagamento],
      } as never),
      `venda ${chave}`,
    );

  // A base do rateio por faturamento: o mes anterior, Loja 1 R$ 300,00 e Loja 2 R$ 100,00 (o dia 15 do mes passado).
  const agora = new Date();
  const dia15DoMesPassado = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 15, 15, 0, 0));
  const haDias = Math.round((Date.now() - dia15DoMesPassado.getTime()) / DIA);
  // O fiado vencido (R$ 80,00), vendido ha 25 dias, tambem cai no mes anterior: R$ 220,00 aqui fecham os R$ 300,00 da Loja 1.
  await vender("mes-anterior-1", loja1, turno1, 22, { kind: "pix", amount: 220 }, haDias);
  await vender("mes-anterior-2", loja2, turno2, 10, { kind: "pix", amount: 100 }, haDias);

  // O Pro Devedor: um fiado que vence daqui a 20 dias e, depois, um vencido ha 20 dias.
  // O em dia primeiro: com o vencido ja gravado, o bloqueio recusaria o segundo.
  await vender("devedor-em-dia", loja1, turno1, 6, { kind: "fiado", amount: 60, due_date: meioDia(somaDias(hojeStr, 20)) }, 0, devedor.id);
  await vender("devedor-vencido", loja1, turno1, 8, { kind: "fiado", amount: 80, due_date: meioDia(somaDias(hojeStr, -20)) }, 25, devedor.id);

  // O cartao a vista de R$ 100,00 (a parcela cai daqui a 10 dias) e o cheque de R$ 70,00 (bom para daqui a 40 dias).
  await vender("cartao", loja1, turno1, 10, { kind: "credito_vista", amount: 100 }, 0);
  await vender("cheque", loja1, turno1, 7, { kind: "cheque", amount: 70, check: { holder_name: "Titular Teste", number: "7001", bank: "Banco Pro", good_for: meioDia(somaDias(hojeStr, 40)) } }, 0);

  // A conta a pagar do Pro Fornecedor: R$ 200,00 daqui a 8 dias.
  exigir(
    await compras.criarCompraAction(db, dono, {
      operation_key: "cenario-pro-compra-200",
      establishment_id: loja1,
      supplier_id: fornecedor.id,
      purchased_at: new Date(),
      received: false,
      items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 1, item_total: 200 }],
      payment: { kind: "a_prazo", due_date: meioDia(somaDias(hojeStr, 8)) },
    } as never),
    "compra de R$ 200,00",
  );

  const cartao = await prisma.cardReceivable.findFirst({ where: { tenant_id, bank_account_id: conta, canceled_at: null } });
  if (!cartao) throw new Error("A venda no cartao nao gerou parcela a receber.");
  const cheque = await prisma.emporioCheck.findFirst({ where: { tenant_id, establishment_id: loja1 } });
  if (!cheque) throw new Error("A venda no cheque nao gerou cheque.");

  console.log("Conta do seed:", tenant_id);
  console.log("Lojas:", loja1, loja2, "Conta:", conta);
  console.log("Parcela de cartao em:", cartao.expected_on.toISOString().slice(0, 10), "Cheque bom para:", cheque.good_for.toISOString().slice(0, 10), "(hoje:", hojeStr + ")");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
