import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da entrega 3 do Meu Emporio (Modulo 39,
 * vendedor na venda e relatorios) para o roteiro
 * `scripts/navegador/emporio-vendedor.py`. Nao e suite. Parte do cenario do
 * turno (`_cenario-emporio-turno.ts`).
 *
 * Na conta do seed, com o prefixo "Vend ":
 *   - o recurso ligado para a conta inteira;
 *   - duas lojas, "Vend Loja 1" e "Vend Loja 2";
 *   - o produto "Vend Ração" (100 kg em cada loja, R$ 20,00 o quilo) e o
 *     produto "Vend Parado" (com preco nas duas lojas, SEM venda nem estoque);
 *   - o troco inicial de R$ 100,00 em cada loja; NENHUM turno fica aberto;
 *   - vend-caixa@teste.local: Caixa das DUAS lojas (o roteiro troca de loja no
 *     balcao do Caixa, e isso so e possivel com duas lojas);
 *   - vend-gestor1@teste.local: Gestor da Loja 1;
 *   - vend-vendedor1@teste.local: Vendedor das Lojas 1 e 2;
 *   - vend-vendedor2@teste.local: Vendedor da Loja 2.
 *
 * Os assentos: o plano "grupo" tem 5. Dono, gestor, dois vendedores e o Caixa
 * ocupam todos; os demais usuarios da conta do seed ficam desativados.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Vend ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  caixa: "vend-caixa@teste.local",
  gestor1: "vend-gestor1@teste.local",
  vendedor1: "vend-vendedor1@teste.local",
  vendedor2: "vend-vendedor2@teste.local",
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
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] },
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
      await prisma.user.update({ where: { id: antigo.id }, data: { active: false, email: `vend-antigo-${antigo.id}@teste.local` } });
    }
  }
}

async function usuario(tenant_id: string, email: string, name: string, role: "ADMIN" | "OPERADOR", emporio_role: "gestor" | "vendedor") {
  const dados = { active: true, role, tenant_id, emporio_role, emporio_only: false, emporio_keys: [] as string[] };
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

  const gestor1 = await usuario(tenant_id, EMAILS.gestor1, "Vend Gestor Loja 1", "OPERADOR", "gestor");
  const vendedor1 = await usuario(tenant_id, EMAILS.vendedor1, "Vend Vendedor Lojas 1 e 2", "OPERADOR", "vendedor");
  const vendedor2 = await usuario(tenant_id, EMAILS.vendedor2, "Vend Vendedor Loja 2", "OPERADOR", "vendedor");

  // Assentos: o dono e os tres de cima; sobra um para o Caixa, cadastrado pela Equipe.
  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor1.id, vendedor1.id, vendedor2.id] } }, data: { active: false } });

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

  const loja1 = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1` }), "loja 1") as { id: string };
  const loja2 = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 2` }), "loja 2") as { id: string };
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: gestor1.id, establishment_id: loja1.id },
      { tenant_id, user_id: vendedor1.id, establishment_id: loja1.id },
      { tenant_id, user_id: vendedor1.id, establishment_id: loja2.id },
      { tenant_id, user_id: vendedor2.id, establishment_id: loja2.id },
    ],
  });

  const caixa = exigir(
    await equipe.cadastrarMembroAction(db, dono, {
      name: "Vend Caixa",
      email: EMAILS.caixa,
      emporio_role: "caixa",
      establishment_ids: [loja1.id, loja2.id],
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
  // O produto parado: tem preco nas lojas e nenhuma venda.
  const parado = (
    exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Parado`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto parado") as { id: string }
  ).id;
  const quiloParado = (
    exigir(await cat.criarApresentacaoAction(db, dono, parado, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo parado") as { id: string }
  ).id;
  for (const loja of [loja1, loja2]) {
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: quiloParado, price: 15 }), "preco do parado");
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 100, unit_cost: 10 } as never),
      "estoque",
    );
    // O troco da loja: saldo inicial do Caixa 1, lancado pelo Dono antes de qualquer turno.
    const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
    if (!registro) throw new Error(`A loja ${loja.id} nasceu sem o Caixa 1.`);
    exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
  }

  console.log("Conta do seed:", tenant_id);
  console.log("Lojas:", loja1.id, loja2.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
