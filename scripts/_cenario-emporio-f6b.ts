import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da F6b do Meu Emporio (Modulo 39) para o
 * roteiro `scripts/navegador/emporio-f6b.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "F6b ":
 *   - o recurso ligado para a conta inteira;
 *   - duas lojas, "F6b Loja 1" e "F6b Loja 2", e o produto "F6b Racao" com
 *     100 kg em cada uma e preco a R$ 20,00 o quilo;
 *   - f6b-gerente@teste.local (Gerente geral), f6b-gestor1@teste.local (Gestor
 *     da Loja 1), f6b-vendedor1@teste.local (Vendedor da Loja 1, SEM chaves) e
 *     f6b-vendedor2@teste.local (Vendedor da Loja 2);
 *   - uma venda de R$ 20,00 na Loja 1 (para o botao de cancelar);
 *   - duas transferencias da Loja 2 para a Loja 1 de 10 kg: uma em
 *     `aguardando_gestor` (o Vendedor recebeu 6) e uma em transito.
 *
 * Os assentos: o plano mais alto do sistema tem 5. Para o roteiro cadastrar
 * mais uma pessoa, o Vendedor da Loja 2 fica DESATIVADO (existe, mas nao
 * ocupa assento), e os demais usuarios da conta do seed tambem ficam
 * desativados. So banco local: `exigirBancoLocal()` barra o resto.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "F6b ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  gerente: "f6b-gerente@teste.local",
  gestor1: "f6b-gestor1@teste.local",
  vendedor1: "f6b-vendedor1@teste.local",
  vendedor2: "f6b-vendedor2@teste.local",
};
const PREFIXO_DO_CADASTRADO = "f6b-novo";

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const transferencias = (
    await prisma.stockTransfer.findMany({
      where: { tenant_id, OR: [{ origin_establishment_id: { in: lojas } }, { destination_establishment_id: { in: lojas } }] },
      select: { id: true },
    })
  ).map((t) => t.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.stockTransferItem.deleteMany({ where: { tenant_id, transfer_id: { in: transferencias } } });
  await prisma.stockTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });

  // A pessoa que o roteiro cadastra. Se algo a prende, sai do caminho pelo email.
  const cadastrados = await prisma.user.findMany({ where: { tenant_id, email: { startsWith: PREFIXO_DO_CADASTRADO } }, select: { id: true } });
  for (const u of cadastrados) {
    try {
      await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    } catch {
      await prisma.user.update({ where: { id: u.id }, data: { active: false, email: `f6b-antigo-${u.id}@teste.local` } });
    }
  }
}

async function usuario(
  tenant_id: string,
  email: string,
  name: string,
  role: "ADMIN" | "OPERADOR",
  emporio_role: "gerente_geral" | "gestor" | "vendedor",
  active = true,
) {
  const dados = { active, role, tenant_id, emporio_role, emporio_only: false, emporio_keys: [] as string[] };
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

  const gerente = await usuario(tenant_id, EMAILS.gerente, "F6b Gerente Geral", "ADMIN", "gerente_geral");
  const gestor1 = await usuario(tenant_id, EMAILS.gestor1, "F6b Gestor Loja 1", "OPERADOR", "gestor");
  const vendedor1 = await usuario(tenant_id, EMAILS.vendedor1, "F6b Vendedor Loja 1", "OPERADOR", "vendedor");
  const vendedor2 = await usuario(tenant_id, EMAILS.vendedor2, "F6b Vendedor Loja 2", "OPERADOR", "vendedor", false);

  // Assentos: o dono e os quatro de cima; sobra um para o roteiro cadastrar.
  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  const mantidos = [owner.id, gerente.id, gestor1.id, vendedor1.id, vendedor2.id];
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: mantidos } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const transf = await import("@/lib/actions/emporio-transferencias");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };
  const ator = (u: { id: string; role: typeof owner.role }) => ({ id: u.id, role: u.role });

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja1 = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1` }), "loja 1") as { id: string };
  const loja2 = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 2` }), "loja 2") as { id: string };
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: gestor1.id, establishment_id: loja1.id },
      { tenant_id, user_id: vendedor1.id, establishment_id: loja1.id },
      { tenant_id, user_id: vendedor2.id, establishment_id: loja2.id },
    ],
  });

  const racao = (
    exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }
  ).id;
  const quilo = (
    exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }
  ).id;
  for (const loja of [loja1, loja2]) {
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 100, unit_cost: 10 } as never),
      "estoque",
    );
  }

  const agora = Date.now();
  exigir(
    await vendas.venderAction(db, dono, {
      operation_key: `cenario-f6b-venda-${agora}`,
      establishment_id: loja1.id,
      items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 1, unit_price: 20 }],
      payments: [{ kind: "dinheiro", amount: 20 }],
    } as never),
    "venda",
  );

  const enviar = async (n: string) =>
    exigir(
      await transf.enviarTransferenciaAction(db, dono, {
        operation_key: `cenario-f6b-${n}-${agora}`,
        origin_establishment_id: loja2.id,
        destination_establishment_id: loja1.id,
        items: [{ emporio_product_id: racao, quantity: 10 }],
      }),
      `envio ${n}`,
    );

  // A primeira chega com 6 de 10 nas maos de um Vendedor: fica aguardando o Gestor.
  const aguardando = await enviar("aguardando");
  exigir(
    await transf.receberTransferenciaAction(db, ator(vendedor1), aguardando.id, {
      items: aguardando.items.map((i) => ({ item_id: i.id, received_qty: 6 })),
    }),
    "recebimento a menos",
  );
  // A segunda segue em transito, para o roteiro receber com menos.
  const emTransito = await enviar("em-transito");

  console.log("Conta do seed:", tenant_id);
  console.log("Lojas:", loja1.id, loja2.id, "| aguardando_gestor:", aguardando.id, "| em transito:", emTransito.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
