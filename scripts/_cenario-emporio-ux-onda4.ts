import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";
import { limparForaDaDemonstracao } from "./_limpar-conta-do-seed";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do Dinheiro em menos telas e das listas longas do Meu
 * Emporio (onda 4 da frente de UX, plano 2026-11-26) para o roteiro
 * `scripts/navegador/emporio-ux-onda4.py`. Nao e suite.
 *
 * Antes de tudo tira da conta do seed o que outros cenarios deixaram (lojas, clientes, contas
 * bancarias e modelos de despesa fora da demonstracao: o percorredor de chaves estrangeiras
 * leva junto vendas, contas e lancamentos), e apaga o que uma rodada anterior DESTE cenario
 * criou fora das lojas (os produtos "U4 ").
 *
 * Com o prefixo "U4 ":
 *   - loja "U4 Loja", com o Caixa 1 aberto (troco de R$ 200,00) e o Pix na "U4 Conta";
 *   - "U4 Conta": conta bancaria com saldo inicial de R$ 1.000,00;
 *   - u4-gestor@teste.local: Gestor da U4 Loja, SEM Dinheiro;
 *   - u4-fin@teste.local: Financeiro (sem loja, so do Emporio);
 *   - o Dono (owner@example.com);
 *   - contas a pagar: o frete de uma venda de e-commerce (R$ 20,00) e TRES comissoes "U4 Comissao
 *     Ana" (5% de cada venda de R$ 100,00 em dinheiro: R$ 5,00 cada), do mesmo dia. O frete sai
 *     ANTES da regra existir, senao a venda dele geraria uma quarta comissao no grupo;
 *   - fiado: "U4 Joao" (CPF 123.456.789-00, telefone (38) 99988-1122, vendas de ha 23 e 16 dias,
 *     vencidas ha 10 e 3 dias), "U4 Maria" (vencido ha 5 dias) e "U4 Pedro" (a vencer);
 *   - dois cheques de "U4 Joao": um vencido (R$ 120,00, bom para ha 3 dias) e um a vencer (R$ 80,00);
 *   - um boleto em aberto (R$ 60,00, "U4 Pedro");
 *   - 45 produtos "U4 Produto NN" com 100 unidades; os NN de 41 a 45 com minimo de 500 (os 5 do
 *     "Precisa repor"), e o produto de venda "U4 Racao".
 *
 * Os assentos: o plano "grupo" tem 5; Dono, Gestor e Financeiro cabem, e os demais usuarios
 * da conta do seed ficam desativados.
 *
 * Idempotente. So banco local: `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "U4 ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = { gestor: "u4-gestor@teste.local", financeiro: "u4-fin@teste.local" };
const DIA = 86_400_000;

// O dia de hoje em Sao Paulo, pelo calendario (sem horario de verao desde 2019: UTC-3).
const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function usuario(tenant_id: string, email: string, name: string, extra: Record<string, unknown>) {
  const dados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_keys: [] as string[], emporio_only: false, ...extra };
  return prisma.user.upsert({
    where: { email },
    update: { ...dados, name },
    create: { ...dados, email, name, password_hash: SENHA_INUTIL },
  });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const limpo = await limparForaDaDemonstracao(tenant_id);
  console.log(`Sujeira de outros cenarios apagada: ${limpo.lojas} lojas, ${limpo.clientes} clientes, ${limpo.contas} contas bancarias.`);

  // Produtos de rodadas anteriores deste cenario (a loja ja saiu na limpeza, com vendas e movimentos).
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporioProdutos = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  await prisma.stockMovement.deleteMany({ where: { tenant_id, product_id: { in: produtos } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporioProdutos } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  if ((await prisma.establishment.count({ where: { tenant_id, name: { startsWith: PREFIXO } } })) > 0) throw new Error("A limpeza deixou lojas U4 para tras.");

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Zeca Gestor U4", { emporio_role: "gestor" });
  const financeiro = await usuario(tenant_id, EMAILS.financeiro, "Fin U4", papelFinanceiro());

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, financeiro.id] } }, data: { active: false } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: { in: [gestor.id, financeiro.id] } } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const desp = await import("@/lib/actions/emporio-despesas");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja` }), "loja") as { id: string }).id;
  await prisma.userEstablishment.create({ data: { tenant_id, user_id: gestor.id, establishment_id: loja } });

  // O produto de venda.
  const racao = (
    exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "racao") as { id: string }
  ).id;
  const quilo = (
    exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }
  ).id;
  exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja, presentation_id: quilo, price: 10 }), "preco");
  exigir(
    await est.implantarEstoqueAction(db, dono, { establishment_id: loja, emporio_product_id: racao, sealed: [], loose_qty: 10000, unit_cost: 4 } as never),
    "estoque da racao",
  );

  // 45 produtos com 100 unidades; os de 41 a 45 com minimo de 500 (abaixo do minimo: "Precisa repor").
  for (let n = 1; n <= 45; n++) {
    const nn = String(n).padStart(2, "0");
    const id = (
      exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Produto ${nn}`, category_id: categoria.id, base_unit: "unidade" } as never), `produto ${nn}`) as { id: string }
    ).id;
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: loja, emporio_product_id: id, sealed: [], loose_qty: 100, unit_cost: 2 } as never),
      `estoque ${nn}`,
    );
    if (n >= 41) exigir(await est.definirLimitesAction(db, dono, { establishment_id: loja, emporio_product_id: id, min_qty: 500, max_qty: null }), `minimo ${nn}`);
  }

  // O dinheiro de partida: a conta (1.000), o troco do Caixa 1 (200) com o turno aberto e o Pix na conta.
  const conta = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Conta`, bank: "Banco U4" }), "conta") as { id: string }).id;
  exigir(await cx.saldoInicialCaixaAction(db, dono, { bank_account_id: conta, amount: 1000 }), "saldo inicial da conta");
  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja, number: 1 } });
  if (!registro) throw new Error(`A loja ${loja} nasceu sem o Caixa 1.`);
  exigir(await cx.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 200 }), "troco do caixa");
  await abrirTurnoDeTeste(db, dono, loja);
  exigir(await cx.definirContaPixAction(db, dono, loja, { bank_account_id: conta }), "conta do Pix");

  const cliente = async (name: string, extra: Record<string, unknown> = {}) => prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${name}`, ...extra } as never });
  const joao = await cliente("João", { document: "12345678900", phone: "(38) 99988-1122" });
  const maria = await cliente("Maria", { phone: "(38) 98877-6655" });
  const pedro = await cliente("Pedro");
  const consumidor = (await (await import("@/lib/actions/emporio-clientes")).garantirConsumidorFinal(db)).id;

  const rodada = Date.now();
  const vender = async (chave: string, qty: number, customer_id: string, payments: unknown[], extra: Record<string, unknown> = {}) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-u4-${chave}-${rodada}`,
        establishment_id: loja,
        cash_register_id: registro.id,
        customer_id,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: qty }],
        payments,
        ...extra,
      } as never),
      `venda ${chave}`,
    );

  // O frete a pagar, ANTES da regra do Vendeu, Pagou.
  await vender("frete", 5, consumidor, [{ kind: "dinheiro", amount: 70 }], { freight_amount: 20, origin: "ecommerce" });

  // O fiado e os titulos a receber (sem regra de comissao ainda).
  const doDia = (n: number) => ({ sold_at: meioDia(somaDias(hojeStr, n)) });
  await vender("joao-1", 10, joao.id, [{ kind: "fiado", amount: 100, due_date: meioDia(somaDias(hojeStr, -10)) }], doDia(-23));
  await vender("joao-2", 5, joao.id, [{ kind: "fiado", amount: 50, due_date: meioDia(somaDias(hojeStr, -3)) }], doDia(-16));
  await vender("maria", 4, maria.id, [{ kind: "fiado", amount: 40, due_date: meioDia(somaDias(hojeStr, -5)) }], doDia(-9));
  await vender("pedro", 3, pedro.id, [{ kind: "fiado", amount: 30, due_date: meioDia(somaDias(hojeStr, 10)) }]);
  await vender("cheque-vencido", 12, joao.id, [{ kind: "cheque", amount: 120, check: { holder_name: "Titular Vencido", number: "U4-CH-A", bank: "Banco U4", good_for: meioDia(somaDias(hojeStr, -3)) } }], doDia(-10));
  await vender("cheque-a-vencer", 8, joao.id, [{ kind: "cheque", amount: 80, check: { holder_name: "Titular A Vencer", number: "U4-CH-B", bank: "Banco U4", good_for: meioDia(somaDias(hojeStr, 15)) } }]);
  await vender("boleto", 6, pedro.id, [{ kind: "boleto", amount: 60, boleto: { due_on: meioDia(somaDias(hojeStr, 7)), number: "U4-BOL-1" } }]);

  // A regra e as TRES vendas que geram as comissoes do mesmo dia, mesma loja, mesmo nome.
  exigir(await desp.criarRegraVariavelAction(db, dono, { establishment_id: loja, name: `${PREFIXO}Comissão Ana`, kind: "percentual", value: 5 } as never), "regra");
  for (let i = 1; i <= 3; i++) await vender(`comissao-${i}`, 10, consumidor, [{ kind: "dinheiro", amount: 100 }]);

  const contas = await desp.listarContasAPagarAction(db, dono, { status: "pending", establishment_id: loja });
  const lista = exigir(contas, "contas a pagar");
  const comissoes = lista.filter((c) => c.origin === "vendeu_pagou" && c.name === `${PREFIXO}Comissão Ana`);
  const fretes = lista.filter((c) => c.origin === "frete");
  console.log("Contas na U4 Loja:", lista.map((c) => `${c.origin}:${c.name}:${c.open_amount}:${c.due_date?.slice(0, 10)}`).join(" | "));
  if (comissoes.length !== 3) throw new Error(`Esperava 3 comissoes, achei ${comissoes.length}.`);
  if (new Set(comissoes.map((c) => c.due_date)).size !== 1) throw new Error("As comissoes nao tem o mesmo vencimento.");
  if (fretes.length !== 1) throw new Error(`Esperava 1 frete, achei ${fretes.length}.`);

  console.log("Conta do seed:", tenant_id);
  console.log("Loja:", loja, "Conta:", conta, "(hoje em Sao Paulo:", hojeStr + ")");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
