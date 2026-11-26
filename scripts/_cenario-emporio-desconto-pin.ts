import "./_env-local";
import bcrypt from "bcryptjs";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { soltarDespesaFixa } from "./_cenario-despesa-fixa";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do preco do cadastro, do desconto liberado por PIN e do brinde
 * (Modulo 39, Q327 a Q334) para o roteiro `scripts/navegador/emporio-desconto-pin.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Dp " (loja, produtos, usuarios):
 *   - "Dp Loja", limite de desconto de 10%, Caixa 1 com turno ABERTO (troco de R$ 100,00);
 *   - dp-vendedor@teste.local: Vendedor da loja (a sessao do roteiro);
 *   - dp-gestor@teste.local ("Dp Gestor"): Gestor da loja, com PIN de autorizacao "4321" (hash bcrypt,
 *     como `definirMeuPinAction` grava: e dado de teste da aplicacao, nao senha de login);
 *   - "Dp Aruana": uma apresentacao ("Quilo") a R$ 230,00;
 *   - "Dp Tranca": apresentacoes "Tranca" (R$ 50,00) e "BONUS" (R$ 0,00);
 *   - "Dp Sem Preço": uma apresentacao SEM preco na loja;
 *   - estoque nos tres.
 * Apaga antes tudo o que rodadas anteriores criaram (vendas, orcamentos, caixa, despesas variaveis).
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Dp ";
const EMAIL_VENDEDOR = "dp-vendedor@teste.local";
const EMAIL_GESTOR = "dp-gestor@teste.local";
const PIN_DO_GESTOR = "4321";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }, { sale_id: { in: vendas } }] } });
  await prisma.saleVariableExpense.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await soltarDespesaFixa(prisma, { tenant_id, lojas, lancamentos });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  // A venda faturada aponta para o orcamento e ele para ela: solta os dois lados antes.
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { quote_id: null, replaces_sale_id: null } });
  await prisma.emporioQuote.updateMany({ where: { tenant_id, establishment_id: { in: lojas } }, data: { sale_id: null, based_on_quote_id: null } });
  await prisma.emporioQuoteItem.deleteMany({ where: { tenant_id, quote: { establishment_id: { in: lojas } } } });
  await prisma.emporioQuote.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.cashHandover.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashRegister.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
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
  return { lojas: lojas.length, vendas: vendas.length };
}

async function usuario(tenant_id: string, email: string, name: string, emporio_role: "gestor" | "vendedor", pinHash: string | null) {
  const dados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_role, emporio_only: false, emporio_keys: [] as string[], emporio_auth_pin_hash: pinHash };
  return prisma.user.upsert({ where: { email }, update: dados, create: { ...dados, email, name, password_hash: SENHA_INUTIL } });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);
  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });

  const limpos = await limpar(tenant_id);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixaActions = await import("@/lib/actions/emporio-caixa");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const vendedor = await usuario(tenant_id, EMAIL_VENDEDOR, "Dp Vendedor", "vendedor", null);
  const gestor = await usuario(tenant_id, EMAIL_GESTOR, "Dp Gestor", "gestor", await bcrypt.hash(PIN_DO_GESTOR, 10));

  const loja = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: vendedor.id, establishment_id: loja.id },
      { tenant_id, user_id: gestor.id, establishment_id: loja.id },
    ],
  });

  async function produto(nome: string, unidade: "quilograma" | "unidade", apresentacoes: { nome: string; preco: number | null }[]) {
    const id = (exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}${nome}`, category_id: categoria!.id, base_unit: unidade } as never), nome) as { id: string }).id;
    for (const a of apresentacoes) {
      const apr = (exigir(await cat.criarApresentacaoAction(db, dono, id, { name: a.nome, base_qty: 1, is_sealed_package: false } as never), a.nome) as { id: string }).id;
      if (a.preco !== null) exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: apr, price: a.preco }), `preco ${a.nome}`);
    }
    exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: id, sealed: [], loose_qty: 500, unit_cost: 20 } as never), `estoque ${nome}`);
    return id;
  }
  await produto("Aruana", "quilograma", [{ nome: "Quilo", preco: 230 }]);
  await produto("Tranca", "unidade", [
    { nome: "Tranca", preco: 50 },
    { nome: "BONUS", preco: 0 },
  ]);
  await produto("Sem Preço", "quilograma", [{ nome: "Quilo", preco: null }]);

  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
  if (!registro) throw new Error("A loja nasceu sem o Caixa 1.");
  exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
  await abrirTurnoDeTeste(db, dono, loja.id);

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id, "| vendedor:", vendedor.id, "| gestor:", gestor.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
