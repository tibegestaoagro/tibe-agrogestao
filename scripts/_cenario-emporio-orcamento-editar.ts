import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario de editar, cancelar e refazer orcamento do
 * Meu Emporio (Modulo 39, Q285 a Q290) para o roteiro
 * `scripts/navegador/emporio-orcamento-editar.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "OrE ":
 *   - "OrE Loja" com o turno do Caixa 1 aberto, validade de orcamento de 7 dias;
 *   - "OrE Ração" (R$ 20,00, 100 kg) e "OrE Parado" (R$ 15,00 no orcamento
 *     vencido, R$ 18,00 hoje);
 *   - tres clientes de cadastro completo: "OrE Aberto", "OrE Vencido", "OrE Faturado";
 *   - tres orcamentos: ABERTO (2 kg de Ração), VENCIDO (valid_until ontem, 1 kg
 *     de Parado orcado a R$ 15,00) e FATURADO (2 kg de Ração, na venda do dono);
 *   - ore-gestor@teste.local: Gestor; ore-vendedor@teste.local: Vendedor.
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local.
 */
exigirBancoLocal();

const PREFIXO = "OrE ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = { gestor: "ore-gestor@teste.local", vendedor: "ore-vendedor@teste.local" };

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const conferencias = (await prisma.cashCount.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...conferencias] } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, id: { in: conferencias } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  // O orcamento so sai depois das vendas (a venda guarda `quote_id` com Restrict);
  // o vinculo `based_on_quote_id` e SetNull, entao a ordem entre orcamentos nao importa.
  await prisma.emporioQuote.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
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
}

async function usuario(tenant_id: string, email: string, name: string, emporio_role: "gestor" | "vendedor") {
  const dados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_role, emporio_only: false, emporio_keys: [] as string[] };
  return prisma.user.upsert({ where: { email }, update: dados, create: { ...dados, email, name, password_hash: SENHA_INUTIL } });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  await limpar(tenant_id);

  const gestor = await usuario(tenant_id, EMAILS.gestor, "OrE Gestor", "gestor");
  const vendedor = await usuario(tenant_id, EMAILS.vendedor, "OrE Vendedor", "vendedor");

  // Assentos: o plano "grupo" tem 5; os demais usuarios do seed ficam desativados.
  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, vendedor.id] } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixaActions = await import("@/lib/actions/emporio-caixa");
  const orc = await import("@/lib/actions/emporio-orcamentos");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja` }), "loja") as { id: string };
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: gestor.id, establishment_id: loja.id },
      { tenant_id, user_id: vendedor.id, establishment_id: loja.id },
    ],
  });

  async function produto(nome: string, preco: number, estoque: number) {
    const p = (exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}${nome}`, category_id: categoria!.id, base_unit: "quilograma" } as never), nome) as { id: string }).id;
    const ap = (exigir(await cat.criarApresentacaoAction(db, dono, p, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), `quilo de ${nome}`) as { id: string }).id;
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: preco }), `preco de ${nome}`);
    exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: p, sealed: [], loose_qty: estoque, unit_cost: 5 } as never), `estoque de ${nome}`);
    return { id: p, ap };
  }
  const racao = await produto("Ração", 20, 100);
  const parado = await produto("Parado", 15, 50);

  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
  if (!registro) throw new Error(`A loja ${loja.id} nasceu sem o Caixa 1.`);
  exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
  await abrirTurnoDeTeste(db, dono, loja.id);

  await prisma.emporioSettings.upsert({
    where: { tenant_id },
    update: { quote_validity_days: 7 },
    create: { tenant_id, quote_validity_days: 7 },
  });

  const cliente = (name: string, document: string, phone: string) =>
    prisma.emporioCustomer.create({ data: { tenant_id, name, person_kind: "pf", document, phone } as never });
  const cAberto = await cliente(`${PREFIXO}Aberto`, "73529184691", "11987654321");
  const cVencido = await cliente(`${PREFIXO}Vencido`, "41827365919", "11955554444");
  const cFaturado = await cliente(`${PREFIXO}Faturado`, "56294831709", "11933332222");

  const ator = { id: vendedor.id, role: vendedor.role };
  async function salvar(chave: string, customer_id: string, p: { id: string; ap: string }, quantity: number) {
    const r = await orc.salvarOrcamentoAction(db, ator, {
      operation_key: `cenario-orcamento-editar-${chave}-${Date.now()}`,
      establishment_id: loja.id,
      customer_id,
      items: [{ emporio_product_id: p.id, presentation_id: p.ap, quantity }],
    });
    if (!r.ok) throw new Error(`orcamento ${chave}: ${r.message}`);
    return r.data;
  }

  const aberto = await salvar("aberto", cAberto.id, racao, 2);
  const vencido = await salvar("vencido", cVencido.id, parado, 1);
  const faturado = await salvar("faturado", cFaturado.id, racao, 2);

  // O vencido: envelhecido para ontem; o preco de hoje do Parado sobe para R$ 18,00.
  const ontemBr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - 86_400_000));
  await prisma.emporioQuote.update({ where: { id: vencido.id }, data: { valid_until: new Date(`${ontemBr}T00:00:00.000Z`) } });
  exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: parado.ap, price: 18 }), "preco de hoje do parado");

  // O faturado: a venda do dono, em dinheiro, pelo orcamento.
  exigir(
    await vendas.venderAction(db, dono, {
      operation_key: `cenario-orcamento-editar-venda-${Date.now()}`,
      establishment_id: loja.id,
      customer_id: cFaturado.id,
      quote_id: faturado.id,
      items: [{ emporio_product_id: racao.id, presentation_id: racao.ap, quantity: 2 }],
      payments: [{ kind: "dinheiro", amount: 40 }],
    } as never),
    "venda do orcamento faturado",
  );

  console.log("Conta do seed:", tenant_id);
  console.log("Loja:", loja.id, "| aberto:", aberto.numero, "vencido:", vencido.numero, "faturado:", faturado.numero);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
