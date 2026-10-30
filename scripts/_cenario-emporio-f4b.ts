import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da F4b do Meu Empório (Modulo 39) para o
 * roteiro `scripts/navegador/emporio-f4b.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "F4b ", no mes atual:
 *   - "F4b Loja 1" e "F4b Loja 2"; "F4b Ração" a R$ 20,00 o quilo, 100 kg a
 *     R$ 10,00 em cada loja;
 *   - Loja 1: tres vendas de 10 kg (R$ 600); transferencia de 10 kg para a
 *     Loja 2 que chega com 9 (perda de R$ 10 na origem);
 *   - Loja 2: duas vendas de 10 kg (R$ 400) e uma de 1 kg a R$ 5,00, abaixo
 *     do custo (a venda com margem negativa);
 *   - "F4b Aluguel" de R$ 2.000,00 dividido 50/50.
 * Esperado no somado: vendas 1.005, custo 510, margem 495, perdas 10, fixas
 * 2.000, resultado -1.515 (Loja 1: -710; Loja 2: -805).
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "F4b ";

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const modelos = (await prisma.fixedExpenseTemplate.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((m) => m.id);
  const transferencias = (await prisma.stockTransfer.findMany({
    where: { tenant_id, OR: [{ origin_establishment_id: { in: lojas } }, { destination_establishment_id: { in: lojas } }] },
    select: { id: true },
  })).map((t) => t.id);
  const lancamentos = (await prisma.financialEntry.findMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: [...vendas, ...modelos] } }] },
    select: { id: true },
  })).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.stockTransferItem.deleteMany({ where: { tenant_id, transfer_id: { in: transferencias } } });
  await prisma.stockTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.saleVariableExpense.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { tenant_id, OR: [{ template_id: { in: modelos } }, { establishment_id: { in: lojas } }] } });
  await prisma.fixedExpenseTemplate.deleteMany({ where: { tenant_id, id: { in: modelos } } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
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
  const vendas = await import("@/lib/actions/emporio-vendas");
  const desp = await import("@/lib/actions/emporio-despesas");
  const transf = await import("@/lib/actions/emporio-transferencias");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const l1 = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja 1` }), "loja 1") as { id: string };
  const l2 = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja 2` }), "loja 2") as { id: string };
  const racao = (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "racao") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  for (const loja of [l1, l2]) {
    exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
    exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 100, unit_cost: 10 } as never), "estoque");
  }

  let n = 0;
  const vender = async (loja: string, quantidade: number, preco: number) => {
    n++;
    exigir(await vendas.venderAction(db, ator, {
      operation_key: `cenario-f4b-${Date.now()}-${n}`,
      establishment_id: loja,
      items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: quantidade, unit_price: preco }],
      payments: [{ kind: "dinheiro", amount: quantidade * preco }],
    } as never), `venda ${n}`);
  };
  for (let i = 0; i < 3; i++) await vender(l1.id, 10, 20);
  for (let i = 0; i < 2; i++) await vender(l2.id, 10, 20);
  await vender(l2.id, 1, 5);

  const t = exigir(await transf.enviarTransferenciaAction(db, ator, {
    operation_key: `cenario-f4b-transf-${Date.now()}`,
    origin_establishment_id: l1.id,
    destination_establishment_id: l2.id,
    items: [{ emporio_product_id: racao, quantity: 10 }],
  } as never), "transferencia") as { id: string };
  const item = await prisma.stockTransferItem.findFirstOrThrow({ where: { transfer_id: t.id } });
  exigir(await transf.receberTransferenciaAction(db, ator, t.id, { items: [{ item_id: item.id, received_qty: 9, loss_reason: "avaria" }] }), "recebimento");

  const agora = new Date();
  exigir(await desp.criarDespesaFixaAction(db, ator, {
    name: `${PREFIXO}Aluguel`,
    amount: 2000,
    due_day: 10,
    split_kind: "percentual",
    starts_on: new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)),
    splits: [{ establishment_id: l1.id, value: 50 }, { establishment_id: l2.id, value: 50 }],
  }), "despesa fixa");

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja 1:", l1.id, "Loja 2:", l2.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
