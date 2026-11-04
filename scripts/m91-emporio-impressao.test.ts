import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M91: Módulo 39 (Meu Empório), entrega 1: configurações e impressão.
 * Roda: `npm run test:m91`
 *
 * Seção 1: o número da venda (contador por conta, atômico, sem buraco).
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

console.log("🖨️ M91: Módulo 39 (Meu Empório), entrega 1: configurações e impressão\n");

async function secao1() {
  console.log("Seção 1: o número da venda (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture } = await import("./_emporio-papel");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = await import("@/lib/actions/emporio-vendas");
  const { carregarCatalogoDeVenda } = await import("@/app/(dashboard)/emporio/_components/catalogo-venda");
  const { formatarNumero } = await import("@/lib/emporio/numeracao");
  const stamp = Date.now();
  const tenantIds: string[] = [];

  async function arranjo(rotulo: string) {
    const t = await prisma.tenant.create({
      data: {
        name: `M91 ${rotulo} ${stamp}`,
        document: `M91${rotulo}${stamp}`.slice(0, 14),
        plan: "grupo",
        status: "trial",
        trial_ends_at: new Date(Date.now() + 86_400_000),
      },
    });
    tenantIds.push(t.id);
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    const u = await prisma.user.create({
      data: {
        tenant_id: t.id,
        name: `M91 ${rotulo}`,
        email: `m91-${rotulo}-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
        ...papelDeFixture("OWNER"),
      },
    });
    const owner = { id: u.id, role: "OWNER" as const, email: u.email };
    const db = prismaForTenant(t.id);
    const cat0 = await carregarCatalogoDeVenda(db, []);
    const cf = cat0.contatos[0].id;
    const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: `M91 Loja ${rotulo}` });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    const categoria = await db.productCategory.create({ data: scoped({ name: `M91 cat ${rotulo}` }) });
    const p = await Cat.criarProdutoEmporioAction(db, owner, { name: `M91 Ração ${rotulo} ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
    if (!p.ok) throw new Error(`produto: ${j(p)}`);
    const pres = await Cat.criarApresentacaoAction(db, owner, p.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: loja.data.id, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: loja.data.id, emporio_product_id: p.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
    let seq = 0;
    const vender = (chave?: string) =>
      V.venderAction(db, owner, {
        operation_key: chave ?? `m91-${rotulo}-${stamp}-${(seq += 1)}`,
        establishment_id: loja.data.id,
        contact_id: cf,
        items: [{ emporio_product_id: p.data.id, presentation_id: pres.data.id, quantity: 1 }],
        payments: [{ kind: "dinheiro", amount: 10 }],
      });
    return { db, owner, vender };
  }

  try {
    const A = await arranjo("A");
    const B = await arranjo("B");

    const a1 = await A.vender();
    const a2 = await A.vender();
    check("A: primeira venda é a 1", a1.ok && a1.data.number === 1, j(a1));
    check("A: segunda venda é a 2", a2.ok && a2.data.number === 2, j(a2));

    const b1 = await B.vender();
    check("B: a primeira venda da outra conta também é a 1", b1.ok && b1.data.number === 1, j(b1));

    // Vendas simultâneas do MESMO produto já esgotam as 3 tentativas da transação
    // serializável (P2034), com ou sem contador (conferido sem ele). O cliente real
    // repete a chamada com a mesma operation_key; aqui cada venda faz o mesmo. A venda
    // que perde a corrida desfaz tudo, inclusive o incremento: por isso nenhum número
    // some, e é isso que o `[3,4,5,6,7]` exato prova.
    const venderRepetindo = async (C: typeof A = A): Promise<Awaited<ReturnType<typeof A.vender>>> => {
      const chave = `m91-lote-${stamp}-${Math.random()}`;
      for (let t = 0; t < 15; t += 1) {
        try {
          return await C.vender(chave);
        } catch (e) {
          if ((e as { code?: string })?.code !== "P2034") throw e;
        }
      }
      throw new Error("excedeu as tentativas");
    };
    const lote = await Promise.all([1, 2, 3, 4, 5].map(() => venderRepetindo()));
    check("5 vendas ao mesmo tempo: todas ok", lote.every((r) => r.ok), j(lote.filter((r) => !r.ok)));
    const nums = lote.flatMap((r) => (r.ok ? [r.data.number] : [])).sort((x, y) => x - y);
    check("5 vendas ao mesmo tempo: números 3 a 7, sem repetir nem pular", j(nums) === "[3,4,5,6,7]", j(nums));

    // Conta nova: as três primeiras vendas disputam a CRIAÇÃO da linha do contador.
    const Cc = await arranjo("C");
    const novo = await Promise.all([1, 2, 3].map(() => venderRepetindo(Cc)));
    const numsC = novo.flatMap((r) => (r.ok ? [r.data.number] : [])).sort((x, y) => x - y);
    check("conta nova, 3 vendas ao mesmo tempo: números 1 a 3", j(numsC) === "[1,2,3]", j(numsC));

    if (!a1.ok) throw new Error("venda base não criou");
    const lida = await V.lerVendaAction(A.db, A.owner, a1.data.id);
    check("lerVendaAction devolve number", lida.ok && lida.data.number === 1, j(lida));

    const lista = await V.listarVendasAction(A.db, A.owner, {});
    check("a lista de vendas traz number", lista.ok && lista.data.length === 7 && lista.data.every((v) => typeof v.number === "number"), j(lista));

    const contador = await A.db.emporioCounter.findFirst({ where: { key: "venda" } });
    check("o contador da conta A parou em 7", contador?.value === 7, j(contador));

    check("formatarNumero(4581) === '004581'", formatarNumero(4581) === "004581");
    check("formatarNumero(1234567) === '1234567'", formatarNumero(1234567) === "1234567");
  } finally {
    const modelos = [
      "emporioAuditLog", "cashMovement", "stockMovement", "emporioSalePayment", "emporioSaleReturnItem", "emporioSaleReturn",
      "emporioSaleItem", "emporioSale", "emporioCounter", "emporioSettings", "financialEntry", "presentationPrice", "productPresentation",
      "userEstablishment", "emporioProduct", "product", "establishment", "bankAccount", "contact", "productCategory", "user",
      "tenantProfile", "tenantFeature",
    ];
    for (const id of tenantIds) {
      for (const m of modelos) {
        try {
          await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: id } });
        } catch {
          // modelo ausente nesta versão do schema: segue
        }
      }
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    const sobrou = await prisma.tenant.count({ where: { id: { in: tenantIds } } });
    check("seção 1: a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
  }
}

async function main() {
  await secao1();
  console.log(falhas === 0 ? "\n✅ M91 verde" : `\n❌ M91: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
