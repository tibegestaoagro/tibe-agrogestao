import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da Frente 1 do Meu Emporio (clientes e
 * fornecedores, plano 2026-11-06) para o roteiro
 * `scripts/navegador/emporio-clientes.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Cli ":
 *   - o recurso ligado para a conta inteira;
 *   - uma loja, "Cli Loja", com o Caixa 1 ABERTO (turno aberto pelo Dono);
 *   - o produto "Cli Ração" (100 kg, R$ 20,00 o quilo);
 *   - uma propriedade da conta, "Cli Fazenda", que ainda nao e fornecedor;
 *   - cli-gestor@teste.local: Gestor; cli-vendedor@teste.local: Vendedor;
 *     cli-caixa@teste.local: Caixa (os tres so da Cli Loja).
 *
 * Os clientes e o fornecedor nascem no roteiro, pela tela. Os assentos: o plano
 * "grupo" tem 5; Dono, Gestor, Vendedor e Caixa cabem, e os demais usuarios da
 * conta do seed ficam desativados.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Cli ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  caixa: "cli-caixa@teste.local",
  gestor: "cli-gestor@teste.local",
  vendedor: "cli-vendedor@teste.local",
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

  // O Caixa e cadastrado pela Equipe a cada rodada: o email antigo sai do caminho.
  const antigo = await prisma.user.findUnique({ where: { email: EMAILS.caixa } });
  if (antigo) {
    try {
      await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: antigo.id } });
      await prisma.user.delete({ where: { id: antigo.id } });
    } catch {
      await prisma.user.update({ where: { id: antigo.id }, data: { active: false, email: `cli-antigo-${antigo.id}@teste.local` } });
    }
  }
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

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Cli Gestor", "gestor");
  const vendedor = await usuario(tenant_id, EMAILS.vendedor, "Cli Vendedor", "vendedor");

  // Assentos: o dono e os dois de cima; sobra espaco para o Caixa, cadastrado pela Equipe.
  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, vendedor.id] } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixaActions = await import("@/lib/actions/emporio-caixa");
  const equipe = await import("@/lib/actions/emporio-equipe");
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

  const caixa = exigir(
    await equipe.cadastrarMembroAction(db, dono, {
      name: "Cli Caixa",
      email: EMAILS.caixa,
      emporio_role: "caixa",
      establishment_ids: [loja.id],
    }),
    "cadastro do caixa",
  );
  if (!caixa.id) throw new Error("O cadastro do Caixa nao devolveu o id.");

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

  // A propriedade que vira fornecedor no roteiro: nenhuma tabela da fazenda aponta para ela.
  const fazenda = await prisma.property.create({ data: { tenant_id, name: `${PREFIXO}Fazenda`, city: "Montes Claros" } });

  console.log("Conta do seed:", tenant_id);
  console.log("Loja:", loja.id, "Racao:", racao, "Fazenda:", fazenda.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
