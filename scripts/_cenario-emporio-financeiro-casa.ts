import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da casa do Financeiro do Meu Emporio
 * (entrega 1 do financeiro das lojas, plano 2026-11-07) para o roteiro
 * `scripts/navegador/emporio-financeiro-casa.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Fin ":
 *   - o recurso ligado para a conta inteira;
 *   - duas lojas, "Fin Loja 1" e "Fin Loja 2";
 *   - uma conta bancaria, "Fin Conta", com saldo inicial de R$ 1.000,00 e
 *     como conta do Pix e do cartao da Loja 1;
 *   - fin-gestor@teste.local: Gestor da Loja 1;
 *   - fin-caixa@teste.local: Caixa da Loja 1, com o Caixa 1 ABERTO (R$ 200,00 de troco);
 *   - fin-casa@teste.local: Financeiro (sem loja, so do Emporio);
 *   - uma compra a prazo vencida ontem (R$ 100,00, "Fin Fornecedor");
 *   - um fiado vencido ontem (R$ 30,00), um cheque bom para hoje (R$ 50,00)
 *     e um cartao de credito a vista que cai hoje (R$ 100,00, 2%), todos do
 *     cliente "Fin Cliente";
 *   - um orcamento da Loja 1 para o Consumidor final (o Financeiro o abre).
 *
 * Os assentos: o plano "grupo" tem 5; Dono, Gestor, Caixa e Financeiro cabem, e
 * os demais usuarios da conta do seed ficam desativados.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Fin ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  financeiro: "fin-casa@teste.local",
  gestor: "fin-gestor@teste.local",
  caixa: "fin-caixa@teste.local",
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
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: {
        tenant_id,
        OR: [
          { establishment_id: { in: lojas } },
          { related_id: { in: [...vendas, ...compras] } },
          { emporio_customer_id: { in: clientes } },
          { emporio_supplier_id: { in: fornecedores } },
        ],
      },
      select: { id: true },
    })
  ).map((l) => l.id);

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
  await prisma.cardFeeRule.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] } });
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
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  await limpar(tenant_id);

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Fin Gestor", { emporio_role: "gestor", emporio_only: false });
  const caixa = await usuario(tenant_id, EMAILS.caixa, "Fin Caixa", { emporio_role: "caixa", emporio_only: false });
  const financeiro = await usuario(tenant_id, EMAILS.financeiro, "Fin Financeiro", papelFinanceiro());

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, caixa.id, financeiro.id] } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const compras = await import("@/lib/actions/emporio-compras");
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
  for (const l of [loja1, loja2]) exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: quilo, price: 10 }), "preco");
  exigir(
    await est.implantarEstoqueAction(db, dono, { establishment_id: loja1, emporio_product_id: racao, sealed: [], loose_qty: 1000, unit_cost: 4 } as never),
    "estoque",
  );

  // O dinheiro de partida: a conta (1.000) e o troco do Caixa 1 da Loja 1 (200), com o turno aberto.
  const conta = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Conta`, bank: "Banco Fin" }), "conta") as { id: string }).id;
  exigir(await cx.saldoInicialCaixaAction(db, dono, { bank_account_id: conta, amount: 1000 }), "saldo inicial da conta");
  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja1, number: 1 } });
  if (!registro) throw new Error(`A loja ${loja1} nasceu sem o Caixa 1.`);
  exigir(await cx.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 200 }), "troco do caixa");
  await abrirTurnoDeTeste(db, dono, loja1);
  exigir(await cx.definirContaPixAction(db, dono, loja1, { bank_account_id: conta }), "conta do Pix");
  exigir(
    await cx.definirRegraCartaoAction(db, dono, { establishment_id: loja1, kind: "credito_vista", fee_pct: 2, days: 1, bank_account_id: conta }),
    "regra de cartao",
  );

  const cliente = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Cliente` } });
  const fornecedor = await prisma.emporioSupplier.create({ data: { tenant_id, kind: "externo", name: `${PREFIXO}Fornecedor` } as never });

  // A compra a prazo, vencida ontem: a conta que o Financeiro paga pela conta bancaria.
  const compra = await compras.criarCompraAction(db, dono, {
    operation_key: "cenario-fin-casa-compra",
    establishment_id: loja1,
    supplier_id: fornecedor.id,
    purchased_at: new Date(),
    received: false,
    items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 1, item_total: 100 }],
    payment: { kind: "a_prazo", due_date: meioDia(somaDias(hojeStr, -1)) },
  } as never);
  exigir(compra, "compra a prazo");

  // O fiado vencido, o cheque bom para hoje e o cartao que cai hoje (a regra de cartao leva 1 dia).
  const turno = await prisma.cashSession.findFirst({ where: { tenant_id, establishment_id: loja1, closed_at: null } });
  const caixaId = turno?.open_register_id ?? registro.id;
  const vender = async (chave: string, qty: number, payments: unknown[], extra: Record<string, unknown> = {}) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-fin-casa-${chave}`,
        establishment_id: loja1,
        cash_register_id: caixaId,
        customer_id: cliente.id,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: qty }],
        payments,
        ...extra,
      } as never),
      `venda ${chave}`,
    );
  await vender("fiado", 3, [{ kind: "fiado", amount: 30, due_date: meioDia(somaDias(hojeStr, -1)) }], { sold_at: new Date(Date.now() - 3 * DIA) });
  await vender("cheque", 5, [{ kind: "cheque", amount: 50, check: { number: "9001", bank: "Banco Fin", good_for: meioDia(hojeStr) } }]);
  await vender("cartao", 10, [{ kind: "credito_vista", amount: 100 }], { sold_at: new Date(Date.now() - 1 * DIA) });

  // Um orcamento da Loja 1, para o Financeiro abrir (a leitura dele vale para o Financeiro).
  const orcamento = await (await import("@/lib/actions/emporio-orcamentos")).salvarOrcamentoAction(db, dono, {
    operation_key: "cenario-fin-casa-orcamento",
    establishment_id: loja1,
    customer_id: (await (await import("@/lib/actions/emporio-clientes")).garantirConsumidorFinal(db)).id,
    items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 2 }],
  });
  if (!orcamento.ok) throw new Error(`orcamento: ${orcamento.message}`);

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
