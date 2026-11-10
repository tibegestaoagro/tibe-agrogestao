import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario de desfazer acordo de fiado e de recalcular o
 * mes do rateio automatico do Meu Emporio (Q275 e Q277, plano 2026-11-09) para o
 * roteiro `scripts/navegador/emporio-acordo-rateio.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Des ":
 *   - o recurso ligado para a conta inteira;
 *   - "Des Loja 1" (3 funcionarios) e "Des Loja 2" (1 funcionario), a primeira com turno aberto;
 *   - des-casa@teste.local: Financeiro (sem loja, so do Emporio);
 *   - "Des Livre": dois fiados vencidos (R$ 80,00 ha 20 dias e R$ 50,00 ha 5 dias)
 *     absorvidos por um acordo de R$ 130,00 em 2 parcelas futuras, SEM movimento;
 *   - "Des Pago": um fiado vencido de R$ 60,00 absorvido por um acordo de uma
 *     parcela, com R$ 10,00 JA pagos nela (nao se desfaz);
 *   - a despesa fixa "Des Aluguel" de R$ 1.000,00 por funcionarios, com o mes
 *     corrente gerado e nenhuma conta paga.
 *
 * Os assentos: o plano "grupo" tem 5; Dono e Financeiro cabem, e os demais
 * usuarios da conta do seed ficam desativados.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Des ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  financeiro: "des-casa@teste.local",
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
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const clientes = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const modelos = (await prisma.fixedExpenseTemplate.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((m) => m.id);
  const ocorrencias = await prisma.fixedExpenseOccurrence.findMany({ where: { tenant_id, template_id: { in: modelos } }, select: { id: true, financial_entry_id: true } });
  const entradasDasFixas = ocorrencias.map((o) => o.financial_entry_id);
  const acordos = (await prisma.emporioCreditAgreement.findMany({ where: { tenant_id, customer_id: { in: clientes } }, select: { id: true } })).map((a) => a.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: {
        tenant_id,
        OR: [
          { establishment_id: { in: lojas } },
          { related_id: { in: vendas } },
          { emporio_customer_id: { in: clientes } },
          { agreement_id: { in: acordos } },
          { id: { in: entradasDasFixas } },
        ],
      },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas, ...acordos, ...lancamentos, ...modelos, ...lojas] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.emporioCreditRelease.deleteMany({ where: { tenant_id, OR: [{ customer_id: { in: clientes } }, { establishment_id: { in: lojas } }] } });
  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }] } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { tenant_id, template_id: { in: modelos } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioCreditAgreement.deleteMany({ where: { tenant_id, id: { in: acordos } } });
  await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id, template_id: { in: modelos } } });
  await prisma.fixedExpenseTemplate.deleteMany({ where: { tenant_id, id: { in: modelos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioQuote.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, id: { in: clientes } } });
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
    console.log("Limpo o prefixo", JSON.stringify(PREFIXO), "na conta", tenant_id);
    await prisma.$disconnect();
    return;
  }

  const financeiro = await usuario(tenant_id, EMAILS.financeiro, "Des Financeiro", papelFinanceiro());

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, financeiro.id] } }, data: { active: false } });

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
  const vendas = await import("@/lib/actions/emporio-vendas");
  const acordos = await import("@/lib/actions/emporio-acordos");
  const despesas = await import("@/lib/actions/emporio-despesas");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja1 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1`, employees_count: 3 } as never), "loja 1") as { id: string }).id;
  const loja2 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 2`, employees_count: 1 } as never), "loja 2") as { id: string }).id;

  const racao = (
    exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }
  ).id;
  const quilo = (
    exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }
  ).id;
  exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja1, presentation_id: quilo, price: 10 }), "preco");
  exigir(
    await est.implantarEstoqueAction(db, dono, { establishment_id: loja1, emporio_product_id: racao, sealed: [], loose_qty: 1000, unit_cost: 4 } as never),
    "estoque",
  );
  const turno1 = await abrirTurnoDeTeste(db, dono, loja1);

  const cliente = (nome: string) => prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${nome}`, person_kind: "pf", phone: "34998761234" } as never });
  const livre = await cliente("Livre");
  const pago = await cliente("Pago");

  const fiado = async (chave: string, clienteId: string, qty: number, valor: number, venceEm: number, vendidaHa: number) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-des-${chave}`,
        establishment_id: loja1,
        cash_register_id: turno1.cash_register_id,
        customer_id: clienteId,
        sold_at: new Date(Date.now() - vendidaHa * DIA),
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: qty }],
        payments: [{ kind: "fiado", amount: valor, due_date: meioDia(somaDias(hojeStr, venceEm)) }],
      } as never),
      `venda ${chave}`,
    );

  // Des Livre: dois fiados vencidos (o de 5 dias primeiro, para o bloqueio nao recusar o segundo) e um acordo de 2 parcelas futuras.
  await fiado("livre-50", livre.id, 5, 50, -5, 10);
  await fiado("livre-80", livre.id, 8, 80, -20, 25);
  const origensLivre = await prisma.financialEntry.findMany({
    where: { tenant_id, emporio_customer_id: livre.id, entry_type: "income", status: "pending" },
    select: { id: true },
  });
  if (origensLivre.length !== 2) throw new Error("O Des Livre deveria ter 2 fiados em aberto.");
  exigir(
    await acordos.fazerAcordoAction(db, dono, livre.id, {
      entry_ids: origensLivre.map((o) => o.id),
      installments: [
        { due_date: somaDias(hojeStr, 30), amount: 65 },
        { due_date: somaDias(hojeStr, 60), amount: 65 },
      ],
    } as never),
    "acordo do Des Livre",
  );

  // Des Pago: um fiado, um acordo de uma parcela e R$ 10,00 ja pagos nela (movimento: nao se desfaz).
  await fiado("pago-60", pago.id, 6, 60, -5, 10);
  const origemPago = await prisma.financialEntry.findFirst({
    where: { tenant_id, emporio_customer_id: pago.id, entry_type: "income", status: "pending" },
    select: { id: true },
  });
  if (!origemPago) throw new Error("O Des Pago nao tem fiado em aberto.");
  const acordoPago = exigir(
    await acordos.fazerAcordoAction(db, dono, pago.id, { entry_ids: [origemPago.id], installments: [{ due_date: somaDias(hojeStr, 30), amount: 60 }] } as never),
    "acordo do Des Pago",
  ) as { id: string };
  const parcela = await prisma.financialEntry.findFirst({
    where: { tenant_id, agreement_id: acordoPago.id, category: "Acordo de fiado", status: "pending" },
    select: { id: true, category: true },
  });
  const parcelaPaga = parcela ?? (await prisma.financialEntry.findFirst({ where: { tenant_id, agreement_id: acordoPago.id, entry_type: "income", id: { not: origemPago.id } }, select: { id: true } }));
  if (!parcelaPaga) throw new Error("O acordo do Des Pago nao gerou parcela.");
  await prisma.financialPayment.create({ data: { tenant_id, entry_id: parcelaPaga.id, amount: 10, paid_at: new Date() } });

  // A despesa por funcionarios: o mes corrente nasce com as lojas de hoje e nenhuma conta paga.
  exigir(
    await despesas.criarDespesaFixaAction(db, dono, { name: `${PREFIXO}Aluguel`, amount: 1000, due_day: 28, split_kind: "funcionarios" }),
    "despesa Des Aluguel",
  );

  console.log("Conta do seed:", tenant_id);
  console.log("Lojas:", loja1, loja2, "Clientes:", livre.id, pago.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
