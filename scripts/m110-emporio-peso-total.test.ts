import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M110: Módulo 39 (Meu Empório), peso total (Q291).
 * Roda: `npm run test:m110`
 *
 * Seção 1: a função pura (peso do item, total, formato brasileiro).
 * Seção 2: com banco: o impresso da venda e do orçamento, a view da venda e o romaneio.
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

console.log("⚖️ M110: Módulo 39 (Meu Empório), peso total (Q291)\n");

async function secao1() {
  console.log("Seção 1: a função pura");
  const { pesoDoItemKg, pesoTotal, pesoBr } = await import("@/lib/emporio/peso");
  const sem = { content_qty: null, content_unit: null };

  check("quilograma: a própria quantidade", pesoDoItemKg({ base_unit: "quilograma", ...sem }, 12.5) === 12.5);
  check("tonelada vezes 1.000", pesoDoItemKg({ base_unit: "tonelada", ...sem }, 2) === 2000);
  check("saca de 25 kg, 3 sacas = 75", pesoDoItemKg({ base_unit: "saca", content_qty: 25, content_unit: "quilograma" }, 3) === 75);
  check("fardo com conteúdo em kg", pesoDoItemKg({ base_unit: "fardo", content_qty: 10, content_unit: "quilograma" }, 2.5) === 25);
  check("unidade com conteúdo em kg", pesoDoItemKg({ base_unit: "unidade", content_qty: 0.5, content_unit: "quilograma" }, 4) === 2);
  check("litro é sem peso", pesoDoItemKg({ base_unit: "litro", ...sem }, 5) === null);
  check("litro com conteúdo em litro é sem peso", pesoDoItemKg({ base_unit: "saca", content_qty: 20, content_unit: "litro" }, 1) === null);
  check("unidade sem conteúdo é sem peso", pesoDoItemKg({ base_unit: "unidade", ...sem }, 3) === null);
  check("metro é sem peso", pesoDoItemKg({ base_unit: "metro", ...sem }, 3) === null);
  check("arredonda a 3 casas", pesoDoItemKg({ base_unit: "saca", content_qty: 0.3333, content_unit: "quilograma" }, 1) === 0.333);
  check("sem ruído de ponto flutuante", pesoDoItemKg({ base_unit: "quilograma", ...sem }, 0.1 + 0.2) === 0.3);

  check("total com mistura", j(pesoTotal([10, null, 2.5])) === j({ total_kg: 12.5, sem_peso: 1 }), j(pesoTotal([10, null, 2.5])));
  check("total sem nenhum peso é nulo", j(pesoTotal([null, null])) === j({ total_kg: null, sem_peso: 2 }));
  check("total de lista vazia é nulo", j(pesoTotal([])) === j({ total_kg: null, sem_peso: 0 }));
  check("total soma sem ruído", pesoTotal([0.1, 0.2]).total_kg === 0.3);

  check("pesoBr 1.250 kg", pesoBr(1250) === "1.250 kg", pesoBr(1250));
  check("pesoBr 12,5 kg", pesoBr(12.5) === "12,5 kg", pesoBr(12.5));
  check("pesoBr 0,333 kg", pesoBr(0.333) === "0,333 kg", pesoBr(0.333));
  check("pesoBr 75 kg sem zeros", pesoBr(75) === "75 kg", pesoBr(75));
}

async function secao2() {
  console.log("\nSeção 2: impresso, view da venda e romaneio (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = await import("@/lib/actions/emporio-vendas");
  const O = await import("@/lib/actions/emporio-orcamentos");
  const Imp = await import("@/lib/actions/emporio-impressao");
  const { carregarCatalogoDeVenda } = await import("@/app/(dashboard)/emporio/_components/catalogo-venda");
  const stamp = Date.now();
  let tenantId = "";

  try {
    const t = await prisma.tenant.create({
      data: { name: `M110 ${stamp}`, document: `M110${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
    });
    tenantId = t.id;
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M110", email: `m110-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const owner = { id: u.id, role: "OWNER" as const, email: u.email };
    const db = prismaForTenant(t.id) as Dado;
    const cf = (await carregarCatalogoDeVenda(db, [])).consumidorFinal.id as string;
    const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M110 Loja" });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    const L = loja.data.id as string;
    const categoria = await db.productCategory.create({ data: scoped({ name: "M110 cat" }) });

    async function produto(nome: string, extra: Dado, apres: string, preco: number) {
      const p = await Cat.criarProdutoEmporioAction(db, owner, { name: `M110 ${nome} ${stamp}`, category_id: categoria.id, ...extra });
      if (!p.ok) throw new Error(`produto ${nome}: ${j(p)}`);
      const a = await Cat.criarApresentacaoAction(db, owner, p.data.id, { name: apres, base_qty: 1, is_sealed_package: false });
      if (!a.ok) throw new Error(`apresentação ${nome}: ${j(a)}`);
      const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: a.data.id, price: preco });
      if (!pr.ok) throw new Error(`preço ${nome}: ${j(pr)}`);
      const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: p.data.id, sealed: [], loose_qty: 1000, unit_cost: 1 });
      if (!imp.ok) throw new Error(`implantar ${nome}: ${j(imp)}`);
      return { emporio_product_id: p.data.id as string, presentation_id: a.data.id as string };
    }
    const racao = await produto("Ração", { base_unit: "quilograma" }, "Quilo", 10);
    const saca = await produto("Milho", { base_unit: "saca", content_qty: 25, content_unit: "quilograma" }, "Saca", 100);
    const oleo = await produto("Óleo", { base_unit: "litro" }, "Litro", 8);
    await abrirTurnoDeTeste(db, owner, L);

    const itens = [
      { ...racao, quantity: 2 },
      { ...saca, quantity: 3 },
      { ...oleo, quantity: 1 },
    ];
    const venda = await V.venderAction(db, owner, {
      operation_key: `m110-${stamp}-1`,
      establishment_id: L,
      customer_id: cf,
      items: itens,
      payments: [{ kind: "dinheiro", amount: 328 }],
    });
    if (!venda.ok) throw new Error(`venda: ${j(venda)}`);

    const imp = await Imp.lerImpressoDaVendaAction(db, owner, venda.data.id);
    check("impresso da venda: lê", imp.ok, j(imp));
    if (imp.ok) {
      check("impresso da venda: peso por item", j(imp.data.itens.map((i) => i.peso_kg)) === "[2,75,null]", j(imp.data.itens.map((i) => i.peso_kg)));
      check("impresso da venda: peso total 77", imp.data.peso_total_kg === 77, String(imp.data.peso_total_kg));
      check("impresso da venda: 1 item sem peso", imp.data.itens_sem_peso === 1, String(imp.data.itens_sem_peso));
    }

    const orc = await O.salvarOrcamentoAction(db, owner, { operation_key: `m110-${stamp}-q`, establishment_id: L, customer_id: cf, items: itens });
    if (!orc.ok) throw new Error(`orçamento: ${j(orc)}`);
    const impo = await Imp.lerImpressoDoOrcamentoAction(db, owner, orc.data.id);
    check("impresso do orçamento: lê", impo.ok, j(impo));
    if (impo.ok) {
      check("impresso do orçamento: peso por item", j(impo.data.itens.map((i) => i.peso_kg)) === "[2,75,null]", j(impo.data.itens.map((i) => i.peso_kg)));
      check("impresso do orçamento: total 77 e 1 sem peso", impo.data.peso_total_kg === 77 && impo.data.itens_sem_peso === 1);
    }

    const lida = await V.lerVendaAction(db, owner, venda.data.id);
    check("view da venda: lê", lida.ok, j(lida));
    if (lida.ok) {
      check("view da venda: weight_kg por item", j(lida.data.items.map((i) => i.weight_kg)) === "[2,75,null]", j(lida.data.items.map((i) => i.weight_kg)));
      check("view da venda: total_weight_kg 77", lida.data.total_weight_kg === 77, String(lida.data.total_weight_kg));
      check("view da venda: items_without_weight 1", lida.data.items_without_weight === 1);
    }

    const rom = await Imp.lerRomaneioDaVendaAction(db, owner, venda.data.id);
    check("romaneio: lê", rom.ok, j(rom));
    if (rom.ok) {
      check("romaneio: peso por item", j(rom.data.itens.map((i) => i.peso_kg)) === "[2,75,null]", j(rom.data.itens.map((i) => i.peso_kg)));
      check("romaneio: total 77 e 1 sem peso", rom.data.peso_total_kg === 77 && rom.data.itens_sem_peso === 1);
    }

    // Só litro: sem peso nenhum, o total some.
    const v2 = await V.venderAction(db, owner, {
      operation_key: `m110-${stamp}-2`,
      establishment_id: L,
      customer_id: cf,
      items: [{ ...oleo, quantity: 2 }],
      payments: [{ kind: "dinheiro", amount: 16 }],
    });
    if (!v2.ok) throw new Error(`venda 2: ${j(v2)}`);
    const imp2 = await Imp.lerImpressoDaVendaAction(db, owner, v2.data.id);
    check("só litro: peso_total_kg nulo", imp2.ok && imp2.data.peso_total_kg === null && imp2.data.itens_sem_peso === 1, j(imp2.ok ? imp2.data.peso_total_kg : imp2));
  } finally {
    if (tenantId) {
      const P = prisma as Dado;
      await P.emporioSale.updateMany({ where: { tenant_id: tenantId }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
      await P.emporioQuote.updateMany({ where: { tenant_id: tenantId }, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id: tenantId } }).catch((e: unknown) => console.log(`  (teardown: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.$disconnect();
  }
}

async function main() {
  await secao1();
  await secao2();
  console.log(falhas === 0 ? "\n✅ M110 (Módulo 39, Empório): peso total passou." : `\n❌ M110 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
