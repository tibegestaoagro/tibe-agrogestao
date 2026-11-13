import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario das contas PIX escolhidas no lancamento do Meu Emporio
 * (Modulo 39, Q310 a Q317) para o roteiro `scripts/navegador/emporio-contas-pix.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Px " (lojas, produto, cliente):
 *   - "Px Loja A" e "Px Loja B", cada uma com o Caixa 1 ABERTO (troco de R$ 100,00);
 *   - "Px Ração" (R$ 20,00 o quilo), 500 kg em cada loja;
 *   - tres contas: "PIX LOJA A" (so a loja A, CNPJ 11.222.333/0001-81, favorecido "Agromax Loja A Ltda"),
 *     "PIX LOJA B" (so a loja B) e "PIX SITE" (todas as lojas, CNPJ e favorecido proprios);
 *   - a conta PIX padrao da loja A e "PIX LOJA A", a da loja B e "PIX LOJA B";
 *   - pix-caixa@teste.local: Caixa so da loja A;
 *   - uma venda antiga (R$ 20,00) na loja A, paga em PIX na conta "PIX LOJA A", para o teste de edicao;
 *   - um fiado de R$ 40,00 do "Px Cliente" na loja A, para o teste de receber por PIX.
 * Apaga antes tudo o que rodadas anteriores criaram (inclusive as contas "Rot ..." que o roteiro cadastra).
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "Px ";
const EMAIL_CAIXA = "pix-caixa@teste.local";
const NOMES_CONTAS = ["PIX LOJA A", "PIX LOJA B", "PIX SITE"];
const PREFIXO_CONTA_ROTEIRO = "Rot ";

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const contas = (
    await prisma.bankAccount.findMany({
      where: { tenant_id, OR: [{ name: { in: NOMES_CONTAS } }, { name: { startsWith: PREFIXO_CONTA_ROTEIRO } }] },
      select: { id: true },
    })
  ).map((c) => c.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, name: { startsWith: PREFIXO } } });
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

  // A conta some se nada mais a segura; se segurar (outro cenario), sai de cena arquivada e renomeada.
  for (const id of contas) {
    try {
      await prisma.bankAccount.delete({ where: { id } });
    } catch {
      await prisma.bankAccount.update({ where: { id }, data: { archived_at: new Date(), name: `Px antiga ${id}` } });
    }
  }
  return { lojas: lojas.length, vendas: vendas.length, contas: contas.length };
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
  const vendas = await import("@/lib/actions/emporio-vendas");
  const clientes = await import("@/lib/actions/emporio-clientes");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const lojaA = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja A`, max_discount_pct: 10 }), "loja A") as { id: string };
  const lojaB = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja B`, max_discount_pct: 10 }), "loja B") as { id: string };

  const produtoId = (exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, dono, produtoId, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  for (const loja of [lojaA, lojaB]) {
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: produtoId, sealed: [], loose_qty: 500, unit_cost: 5 } as never),
      "estoque",
    );
    const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
    if (!registro) throw new Error(`A loja ${loja.id} nasceu sem o Caixa 1.`);
    exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
    await abrirTurnoDeTeste(db, dono, loja.id);
  }

  // O Caixa so da loja A, direto no banco (hash que nenhuma senha produz: a sessao vem do cookie).
  const caixa = await prisma.user.upsert({
    where: { email: EMAIL_CAIXA },
    update: { active: true, role: "OPERADOR", tenant_id, emporio_role: "caixa", emporio_only: false, emporio_keys: [] },
    create: { tenant_id, email: EMAIL_CAIXA, name: "Px Caixa A", role: "OPERADOR", password_hash: "sem-senha", emporio_role: "caixa", emporio_only: false, emporio_keys: [] },
  });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: caixa.id } });
  await prisma.userEstablishment.create({ data: { tenant_id, user_id: caixa.id, establishment_id: lojaA.id } });

  const conta = async (input: Record<string, unknown>) => exigir(await caixaActions.criarContaAction(db, dono, input as never), String(input.name)) as { id: string };
  const contaA = await conta({ name: "PIX LOJA A", bank: "Banco A", document: "11.222.333/0001-81", beneficiary: "Agromax Loja A Ltda", pix_all_establishments: false, establishment_ids: [lojaA.id] });
  const contaB = await conta({ name: "PIX LOJA B", bank: "Banco B", pix_all_establishments: false, establishment_ids: [lojaB.id] });
  const contaSite = await conta({ name: "PIX SITE", bank: "Banco Site", document: "45.723.174/0001-10", beneficiary: "Agromax Site Ltda", pix_all_establishments: true });
  exigir(await caixaActions.definirContaPixAction(db, dono, lojaA.id, { bank_account_id: contaA.id }), "padrao da loja A");
  exigir(await caixaActions.definirContaPixAction(db, dono, lojaB.id, { bank_account_id: contaB.id }), "padrao da loja B");

  const consumidor = await clientes.garantirConsumidorFinal(db);
  const agora = Date.now();
  const venda = exigir(
    await vendas.venderAction(db, dono, {
      operation_key: `cenario-pix-antiga-${agora}`,
      establishment_id: lojaA.id,
      customer_id: consumidor.id,
      items: [{ emporio_product_id: produtoId, presentation_id: quilo, quantity: 1, unit_price: 20 }],
      payments: [{ kind: "pix", amount: 20, bank_account_id: contaA.id }],
    } as never),
    "venda antiga",
  ) as { id: string };

  const cliente = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Cliente` } });
  exigir(
    await vendas.venderAction(db, dono, {
      operation_key: `cenario-pix-fiado-${agora}`,
      establishment_id: lojaA.id,
      customer_id: cliente.id,
      items: [{ emporio_product_id: produtoId, presentation_id: quilo, quantity: 2, unit_price: 20 }],
      payments: [{ kind: "fiado", amount: 40, due_date: new Date(agora + 5 * 86_400_000) }],
    } as never),
    "fiado",
  );

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s),", limpos.contas, "conta(s)");
  console.log("Lojas:", lojaA.id, lojaB.id, "| Contas:", contaA.id, contaB.id, contaSite.id, "| venda antiga:", venda.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
