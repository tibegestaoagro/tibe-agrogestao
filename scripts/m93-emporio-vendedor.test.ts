import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M93: Módulo 39 (Meu Empório), entrega 3: o vendedor na venda e os relatórios.
 * Roda: `npm run test:m93`
 *
 * Seção 1: o vendedor da venda (quem pode ser, o Caixa que informa, a troca, a rota, a migração).
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

console.log("🧾 M93: Módulo 39 (Meu Empório), entrega 3: vendedor e relatórios\n");

const tenantIds: string[] = [];

async function secao1() {
  console.log("Seção 1: o vendedor da venda (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { readFileSync } = await import("node:fs");
  const { prisma, prismaForTenant } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const Ven = await import("@/lib/actions/emporio-vendas");
  const Cli = await import("@/lib/actions/emporio-clientes");
  const { vendedoresDaLoja } = await import("@/lib/emporio/vendedores");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const stamp = Date.now();
  const rec = (r: Dado, code: string, status: number, field?: string, message?: string) =>
    !!r && !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field) && (message === undefined || r.message === message);
  const MSG_SEM_VENDEDOR = "Escolha o vendedor que atendeu.";
  const MSG_VENDEDOR_INVALIDO = "Escolha um vendedor desta loja.";

  type Role = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";
  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: {
        name: `M93 ${rotulo} ${stamp}`,
        document: `M93${rotulo}${stamp}`.slice(0, 14),
        plan: "grupo",
        status: "trial",
        trial_ends_at: new Date(Date.now() + 86_400_000),
      },
    });
    tenantIds.push(t.id);
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    const mkUser = async (suf: string, role: Role, extra: Dado = {}) => {
      const u = await prisma.user.create({
        data: { tenant_id: t.id, name: `M93 ${suf}`, email: `m93-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role, ...papelDeFixture(role), ...extra },
      });
      return { id: u.id, role };
    };
    return { t, db: prismaForTenant(t.id), mkUser };
  };

  const A = await mkTenant("A");
  const B = await mkTenant("B");
  const db = A.db;
  const owner = await A.mkUser("dono", "OWNER");
  const gerente = await A.mkUser("gerente", "ADMIN");
  const gestor = await A.mkUser("gestor", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend1 = await A.mkUser("vend1", "OPERADOR");
  const vend2 = await A.mkUser("vend2", "OPERADOR");
  const caixa = await A.mkUser("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const caixa2 = await A.mkUser("caixa2", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const caixaL2 = await A.mkUser("caixal2", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const inativo = await A.mkUser("inativo", "OPERADOR", { active: false });
  const ownerB = await B.mkUser("dono", "OWNER");
  const vendB = await B.mkUser("vend", "OPERADOR");

  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M93 Loja 1" });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M93 Loja 2" });
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j([l1, l2])}`);
  const L1 = l1.data.id;
  const L2 = l2.data.id;
  await vincularTodas(prisma, A.t.id, [gestor.id, vend1.id, caixa.id, caixa2.id, inativo.id], [L1]);
  await vincularTodas(prisma, A.t.id, [vend2.id, caixaL2.id], [L2]);

  // produto, preço e estoque nas duas lojas
  const cat = await db.productCategory.create({ data: { name: "M93 categoria" } as never });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M93 Sal ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(j(prod));
  const ap = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!ap.ok) throw new Error(j(ap));
  for (const est of [L1, L2]) {
    const p = await Cat.definirPrecoAction(db, owner, { establishment_id: est, presentation_id: ap.data.id, price: 20 });
    if (!p.ok) throw new Error(j(p));
    const e = await Est.implantarEstoqueAction(db, owner, { establishment_id: est, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100, unit_cost: 5 });
    if (!e.ok) throw new Error(j(e));
  }
  const cf = (await Cli.garantirConsumidorFinal(db)).id;
  for (const est of [L1, L2]) await abrirTurnoDeTeste(db, owner, est);

  let seq = 0;
  const vender = (ator: { id: string; role: Role }, est: string, extra: Dado = {}) =>
    Ven.venderAction(db, ator as never, {
      operation_key: `m93-${stamp}-${(seq += 1)}`,
      establishment_id: est,
      contact_id: cf,
      items: [{ emporio_product_id: prod.data.id, presentation_id: ap.data.id, quantity: 1, unit_price: 20 }],
      payments: [{ kind: "dinheiro", amount: 20 }],
      ...extra,
    });

  // --- a lista de quem pode ser vendedor
  const lista = await vendedoresDaLoja(db, L1);
  const ids = new Set(lista.map((x) => x.id));
  check(
    "vendedoresDaLoja(Loja 1): Dono, Gerente geral, Gestor e Vendedor da Loja 1",
    [owner, gerente, gestor, vend1].every((u) => ids.has(u.id)),
    j(lista),
  );
  check("e não traz o Caixa, o Vendedor só da Loja 2 nem o desativado", ![caixa, caixaL2, vend2, inativo].some((u) => ids.has(u.id)), j(lista));
  check("a lista tem exatamente 4 pessoas, com id e name", lista.length === 4 && lista.every((x) => typeof x.id === "string" && typeof x.name === "string"), j(lista));

  // --- o vendedor sozinho
  const sozinho = await vender(vend1, L1);
  check("o Vendedor vende sem seller_user_id: ok", sozinho.ok, j(sozinho));
  const rowSozinho = sozinho.ok ? await db.emporioSale.findFirst({ where: { id: sozinho.data.id } }) : null;
  check(
    "e a venda grava seller_user_id = sold_by_user_id = o Vendedor",
    rowSozinho?.seller_user_id === vend1.id && rowSozinho?.sold_by_user_id === vend1.id,
    j(rowSozinho),
  );

  // --- o Caixa sem vendedor
  const antes = await db.emporioSale.count();
  const semVend = await vender(caixa, L1);
  check("o Caixa sem vendedor: 422 SELLER_REQUIRED em seller_user_id", rec(semVend, "SELLER_REQUIRED", 422, "seller_user_id", MSG_SEM_VENDEDOR), j(semVend));
  check("e nenhuma venda foi gravada", (await db.emporioSale.count()) === antes);

  // --- o Caixa com vendedor
  const comVend = await vender(caixa, L1, { seller_user_id: vend1.id });
  check("o Caixa com o Vendedor da Loja 1: ok", comVend.ok, j(comVend));
  check(
    "a venda tem seller = Vendedor, sold_by = Caixa e seller_name",
    comVend.ok && comVend.data.seller_user_id === vend1.id && comVend.data.sold_by_user_id === caixa.id && comVend.data.seller_name === "M93 vend1" && comVend.data.sold_by_name === "M93 caixa",
    j(comVend.ok ? [comVend.data.seller_user_id, comVend.data.sold_by_user_id, comVend.data.seller_name, comVend.data.sold_by_name] : comVend),
  );
  const comGestor = await vender(caixa, L1, { seller_user_id: gestor.id });
  check("o Caixa pode indicar o Gestor, o Gerente geral e o Dono", comGestor.ok && (await vender(caixa, L1, { seller_user_id: gerente.id })).ok && (await vender(caixa, L1, { seller_user_id: owner.id })).ok, j(comGestor));
  const lida = comVend.ok ? await Ven.lerVendaAction(db, owner, comVend.data.id) : null;
  check("lerVenda também traz os nomes", !!lida?.ok && lida.data.seller_name === "M93 vend1", j(lida));

  // --- repetir a chave devolve a venda gravada, sem revalidar o vendedor
  const chaveFixa = `m93-${stamp}-replay`;
  const r1 = await vender(caixa, L1, { operation_key: chaveFixa, seller_user_id: vend1.id });
  const r2 = await vender(caixa, L1, { operation_key: chaveFixa, seller_user_id: vend1.id });
  check("repetir a chave devolve a mesma venda", r1.ok && r2.ok && r2.data.id === r1.data.id && r2.data.replayed === true && r2.data.seller_user_id === vend1.id, j(r2));

  // --- vendedor inválido
  const invalido = async (nome: string, sellerId: string) => {
    const n0 = await db.emporioSale.count();
    const r = await vender(caixa, L1, { seller_user_id: sellerId });
    check(`vendedor inválido (${nome}): 422 INVALID_SELLER em seller_user_id, sem gravar`, rec(r, "INVALID_SELLER", 422, "seller_user_id", MSG_VENDEDOR_INVALIDO) && (await db.emporioSale.count()) === n0, j(r));
  };
  await invalido("Vendedor só da Loja 2", vend2.id);
  await invalido("outro Caixa", caixa2.id);
  await invalido("usuário desativado", inativo.id);
  await invalido("usuário de outra conta", vendB.id);
  await invalido("id que não existe", "nao-existe");
  const doVendedor = await vender(vend1, L1, { seller_user_id: vend2.id });
  check("o Vendedor que indica alguém inválido também é recusado", rec(doVendedor, "INVALID_SELLER", 422, "seller_user_id", MSG_VENDEDOR_INVALIDO), j(doVendedor));
  const doVendedorOk = await vender(vend1, L1, { seller_user_id: gestor.id });
  check("o Vendedor que indica o Gestor da loja: seller = Gestor, sold_by = Vendedor", doVendedorOk.ok && doVendedorOk.data.seller_user_id === gestor.id && doVendedorOk.data.sold_by_user_id === vend1.id, j(doVendedorOk));

  // --- a troca herda o vendedor
  if (!comVend.ok) throw new Error("sem venda para trocar");
  const item = comVend.data.items[0];
  const troca = await Ven.trocarAction(db, gestor as never, comVend.data.id, {
    operation_key: `m93-${stamp}-troca`,
    items_devolvidos: [{ sale_item_id: item.id, quantity: 1 }],
    venda: { items: [{ emporio_product_id: prod.data.id, presentation_id: ap.data.id, quantity: 1, unit_price: 20 }], payments: [], contact_id: cf },
  });
  check("a troca feita pelo Gestor funciona", troca.ok, j(troca));
  check(
    "a venda nova da troca herda o vendedor da original (Vendedor), com sold_by = Gestor",
    troca.ok && troca.data.venda.seller_user_id === vend1.id && troca.data.venda.sold_by_user_id === gestor.id,
    j(troca.ok ? [troca.data.venda.seller_user_id, troca.data.venda.sold_by_user_id] : troca),
  );

  // --- troca de venda sem vendedor (anterior à entrega): fica quem registrou, e o seller_user_id do corpo é ignorado
  if (!doVendedorOk.ok) throw new Error("sem venda legada para trocar");
  await prisma.emporioSale.update({ where: { id: doVendedorOk.data.id }, data: { seller_user_id: null } });
  const trocaLegada = await Ven.trocarAction(db, gestor as never, doVendedorOk.data.id, {
    operation_key: `m93-${stamp}-troca-legada`,
    items_devolvidos: [{ sale_item_id: doVendedorOk.data.items[0].id, quantity: 1 }],
    venda: {
      items: [{ emporio_product_id: prod.data.id, presentation_id: ap.data.id, quantity: 1, unit_price: 20 }],
      payments: [],
      contact_id: cf,
      seller_user_id: vend2.id,
    },
  });
  check(
    "troca de venda sem vendedor: a nova fica com quem registrou (Gestor), ignorando o seller_user_id do corpo",
    trocaLegada.ok && trocaLegada.data.venda.seller_user_id === gestor.id && trocaLegada.data.venda.sold_by_user_id === gestor.id,
    j(trocaLegada.ok ? [trocaLegada.data.venda.seller_user_id, trocaLegada.data.venda.sold_by_user_id] : trocaLegada),
  );
  await prisma.emporioSale.update({ where: { id: doVendedorOk.data.id }, data: { seller_user_id: gestor.id } });

  // --- listarVendedoresDaLojaAction
  const lA = await Ven.listarVendedoresDaLojaAction(db, caixa as never, L1);
  check("listarVendedoresDaLojaAction: o Caixa da loja recebe a lista", lA.ok && lA.data.length === 4, j(lA));
  const lFora = await Ven.listarVendedoresDaLojaAction(db, caixa as never, L2);
  check("o Caixa pedindo a Loja 2: 404 em establishment_id", rec(lFora, "NOT_FOUND", 404, "establishment_id"), j(lFora));
  const lVis = await Ven.listarVendedoresDaLojaAction(db, (await A.mkUser("visu", "VISUALIZADOR")) as never, L1);
  check("quem não tem função no Empório: recusa de permissão (403)", !lVis.ok && lVis.status === 403, j(lVis));
  const lDono = await Ven.listarVendedoresDaLojaAction(db, owner, L1);
  check("o Dono lista a Loja 1", lDono.ok && lDono.data.length === 4, j(lDono));

  // --- rotas
  type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const chamar = async (token: string | null, caminho: string, metodo: string, url: string, corpo?: Dado, id = "x") => {
    const mod = (await import(`@/app/api/v1/emporio/${caminho}/route`)) as Record<string, Handler>;
    const init: RequestInit = { method: metodo };
    if (corpo !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(corpo);
    }
    const res = await withBearer(token, () => mod[metodo](new Request(`http://localhost/api/v1/emporio/${url}`, init), { params: Promise.resolve({ id }) }));
    let json: Dado = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  };
  const tCaixa = signAccessToken(caixa.id);
  const tCaixaL2 = signAccessToken(caixaL2.id);
  const rSem = await chamar(null, "establishments/[id]/sellers", "GET", `establishments/${L1}/sellers`, undefined, L1);
  check("GET establishments/:id/sellers sem sessão: 401", rSem.status === 401, `${rSem.status} ${j(rSem.json)}`);
  const rOk = await chamar(tCaixa, "establishments/[id]/sellers", "GET", `establishments/${L1}/sellers`, undefined, L1);
  check("o Caixa da Loja 1 recebe a lista (200, 4 pessoas)", rOk.status === 200 && rOk.json?.data?.length === 4, `${rOk.status} ${j(rOk.json)}`);
  const rFora = await chamar(tCaixaL2, "establishments/[id]/sellers", "GET", `establishments/${L1}/sellers`, undefined, L1);
  check("o Caixa de outra loja: 404", rFora.status === 404, `${rFora.status} ${j(rFora.json)}`);
  const rB = await chamar(signAccessToken(ownerB.id), "establishments/[id]/sellers", "GET", `establishments/${L1}/sellers`, undefined, L1);
  check("o Dono de outra conta: 404", rB.status === 404, `${rB.status} ${j(rB.json)}`);

  const corpo = (extra: Dado) => ({
    operation_key: `m93-${stamp}-rota-${(seq += 1)}`,
    establishment_id: L1,
    contact_id: cf,
    items: [{ emporio_product_id: prod.data.id, presentation_id: ap.data.id, quantity: 1, unit_price: 20 }],
    payments: [{ kind: "dinheiro", amount: 20 }],
    ...extra,
  });
  const pSem = await chamar(tCaixa, "sales", "POST", "sales", corpo({}));
  check("POST sales do Caixa sem seller_user_id: 422 SELLER_REQUIRED no campo", pSem.status === 422 && pSem.json?.error?.code === "SELLER_REQUIRED" && pSem.json?.error?.field === "seller_user_id" && pSem.json?.error?.message === MSG_SEM_VENDEDOR, `${pSem.status} ${j(pSem.json)}`);
  const pOk = await chamar(tCaixa, "sales", "POST", "sales", corpo({ seller_user_id: vend1.id }));
  check("POST sales do Caixa com seller_user_id: 201 com seller_name", pOk.status === 201 && pOk.json?.data?.seller_user_id === vend1.id && pOk.json?.data?.seller_name === "M93 vend1", `${pOk.status} ${j(pOk.json)}`);
  const pRuim = await chamar(tCaixa, "sales", "POST", "sales", corpo({ seller_user_id: vend2.id }));
  check("POST sales com vendedor de outra loja: 422 INVALID_SELLER", pRuim.status === 422 && pRuim.json?.error?.code === "INVALID_SELLER" && pRuim.json?.error?.field === "seller_user_id" && pRuim.json?.error?.message === MSG_VENDEDOR_INVALIDO, `${pRuim.status} ${j(pRuim.json)}`);

  // --- a migração: ninguém com sold_by fica sem vendedor, e reaplicar o UPDATE conserta o que faltar
  const orfas = await prisma.emporioSale.count({ where: { sold_by_user_id: { not: null }, seller_user_id: null } });
  check("no banco local, nenhuma venda com sold_by_user_id fica com seller_user_id nulo", orfas === 0, String(orfas));
  if (sozinho.ok) {
    await prisma.emporioSale.update({ where: { id: sozinho.data.id }, data: { seller_user_id: null } });
    const sql = readFileSync("prisma/migrations/20261105140000_emporio_vendedor_da_venda/migration.sql", "utf8");
    const update = sql
      .split("\n")
      .filter((l) => !l.startsWith("--"))
      .join("\n")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("UPDATE"));
    check("a migração traz o UPDATE do backfill", !!update, sql.slice(-200));
    if (update) await prisma.$executeRawUnsafe(update);
    const depois = await prisma.emporioSale.findUnique({ where: { id: sozinho.data.id } });
    check("rodar o UPDATE preenche o vendedor com quem registrou", depois?.seller_user_id === vend1.id, j(depois?.seller_user_id));
  }
}

async function limpar() {
  const { prisma } = await import("@/lib/prisma");
  const modelos = [
    "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "emporioSalePayment", "emporioSaleReturnItem", "stockMovement", "emporioSaleItem",
    "emporioSaleReturn", "emporioSale", "cashHandover", "cashSession", "cashRegister", "fixedExpenseOccurrence", "fixedExpenseSplit", "fixedExpenseTemplate",
    "emporioCounter", "emporioSettings", "financialPayment", "financialEntry", "userEstablishment", "establishment", "bankAccount", "contact",
    "user", "tenantProfile", "tenantFeature",
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
  check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
}

async function main() {
  try {
    await secao1();
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M93 verde" : `\n❌ M93: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
