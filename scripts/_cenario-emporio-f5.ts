import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";
import { TODAS_AS_CHAVES } from "./_emporio-papel";

/**
 * Monta, no banco LOCAL, o cenario da F5 do Meu Empório (Modulo 39) para o
 * roteiro `scripts/navegador/emporio-f5.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "F5 ":
 *   - o recurso liberado SO para o Owner e o operador de teste; o
 *     `fora-emporio@teste.local` (ADMIN da mesma conta) fica fora da lista;
 *   - "F5 Loja": "F5 Ração" a R$ 20,00 o quilo, 100 kg a R$ 10,00, minimo 200
 *     (precisa repor);
 *   - compra a prazo de R$ 300,00 da "F5 Casa do Adubo", vencida ha 3 dias;
 *   - duas vendas fiado ao "F5 João" (R$ 40,00 e R$ 60,00), vencidas ha 4 e
 *     2 dias: uma linha so, de R$ 100,00;
 *   - uma venda em dinheiro ONTEM, sem conferencia do caixa;
 *   - uma conta da fazenda "F5 Diesel" de R$ 77,00 vencendo amanha;
 *   - "F5 Milho", "F5 Farelo" e "F5 Mistura" em quilo, e "F5 Óleo" em litro,
 *     para a composicao da receita.
 * Apaga antes tudo o que rodadas anteriores criaram com o prefixo.
 *
 * Idempotente.
 */
exigirBancoLocal();

const PREFIXO = "F5 ";
const EMAIL_OPERADOR = "operador-emporio@teste.local";
const EMAIL_FORA = "fora-emporio@teste.local";
const DIA = 86_400_000;

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const compras = (await prisma.emporioPurchase.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((c) => c.id);
  const contatos = (await prisma.contact.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const composicoes = (await prisma.composition.findMany({ where: { tenant_id, emporio_product_id: { in: emporio } }, select: { id: true } })).map((c) => c.id);
  const lancamentos = (await prisma.financialEntry.findMany({
    where: {
      tenant_id,
      OR: [
        { establishment_id: { in: lojas } },
        { related_id: { in: [...vendas, ...compras] } },
        { category: { startsWith: PREFIXO } },
      ],
    },
    select: { id: true },
  })).map((l) => l.id);

  await prisma.cashMovement.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.compositionItem.deleteMany({ where: { tenant_id, composition_id: { in: composicoes } } });
  await prisma.composition.deleteMany({ where: { tenant_id, id: { in: composicoes } } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioPurchaseItem.deleteMany({ where: { tenant_id, purchase_id: { in: compras } } });
  await prisma.emporioPurchase.deleteMany({ where: { tenant_id, id: { in: compras } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.contact.deleteMany({ where: { tenant_id, id: { in: contatos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  return { lojas: lojas.length, vendas: vendas.length };
}

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

/**
 * F6b (Q118, Q119): quem vê o Empório é quem tem `emporio_role`. O operador é
 * Vendedor (com as chaves, como era o OPERADOR); o "fora" fica SEM função, que
 * é o que o faz não ver o Empório (a lista de usuários do recurso já não vale).
 */
async function usuario(tenant_id: string, email: string, name: string, role: "OPERADOR" | "ADMIN", comFuncao: boolean) {
  const papel = comFuncao
    ? { emporio_role: "vendedor" as const, emporio_keys: [...TODAS_AS_CHAVES] }
    : { emporio_role: null, emporio_keys: [] as string[] };
  return prisma.user.upsert({
    where: { email },
    update: { active: true, role, tenant_id, ...papel },
    // Hash que nenhuma senha produz: ninguem entra por senha aqui.
    create: { tenant_id, email, name, role, password_hash: "sem-senha", ...papel },
  });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const operador = await usuario(tenant_id, EMAIL_OPERADOR, "Operador do Empório", "OPERADOR", true);
  const fora = await usuario(tenant_id, EMAIL_FORA, "Fora do Empório", "ADMIN", false);

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [owner.id, operador.id] });
  if (!ligado.ok) throw new Error(ligado.message);

  const limpos = await limpar(tenant_id);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const compras = await import("@/lib/actions/emporio-compras");
  const db = prismaForTenant(tenant_id);
  const ator = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, ator, { name: `${PREFIXO}Loja` }), "loja") as { id: string };
  await prisma.userEstablishment.create({ data: { tenant_id, user_id: operador.id, establishment_id: loja.id } }); // o Vendedor só vê a loja que tem
  const produto = async (nome: string, base_unit: string) =>
    (exigir(await cat.criarProdutoEmporioAction(db, ator, { name: `${PREFIXO}${nome}`, category_id: categoria.id, base_unit } as never), nome) as { id: string }).id;

  const racao = await produto("Ração", "quilograma");
  const quilo = (exigir(await cat.criarApresentacaoAction(db, ator, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, ator, { establishment_id: loja.id, presentation_id: quilo, price: 20 }), "preco");
  exigir(await est.implantarEstoqueAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, sealed: [], loose_qty: 100, unit_cost: 10 } as never), "estoque");
  exigir(await est.definirLimitesAction(db, ator, { establishment_id: loja.id, emporio_product_id: racao, min_qty: 200, max_qty: 300 }), "limites");
  for (const [nome, unidade] of [["Milho", "quilograma"], ["Farelo", "quilograma"], ["Mistura", "quilograma"], ["Óleo", "litro"]]) {
    await produto(nome, unidade);
  }

  const fornecedor = await prisma.contact.create({ data: { tenant_id, name: `${PREFIXO}Casa do Adubo` } });
  const cliente = await prisma.contact.create({ data: { tenant_id, name: `${PREFIXO}João` } });
  const agora = new Date();
  const chave = (s: string) => `cenario-f5-${s}-${agora.getTime()}`;

  // A compra a prazo nasce com vencimento futuro (a action recusa o passado) e
  // e empurrada para 3 dias atras direto no banco.
  const compra = exigir(await compras.criarCompraAction(db, ator, {
    operation_key: chave("compra"),
    establishment_id: loja.id,
    contact_id: fornecedor.id,
    purchased_at: agora,
    received: false,
    items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 30, item_total: 300 }],
    payment: { kind: "a_prazo", due_date: new Date(agora.getTime() + 10 * DIA) },
  }), "compra") as { id: string };
  await prisma.financialEntry.updateMany({ where: { tenant_id, related_id: compra.id }, data: { due_date: new Date(agora.getTime() - 3 * DIA) } });

  // Os dois fiados, pelo mesmo caminho: vencimento futuro, depois o passado.
  for (const [n, valor, diasAtras] of [[1, 40, 4], [2, 60, 2]] as const) {
    const venda = exigir(await vendas.venderAction(db, ator, {
      operation_key: chave(`fiado-${n}`),
      establishment_id: loja.id,
      contact_id: cliente.id,
      items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: valor / 20, unit_price: 20 }],
      payments: [{ kind: "fiado", amount: valor, due_date: new Date(agora.getTime() + 5 * DIA) }],
    } as never), `fiado ${n}`) as { id: string };
    const venc = new Date(agora.getTime() - diasAtras * DIA);
    await prisma.financialEntry.updateMany({ where: { tenant_id, related_id: venda.id }, data: { due_date: venc } });
    await prisma.emporioSalePayment.updateMany({ where: { tenant_id, sale_id: venda.id, kind: "fiado" }, data: { due_date: venc } });
  }

  // A venda em dinheiro de ONTEM: o movimento da gaveta e levado para ontem, ao
  // meio-dia de Brasilia, e nenhuma conferencia e feita.
  const dinheiro = exigir(await vendas.venderAction(db, ator, {
    operation_key: chave("dinheiro"),
    establishment_id: loja.id,
    items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: 1, unit_price: 20 }],
    payments: [{ kind: "dinheiro", amount: 20 }],
  } as never), "dinheiro") as { id: string };
  const ontem = new Date(agora.getTime() - DIA);
  ontem.setUTCHours(15, 0, 0, 0);
  await prisma.cashMovement.updateMany({ where: { tenant_id, establishment_id: loja.id }, data: { occurred_at: ontem } });
  await prisma.emporioSale.update({ where: { id: dinheiro.id }, data: { sold_at: ontem } });

  // A conta da fazenda, direto no banco: e o par de comparacao, sem regra a provar.
  await prisma.financialEntry.create({
    data: {
      tenant_id,
      entry_type: "expense",
      category: `${PREFIXO}Diesel`,
      amount: 77,
      due_date: new Date(agora.getTime() + DIA),
      status: "pending",
    },
  });

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos.lojas, "loja(s),", limpos.vendas, "venda(s)");
  console.log("Loja:", loja.id, "| recurso so para", owner.email, "e", EMAIL_OPERADOR, "| fora da lista:", fora.email);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
