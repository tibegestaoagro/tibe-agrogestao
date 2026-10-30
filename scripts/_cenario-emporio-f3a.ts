import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da F3a do Meu Empório (Modulo 39) para o
 * roteiro `scripts/navegador/emporio-f3a.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "F3a ":
 *   - "F3a Loja" (ponto de venda), desconto maximo de 10%;
 *   - "F3a Sal": Saca 10 kg (fechada) a R$ 100,00 e Quilo a R$ 12,00, com
 *     3 sacas lacradas a R$ 9,00 o kg e nada avulso (o aceite do §25);
 *   - "F3a Ração": Quilo a R$ 20,00, 50 kg avulsos a R$ 10,00;
 *   - a conta bancaria "F3a Banco", conta PIX da loja;
 *   - o cliente "F3a José" em Contatos.
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "F3a ";

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const contatos = (await prisma.contact.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const devolucoes = (await prisma.emporioSaleReturn.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((d) => d.id);
  const lancamentos = (await prisma.financialEntry.findMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...devolucoes] } }] },
    select: { id: true },
  })).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  // A venda nova da troca aponta para a devolucao, e a devolucao para a venda.
  await prisma.emporioSale.updateMany({ where: { tenant_id, id: { in: vendas } }, data: { exchange_return_id: null } });
  await prisma.emporioSaleReturnItem.deleteMany({ where: { tenant_id, return_id: { in: devolucoes } } });
  await prisma.emporioSaleReturn.deleteMany({ where: { tenant_id, id: { in: devolucoes } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  await prisma.bankAccount.deleteMany({ where: { tenant_id, id: { in: contas } } });
  await prisma.contact.deleteMany({ where: { tenant_id, id: { in: contatos } } });
  return { lojas: lojas.length, vendas: vendas.length };
}

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const limpos = await limpar(tenant_id);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixa = await import("@/lib/actions/emporio-caixa");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja`, max_discount_pct: 10 }), "loja") as { id: string };

  const novo = async (nome: string) =>
    (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}${nome}`, category_id: categoria.id, base_unit: "quilograma" } as never), nome) as { id: string }).id;
  const apresentacao = async (produto: string, name: string, base_qty: number, is_sealed_package: boolean) =>
    (exigir(await cat.criarApresentacaoAction(db, ator, produto, { name, base_qty, is_sealed_package } as never), name) as { id: string }).id;
  const preco = async (presentation_id: string, price: number) =>
    exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id, price }), "preco");

  const sal = await novo("Sal");
  const saca = await apresentacao(sal, "Saca 10 kg", 10, true);
  const quiloSal = await apresentacao(sal, "Quilo", 1, false);
  await preco(saca, 100);
  await preco(quiloSal, 12);
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: sal, sealed: [{ presentation_id: saca, packages: 3 }], loose_qty: 0, unit_cost: 9 } as never), "estoque do sal");

  const racao = await novo("Ração");
  const quiloRacao = await apresentacao(racao, "Quilo", 1, false);
  await preco(quiloRacao, 20);
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 50, unit_cost: 10 } as never), "estoque da racao");

  const conta = exigir(await caixa.criarContaAction(db, ator, { name: `${PREFIXO}Banco`, bank: "Banco do Brasil" }), "conta") as { id: string };
  exigir(await caixa.definirContaPixAction(db, ator, loja.id, { bank_account_id: conta.id }), "conta pix");

  const jose = await prisma.contact.create({ data: { tenant_id, name: `${PREFIXO}José` } });

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id, "Sal:", sal, "Ração:", racao, "Conta:", conta.id, "José:", jose.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
