import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da escolha do cliente e do fornecedor (plano
 * 2 da Frente 2 do Meu Emporio, 2026-11-06) para o roteiro
 * `scripts/navegador/emporio-escolha.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Escolha ":
 *   - o recurso ligado para a conta inteira;
 *   - uma loja, "Escolha Loja", com o Caixa 1 ABERTO e o produto "Escolha
 *     Ração" (100 kg, R$ 20,00 o quilo, como o da F6b);
 *   - escolha-vendedor@teste.local (Vendedor) e escolha-gestor@teste.local
 *     (Gestor), os dois so da Escolha Loja;
 *   - os clientes da secao 3 da m96, com os mesmos telefones: Escolha Maria
 *     Souza (CPF 55631500205, telefone +55 (34) 99876-1234, com uma venda
 *     concluida antiga de R$ 50,00), Escolha Maria Sousa (so telefone, sem
 *     CPF), Escolha Joao da Ponte, Escolha Ze Carlos e Escolha Agro Alfa Ltda;
 *   - o fornecedor de fora "Escolha Agropecuária Central" e o fornecedor de
 *     propriedade "Escolha Fazenda Boa Vista".
 *
 * O roteiro ainda cadastra o "Pedro Escolha"; esta limpeza o apaga. Idempotente.
 * So banco local: `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Escolha ";
const CLIENTE_DO_ROTEIRO = "Pedro Escolha";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  gestor: "escolha-gestor@teste.local",
  vendedor: "escolha-vendedor@teste.local",
};

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const compras = (await prisma.emporioPurchase.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const propriedades = (await prisma.property.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const fornecedores = (
    await prisma.emporioSupplier.findMany({
      where: { tenant_id, OR: [{ name: { startsWith: PREFIXO } }, { property_id: { in: propriedades } }] },
      select: { id: true },
    })
  ).map((f) => f.id);
  const clientes = (
    await prisma.emporioCustomer.findMany({
      where: { tenant_id, OR: [{ name: { startsWith: PREFIXO } }, { name: CLIENTE_DO_ROTEIRO }] },
      select: { id: true },
    })
  ).map((c) => c.id);
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
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }] },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  // O orcamento so sai depois das vendas: a venda guarda `quote_id` com Restrict.
  await prisma.emporioQuote.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioPurchaseItem.deleteMany({ where: { purchase_id: { in: compras } } });
  await prisma.emporioPurchase.deleteMany({ where: { tenant_id, id: { in: compras } } });
  // Cliente e fornecedor depois de venda, orcamento e compra (as FKs sao Restrict e SetNull).
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, id: { in: clientes } } });
  await prisma.emporioSupplier.deleteMany({ where: { tenant_id, id: { in: fornecedores } } });
  await prisma.property.deleteMany({ where: { tenant_id, id: { in: propriedades } } });
  await prisma.cashHandover.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashRegister.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
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

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Escolha Gestor", "gestor");
  const vendedor = await usuario(tenant_id, EMAILS.vendedor, "Escolha Vendedor", "vendedor");

  // Assentos: o plano "grupo" tem 5; dono, gestor e vendedor cabem, os demais ficam desativados.
  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, vendedor.id] } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixaActions = await import("@/lib/actions/emporio-caixa");
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

  const racao = (
    exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }
  ).id;
  const quilo = (
    exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }
  ).id;
  exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
  exigir(
    await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 100, unit_cost: 5 } as never),
    "estoque",
  );

  // O troco do Caixa 1 e o turno aberto: sem turno aberto nao ha venda.
  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
  if (!registro) throw new Error(`A loja ${loja.id} nasceu sem o Caixa 1.`);
  exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
  await abrirTurnoDeTeste(db, dono, loja.id);

  // Os clientes da secao 3 da m96, com os mesmos telefones e documentos.
  const novo = (name: string, extra: Record<string, unknown>) =>
    prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${name}`, ...extra } as never });
  const souza = await novo("Maria Souza", { person_kind: "pf", phone: "+55 (34) 99876-1234", document: "55631500205" });
  await novo("Maria Sousa", { person_kind: "pf", phone: "34 3333-5678" });
  await novo("João da Ponte", { person_kind: "pf", phone: "998751111" });
  await novo("Zé Carlos", { person_kind: "pf", phone: "(55) 99123-4567" });
  await novo("Agro Alfa Ltda", { person_kind: "pj", document: "12ABC34501DE35", phone: "34 3000-1111" });

  // A venda concluida antiga da Maria Souza: a janela mostra "Última compra ..., R$ 50,00".
  // Pela action, para o contador de numeracao andar junto; depois a data volta 10 dias.
  const vendas = await import("@/lib/actions/emporio-vendas");
  const antiga = exigir(
    await vendas.venderAction(db, dono, {
      operation_key: `cenario-escolha-venda-${Date.now()}`,
      establishment_id: loja.id,
      customer_id: souza.id,
      items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 2.5, unit_price: 20 }],
      payments: [{ kind: "dinheiro", amount: 50 }],
    } as never),
    "venda antiga",
  ) as { id: string };
  await prisma.emporioSale.update({ where: { id: antiga.id }, data: { sold_at: new Date(Date.now() - 10 * 86_400_000) } });

  // Os fornecedores da Compra: um de fora e o da propriedade do dono (nenhuma tabela da fazenda aponta para ela).
  await prisma.emporioSupplier.create({
    data: { tenant_id, kind: "externo", name: `${PREFIXO}Agropecuária Central`, person_kind: "pj", document: "11222333000181", phone: "(34) 3222-0000" },
  });
  const fazenda = await prisma.property.create({ data: { tenant_id, name: `${PREFIXO}Fazenda Boa Vista`, city: "Montes Claros" } });
  await prisma.emporioSupplier.create({ data: { tenant_id, kind: "propriedade", property_id: fazenda.id, name: fazenda.name } });

  console.log("Conta do seed:", tenant_id);
  console.log("Loja:", loja.id, "Racao:", racao, "Maria Souza:", souza.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
