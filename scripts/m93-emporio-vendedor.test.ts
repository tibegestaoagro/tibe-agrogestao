import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M93: Módulo 39 (Meu Empório), entrega 3: o vendedor na venda e os relatórios.
 * Roda: `npm run test:m93`
 *
 * Seção 1: o vendedor da venda (quem pode ser, o Caixa que informa, a troca, a rota, a migração).
 * Seção 2: o vendedor e o caixa nos dados do papel.
 * Seção 3: o relatório de vendas (por vendedor, por produto, parados, por loja; alcance e datas).
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
      customer_id: cf,
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
    venda: { items: [{ emporio_product_id: prod.data.id, presentation_id: ap.data.id, quantity: 1, unit_price: 20 }], payments: [], customer_id: cf },
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
      customer_id: cf,
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
    customer_id: cf,
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

  // --- Seção 2: o vendedor e o caixa nos dados do papel
  console.log("\nSeção 2: o vendedor e o caixa no papel");
  const { lerImpressoDaVendaAction } = await import("@/lib/actions/emporio-impressao");
  if (!comVend.ok) throw new Error("sem venda para imprimir");
  const imp = await lerImpressoDaVendaAction(db, owner, comVend.data.id);
  check("a venda do Caixa com o Vendedor: vendedor = nome do Vendedor", imp.ok && imp.data.vendedor === "M93 vend1", j(imp));
  check("e caixa = Caixa 1 (nome de quem registrou)", imp.ok && imp.data.caixa === "Caixa 1 (M93 caixa)", j(imp.ok ? imp.data.caixa : imp));
  check("registrada_por saiu dos dados do papel", imp.ok && !("registrada_por" in imp.data), j(imp));
  const vistaV = await Ven.lerVendaAction(db, owner, comVend.data.id);
  check("VendaView expõe cash_session_id", vistaV.ok && typeof vistaV.data.cash_session_id === "string", j(vistaV.ok ? vistaV.data.cash_session_id : vistaV));
  await prisma.emporioSale.update({ where: { id: comVend.data.id }, data: { cash_session_id: null } });
  const semTurno = await lerImpressoDaVendaAction(db, owner, comVend.data.id);
  check("venda sem turno: caixa nulo, vendedor continua", semTurno.ok && semTurno.data.caixa === null && semTurno.data.vendedor === "M93 vend1", j(semTurno));
  await prisma.emporioSale.update({ where: { id: comVend.data.id }, data: { seller_user_id: null } });
  const semVendedor = await lerImpressoDaVendaAction(db, owner, comVend.data.id);
  check("venda antiga sem vendedor: vendedor nulo", semVendedor.ok && semVendedor.data.vendedor === null, j(semVendedor));
}

async function secao3() {
  console.log("\nSeção 3: o relatório de vendas (com banco)");
  const { prisma, prismaForTenant } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const Ven = await import("@/lib/actions/emporio-vendas");
  const Cli = await import("@/lib/actions/emporio-clientes");
  const Rel = await import("@/lib/actions/emporio-relatorios");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const stamp = Date.now();
  const rec = (r: Dado, code: string, status: number, field?: string, message?: string) =>
    !!r && !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field) && (message === undefined || r.message === message);

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
        data: { tenant_id: t.id, name: `M93R ${suf}`, email: `m93r-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role, ...papelDeFixture(role), ...extra },
      });
      return { id: u.id, role };
    };
    return { t, db: prismaForTenant(t.id), mkUser };
  };

  const C = await mkTenant("C");
  const D = await mkTenant("D");
  const db = C.db;
  const owner = await C.mkUser("dono", "OWNER");
  const gestor = await C.mkUser("gestor", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vendA = await C.mkUser("vendA", "OPERADOR");
  const vendB = await C.mkUser("vendB", "OPERADOR");
  const caixa = await C.mkUser("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const ownerD = await D.mkUser("dono", "OWNER");

  const mkLoja = async (name: string) => {
    const r = await Cat.criarEstabelecimentoAction(db, owner, { name });
    if (!r.ok) throw new Error(j(r));
    return r.data.id;
  };
  const L1 = await mkLoja("M93R Loja 1");
  const L2 = await mkLoja("M93R Loja 2");
  const L3 = await mkLoja("M93R Loja 3 arquivada");
  await vincularTodas(prisma, C.t.id, [gestor.id, vendA.id, caixa.id], [L1]);
  await vincularTodas(prisma, C.t.id, [vendB.id], [L1, L2]);

  const cat = await db.productCategory.create({ data: { name: "M93R categoria" } as never });
  const mkProduto = async (nome: string, precos: [string, number][], estoque: string[]) => {
    const p = await Cat.criarProdutoEmporioAction(db, owner, { name: `${nome} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    if (!p.ok) throw new Error(j(p));
    const a = await Cat.criarApresentacaoAction(db, owner, p.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!a.ok) throw new Error(j(a));
    for (const [est, price] of precos) {
      const r = await Cat.definirPrecoAction(db, owner, { establishment_id: est, presentation_id: a.data.id, price });
      if (!r.ok) throw new Error(j(r));
    }
    for (const est of estoque) {
      const e = await Est.implantarEstoqueAction(db, owner, { establishment_id: est, emporio_product_id: p.data.id, sealed: [], loose_qty: 100, unit_cost: 2 });
      if (!e.ok) throw new Error(j(e));
    }
    return { id: p.data.id, ap: a.data.id, name: `${nome} ${stamp}` };
  };
  const P1 = await mkProduto("M93R Arroz", [[L1, 10], [L2, 10]], [L1, L2]);
  const P2 = await mkProduto("M93R Feijao", [[L1, 30], [L2, 30]], [L1, L2]);
  const P3 = await mkProduto("M93R Parado", [[L1, 5], [L2, 5], [L3, 5]], []);
  const P4 = await mkProduto("M93R Arquivado", [[L1, 5]], []);
  const P5 = await mkProduto("M93R So na Loja 2", [[L2, 7]], []);
  await prisma.emporioProduct.update({ where: { id: P4.id }, data: { archived_at: new Date() } });

  const cf = (await Cli.garantirConsumidorFinal(db)).id;
  for (const est of [L1, L2]) await abrirTurnoDeTeste(db, owner, est);

  let seq = 0;
  const vender = async (ator: { id: string; role: Role }, est: string, p: { id: string; ap: string }, qtd: number, preco: number, extra: Dado = {}) => {
    const r = await Ven.venderAction(db, ator as never, {
      operation_key: `m93r-${stamp}-${(seq += 1)}`,
      establishment_id: est,
      customer_id: cf,
      items: [{ emporio_product_id: p.id, presentation_id: p.ap, quantity: qtd, unit_price: preco }],
      payments: [{ kind: "dinheiro", amount: qtd * preco }],
      ...extra,
    });
    if (!r.ok) throw new Error(`venda: ${j(r)}`);
    return r.data;
  };
  const em = (iso: string) => new Date(iso);
  const mover = (id: string, iso: string) => prisma.emporioSale.update({ where: { id }, data: { sold_at: em(iso) } });

  // Período do relatório: 2025-03-01 a 2025-03-31 (Brasília), longe das vendas de "agora" das outras seções.
  const P = { from: "2025-03-01", to: "2025-03-31" };

  // Loja 1
  const S1 = await vender(vendA, L1, P1, 2, 10); // 20, Vendedor A
  const S2 = await vender(caixa, L1, P2, 1, 30, { seller_user_id: vendA.id }); // 30, o Caixa pelo Vendedor A
  const S3 = await vender(vendB, L1, P1, 1, 10); // 10, Vendedor B
  const S4 = await vender(vendA, L1, P2, 1, 30); // cancelada
  const S5 = await vender(vendA, L1, P1, 1, 10); // 23h30 do último dia: entra
  const S6 = await vender(vendA, L1, P1, 1, 10); // 0h10 do dia seguinte: fica fora
  const S7 = await vender(gestor, L1, P1, 4, 10); // 40, de antes do período, com devolução de 3 (30) dentro dele
  const canc = await Ven.cancelarVendaAction(db, owner, S4.id, { reason: "teste" });
  if (!canc.ok) throw new Error(`cancelar: ${j(canc)}`);
  const dev = await Ven.devolverAction(db, owner, S7.id, {
    operation_key: `m93r-${stamp}-dev`,
    refund_kind: "dinheiro",
    items: [{ sale_item_id: S7.items[0].id, quantity: 3 }],
  });
  if (!dev.ok) throw new Error(`devolver: ${j(dev)}`);

  // Loja 2
  const S8 = await vender(vendB, L2, P1, 3, 10); // 30, Vendedor B
  const S9 = await vender(owner, L2, P2, 1, 30); // 30, o Dono, trocado depois
  const S10 = await vender(vendB, L2, P1, 1, 10); // 10, fica sem vendedor
  const troca = await Ven.trocarAction(db, owner, S9.id, {
    operation_key: `m93r-${stamp}-troca`,
    items_devolvidos: [{ sale_item_id: S9.items[0].id, quantity: 1 }],
    venda: { items: [{ emporio_product_id: P1.id, presentation_id: P1.ap, quantity: 3, unit_price: 10 }], payments: [], customer_id: cf },
  });
  if (!troca.ok) throw new Error(`troca: ${j(troca)}`);

  // Os instantes exatos, gravados pelo banco
  await mover(S1.id, "2025-03-10T15:00:00Z");
  await mover(S2.id, "2025-03-11T15:00:00Z");
  await mover(S3.id, "2025-03-12T15:00:00Z");
  await mover(S4.id, "2025-03-12T16:00:00Z");
  await mover(S5.id, "2025-04-01T02:30:00Z"); // 31/03 às 23h30 em Brasília
  await mover(S6.id, "2025-04-01T03:10:00Z"); // 01/04 às 0h10 em Brasília
  await mover(S7.id, "2025-02-20T15:00:00Z");
  await prisma.emporioSaleReturn.update({ where: { id: dev.data.id }, data: { returned_at: em("2025-03-15T15:00:00Z") } });
  await mover(S8.id, "2025-03-12T15:00:00Z");
  await mover(S9.id, "2025-03-13T14:00:00Z");
  await mover(troca.data.venda.id, "2025-03-13T15:00:00Z");
  await prisma.emporioSaleReturn.update({ where: { id: troca.data.devolucao.id }, data: { returned_at: em("2025-03-13T15:00:00Z") } });
  await mover(S10.id, "2025-03-14T15:00:00Z");
  await prisma.emporioSale.update({ where: { id: S10.id }, data: { seller_user_id: null } });
  // A Loja 3 sai do ar, e o Vendedor B sai da empresa
  await prisma.establishment.update({ where: { id: L3 }, data: { archived_at: new Date() } });
  await prisma.user.update({ where: { id: vendB.id }, data: { active: false } });

  const rel = await Rel.relatorioDeVendasAction(db, owner, P);
  check("o Dono, todas as lojas: ok", rel.ok, j(rel));
  if (!rel.ok) return;
  const r = rel.data;
  check("periodo ecoa o pedido", r.periodo.from === P.from && r.periodo.to === P.to, j(r.periodo));
  check("lojas: as duas ativas, sem a arquivada", j(r.lojas.map((l) => l.id).sort()) === j([L1, L2].sort()), j(r.lojas));

  const vend = (id: string | null) => r.por_vendedor.find((x) => x.seller_user_id === id);
  const linha = (x: Dado) => (x ? [x.sales_count, x.total, x.average_ticket] : null);
  check("Vendedor A: 3 vendas (sem a cancelada e sem a das 0h10), R$ 60, ticket 20", j(linha(vend(vendA.id))) === j([3, 60, 20]), j(vend(vendA.id)));
  check("Vendedor B: 2 vendas, R$ 40, ticket 20", j(linha(vend(vendB.id))) === j([2, 40, 20]), j(vend(vendB.id)));
  check("Vendedor desativado continua na linha dele, com o nome", vend(vendB.id)?.name === "M93R vendB", j(vend(vendB.id)));
  check("o Dono: 1 venda (a nova da troca não conta), R$ 30 (30 + 30 da troca - 30 devolvido), ticket 30", j(linha(vend(owner.id))) === j([1, 30, 30]), j(vend(owner.id)));
  check("venda sem vendedor: linha seller_user_id nulo, \"Sem vendedor\", 1 venda, R$ 10", j(linha(vend(null))) === j([1, 10, 10]) && vend(null)?.name === "Sem vendedor", j(vend(null)));
  check(
    "devolução no período de venda de antes dele: o Gestor fica com 0 vendas, R$ -30 e ticket nulo",
    j(linha(vend(gestor.id))) === j([0, -30, null]),
    j(vend(gestor.id)),
  );
  check(
    "por_vendedor por total decrescente, só quem vendeu ou teve devolução",
    j(r.por_vendedor.map((x) => x.seller_user_id)) === j([vendA.id, vendB.id, owner.id, null, gestor.id]),
    j(r.por_vendedor.map((x) => [x.name, x.total])),
  );

  const loja = (id: string) => r.por_loja.find((x) => x.establishment_id === id);
  check("Loja 1: 4 vendas, R$ 40 (70 - 30 devolvido da venda de fevereiro), ticket 10", j(linha(loja(L1))) === j([4, 40, 10]) && loja(L1)?.name === "M93R Loja 1", j(loja(L1)));
  check("Loja 2: 3 vendas, R$ 70, ticket 23,33", j(linha(loja(L2))) === j([3, 70, 23.33]), j(loja(L2)));
  check("por_loja por total decrescente, sem a arquivada", j(r.por_loja.map((x) => x.establishment_id)) === j([L2, L1]), j(r.por_loja));

  const prodLinha = (x: Dado) => (x ? [x.emporio_product_id, x.name, x.base_unit, x.quantity, x.total] : null);
  check(
    "por_produto: Arroz 8 kg e R$ 80 (11 vendidos - 3 devolvidos), Feijão 1 kg e R$ 30, por total",
    j(r.por_produto.map(prodLinha)) === j([
      [P1.id, P1.name, "quilograma", 8, 80],
      [P2.id, P2.name, "quilograma", 1, 30],
    ]),
    j(r.por_produto),
  );

  const parados = r.parados.map((x) => `${x.emporio_product_id}@${x.establishment_id}`).sort();
  check(
    "parados: o produto com preço e sem venda em cada loja, e o que só tem preço na Loja 2",
    j(parados) === j([`${P3.id}@${L1}`, `${P3.id}@${L2}`, `${P5.id}@${L2}`].sort()),
    j(r.parados),
  );
  check("parados não traz o arquivado, o sem preço na loja, o vendido nem a loja arquivada", !r.parados.some((x) => [P1.id, P2.id, P4.id].includes(x.emporio_product_id) || x.establishment_id === L3));
  const pl = r.parados.find((x) => x.emporio_product_id === P3.id && x.establishment_id === L1);
  check("a linha do parado traz o nome do produto e o da loja", pl?.name === P3.name && pl?.establishment_name === "M93R Loja 1", j(pl));

  // Uma loja só, e a arquivada pedida por id
  const so2 = await Rel.relatorioDeVendasAction(db, owner, { ...P, establishment_id: L2 });
  check(
    "o Dono pedindo a Loja 2: só ela, com o Vendedor B em 1 venda de R$ 30",
    so2.ok && j(so2.data.lojas.map((l) => l.id)) === j([L2]) && j(so2.data.por_loja.map(linha)) === j([[3, 70, 23.33]]) && j(linha(so2.data.por_vendedor.find((x) => x.seller_user_id === vendB.id))) === j([1, 30, 30]),
    j(so2),
  );
  const so3 = await Rel.relatorioDeVendasAction(db, owner, { ...P, establishment_id: L3 });
  check("a loja arquivada pedida por id responde, com zero vendas e ticket nulo", so3.ok && j(so3.data.por_loja.map(linha)) === j([[0, 0, null]]), j(so3));

  // Alcance
  const doGestor = await Rel.relatorioDeVendasAction(db, gestor, P);
  check(
    "o Gestor da Loja 1 sem loja: vê só a Loja 1",
    doGestor.ok && j(doGestor.data.lojas.map((l) => l.id)) === j([L1]) && j(doGestor.data.por_loja.map(linha)) === j([[4, 40, 10]]),
    j(doGestor),
  );
  check(
    "e os vendedores só da Loja 1: Vendedor A 60, Vendedor B 10, Gestor -30",
    doGestor.ok && j(doGestor.data.por_vendedor.map((x) => [x.seller_user_id, x.sales_count, x.total])) === j([[vendA.id, 3, 60], [vendB.id, 1, 10], [gestor.id, 0, -30]]),
    j(doGestor.ok ? doGestor.data.por_vendedor : doGestor),
  );
  check("e os parados só da Loja 1", doGestor.ok && j(doGestor.data.parados.map((x) => `${x.emporio_product_id}@${x.establishment_id}`)) === j([`${P3.id}@${L1}`]), j(doGestor.ok ? doGestor.data.parados : doGestor));
  const gestorL2 = await Rel.relatorioDeVendasAction(db, gestor, { ...P, establishment_id: L2 });
  check("o Gestor da Loja 1 pedindo a Loja 2: 404 no establishment_id", rec(gestorL2, "NOT_FOUND", 404, "establishment_id", "Estabelecimento não encontrado."), j(gestorL2));
  const inexistente = await Rel.relatorioDeVendasAction(db, owner, { ...P, establishment_id: "nao-existe" });
  check("loja que não existe: 404 no establishment_id", rec(inexistente, "NOT_FOUND", 404, "establishment_id", "Estabelecimento não encontrado."), j(inexistente));
  const MSG_403 = "Só o gestor da loja pode ver os relatórios.";
  const doVendedor = await Rel.relatorioDeVendasAction(db, vendA, P);
  check("o Vendedor: 403", rec(doVendedor, "FORBIDDEN", 403, undefined, MSG_403), j(doVendedor));
  const doCaixa = await Rel.relatorioDeVendasAction(db, caixa, P);
  check("o Caixa: 403", rec(doCaixa, "FORBIDDEN", 403, undefined, MSG_403), j(doCaixa));

  // Datas inválidas
  const MSG_FROM = "Informe a data inicial no formato AAAA-MM-DD.";
  const MSG_TO = "Informe a data final no formato AAAA-MM-DD.";
  const MSG_ORDEM = "A data final não pode ser antes da inicial.";
  const MSG_366 = "O período vai até 366 dias.";
  const datas: [string, Dado, string, string][] = [
    ["from fora do formato", { from: "2025-3-1", to: "2025-03-31" }, "from", MSG_FROM],
    ["from vazio", { from: "", to: "2025-03-31" }, "from", MSG_FROM],
    ["from que não existe (30/02)", { from: "2025-02-30", to: "2025-03-31" }, "from", MSG_FROM],
    ["to fora do formato", { from: "2025-03-01", to: "31/03/2025" }, "to", MSG_TO],
    ["to ausente", { from: "2025-03-01" }, "to", MSG_TO],
    ["to antes de from", { from: "2025-03-10", to: "2025-03-09" }, "to", MSG_ORDEM],
    ["367 dias", { from: "2025-01-01", to: "2026-01-02" }, "to", MSG_366],
  ];
  for (const [nome, input, field, msg] of datas) {
    const x = await Rel.relatorioDeVendasAction(db, owner, input);
    check(`data inválida (${nome}): 422 VALIDATION_ERROR em ${field}`, rec(x, "VALIDATION_ERROR", 422, field, msg), j(x));
  }
  const ok366 = await Rel.relatorioDeVendasAction(db, owner, { from: "2025-01-01", to: "2026-01-01" });
  check("366 dias passa", ok366.ok, j(ok366));
  const umDia = await Rel.relatorioDeVendasAction(db, owner, { from: "2025-03-31", to: "2025-03-31" });
  check(
    "um dia só (31/03): só a venda das 23h30, do Vendedor A",
    umDia.ok && j(umDia.data.por_vendedor.map((x) => [x.seller_user_id, x.sales_count, x.total])) === j([[vendA.id, 1, 10]]),
    j(umDia.ok ? umDia.data.por_vendedor : umDia),
  );
  const abril = await Rel.relatorioDeVendasAction(db, owner, { from: "2025-04-01", to: "2025-04-01" });
  check(
    "o dia seguinte (01/04): só a venda das 0h10",
    abril.ok && j(abril.data.por_vendedor.map((x) => [x.seller_user_id, x.sales_count, x.total])) === j([[vendA.id, 1, 10]]),
    j(abril.ok ? abril.data.por_vendedor : abril),
  );

  // Rota
  type Handler = (req: Request) => Promise<Response>;
  const mod = (await import("@/app/api/v1/emporio/reports/sales/route")) as unknown as Record<string, Handler>;
  const chamar = async (token: string | null, qs: string) => {
    const res = await withBearer(token, () => mod.GET(new Request(`http://localhost/api/v1/emporio/reports/sales?${qs}`)));
    let json: Dado = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  };
  const qs = `from=${P.from}&to=${P.to}`;
  const rSem = await chamar(null, qs);
  check("GET reports/sales sem sessão: 401", rSem.status === 401, `${rSem.status} ${j(rSem.json)}`);
  const rOk = await chamar(signAccessToken(owner.id), qs);
  check(
    "GET reports/sales do Dono: 200 com por_loja",
    rOk.status === 200 && j(rOk.json?.data?.por_loja?.map((x: Dado) => x.establishment_id)) === j([L2, L1]),
    `${rOk.status} ${j(rOk.json)}`,
  );
  const rLoja = await chamar(signAccessToken(owner.id), `${qs}&establishment_id=${L1}`);
  check("GET com establishment_id: só a loja pedida", rLoja.status === 200 && j(rLoja.json?.data?.lojas?.map((x: Dado) => x.id)) === j([L1]), `${rLoja.status} ${j(rLoja.json)}`);
  const rData = await chamar(signAccessToken(owner.id), "from=2025-03-10&to=2025-03-09");
  check(
    "GET com to antes de from: 422 no campo to, com a frase",
    rData.status === 422 && rData.json?.error?.code === "VALIDATION_ERROR" && rData.json?.error?.field === "to" && rData.json?.error?.message === MSG_ORDEM,
    `${rData.status} ${j(rData.json)}`,
  );
  const rVend = await chamar(signAccessToken(vendA.id), qs);
  check("GET do Vendedor: 403", rVend.status === 403, `${rVend.status} ${j(rVend.json)}`);
  const rOutra = await chamar(signAccessToken(ownerD.id), `${qs}&establishment_id=${L1}`);
  check("GET do Dono de outra conta pedindo a Loja 1: 404 no establishment_id", rOutra.status === 404 && rOutra.json?.error?.field === "establishment_id", `${rOutra.status} ${j(rOutra.json)}`);
  const rOutraTodas = await chamar(signAccessToken(ownerD.id), qs);
  check(
    "e sem loja, a outra conta não vê nada desta",
    rOutraTodas.status === 200 && rOutraTodas.json?.data?.lojas?.length === 0 && rOutraTodas.json?.data?.por_vendedor?.length === 0,
    `${rOutraTodas.status} ${j(rOutraTodas.json)}`,
  );
}

async function limpar() {
  const { prisma } = await import("@/lib/prisma");
  const modelos = [
    "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "emporioSalePayment", "emporioSaleReturnItem", "stockMovement", "emporioSaleItem",
    "emporioSaleReturn", "emporioSale", "cashHandover", "cashSession", "cashRegister", "fixedExpenseOccurrence", "fixedExpenseSplit", "fixedExpenseTemplate",
    "emporioCounter", "emporioSettings", "financialPayment", "financialEntry", "userEstablishment", "establishment", "bankAccount", "emporioCustomer", "contact",
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
    await secao3();
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
