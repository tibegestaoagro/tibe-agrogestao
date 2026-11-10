import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M111: Módulo 39 (Meu Empório), regra do "Vendeu, Pagou" por NOME de apresentação (Q292).
 * Roda: `npm run test:m111`
 *
 * Seção 1: o normalizar puro (acento, caixa, espaço).
 * Seção 2: com banco: a regra por nome vale em qualquer produto, ignora caixa e espaço, e as recusas.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const j = (x: unknown) => JSON.stringify(x);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;

console.log("🏷️ M111: Módulo 39 (Meu Empório), regra por nome de apresentação (Q292)\n");

async function secao1() {
  console.log("Seção 1: o normalizar puro");
  const { normalizar } = await import("@/lib/emporio/vendeu-pagou");
  check("caixa", normalizar("FRANQUIA") === "franquia");
  check("espaço nas pontas", normalizar("  Franquia ") === "franquia");
  check("acento", normalizar("Apresentação Única") === "apresentacao unica", normalizar("Apresentação Única"));
  check("espaço do meio é preservado", normalizar("Franquia Plus") === "franquia plus");
  check("FRANQUIA e FRANQUIA PLUS são diferentes", normalizar("FRANQUIA") !== normalizar("FRANQUIA PLUS"));
  check("nulo e vazio viram vazio", normalizar(null) === "" && normalizar(undefined) === "" && normalizar("  ") === "");
}

async function secao2() {
  console.log("\nSeção 2: a regra na venda e as recusas (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = await import("@/lib/actions/emporio-vendas");
  const D = await import("@/lib/actions/emporio-despesas");
  const { carregarCatalogoDeVenda } = await import("@/app/(dashboard)/emporio/_components/catalogo-venda");
  const stamp = Date.now();
  let tenantId = "";

  try {
    const t = await prisma.tenant.create({
      data: { name: `M111 ${stamp}`, document: `M111${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
    });
    tenantId = t.id;
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M111", email: `m111-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const owner = { id: u.id, role: "OWNER" as const, email: u.email };
    const db = prismaForTenant(t.id) as Dado;
    const cf = (await carregarCatalogoDeVenda(db, [])).consumidorFinal.id as string;
    const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M111 Loja" });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    const L = loja.data.id as string;
    const categoria = await db.productCategory.create({ data: scoped({ name: "M111 cat" }) });

    async function produto(nome: string, apres: string, preco: number) {
      const p = await Cat.criarProdutoEmporioAction(db, owner, { name: `M111 ${nome} ${stamp}`, category_id: categoria.id, base_unit: "unidade" });
      if (!p.ok) throw new Error(`produto ${nome}: ${j(p)}`);
      const a = await Cat.criarApresentacaoAction(db, owner, p.data.id, { name: apres, base_qty: 1, is_sealed_package: false });
      if (!a.ok) throw new Error(`apresentação ${nome}: ${j(a)}`);
      const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: a.data.id, price: preco });
      if (!pr.ok) throw new Error(`preço ${nome}: ${j(pr)}`);
      const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: p.data.id, sealed: [], loose_qty: 1000, unit_cost: 1 });
      if (!imp.ok) throw new Error(`implantar ${nome}: ${j(imp)}`);
      return { emporio_product_id: p.data.id as string, presentation_id: a.data.id as string };
    }
    const p1 = await produto("A", "FRANQUIA", 10);
    const p2 = await produto("B", "Franquia", 10);
    // A variação de espaço é gravada direto: o cadastro apara, mas dado antigo pode ter sobra.
    await db.productPresentation.update({ where: { id: p2.presentation_id }, data: { name: "Franquia " } });
    const p3 = await produto("C", "FRANQUIA PLUS", 10);
    await abrirTurnoDeTeste(db, owner, L);

    const criada = await D.criarRegraVariavelAction(db, owner, {
      establishment_id: L,
      name: "M111 Franquia",
      kind: "percentual",
      value: 10,
      presentation_name: "  FRANQUIA ",
    });
    check("cria a regra por nome", criada.ok, j(criada));
    if (!criada.ok) throw new Error("sem regra");
    check("guarda o nome aparado, como digitado", criada.data.presentation_name === "FRANQUIA", String(criada.data.presentation_name));
    check("a regra por nome não tem produto nem apresentação", criada.data.emporio_product_id === null && criada.data.presentation_id === null);

    const venda = await V.venderAction(db, owner, {
      operation_key: `m111-${stamp}-1`,
      establishment_id: L,
      customer_id: cf,
      items: [
        { ...p1, quantity: 2 },
        { ...p2, quantity: 1 },
        { ...p3, quantity: 1 },
      ],
      payments: [{ kind: "dinheiro", amount: 40 }],
    });
    if (!venda.ok) throw new Error(`venda: ${j(venda)}`);
    const despesas = await db.saleVariableExpense.findMany({ where: { sale_id: venda.data.id } });
    check("uma despesa", despesas.length === 1, String(despesas.length));
    check("10% só dos dois itens FRANQUIA (R$ 30): R$ 3,00", despesas.length === 1 && Number(despesas[0].amount) === 3, despesas.map((d: Dado) => String(d.amount)).join(","));
    check("o snapshot grava presentation_name", despesas.length === 1 && despesas[0].rule_snapshot?.presentation_name === "FRANQUIA", j(despesas[0]?.rule_snapshot));

    const v2 = await V.venderAction(db, owner, {
      operation_key: `m111-${stamp}-2`,
      establishment_id: L,
      customer_id: cf,
      items: [{ ...p3, quantity: 1 }],
      payments: [{ kind: "dinheiro", amount: 10 }],
    });
    if (!v2.ok) throw new Error(`venda 2: ${j(v2)}`);
    check("venda sem FRANQUIA não gera despesa", (await db.saleVariableExpense.count({ where: { sale_id: v2.data.id } })) === 0);

    const comProduto = await D.criarRegraVariavelAction(db, owner, {
      establishment_id: L,
      name: "M111 ruim 1",
      kind: "percentual",
      value: 10,
      emporio_product_id: p1.emporio_product_id,
      presentation_name: "FRANQUIA",
    });
    check("nome com produto escolhido: 422 em presentation_name", !comProduto.ok && comProduto.status === 422 && comProduto.field === "presentation_name", j(comProduto));
    const comId = await D.criarRegraVariavelAction(db, owner, {
      establishment_id: L,
      name: "M111 ruim 2",
      kind: "percentual",
      value: 10,
      presentation_id: p1.presentation_id,
      presentation_name: "FRANQUIA",
    });
    check("nome com presentation_id: 422 em presentation_name", !comId.ok && comId.status === 422 && comId.field === "presentation_name", j(comId));
    const longo = await D.criarRegraVariavelAction(db, owner, {
      establishment_id: L,
      name: "M111 ruim 3",
      kind: "percentual",
      value: 10,
      presentation_name: "x".repeat(121),
    });
    check("nome de 121 letras: 422 em presentation_name", !longo.ok && longo.status === 422 && longo.field === "presentation_name", j(longo));
    check("as recusas não gravaram regra", (await db.variableExpenseRule.count({ where: { establishment_id: L } })) === 1);

    const trocou = await D.editarRegraVariavelAction(db, owner, criada.data.id, { emporio_product_id: p1.emporio_product_id });
    check("escolher um produto numa regra por nome troca o nome por produto", trocou.ok && trocou.data.presentation_name === null && trocou.data.emporio_product_id === p1.emporio_product_id, j(trocou));
  } finally {
    if (tenantId) {
      const P = prisma as Dado;
      await P.emporioSale.updateMany({ where: { tenant_id: tenantId }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
      await P.saleVariableExpense.deleteMany({ where: { tenant_id: tenantId } }).catch(() => undefined);
      await P.variableExpenseRule.deleteMany({ where: { tenant_id: tenantId } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id: tenantId } }).catch((e: unknown) => console.log(`  (teardown: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.$disconnect();
  }
}

async function main() {
  await secao1();
  await secao2();
  console.log(falhas === 0 ? "\n✅ M111 (Módulo 39, Empório): regra por apresentação passou." : `\n❌ M111 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
