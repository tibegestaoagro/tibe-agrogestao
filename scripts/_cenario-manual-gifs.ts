import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o que as animações do manual do Meu Empório pedem e o cenário de demonstração não
 * tem, para o roteiro `scripts/navegador/manual-gifs.py`. Não é suíte.
 *
 * Roda DEPOIS do cenário de demonstração (a equipe e as duas lojas, "Loja Centro" e "Loja da Rodovia", vêm
 * dele; ver o cabeçalho de `manual-emporio.py`). Tudo aqui é fictício: o repositório é público e os GIFs saem
 * daqui.
 *
 *   - Contas: "PIX Loja Centro" (só a Loja Centro, CNPJ e favorecido, padrão da Loja Centro) e "PIX Site"
 *     (todas as lojas, CNPJ e favorecido). A "PIX Loja da Rodovia" é cadastrada pela tela, na animação, e
 *     por isso a limpeza a conhece pelo nome;
 *   - Franqueado "Ademir Santos", com um crédito já lançado (venda de R$ 30,00 mais crédito de R$ 12,00);
 *     "Marlene Rocha" nasce pela tela;
 *   - "Ração Poedeiras 15 kg": em SACA (conteúdo de 15 kg), com a "Saca 15 kg" fechada e o "GRANEL" de
 *     0,068 saca (o 1,02 kg que o "confira" marca), 10 sacas na Loja Centro e 6 na da Rodovia;
 *   - "Farelo de Soja 40 kg": em QUILO, com "Saca 40 kg" e "ATACADO" (40 kg, fechadas) e "Quilo", 10 sacas
 *     na Loja Centro;
 *   - "Sal Mineral Premium": em quilo, 300 kg: é o produto das vendas de todas as animações de balcão, para
 *     a limpeza devolver o estoque sem tocar nos produtos da demonstração.
 *
 * Apaga antes tudo o que rodadas anteriores criaram (inclusive o que a tela criou, e os movimentos de caixa
 * por `sale_id`). Idempotente.
 */
exigirBancoLocal();

const PRODUTOS = ["Ração Poedeiras 15 kg", "Farelo de Soja 40 kg", "Sal Mineral Premium"];
const CONTAS = ["PIX Loja Centro", "PIX Site", "PIX Loja da Rodovia"];
const FRANQUEADOS = ["Ademir Santos", "Marlene Rocha"];

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

function cnpjValido(c: string): boolean {
  const d = c.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    let peso = n - 7;
    for (let i = 0; i < n; i++) {
      soma += Number(d[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

async function limpar(tenant_id: string) {
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { in: PRODUTOS } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { in: CONTAS } }, select: { id: true } })).map((c) => c.id);
  const franqueados = (await prisma.emporioFranchisee.findMany({ where: { tenant_id, name: { in: FRANQUEADOS } }, select: { id: true } })).map((f) => f.id);
  const pagamentos = (await prisma.emporioFranchiseePayment.findMany({ where: { tenant_id, franchisee_id: { in: franqueados } }, select: { id: true } })).map((p) => p.id);
  const vendas = (
    await prisma.emporioSale.findMany({
      where: {
        tenant_id,
        OR: [
          { items: { some: { emporio_product_id: { in: emporio } } } },
          { payments: { some: { bank_account_id: { in: contas } } } },
          { franchisee_id: { in: franqueados } },
        ],
      },
      select: { id: true },
    })
  ).map((v) => v.id);
  // A despesa variavel da venda (regra da loja) aponta para a venda com Restrict, e o movimento de estoque
  // dela (a embalagem) e de OUTRO produto: sai por aqui, antes das vendas.
  const despesas = await prisma.saleVariableExpense.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true, financial_entry_id: true } });
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ related_id: { in: vendas } }, { id: { in: despesas.map((d) => d.financial_entry_id).filter((x): x is string => !!x) } }] },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({
    // sale_id: o dinheiro da venda; franchisee_payment_id: o pagamento da animação "franqueado-pagar".
    where: { tenant_id, OR: [{ sale_id: { in: vendas } }, { franchisee_payment_id: { in: pagamentos } }, { bank_account_id: { in: contas } }] },
  });
  await prisma.emporioFranchiseePayment.deleteMany({ where: { tenant_id, id: { in: pagamentos } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ product_id: { in: produtos } }, { sale_variable_expense_id: { in: despesas.map((d) => d.id) } }] } });
  await prisma.saleVariableExpense.deleteMany({ where: { tenant_id, id: { in: despesas.map((d) => d.id) } } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioFranchisee.deleteMany({ where: { tenant_id, id: { in: franqueados } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, presentation: { emporio_product_id: { in: emporio } } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  // As lojas que apontavam para uma conta nossa voltam para a "Conta da loja" da demonstração.
  const padrao = await prisma.bankAccount.findFirst({ where: { tenant_id, name: "Conta da loja" }, select: { id: true } });
  await prisma.establishment.updateMany({ where: { tenant_id, pix_bank_account_id: { in: contas } }, data: { pix_bank_account_id: padrao?.id ?? null } });
  for (const id of contas) {
    try {
      await prisma.bankAccount.delete({ where: { id } });
    } catch {
      await prisma.bankAccount.update({ where: { id }, data: { archived_at: new Date(), name: `Manual antiga ${id}` } });
    }
  }
  return { vendas: vendas.length, produtos: produtos.length, contas: contas.length, franqueados: franqueados.length };
}

async function main() {
  for (const c of ["11.222.333/0001-81", "45.723.174/0001-10", "12.345.678/0001-95"]) {
    if (!cnpjValido(c)) throw new Error(`CNPJ fictício inválido: ${c}`);
  }
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const lojas = await prisma.establishment.findMany({ where: { tenant_id, name: { in: ["Loja Centro", "Loja da Rodovia"] }, archived_at: null }, select: { id: true, name: true } });
  const centro = lojas.find((l) => l.name === "Loja Centro");
  const rodovia = lojas.find((l) => l.name === "Loja da Rodovia");
  if (!centro || !rodovia) {
    throw new Error(`A demonstracao nao esta montada (faltam as lojas): rode npm run cenario:emporio-demo -- --conta ${tenant_id} --confirmar`);
  }

  const limpos = await limpar(tenant_id);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixaActions = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const clientes = await import("@/lib/actions/emporio-clientes");
  const franq = await import("@/lib/actions/emporio-franqueados");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria =
    (await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null, name: "Alimentação animal" } })) ??
    (await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } }));
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const produto = async (name: string, input: Record<string, unknown>) =>
    (exigir(await cat.criarProdutoEmporioAction(db, dono, { name, category_id: categoria.id, ...input } as never), name) as { id: string }).id;
  const apresentacao = async (produtoId: string, name: string, base_qty: number, is_sealed_package: boolean) => {
    // O produto em saca ja nasce com a apresentacao da saca: reaproveita se for a mesma.
    const existente = await prisma.productPresentation.findFirst({ where: { tenant_id, emporio_product_id: produtoId, name } });
    if (existente && Number(existente.base_qty) === base_qty && existente.is_sealed_package === is_sealed_package) return existente.id;
    return (exigir(await cat.criarApresentacaoAction(db, dono, produtoId, { name, base_qty, is_sealed_package } as never), name) as { id: string }).id;
  };
  const preco = async (presentation_id: string, valores: [string, number][]) => {
    for (const [establishment_id, price] of valores) {
      exigir(await cat.definirPrecoAction(db, dono, { establishment_id, presentation_id, price }), "preco");
    }
  };
  const nasDuas = (a: number): [string, number][] => [[centro.id, a], [rodovia.id, a]];

  // A: saca de 15 kg com GRANEL de 0,068 saca (1,02 kg), 10 sacas na Centro e 6 na Rodovia.
  const A = await produto("Ração Poedeiras 15 kg", { base_unit: "saca", content_qty: 15, content_unit: "quilograma" });
  const aSaca = await apresentacao(A, "Saca 15 kg", 1, true);
  const aGranel = await apresentacao(A, "GRANEL", 0.068, false);
  await preco(aSaca, nasDuas(150));
  await preco(aGranel, nasDuas(2.4));
  await prisma.emporioProduct.update({ where: { id: A }, data: { reference_cost: 90 } });
  for (const [loja, n] of [[centro, 10], [rodovia, 6]] as const) {
    exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: A, sealed: [{ presentation_id: aSaca, packages: n }], loose_qty: 0, unit_cost: 90 } as never), "implantar A");
  }

  // B: quilo com duas fechadas de 40 kg e a avulsa "Quilo".
  const B = await produto("Farelo de Soja 40 kg", { base_unit: "quilograma" });
  const bSaca = await apresentacao(B, "Saca 40 kg", 40, true);
  const bAtac = await apresentacao(B, "ATACADO", 40, true);
  const bQuilo = await apresentacao(B, "Quilo", 1, false);
  await preco(bSaca, nasDuas(120));
  await preco(bAtac, nasDuas(110));
  await preco(bQuilo, nasDuas(4));
  await prisma.emporioProduct.update({ where: { id: B }, data: { reference_cost: 3 } });
  exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: centro.id, emporio_product_id: B, sealed: [{ presentation_id: bSaca, packages: 10 }], loose_qty: 0, unit_cost: 3 } as never), "implantar B");

  // C: o produto das vendas de balcao das animacoes.
  const C = await produto("Sal Mineral Premium", { base_unit: "quilograma" });
  const cQuilo = await apresentacao(C, "Quilo", 1, false);
  await preco(cQuilo, nasDuas(6));
  await prisma.emporioProduct.update({ where: { id: C }, data: { reference_cost: 3.5 } });
  exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: centro.id, emporio_product_id: C, sealed: [], loose_qty: 300, unit_cost: 3.5 } as never), "implantar C");

  // Contas PIX.
  const conta = async (input: Record<string, unknown>) => exigir(await caixaActions.criarContaAction(db, dono, input as never), String(input.name)) as { id: string };
  const contaCentro = await conta({ name: "PIX Loja Centro", bank: "Banco Exemplo", document: "11.222.333/0001-81", beneficiary: "Vale Verde Agropecuária Ltda", pix_all_establishments: false, establishment_ids: [centro.id] });
  await conta({ name: "PIX Site", bank: "Banco Exemplo", document: "45.723.174/0001-10", beneficiary: "Vale Verde Comércio Digital Ltda", pix_all_establishments: true });
  exigir(await caixaActions.definirContaPixAction(db, dono, centro.id, { bank_account_id: contaCentro.id }), "padrao da Loja Centro");

  // O franqueado com um credito ja lancado: uma venda em dinheiro de R$ 30,00 mais R$ 12,00 de credito.
  const ademir = exigir(await franq.cadastrarFranqueadoAction(db, dono, { name: "Ademir Santos", phone: "(38) 99111-2233" } as never), "franqueado") as { id: string };
  const consumidor = await clientes.garantirConsumidorFinal(db);
  exigir(
    await vendas.venderAction(db, dono, {
      operation_key: `cenario-manual-gifs-credito-${Date.now()}`,
      establishment_id: centro.id,
      customer_id: consumidor.id,
      items: [{ emporio_product_id: C, presentation_id: cQuilo, quantity: 5, unit_price: 6 }],
      payments: [{ kind: "dinheiro", amount: 42 }],
      franchisee_id: ademir.id,
      franchisee_credit: 12,
    } as never),
    "venda com credito",
  );

  console.log("Conta do seed:", tenant_id, "| limpos:", limpos);
  console.log("Lojas:", centro.id, rodovia.id, "| A:", A, "B:", B, "C:", C, "| franqueado:", ademir.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
