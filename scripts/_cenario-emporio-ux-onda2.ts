import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";
import { limparForaDaDemonstracao } from "./_limpar-conta-do-seed";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do Inicio novo do Meu Emporio (onda 2 da frente
 * de UX, plano 2026-11-25) para o roteiro `scripts/navegador/emporio-ux-onda2.py`.
 * Nao e suite.
 *
 * Antes de tudo tira da conta do seed o que outros cenarios deixaram (como o
 * cenario do manual): sem isso o Dono veria um aviso de estoque por loja de teste.
 * Ficam as tres lojas da demonstracao, se existirem.
 *
 * Com o prefixo "Ux ":
 *   - tres lojas: A e B, com problemas de todo tipo, e C, limpa (sem nenhum aviso);
 *   - o produto "Ux Racao": estoque abaixo do minimo em A e em B; so com estoque em C;
 *   - ux-gestor-a@teste.local: Gestor so da Loja A;
 *   - ux-gestor-c@teste.local: Gestor so da Loja C (o Inicio sem "Precisa de voce");
 *   - ux-caixa@teste.local: Caixa da Loja A (o Inicio dele e Vender);
 *   - ux-financeiro@teste.local: Financeiro (so a coluna do dinheiro);
 *   - dinheiro: um orcamento a vencer e um turno aberto desde ontem em A e em B
 *     (o Gestor de A so conta o de A); uma venda hoje em cada uma; um fiado vencido,
 *     um cheque vencido, uma compra a pagar vencida (R$ 100) e uma vencendo hoje
 *     (R$ 60), um pedido de pagamento pendente e uma venda de outubro (a comparacao
 *     do mes).
 *
 * Os assentos: o plano "grupo" tem 5; Dono, os dois Gestores, o Caixa e o
 * Financeiro cabem, e os demais usuarios da conta do seed ficam desativados.
 *
 * Idempotente. So banco local: `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Ux ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  gestorA: "ux-gestor-a@teste.local",
  gestorC: "ux-gestor-c@teste.local",
  caixa: "ux-caixa@teste.local",
  financeiro: "ux-financeiro@teste.local",
};
const DIA = 86_400_000;

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const meiaNoite = (dia: string) => new Date(`${dia}T00:00:00Z`);

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
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

  const limpo = await limparForaDaDemonstracao(tenant_id);
  console.log(`Sujeira de outros cenarios apagada: ${limpo.lojas} lojas, ${limpo.clientes} clientes, ${limpo.contas} contas bancarias.`);

  // Produtos e pedidos de pagamento de rodadas anteriores deste cenario (a loja ja saiu na limpeza).
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporioProdutos = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  await prisma.stockMovement.deleteMany({ where: { tenant_id, product_id: { in: produtos } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporioProdutos } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  const lojasAntigas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  if (lojasAntigas.length > 0) throw new Error("A limpeza deixou lojas Ux para tras.");

  const gestorA = await usuario(tenant_id, EMAILS.gestorA, "Ana Gestora", { emporio_role: "gestor", emporio_only: false });
  const gestorC = await usuario(tenant_id, EMAILS.gestorC, "Carlos Gestor", { emporio_role: "gestor", emporio_only: false });
  const caixa = await usuario(tenant_id, EMAILS.caixa, "Cida Caixa", { emporio_role: "caixa", emporio_only: false });
  const financeiro = await usuario(tenant_id, EMAILS.financeiro, "Fabio Financeiro", papelFinanceiro());

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({
    where: { tenant_id, id: { notIn: [owner.id, gestorA.id, gestorC.id, caixa.id, financeiro.id] } },
    data: { active: false },
  });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: { in: [gestorA.id, gestorC.id, caixa.id] } } });
  await prisma.emporioPaymentRequest.deleteMany({ where: { tenant_id, requested_by_user_id: gestorA.id } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const compras = await import("@/lib/actions/emporio-compras");
  const orcamentos = await import("@/lib/actions/emporio-orcamentos");
  const clientes = await import("@/lib/actions/emporio-clientes");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const lojaA = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja A` }), "loja A") as { id: string }).id;
  const lojaB = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja B` }), "loja B") as { id: string }).id;
  const lojaC = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja C` }), "loja C") as { id: string }).id;
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: gestorA.id, establishment_id: lojaA },
      { tenant_id, user_id: gestorC.id, establishment_id: lojaC },
      { tenant_id, user_id: caixa.id, establishment_id: lojaA },
    ],
  });

  const racao = (
    exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }
  ).id;
  const quilo = (
    exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }
  ).id;
  for (const l of [lojaA, lojaB, lojaC]) exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: quilo, price: 10 }), "preco");
  for (const [l, qtd] of [[lojaA, 1000], [lojaB, 100], [lojaC, 1000]] as const) {
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: l, emporio_product_id: racao, sealed: [], loose_qty: qtd, unit_cost: 4 } as never),
      "estoque",
    );
  }
  // O minimo so existe em A e em B (acima do estoque delas): em C nada pede reposicao.
  await prisma.stockLimit.createMany({
    data: [lojaA, lojaB].map((l) => ({ tenant_id, establishment_id: l, emporio_product_id: racao, min_qty: 2000 })),
  });

  const conta = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Conta`, bank: "Banco Ux" }), "conta") as { id: string }).id;
  exigir(await cx.saldoInicialCaixaAction(db, dono, { bank_account_id: conta, amount: 1000 }), "saldo inicial da conta");
  const caixaDe: Record<string, string> = {};
  for (const l of [lojaA, lojaB]) {
    const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: l, number: 1 } });
    if (!registro) throw new Error(`A loja ${l} nasceu sem o Caixa 1.`);
    exigir(await cx.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 200 }), "troco do caixa");
    const turno = await abrirTurnoDeTeste(db, dono, l);
    caixaDe[l] = turno.cash_register_id;
  }

  const cliente = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Cliente` } });
  const fornecedor = await prisma.emporioSupplier.create({ data: { tenant_id, kind: "externo", name: `${PREFIXO}Fornecedor` } as never });

  // As compras a prazo: uma vencida ontem (R$ 100) e uma que vence hoje (R$ 60).
  for (const [chave, venc, valor] of [["vencida", -1, 100], ["hoje", 0, 60]] as const) {
    exigir(
      await compras.criarCompraAction(db, dono, {
        operation_key: `cenario-ux2-compra-${chave}`,
        establishment_id: lojaB,
        supplier_id: fornecedor.id,
        purchased_at: new Date(),
        received: false,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 1, item_total: valor }],
        payment: { kind: "a_prazo", due_date: meioDia(somaDias(hojeStr, venc)) },
      } as never),
      `compra ${chave}`,
    );
  }

  const vender = async (chave: string, loja: string, qty: number, payments: unknown[], extra: Record<string, unknown> = {}) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-ux2-${chave}`,
        establishment_id: loja,
        cash_register_id: caixaDe[loja],
        customer_id: cliente.id,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: qty }],
        payments,
        ...extra,
      } as never),
      `venda ${chave}`,
    );
  // Hoje: R$ 40 em A e R$ 25 em B (dinheiro); o cheque (R$ 50, A) nasce para hoje e e antecipado para ontem abaixo.
  await vender("hoje-a", lojaA, 4, [{ kind: "dinheiro", amount: 40 }]);
  await vender("hoje-b", lojaB, 2.5, [{ kind: "dinheiro", amount: 25 }]);
  await vender("cheque", lojaA, 5, [{ kind: "cheque", amount: 50, check: { holder_name: "Titular Ux", number: "9101", bank: "Banco Ux", good_for: meioDia(hojeStr) } }]);
  await prisma.emporioCheck.updateMany({ where: { tenant_id, establishment_id: lojaA, number: "9101" }, data: { good_for: meioDia(somaDias(hojeStr, -2)) } });
  // O fiado vencido (R$ 30, ha 3 dias) e a venda de outubro (R$ 20, ha 40 dias).
  await vender("fiado", lojaA, 3, [{ kind: "fiado", amount: 30, due_date: meioDia(somaDias(hojeStr, -1)) }], { sold_at: new Date(Date.now() - 3 * DIA) });
  await vender("outubro", lojaB, 2, [{ kind: "dinheiro", amount: 20 }], { sold_at: new Date(Date.now() - 40 * DIA) });

  // Um orcamento a vencer em cada uma das lojas A e B (a validade vira hoje + 2).
  const consumidor = await clientes.garantirConsumidorFinal(db);
  for (const l of [lojaA, lojaB]) {
    const o = await orcamentos.salvarOrcamentoAction(db, dono, {
      operation_key: `cenario-ux2-orcamento-${l}`,
      establishment_id: l,
      customer_id: consumidor.id,
      items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 2 }],
    });
    if (!o.ok) throw new Error(`orcamento: ${o.message}`);
  }
  await prisma.emporioQuote.updateMany({
    where: { tenant_id, establishment_id: { in: [lojaA, lojaB] } },
    data: { valid_until: meiaNoite(somaDias(hojeStr, 2)) },
  });

  // Os turnos de A e B seguem abertos desde ontem (abertura antes do comeco de hoje em Sao Paulo).
  const inicioHoje = new Date(`${hojeStr}T03:00:00Z`).getTime();
  await prisma.cashSession.updateMany({
    where: { tenant_id, establishment_id: { in: [lojaA, lojaB] }, closed_at: null },
    data: { opened_at: new Date(inicioHoje - 2 * 3_600_000) },
  });

  // Um pedido de pagamento esperando aprovacao.
  await prisma.emporioPaymentRequest.create({
    data: { tenant_id, requested_by_user_id: gestorA.id, entry_ids: [], establishment_id: lojaA, total: 80, status: "pendente" },
  });

  console.log("Conta do seed:", tenant_id);
  console.log("Lojas A, B, C:", lojaA, lojaB, lojaC, "(hoje:", hojeStr + ")");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
