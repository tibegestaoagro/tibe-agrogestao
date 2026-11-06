import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M92: Módulo 39 (Meu Empório), entrega 2: caixa com turno.
 * Roda: `npm run test:m92`
 *
 * Seção 1: o modelo (caixas numerados, sessão única por caixa, "Com a gerência").
 * Seção 2: o papel Caixa (Equipe, permissões, páginas, leituras recusadas, vendas de hoje, desconto).
 * Seção 3: caixas, turno (abrir, sangria, conferir, encerrar), a gerência, a transferência, o Meu Dia e as rotas.
 * Seção 4: todo dinheiro da gaveta (venda, fiado, devolução, cancelamento, troca, despesa) cai no turno.
 * Seção 5: o relatório do encerramento (dados do papel).
 * Seção 6: a reaplicação do backfill só preenche lojas sem turno.
 * Seção 7: o relógio interno do turno (`opts.agora`), e a rota que ignora data no corpo.
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

console.log("🧾 M92: Módulo 39 (Meu Empório), entrega 2: caixa com turno\n");

const tenantIds: string[] = [];

async function secao1() {
  console.log("Seção 1: o modelo (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture } = await import("./_emporio-papel");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Caixa = await import("@/lib/actions/emporio-caixa");
  const stamp = Date.now();

  async function arranjo(rotulo: string) {
    const t = await prisma.tenant.create({
      data: {
        name: `M92 ${rotulo} ${stamp}`,
        document: `M92${rotulo}${stamp}`.slice(0, 14),
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
        name: `M92 ${rotulo}`,
        email: `m92-${rotulo}-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
        ...papelDeFixture("OWNER"),
      },
    });
    const owner = { id: u.id, role: "OWNER" as const, email: u.email };
    const db = prismaForTenant(t.id);
    const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: `M92 Loja ${rotulo}` });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    return { t, u, owner, db, lojaId: loja.data.id };
  }

  const A = await arranjo("A");
  const B = await arranjo("B");

  // criarEstabelecimentoAction cria o Caixa 1
  const caixasA = await A.db.cashRegister.findMany({ where: { establishment_id: A.lojaId } });
  check("a loja nasce com exatamente um caixa, o de número 1", caixasA.length === 1 && caixasA[0].number === 1, j(caixasA));
  const caixa1 = caixasA[0];

  // saldo por caixa
  const caixa2 = await A.db.cashRegister.create({ data: scoped({ establishment_id: A.lojaId, number: 2 }) });
  const mov = (extra: Dado) => ({
    establishment_id: A.lojaId,
    direction: "entrada" as const,
    origin: "implantacao" as const,
    occurred_at: new Date(),
    ...extra,
  });
  await A.db.cashMovement.create({ data: scoped(mov({ amount: 50, cash_register_id: caixa1.id })) });
  await A.db.cashMovement.create({ data: scoped(mov({ amount: 20, cash_register_id: caixa2.id })) });
  check("saldoDoCaixa: Caixa 1 = 5000", (await Caixa.saldoDoCaixa(A.db, caixa1.id)) === 5000);
  check("saldoDoCaixa: Caixa 2 = 2000", (await Caixa.saldoDoCaixa(A.db, caixa2.id)) === 2000);
  check("saldoDaGaveta é a soma dos caixas da loja = 7000", (await Caixa.saldoDaGaveta(A.db, A.lojaId)) === 7000);

  // Com a gerência
  await A.db.cashMovement.create({
    data: scoped({
      manager_establishment_id: A.lojaId,
      direction: "entrada",
      origin: "sangria",
      occurred_at: new Date(),
      amount: 30,
    }),
  });
  check("saldoDaGerencia soma só o que tem manager_establishment_id = 3000", (await Caixa.saldoDaGerencia(A.db, A.lojaId)) === 3000);
  check("saldoDaGaveta não inclui a gerência (continua 7000)", (await Caixa.saldoDaGaveta(A.db, A.lojaId)) === 7000);

  // CHECK: dois lugares
  async function erroDe(fn: () => Promise<unknown>): Promise<Dado> {
    try {
      await fn();
      return null;
    } catch (e) {
      return e;
    }
  }
  const textoDe = (e: Dado) => `${e?.message ?? ""} ${j(e?.meta ?? {})} ${j(e?.cause ?? {})}`;
  const eCheck = await erroDe(() =>
    A.db.cashMovement.create({
      data: scoped(mov({ amount: 5, manager_establishment_id: A.lojaId, origin: "sangria" })),
    }),
  );
  check("o CHECK recusa movimento com gaveta e gerência juntas, pelo CashMovement_exactly_one_place", textoDe(eCheck).includes("CashMovement_exactly_one_place"), textoDe(eCheck).slice(0, 200));

  const eSemLugar = await erroDe(() =>
    A.db.cashMovement.create({
      data: scoped({ direction: "entrada", origin: "sangria", occurred_at: new Date(), amount: 5 }),
    }),
  );
  check("o CHECK recusa movimento sem lugar nenhum", textoDe(eSemLugar).includes("CashMovement_exactly_one_place"), textoDe(eSemLugar).slice(0, 200));

  const eRegistroSemGaveta = await erroDe(() =>
    A.db.cashMovement.create({
      data: scoped({
        manager_establishment_id: A.lojaId,
        cash_register_id: caixa1.id,
        direction: "entrada",
        origin: "sangria",
        occurred_at: new Date(),
        amount: 5,
      }),
    }),
  );
  check("o CHECK recusa caixa sem gaveta, pelo CashMovement_register_in_drawer", textoDe(eRegistroSemGaveta).includes("CashMovement_register_in_drawer"), textoDe(eRegistroSemGaveta).slice(0, 200));

  // um único aberto por caixa
  const sessao = (n: string, extra: Dado = {}) => ({
    establishment_id: A.lojaId,
    cash_register_id: caixa1.id,
    operation_key: `m92-${stamp}-${n}`,
    opened_by_user_id: A.u.id,
    opened_at: new Date(),
    opening_expected: 0,
    opening_counted: 0,
    ...extra,
  });
  await A.db.cashSession.create({ data: scoped(sessao("s1", { open_register_id: caixa1.id })) });
  const eDup = await erroDe(() => A.db.cashSession.create({ data: scoped(sessao("s2", { open_register_id: caixa1.id })) }));
  check(
    "duas sessões abertas no mesmo caixa violam o único (P2002 em open_register_id)",
    eDup?.code === "P2002" && textoDe(eDup).includes("open_register_id"),
    textoDe(eDup).slice(0, 200),
  );
  const eOutroCaixa = await erroDe(() => A.db.cashSession.create({ data: scoped(sessao("s2b", { open_register_id: caixa2.id })) }));
  check("sessão aberta com open_register_id de outro caixa é recusada, pelo CashSession_open_register_matches", textoDe(eOutroCaixa).includes("CashSession_open_register_matches"), textoDe(eOutroCaixa).slice(0, 200));
  let encerradasOk = true;
  try {
    await A.db.cashSession.create({ data: scoped(sessao("s3", { open_register_id: null })) });
    await A.db.cashSession.create({ data: scoped(sessao("s4", { open_register_id: null })) });
  } catch (e) {
    encerradasOk = false;
    console.log(String(e));
  }
  check("sessões encerradas (open_register_id nulo) convivem", encerradasOk);

  // CashHandover existe e é escopado
  const sess = await A.db.cashSession.findFirst({ where: { operation_key: `m92-${stamp}-s1` } });
  await A.db.cashHandover.create({
    data: scoped({
      establishment_id: A.lojaId,
      cash_register_id: caixa1.id,
      cash_session_id: sess!.id,
      kind: "sangria",
      amount: 10,
      operation_key: `m92-${stamp}-h1`,
      created_by_user_id: A.u.id,
    }),
  });

  // isolamento
  check("tenant B não vê CashRegister do A", (await B.db.cashRegister.count({ where: { id: caixa1.id } })) === 0);
  check("tenant B não vê CashSession do A", (await B.db.cashSession.count()) === 0);
  check("tenant B não vê CashHandover do A", (await B.db.cashHandover.count()) === 0);
  check("tenant B só tem o próprio Caixa 1", (await B.db.cashRegister.count()) === 1);
}

async function secao2() {
  console.log("\nSeção 2: o papel Caixa (com banco)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const Cmp = await import("@/lib/actions/emporio-compras");
  const Trf = await import("@/lib/actions/emporio-transferencias");
  const Ven = await import("@/lib/actions/emporio-vendas");
  const Desp = await import("@/lib/actions/emporio-despesas");
  const Eq = await import("@/lib/actions/emporio-equipe");
  const Cli = await import("@/lib/actions/emporio-clientes");
  const { papelDoEmporio, pode, EMPORIO_KEYS } = await import("@/lib/emporio/papel");
  const { paginasVisiveis } = await import("@/lib/emporio/paginas");
  const { papelDeFixture } = await import("./_emporio-papel");
  const stamp = Date.now();

  const t = await prisma.tenant.create({
    data: {
      name: `M92 caixa ${stamp}`,
      document: `M92C${stamp}`.slice(0, 14),
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
      name: "M92 dono caixa",
      email: `m92-dono-caixa-${stamp}@teste.local`,
      password_hash: "x",
      role: "OWNER",
      ...papelDeFixture("OWNER"),
    },
  });
  const owner = { id: u.id, role: "OWNER" as const, email: u.email };
  const db = prismaForTenant(t.id);
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M92 C Loja 1" });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M92 C Loja 2" });
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j([l1, l2])}`);
  const loja1 = l1.data.id;
  const loja2 = l2.data.id;
  await prisma.establishment.update({ where: { id: loja1 }, data: { max_discount_pct: 10 } });

  // Equipe: cadastrar o Caixa
  const semLoja = await Eq.cadastrarMembroAction(db, owner, { name: "Caixa Sem Loja", email: `m92-cx0-${stamp}@teste.local`, emporio_role: "caixa" });
  check("cadastrar Caixa sem loja: 422 em establishment_ids", !semLoja.ok && semLoja.status === 422 && semLoja.field === "establishment_ids", j(semLoja));
  const comChave = await Eq.cadastrarMembroAction(db, owner, {
    name: "Caixa Com Chave",
    email: `m92-cx1-${stamp}@teste.local`,
    emporio_role: "caixa",
    establishment_ids: [loja1],
    emporio_keys: ["perda"],
  });
  check("cadastrar Caixa com chaves: 422 em emporio_keys", !comChave.ok && comChave.status === 422 && comChave.field === "emporio_keys", j(comChave));
  const cad = await Eq.cadastrarMembroAction(db, owner, {
    name: "Caixa Um",
    email: `m92-cx2-${stamp}@teste.local`,
    emporio_role: "caixa",
    establishment_ids: [loja1],
  });
  check("cadastrar Caixa com lojas e sem chaves funciona", cad.ok, j(cad));
  if (!cad.ok) throw new Error("sem caixa não há seção 2");
  const caixa = { id: cad.data.id, role: "OPERADOR" as const };
  const gravado = await prisma.user.findUnique({ where: { id: caixa.id } });
  check("o Caixa fica gravado com emporio_role caixa, sem chaves", gravado?.emporio_role === "caixa" && gravado.emporio_keys.length === 0, j(gravado));
  const alterado = await Eq.alterarMembroAction(db, owner, caixa.id, { emporio_keys: ["perda"] });
  check("alterar o Caixa para ter chaves: 422 em emporio_keys", !alterado.ok && alterado.status === 422 && alterado.field === "emporio_keys", j(alterado));

  // papel.ts
  const c = await papelDoEmporio(db, caixa);
  check("papel carregado é caixa, soDaLoja, sem chaves", c.papel === "caixa" && c.soDaLoja && c.chaves.size === 0, j({ p: c.papel, s: c.soDaLoja }));
  check("pode vendedor_da_loja na Loja 1", pode(c, "vendedor_da_loja", loja1));
  check("não pode vendedor_da_loja na Loja 2", !pode(c, "vendedor_da_loja", loja2));
  check("nenhuma chave vale para o Caixa", EMPORIO_KEYS.every((k) => !pode(c, `chave:${k.id}`, loja1)));
  check("chave:devolver_trocar falsa na Loja 1", !pode(c, "chave:devolver_trocar", loja1));
  check("gestor_da_loja e conta falsos", !pode(c, "gestor_da_loja", loja1) && !pode(c, "conta"));
  check("fora_do_caixa falso para o Caixa", !pode(c, "fora_do_caixa"));
  const gestor = { ...c, papel: "gestor" as const };
  const vend = { ...c, papel: "vendedor" as const };
  const dono = { ...c, papel: "dono" as const, lojas: null };
  check("fora_do_caixa verdadeiro para gestor, vendedor e dono", pode(gestor, "fora_do_caixa") && pode(vend, "fora_do_caixa") && pode(dono, "fora_do_caixa"));
  check("EMPORIO_KEYS não tem mais transferir_caixa", !EMPORIO_KEYS.some((k) => (k.id as string) === "transferir_caixa"));
  const hrefs = paginasVisiveis(c).map((p) => p.href);
  check(
    "paginasVisiveis do Caixa é exatamente Início, Vender, Vendas, Fiado e Caixa",
    j(hrefs) === j(["/emporio", "/emporio/vender", "/emporio/vendas", "/emporio/fiado", "/emporio/caixa"]),
    j(hrefs),
  );

  // Produto, preço e estoque nas duas lojas
  const cat = await db.productCategory.create({ data: scoped({ name: "M92 categoria" }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M92 Sal ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(j(prod));
  const ap = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!ap.ok) throw new Error(j(ap));
  for (const est of [loja1, loja2]) {
    const p = await Cat.definirPrecoAction(db, owner, { establishment_id: est, presentation_id: ap.data.id, price: 20 });
    if (!p.ok) throw new Error(j(p));
    const e = await Est.implantarEstoqueAction(db, owner, { establishment_id: est, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100, unit_cost: 5 });
    if (!e.ok) throw new Error(j(e));
  }
  const cf = (await Cli.garantirConsumidorFinal(db)).id;
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  for (const est of [loja1, loja2]) await abrirTurnoDeTeste(db, owner, est);
  let seq = 0;
  const vender = (ator: { id: string; role: "OWNER" | "OPERADOR" }, est: string, preco: number) =>
    Ven.venderAction(db, ator, {
      operation_key: `m92-s2-${stamp}-${(seq += 1)}`,
      establishment_id: est,
      customer_id: cf,
      seller_user_id: owner.id,
      items: [{ emporio_product_id: prod.data.id, presentation_id: ap.data.id, quantity: 1, unit_price: preco }],
      payments: [{ kind: "dinheiro", amount: preco }],
    });

  // Desconto
  const acima = await vender(caixa, loja1, 15);
  check("desconto de 25% (limite 10%) é recusado ao Caixa: 403 DISCOUNT_ABOVE_LIMIT em items", !acima.ok && acima.code === "DISCOUNT_ABOVE_LIMIT" && acima.status === 403 && acima.field === "items", j(acima));
  const dentro = await vender(caixa, loja1, 19);
  check("desconto de 5% (dentro do limite) passa para o Caixa", dentro.ok, j(dentro));
  const naLoja2 = await vender(caixa, loja2, 20);
  check("o Caixa não vende na Loja 2: recusado", !naLoja2.ok, j(naLoja2));

  // Vendas: hoje e nas lojas dele
  const antiga = await vender(owner, loja1, 20);
  if (!antiga.ok) throw new Error(j(antiga));
  await prisma.emporioSale.update({ where: { id: antiga.data.id }, data: { sold_at: new Date(Date.now() - 3 * 86_400_000) } });
  const outraLoja = await vender(owner, loja2, 20);
  if (!outraLoja.ok) throw new Error(j(outraLoja));
  const dezDias = new Date(Date.now() - 10 * 86_400_000);
  const doCaixa = await Ven.listarVendasAction(db, caixa, { de: dezDias });
  check(
    "listarVendas do Caixa, pedindo 10 dias: só a venda de hoje da Loja 1",
    doCaixa.ok && doCaixa.data.length === 1 && dentro.ok && doCaixa.data[0].id === dentro.data.id,
    j(doCaixa.ok ? doCaixa.data.map((v) => v.id) : doCaixa),
  );
  const semPeriodo = await Ven.listarVendasAction(db, caixa);
  check("listarVendas do Caixa sem período também é só hoje", semPeriodo.ok && semPeriodo.data.length === 1, j(semPeriodo.ok ? semPeriodo.data.length : semPeriodo));
  const doDono = await Ven.listarVendasAction(db, owner, { de: dezDias });
  check("o Dono, pedindo 10 dias, vê as 3 vendas feitas", doDono.ok && doDono.data.length === 3, j(doDono.ok ? doDono.data.length : doDono));
  const lerAntiga = await Ven.lerVendaAction(db, caixa, antiga.data.id);
  check("lerVenda de dia anterior: 404 para o Caixa", !lerAntiga.ok && lerAntiga.status === 404, j(lerAntiga));

  // Recusas 403
  const dev = await Ven.devolverAction(db, caixa, dentro.ok ? dentro.data.id : "x", { operation_key: `m92-dev-${stamp}`, refund_kind: "dinheiro", items: [] });
  check("devolverAction recusa o Caixa com 403", !dev.ok && dev.status === 403, j(dev));
  const canc = await Ven.cancelarVendaAction(db, caixa, dentro.ok ? dentro.data.id : "x", { reason: "teste" });
  check("cancelarVendaAction recusa o Caixa com 403", !canc.ok && canc.status === 403, j(canc));
  const pag = await Desp.pagarDespesasAction(db, caixa, { entry_ids: ["x"], from: { establishment_id: loja1 } } as never);
  check("pagarDespesasAction recusa o Caixa com 403", !pag.ok && pag.status === 403, j(pag));
  const leituras: [string, { ok: boolean; status?: number }][] = [
    ["saldoDaLojaAction", await Est.saldoDaLojaAction(db, caixa, loja1)],
    ["saldoDoProdutoAction", await Est.saldoDoProdutoAction(db, caixa, prod.data.id)],
    ["estoqueConsolidadoAction", await Est.estoqueConsolidadoAction(db, caixa)],
    ["precisaReporAction", await Est.precisaReporAction(db, caixa)],
    ["listarProdutosEmporioAction", await Cat.listarProdutosEmporioAction(db, caixa)],
    ["lerProdutoEmporioAction", await Cat.lerProdutoEmporioAction(db, caixa, prod.data.id)],
    ["listarCandidatosAction", await Cat.listarCandidatosAction(db, caixa)],
    ["listarComprasAction", await Cmp.listarComprasAction(db, caixa)],
    ["listarTransferenciasAction", await Trf.listarTransferenciasAction(db, caixa)],
    ["transferenciasParadasAction", await Trf.transferenciasParadasAction(db, caixa)],
  ];
  for (const [nome, r] of leituras) {
    check(`${nome} recusa o Caixa com 403`, !r.ok && r.status === 403, j(r));
  }
  const recCompra = await Cmp.receberCompraAction(db, caixa, "qualquer");
  check("receberCompraAction recusa o Caixa com 403", !recCompra.ok && recCompra.status === 403, j(recCompra));
  const recTransf = await Trf.receberTransferenciaAction(db, caixa, "qualquer", { items: [] } as never);
  check("receberTransferenciaAction recusa o Caixa com 403", !recTransf.ok && recTransf.status === 403, j(recTransf));
  const cancTransf = await Trf.cancelarTransferenciaAction(db, caixa, "qualquer", {} as never);
  check("cancelarTransferenciaAction recusa o Caixa com 403", !cancTransf.ok && cancTransf.status === 403, j(cancTransf));
  const estoqueDono = await Est.saldoDaLojaAction(db, owner, loja1);
  check("a leitura do estoque segue aberta ao Dono", estoqueDono.ok);
  const lojasCaixa = await Cat.listarEstabelecimentosAction(db, caixa);
  check("listarEstabelecimentos segue aberta ao Caixa (o balcão precisa), só as lojas dele", lojasCaixa.ok && lojasCaixa.data.length === 1 && lojasCaixa.data[0].id === loja1, j(lojasCaixa));
}

async function secao3() {
  console.log("\nSeção 3: caixas, turno, sangria, encerramento e a gerência (com banco)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Caixa = await import("@/lib/actions/emporio-caixa");
  const Tu: Dado = await import("@/lib/actions/emporio-turno");
  const MD = await import("@/lib/actions/emporio-meu-dia");
  const { rotuloDaAcao } = await import("@/lib/emporio/historico");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const stamp = Date.now();
  let seq = 0;
  const k = (p: string) => `m92-s3-${stamp}-${p}-${(seq += 1)}`;
  const n = (x: unknown) => Number(x);
  const rec = (r: Dado, code: string, status: number, field?: string) =>
    !!r && !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);

  type Role = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";
  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: {
        name: `M92 s3 ${rotulo} ${stamp}`,
        document: `M92T${rotulo}${stamp}`.slice(0, 14),
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
        data: { tenant_id: t.id, name: `M92 ${suf}`, email: `m92-s3-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role, ...papelDeFixture(role), ...extra },
      });
      return { id: u.id, role };
    };
    return { t, db: prismaForTenant(t.id), mkUser };
  };

  const A = await mkTenant("A");
  const B = await mkTenant("B");
  const db = A.db;
  const owner = await A.mkUser("own", "OWNER");
  const gestor = await A.mkUser("gestor", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const v1 = await A.mkUser("v1", "OPERADOR");
  const v2 = await A.mkUser("v2", "OPERADOR");
  const cx = await A.mkUser("cx", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const va = await A.mkUser("va", "OPERADOR");
  const vb = await A.mkUser("vb", "OPERADOR");
  const ownerB = await B.mkUser("own", "OWNER");
  const gestor2 = await A.mkUser("gestor2", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const nomeL1 = "M92 T Loja 1";
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: nomeL1 });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M92 T Loja 2" });
  const l3 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M92 T Loja 3" });
  if (!l1.ok || !l2.ok || !l3.ok) throw new Error(`lojas: ${j([l1, l2, l3])}`);
  const L1 = l1.data.id;
  const L2 = l2.data.id;
  const L3 = l3.data.id;
  await vincularTodas(prisma, A.t.id, [gestor.id, v1.id, v2.id, cx.id], [L1]);
  await vincularTodas(prisma, A.t.id, [va.id, vb.id], [L3]);
  await vincularTodas(prisma, A.t.id, [gestor2.id], [L2]);
  const caixa1 = async (loja: string) => (await db.cashRegister.findFirst({ where: { establishment_id: loja, number: 1 } }))!.id;
  const r1 = await caixa1(L1);
  const saldo = (id: string) => Caixa.saldoDoCaixa(db, id);
  const gerencia = () => Caixa.saldoDaGerencia(db, L1);
  const difs = () => db.financialEntry.count({ where: { category: "Diferença de caixa" } });

  // --- caixas
  const cVend = await Tu.criarCaixaAction(db, v1, { establishment_id: L1 });
  check("criar caixa: o Vendedor recebe 403", rec(cVend, "FORBIDDEN", 403), j(cVend));
  const c2 = await Tu.criarCaixaAction(db, gestor, { establishment_id: L1 });
  check("o Gestor cria o Caixa 2 (number = max + 1)", c2.ok && c2.data.number === 2 && c2.data.nome === "Caixa 2", j(c2));
  const r2: string = c2.data?.id;

  // --- abrir com contado igual ao esperado
  check("saldo inicial de um caixa pelo Caixa: 403", rec(await Caixa.saldoInicialCaixaAction(db, cx, { cash_register_id: r2, amount: 5 } as never), "FORBIDDEN", 403));
  check("saldo inicial de um caixa pelo Vendedor: 403", rec(await Caixa.saldoInicialCaixaAction(db, v1, { cash_register_id: r2, amount: 5 } as never), "FORBIDDEN", 403));
  check("saldo inicial do caixa pela loja (legado) pelo Vendedor: 403", rec(await Caixa.saldoInicialCaixaAction(db, v1, { establishment_id: L1, amount: 5 } as never), "FORBIDDEN", 403));
  check("as recusas não gravaram implantação no caixa", (await db.cashMovement.count({ where: { cash_register_id: r2 ?? "x", origin: "implantacao" } })) === 0);
  check("saldo inicial de 50 no Caixa 1 (por cash_register_id)", (await Caixa.saldoInicialCaixaAction(db, owner, { cash_register_id: r1, amount: 50 } as never)).ok);
  check(
    "saldo inicial de novo no mesmo caixa: 409 OPENING_ALREADY_DONE",
    rec(await Caixa.saldoInicialCaixaAction(db, owner, { cash_register_id: r1, amount: 5 } as never), "OPENING_ALREADY_DONE", 409),
  );
  const dif0 = await difs();
  const kA1 = k("abrir");
  const a1 = await Tu.abrirTurnoAction(db, v1, { operation_key: kA1, cash_register_id: r1, counted: 50 });
  check("abrir o Caixa 1 com contado = esperado (50): aberto", a1.ok, j(a1));
  const T1: string = a1.data?.id;
  const cnt1 = await db.cashCount.findFirst({ where: { cash_session_id: T1 ?? "x", kind: "abertura" } });
  check("a abertura grava CashCount kind abertura, esperado 50 e diferença zero", !!cnt1 && n(cnt1.expected) === 50 && n(cnt1.difference) === 0 && cnt1.cash_register_id === r1, j(cnt1));
  check("sem diferença, nenhum lançamento 'Diferença de caixa'", (await difs()) === dif0);
  const s1 = await db.cashSession.findFirst({ where: { id: T1 ?? "x" } });
  check("o turno fica aberto: open_register_id = o caixa", s1?.open_register_id === r1 && s1?.closed_at === null, j(s1));
  const a1b = await Tu.abrirTurnoAction(db, v1, { operation_key: kA1, cash_register_id: r1, counted: 50 });
  check("repetir a chave da abertura devolve o turno gravado, sem duplicar", a1b.ok && a1b.data.id === T1 && a1b.data.replayed === true && (await db.cashSession.count({ where: { operation_key: kA1 } })) === 1, j(a1b));
  check("abrir de novo um caixa aberto: 409 SESSION_ALREADY_OPEN em cash_register_id", rec(await Tu.abrirTurnoAction(db, v2, { operation_key: k("abrir"), cash_register_id: r1, counted: 50 }), "SESSION_ALREADY_OPEN", 409, "cash_register_id"));

  // --- abrir com diferença
  const semJust = await Tu.abrirTurnoAction(db, v1, { operation_key: k("abrir"), cash_register_id: r2, counted: 10 });
  check("abrir com contado diferente e sem justificativa: 422 justification", rec(semJust, "VALIDATION_ERROR", 422, "justification"), j(semJust));
  check("a recusa não abriu o turno", (await db.cashSession.count({ where: { cash_register_id: r2 } })) === 0);
  const a2 = await Tu.abrirTurnoAction(db, v1, { operation_key: k("abrir"), cash_register_id: r2, counted: 10, justification: "achou troco" });
  check("com justificativa: aberto", a2.ok, j(a2));
  const T2: string = a2.data?.id;
  const aj2 = await db.cashMovement.findMany({ where: { cash_session_id: T2 ?? "x", origin: "conferencia" } });
  check("o ajuste entra no caixa, no turno: entrada de 10, origem conferencia", aj2.length === 1 && aj2[0].direction === "entrada" && n(aj2[0].amount) === 10 && aj2[0].cash_register_id === r2, j(aj2));
  check("e vira receita 'Diferença de caixa' de 10", (await difs()) === dif0 + 1 && (await saldo(r2)) === 1000);
  const depoisDoTurno = await Caixa.saldoInicialCaixaAction(db, gestor, { cash_register_id: r2, amount: 5 } as never);
  check("saldo inicial num caixa que já teve turno (sem implantação): 409 OPENING_ALREADY_DONE", rec(depoisDoTurno, "OPENING_ALREADY_DONE", 409, "cash_register_id"), j(depoisDoTurno));
  check("e não gravou implantação", (await db.cashMovement.count({ where: { cash_register_id: r2 ?? "x", origin: "implantacao" } })) === 0);

  // --- reforço da gerência
  check("Vendedor informando o saldo inicial da gerência: 403", rec(await Caixa.saldoInicialCaixaAction(db, v1, { manager_establishment_id: L1, amount: 60 } as never), "FORBIDDEN", 403));
  check("saldo inicial da gerência da Loja 1: 60 (Gestor)", (await Caixa.saldoInicialCaixaAction(db, gestor, { manager_establishment_id: L1, amount: 60 } as never)).ok && (await gerencia()) === 6000);
  const r3: string = (await Tu.criarCaixaAction(db, gestor, { establishment_id: L1 })).data?.id;
  const semReforco = await Tu.abrirTurnoAction(db, v1, { operation_key: k("abrir"), cash_register_id: r3, counted: 100, reinforcement: 100 });
  check("reforço de 100 com 60 na gerência: 409 INSUFFICIENT_CASH em reinforcement", rec(semReforco, "INSUFFICIENT_CASH", 409, "reinforcement") && semReforco.message === "Não há dinheiro suficiente para isso.", j(semReforco));
  check("a recusa não mexeu na gerência nem abriu turno", (await gerencia()) === 6000 && (await db.cashSession.count({ where: { cash_register_id: r3 ?? "x" } })) === 0);
  const conta = await Caixa.criarContaAction(db, owner, { name: `M92 Conta ${stamp}`, bank: "Banco" });
  if (!conta.ok) throw new Error(j(conta));
  const CT = conta.data.id;
  check("saldo inicial da conta (1000)", (await Caixa.saldoInicialCaixaAction(db, owner, { bank_account_id: CT, amount: 1000 })).ok);
  const tParaGer = await Caixa.transferirCaixaAction(db, owner, { operation_key: k("tr"), from: { bank_account_id: CT }, to: { manager_establishment_id: L1 } as never, amount: 140 });
  check("da conta para a gerência (140): a gerência fica com 200", tParaGer.ok && (await gerencia()) === 20000, j(tParaGer));
  const a3 = await Tu.abrirTurnoAction(db, v1, { operation_key: k("abrir"), cash_register_id: r3, counted: 100, reinforcement: 100 });
  check("reforço de 100 com 200 na gerência: aberto", a3.ok, j(a3));
  const T3: string = a3.data?.id;
  check("a gerência cai 100 e o caixa sobe 100", (await gerencia()) === 10000 && (await saldo(r3)) === 10000);
  const s3 = await db.cashSession.findFirst({ where: { id: T3 ?? "x" } });
  check("o turno guarda o reforço (100) e o esperado da abertura depois dele (100)", n(s3?.reinforcement) === 100 && n(s3?.opening_expected) === 100, j(s3));
  const ref = await db.cashMovement.findMany({ where: { origin: "reforco", cash_session_id: T3 ?? "x" } });
  check("o reforço entra no caixa com origem reforco, no turno", ref.length === 1 && ref[0].direction === "entrada" && ref[0].cash_register_id === r3, j(ref));
  check("e sai da gerência com origem reforco", (await db.cashMovement.count({ where: { origin: "reforco", manager_establishment_id: L1, direction: "saida" } })) === 1);

  // --- duas aberturas ao mesmo tempo (o Caixa abre)
  const r4: string = (await Tu.criarCaixaAction(db, gestor, { establishment_id: L1 })).data?.id;
  const [p1, p2] = await Promise.all([
    Tu.abrirTurnoAction(db, cx, { operation_key: k("par"), cash_register_id: r4, counted: 0 }),
    Tu.abrirTurnoAction(db, cx, { operation_key: k("par"), cash_register_id: r4, counted: 0 }),
  ]);
  const oks = [p1, p2].filter((r: Dado) => r.ok);
  const recusas = [p1, p2].filter((r: Dado) => rec(r, "SESSION_ALREADY_OPEN", 409, "cash_register_id"));
  check("duas aberturas em paralelo: exatamente uma ok, a outra SESSION_ALREADY_OPEN", oks.length === 1 && recusas.length === 1, j([p1, p2]));
  check("e um turno só no caixa", (await db.cashSession.count({ where: { cash_register_id: r4 ?? "x" } })) === 1);
  const T4: string = (oks[0] as Dado)?.data?.id;

  // --- sangria
  const ger0 = await gerencia();
  const kS = k("sangria");
  const sg = await Tu.sangriaAction(db, v1, T1, { operation_key: kS, amount: 30 });
  check("sangria de 30 com 50 no caixa (quem abriu o turno faz)", sg.ok, j(sg));
  check("o caixa fica com 20 e a gerência não muda (aguarda o gerente)", (await saldo(r1)) === 2000 && (await gerencia()) === ger0);
  const hS = await db.cashHandover.findMany({ where: { cash_session_id: T1 ?? "x" } });
  check("uma entrega pendente de 30, kind sangria", hS.length === 1 && hS[0].kind === "sangria" && n(hS[0].amount) === 30 && hS[0].confirmed_at === null, j(hS));
  const mS = await db.cashMovement.findMany({ where: { origin: "sangria", cash_handover_id: hS[0]?.id ?? "x" } });
  check("a saída da sangria leva o turno e a entrega", mS.length === 1 && mS[0].direction === "saida" && mS[0].cash_session_id === T1 && mS[0].cash_register_id === r1, j(mS));
  const sgB = await Tu.sangriaAction(db, v1, T1, { operation_key: kS, amount: 30 });
  check("repetir a chave da sangria não duplica", sgB.ok && (await db.cashHandover.count({ where: { operation_key: kS } })) === 1 && (await saldo(r1)) === 2000, j(sgB));
  const sgOutro = await Tu.sangriaAction(db, v1, T2, { operation_key: kS, amount: 30 });
  check("a chave da sangria do Caixa 1 usada noutro turno: recusada, sem devolver a do outro", !sgOutro.ok && sgOutro.status === 409 && sgOutro.field === "operation_key", j(sgOutro));
  const sg80 = await Tu.sangriaAction(db, v1, T1, { operation_key: k("sangria"), amount: 80 });
  check("sangria de 80 com 20: 409 INSUFFICIENT_CASH em amount", rec(sg80, "INSUFFICIENT_CASH", 409, "amount") && sg80.message === "Não há dinheiro suficiente para isso.", j(sg80));

  // --- conferência livre dentro do turno
  const cf = await Caixa.conferirGavetaAction(db, v1, { cash_register_id: r1, counted: 20 } as never);
  check("conferência livre no Caixa 1 aberto: ok", cf.ok, j(cf));
  const cfRow = await db.cashCount.findFirst({ where: { cash_session_id: T1 ?? "x", kind: "livre" } });
  check("grava CashCount kind livre no turno, diferença zero", !!cfRow && n(cfRow.difference) === 0 && n(cfRow.expected) === 20, j(cfRow));

  // --- encerrar
  const cr5 = await Tu.criarCaixaAction(db, gestor, { establishment_id: L1 });
  const r5: string = cr5.data?.id;
  check("o Caixa 5 nasce com number 5", cr5.ok && cr5.data.number === 5, j(cr5));
  await Caixa.saldoInicialCaixaAction(db, owner, { cash_register_id: r5, amount: 120 } as never);
  const T5: string = (await Tu.abrirTurnoAction(db, v1, { operation_key: k("abrir"), cash_register_id: r5, counted: 120 })).data?.id;
  const grande = await Tu.encerrarTurnoAction(db, v1, T5, { operation_key: k("enc"), counted: 120, malote_amount: 130 });
  check("malote de 130 com 120 contados: 422 MALOTE_TOO_BIG em malote_amount", rec(grande, "MALOTE_TOO_BIG", 422, "malote_amount") && grande.message === "O malote não pode passar do que foi contado.", j(grande));
  const kE = k("enc");
  const [enc, encPar] = await Promise.all([
    Tu.encerrarTurnoAction(db, v1, T5, { operation_key: kE, counted: 120, malote_amount: 100 }),
    Tu.encerrarTurnoAction(db, v1, T5, { operation_key: kE, counted: 120, malote_amount: 100 }),
  ]);
  check("encerrar com contado 120, esperado 120, malote 100: ok", enc.ok, j(enc));
  check("o mesmo encerramento em paralelo (mesma chave): os dois ok", enc.ok && encPar.ok && encPar.data.id === T5, j(encPar));
  const s5 = await db.cashSession.findFirst({ where: { id: T5 ?? "x" } });
  check("o turno fecha: open_register_id nulo, closed_at e os números do encerramento", !!s5 && s5.open_register_id === null && s5.closed_at !== null && s5.closed_by_user_id === v1.id && n(s5.closing_expected) === 120 && n(s5.closing_counted) === 120 && n(s5.malote_amount) === 100, j(s5));
  const hM = await db.cashHandover.findMany({ where: { cash_session_id: T5 ?? "x" } });
  check("uma entrega pendente de 100, kind malote", hM.length === 1 && hM[0].kind === "malote" && n(hM[0].amount) === 100 && hM[0].confirmed_at === null, j(hM));
  check("o troco (20) fica no caixa", (await saldo(r5)) === 2000);
  const cnt5 = await db.cashCount.findFirst({ where: { cash_session_id: T5 ?? "x", kind: "encerramento" } });
  check("CashCount kind encerramento com diferença zero", !!cnt5 && n(cnt5.difference) === 0, j(cnt5));
  const encB = await Tu.encerrarTurnoAction(db, v1, T5, { operation_key: kE, counted: 120, malote_amount: 100 });
  check("repetir a chave do encerramento devolve o gravado, sem segundo malote", encB.ok && (await db.cashHandover.count({ where: { cash_session_id: T5 ?? "x" } })) === 1, j(encB));
  check("e um movimento de malote só", (await db.cashMovement.count({ where: { cash_session_id: T5 ?? "x", origin: "malote" } })) === 1);
  const encOutro = await Tu.encerrarTurnoAction(db, v1, T2, { operation_key: kE, counted: 10, malote_amount: 0 });
  check("a chave do encerramento do Caixa 5 usada noutro turno: recusada, e o outro segue aberto", !encOutro.ok && encOutro.status === 409 && encOutro.field === "operation_key" && (await db.cashSession.findFirst({ where: { id: T2 ?? "x" } }))?.closed_at === null, j(encOutro));
  const sgMalote = await Tu.sangriaAction(db, v1, T2, { operation_key: hM[0]?.operation_key ?? "x", amount: 1 });
  check("uma sangria com a chave guardada no malote não pega o malote como repetição", !sgMalote.ok || sgMalote.data.id !== hM[0]?.id, j(sgMalote));
  check("e não grava sangria nova com aquela chave", (await db.cashHandover.count({ where: { operation_key: hM[0]?.operation_key ?? "x" } })) === 1);
  check("encerrar de novo: 409 SESSION_CLOSED", rec(await Tu.encerrarTurnoAction(db, v1, T5, { operation_key: k("enc"), counted: 20, malote_amount: 0 }), "SESSION_CLOSED", 409));
  check("sangria em turno encerrado: 409 SESSION_CLOSED", rec(await Tu.sangriaAction(db, v1, T5, { operation_key: k("sangria"), amount: 1 }), "SESSION_CLOSED", 409));
  const cfFechado: Dado = await Caixa.conferirGavetaAction(db, v1, { cash_register_id: r5, counted: 20 } as never);
  check("conferir caixa fechado: 409 CASH_CLOSED em cash_register_id", rec(cfFechado, "CASH_CLOSED", 409, "cash_register_id") && cfFechado.message === "Nenhum caixa aberto nesta loja. Abra o caixa com o troco inicial.", j(cfFechado));

  // --- revisão final: M4, quem faz sangria
  const v2Sg: Dado = await Tu.sangriaAction(db, v2, T1, { operation_key: k("sangria"), amount: 1 });
  check(
    "loja com Caixa: o Vendedor que não abriu o turno recebe 403 NOT_SESSION_OWNER na sangria",
    rec(v2Sg, "NOT_SESSION_OWNER", 403) && v2Sg.message === "Só quem abriu o caixa ou o gestor da loja faz sangria neste turno.",
    j(v2Sg),
  );

  // --- quem encerra
  const v2Enc = await Tu.encerrarTurnoAction(db, v2, T1, { operation_key: k("enc"), counted: 20, malote_amount: 0 });
  check("loja com Caixa: o Vendedor que não abriu recebe 403 NOT_SESSION_OWNER", rec(v2Enc, "NOT_SESSION_OWNER", 403) && v2Enc.message === "Só quem abriu o caixa ou o gestor da loja encerra este turno.", j(v2Enc));
  check("o Gestor encerra o turno de outra pessoa", (await Tu.encerrarTurnoAction(db, gestor, T1, { operation_key: k("enc"), counted: 20, malote_amount: 0 })).ok);
  check("malote zero não cria entrega", (await db.cashHandover.count({ where: { cash_session_id: T1 ?? "x", kind: "malote" } })) === 0);
  const r1L3 = await caixa1(L3);
  const aL3 = await Tu.abrirTurnoAction(db, va, { operation_key: k("abrir"), cash_register_id: r1L3, counted: 0 });
  check("loja sem Caixa: um Vendedor abre", aL3.ok, j(aL3));
  const resolver = (ator: Dado, loja: string, pedido: string | undefined, modo: string) => Tu.resolverTurno(db, ator, loja, pedido, modo);
  const rv1 = await resolver(va, L3, undefined, "exige");
  check("resolverTurno: um aberto na loja é ele", rv1.ok && rv1.turno?.id === aL3.data?.id && rv1.turno?.cash_register_id === r1L3, j(rv1));
  check("loja sem Caixa: outro Vendedor encerra", (await Tu.encerrarTurnoAction(db, vb, aL3.data?.id, { operation_key: k("enc"), counted: 0, malote_amount: 0 })).ok);
  const rv2 = await resolver(va, L3, undefined, "exige");
  check("resolverTurno sem aberto: CASH_CLOSED", rec(rv2, "CASH_CLOSED", 409, "cash_register_id"), j(rv2));
  const rv3 = await resolver(va, L3, undefined, "se_houver");
  check("resolverTurno sem aberto, se_houver: nulo", rv3.ok && rv3.turno === null, j(rv3));
  const rv4 = await resolver(owner, L1, undefined, "exige");
  check("resolverTurno com vários abertos e nenhum do ator: CASH_REGISTER_REQUIRED", rec(rv4, "CASH_REGISTER_REQUIRED", 422, "cash_register_id") && rv4.message === "Há mais de um caixa aberto. Escolha o caixa.", j(rv4));
  check("o mesmo, se_houver: nulo", (await resolver(owner, L1, undefined, "se_houver")).turno === null);
  const rv5 = await resolver(cx, L1, undefined, "exige");
  check("vários abertos: o que o ator abriu", rv5.ok && rv5.turno?.id === T4, j(rv5));
  check("pedido de caixa fechado: CASH_CLOSED", rec(await resolver(owner, L1, r1, "se_houver"), "CASH_CLOSED", 409, "cash_register_id"));
  check("pedido de caixa aberto: ele", (await resolver(owner, L1, r2, "exige")).turno?.id === T2);
  check("pedido de caixa de outra loja: CASH_CLOSED", rec(await resolver(owner, L3, r2, "exige"), "CASH_CLOSED", 409, "cash_register_id"));

  // --- confirmar a entrega
  const H5 = hM[0]?.id ?? "x";
  check("o Vendedor confirma a entrega: 403", rec(await Tu.confirmarEntregaAction(db, v1, H5, { operation_key: k("conf"), received_amount: 100 }), "FORBIDDEN", 403));
  check("o Caixa confirma a entrega: 403", rec(await Tu.confirmarEntregaAction(db, cx, H5, { operation_key: k("conf"), received_amount: 100 }), "FORBIDDEN", 403));
  const outraLoja = await Tu.confirmarEntregaAction(db, gestor2, H5, { operation_key: k("conf"), received_amount: 100 });
  check("o Gestor de outra loja confirma a entrega: 403 ou 404", !outraLoja.ok && (outraLoja.status === 403 || outraLoja.status === 404), j(outraLoja));
  const g1 = await gerencia();
  const kC1 = k("conf");
  const [conf1, conf1b] = await Promise.all([
    Tu.confirmarEntregaAction(db, gestor, H5, { operation_key: kC1, received_amount: 100 }),
    Tu.confirmarEntregaAction(db, gestor, H5, { operation_key: kC1, received_amount: 100 }),
  ]);
  check("o Gestor confirma 100 recebendo 100: a gerência sobe 100", conf1.ok && (await gerencia()) === g1 + 10000, j(conf1));
  check("a mesma confirmação em paralelo (mesma chave): as duas ok, a gerência sobe uma vez", conf1.ok && conf1b.ok && (await gerencia()) === g1 + 10000, j(conf1b));
  const ent = await db.cashMovement.findMany({ where: { cash_handover_id: H5, origin: "entrega_gerencia" } });
  check("a entrada na gerência tem origem entrega_gerencia", ent.length === 1 && ent[0].manager_establishment_id === L1 && ent[0].direction === "entrada", j(ent));
  const sg100 = await Tu.sangriaAction(db, v1, T3, { operation_key: k("sangria"), amount: 100 });
  const HS = (await db.cashHandover.findFirst({ where: { cash_session_id: T3 ?? "x" } }))?.id ?? "x";
  check("outra entrega de 100 (sangria do Caixa 3)", sg100.ok, j(sg100));
  const g2 = await gerencia();
  const d0 = await difs();
  const sem = await Tu.confirmarEntregaAction(db, gestor, HS, { operation_key: k("conf"), received_amount: 95 });
  check("recebendo 95 sem notes: 422 em notes", rec(sem, "VALIDATION_ERROR", 422, "notes"), j(sem));
  const kC = k("conf");
  const com = await Tu.confirmarEntregaAction(db, gestor, HS, { operation_key: kC, received_amount: 95, notes: "faltou uma nota" });
  check("com notes: confirmado e a gerência sobe 95", com.ok && (await gerencia()) === g2 + 9500, j(com));
  const hRow = await db.cashHandover.findFirst({ where: { id: HS } });
  check("a entrega guarda recebido 95 e diferença -5", n(hRow?.received_amount) === 95 && n(hRow?.difference) === -5 && hRow?.confirmed_by_user_id === gestor.id, j(hRow));
  const lancDif = await db.financialEntry.findMany({ where: { related_id: HS, category: "Diferença de caixa" } });
  check("e um lançamento de despesa de 5, 'Diferença de caixa'", (await difs()) === d0 + 1 && lancDif.length === 1 && lancDif[0].entry_type === "expense" && n(lancDif[0].amount) === 5, j(lancDif));
  check("confirmar de novo: 409 HANDOVER_ALREADY_CONFIRMED", rec(await Tu.confirmarEntregaAction(db, gestor, HS, { operation_key: k("conf"), received_amount: 95, notes: "x" }), "HANDOVER_ALREADY_CONFIRMED", 409));
  const comB = await Tu.confirmarEntregaAction(db, gestor, HS, { operation_key: kC, received_amount: 95, notes: "faltou uma nota" });
  check("repetir a chave da confirmação devolve o gravado", comB.ok && (await gerencia()) === g2 + 9500, j(comB));
  const comOutra = await Tu.confirmarEntregaAction(db, gestor, H5, { operation_key: kC, received_amount: 95, notes: "x" });
  check("a chave de uma confirmação usada noutra entrega: recusada", !comOutra.ok && comOutra.status === 409, j(comOutra));
  // duas sangrias em paralelo que juntas passam do saldo do Caixa 2 (10): uma vale, a outra não
  const antesPar = await saldo(r2);
  const [sp1, sp2] = await Promise.all([
    Tu.sangriaAction(db, v1, T2, { operation_key: k("sangria"), amount: 6 }),
    Tu.sangriaAction(db, v1, T2, { operation_key: k("sangria"), amount: 6 }),
  ]);
  const spOk = [sp1, sp2].filter((r: Dado) => r.ok);
  check("duas sangrias de 6 em paralelo com 10 no caixa: uma ok, a outra INSUFFICIENT_CASH", antesPar === 1000 && spOk.length === 1 && [sp1, sp2].some((r: Dado) => rec(r, "INSUFFICIENT_CASH", 409, "amount")), j([sp1, sp2]));
  check("o caixa fica com 4", (await saldo(r2)) === 400);
  const spH = (spOk[0] as Dado)?.data?.id;
  check("o Gestor confirma essa sangria (6)", (await Tu.confirmarEntregaAction(db, gestor, spH, { operation_key: k("conf"), received_amount: 6 })).ok);
  const pend = await Tu.listarEntregasAction(db, gestor, { establishment_id: L1, status: "pending" });
  check("listarEntregas pendentes: só a sangria de 30", pend.ok && pend.data.length === 1 && pend.data[0].amount === 30, j(pend));

  // --- transferência
  const doCaixa: Dado = await Caixa.transferirCaixaAction(db, gestor, { operation_key: k("tr"), from: { establishment_id: L1 }, to: { bank_account_id: CT }, amount: 10 });
  check("transferência saindo da gaveta: 422 DRAWER_TRANSFER em from", rec(doCaixa, "DRAWER_TRANSFER", 422, "from") && doCaixa.message === "A gaveta vai ao gerente pela sangria ou pelo malote.", j(doCaixa));
  check("transferência entrando na gaveta: 422 DRAWER_TRANSFER em to", rec(await Caixa.transferirCaixaAction(db, owner, { operation_key: k("tr"), from: { bank_account_id: CT }, to: { establishment_id: L1 }, amount: 10 }), "DRAWER_TRANSFER", 422, "to"));
  check("o Vendedor tirando da gerência: 403", rec(await Caixa.transferirCaixaAction(db, v1, { operation_key: k("tr"), from: { manager_establishment_id: L1 } as never, to: { bank_account_id: CT }, amount: 10 }), "FORBIDDEN", 403));
  const g3 = await gerencia();
  const contaAntes = (await Caixa.saldosDasContas(db)).get(CT) ?? 0;
  const gParaC = await Caixa.transferirCaixaAction(db, gestor, { operation_key: k("tr"), from: { manager_establishment_id: L1 } as never, to: { bank_account_id: CT }, amount: 50 });
  check("da gerência para a conta (Gestor, 50): a gerência cai e a conta sobe", gParaC.ok && (await gerencia()) === g3 - 5000 && ((await Caixa.saldosDasContas(db)).get(CT) ?? 0) === contaAntes + 5000, j(gParaC));
  check("a transferência mostra a gerência na origem", gParaC.ok && (gParaC.data.from as Dado).manager_establishment_id === L1, j(gParaC));

  // --- Meu Dia
  const ontem = new Date(Date.now() - 26 * 3_600_000);
  await prisma.cashSession.update({ where: { id: T2 }, data: { opened_at: ontem } });
  const ddmm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(ontem);
  const itensV1 = await MD.itensDoEmporioNoDia(db, v1);
  const turnoItem = itensV1.find((i) => i.chave === `emporio_turno:${T2}`);
  check(`o Meu Dia do Vendedor avisa 'Caixa 2 da ${nomeL1} aberto desde ${ddmm}'`, turnoItem?.titulo === `Caixa 2 da ${nomeL1} aberto desde ${ddmm}` && turnoItem?.origem === "emporio_turno", j(itensV1.map((i) => i.titulo)));
  check("o turno aberto hoje não gera aviso", !itensV1.some((i) => i.chave === `emporio_turno:${T4}`));
  check("o Vendedor não recebe o aviso da entrega", !itensV1.some((i) => i.origem === "emporio_entrega"));
  const itensG = await MD.itensDoEmporioNoDia(db, gestor);
  const entregaItem = itensG.find((i) => i.chave === `emporio_entrega:${L1}`);
  check(`o Gestor recebe 'R$ 30,00 aguardando o gerente na ${nomeL1}'`, entregaItem?.titulo === `R$ 30,00 aguardando o gerente na ${nomeL1}` && entregaItem?.valor === 30, j(itensG.map((i) => i.titulo)));
  const itensO = await MD.itensDoEmporioNoDia(db, owner);
  check("o aviso Q110 ('caixa não conferido') não existe mais", ![...itensV1, ...itensG, ...itensO].some((i) => (i.origem as string) === "emporio_caixa"));
  const itensG2 = await MD.itensDoEmporioNoDia(db, gestor2);
  check("o Gestor de outra loja não recebe o aviso da entrega da Loja 1", !itensG2.some((i) => i.chave === `emporio_entrega:${L1}`), j(itensG2.map((i) => i.titulo)));
  // a virada do dia é a de São Paulo: 23:30 de ontem avisa, 00:30 de hoje não
  const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const hojeSP = diaSP(new Date());
  const ontemSP = diaSP(new Date(Date.parse(`${hojeSP}T12:00:00-03:00`) - 86_400_000));
  const abrirEm = async (quando: Date) => {
    const reg = await Tu.criarCaixaAction(db, owner, { establishment_id: L3 });
    const t = await Tu.abrirTurnoAction(db, va, { operation_key: k("abrir"), cash_register_id: reg.data?.id, counted: 0 });
    await prisma.cashSession.update({ where: { id: t.data?.id }, data: { opened_at: quando } });
    return t.data?.id as string;
  };
  const tarde = await abrirEm(new Date(`${ontemSP}T23:30:00-03:00`));
  const cedo = await abrirEm(new Date(`${hojeSP}T00:30:00-03:00`));
  const itensVa = await MD.itensDoEmporioNoDia(db, va);
  check("turno aberto às 23:30 de ontem em São Paulo: avisa", itensVa.some((i) => i.chave === `emporio_turno:${tarde}`), j(itensVa.map((i) => i.titulo)));
  check("turno aberto às 00:30 de hoje em São Paulo: não avisa", !itensVa.some((i) => i.chave === `emporio_turno:${cedo}`), j(itensVa.map((i) => i.titulo)));

  // --- outra loja
  const r1L2 = await caixa1(L2);
  check("o Caixa da Loja 1 abre o caixa da Loja 2: 403", rec(await Tu.abrirTurnoAction(db, cx, { operation_key: k("abrir"), cash_register_id: r1L2, counted: 0 }), "FORBIDDEN", 403));
  const kL2 = k("abrir");
  const [aL2a, aL2b] = await Promise.all([
    Tu.abrirTurnoAction(db, owner, { operation_key: kL2, cash_register_id: r1L2, counted: 0 }),
    Tu.abrirTurnoAction(db, owner, { operation_key: kL2, cash_register_id: r1L2, counted: 0 }),
  ]);
  check("a mesma abertura em paralelo (mesma chave): as duas ok, o mesmo turno", aL2a.ok && aL2b.ok && aL2a.data.id === aL2b.data.id, j([aL2a, aL2b]));
  check("e um turno só no caixa", (await db.cashSession.count({ where: { cash_register_id: r1L2 } })) === 1);
  const TL2: string = aL2a.data?.id;
  check("o Caixa da Loja 1 sangra o caixa da Loja 2: 403", rec(await Tu.sangriaAction(db, cx, TL2, { operation_key: k("sangria"), amount: 1 }), "FORBIDDEN", 403));
  check("o Caixa da Loja 1 encerra o caixa da Loja 2: 403", rec(await Tu.encerrarTurnoAction(db, cx, TL2, { operation_key: k("enc"), counted: 0, malote_amount: 0 }), "FORBIDDEN", 403));

  // --- revisão final: M6, a gerência de destino fora do alcance
  const trFora: Dado = await Caixa.transferirCaixaAction(db, gestor2, { operation_key: k("tr"), from: { manager_establishment_id: L2 } as never, to: { manager_establishment_id: L1 } as never, amount: 1 });
  check("o Gestor da Loja 2 manda para a gerência da Loja 1, que não enxerga: 403", rec(trFora, "FORBIDDEN", 403), j(trFora));

  // --- revisão final: M5, o Caixa só lê os turnos de hoje; as entregas são do gestor
  const Rel: Dado = await import("@/lib/actions/emporio-relatorio-turno");
  const ha2dias = new Date(Date.now() - 2 * 86_400_000);
  const velho = await db.cashSession.create({
    data: scoped({
      establishment_id: L1,
      cash_register_id: r1,
      operation_key: k("velho"),
      opened_by_user_id: v1.id,
      opened_at: ha2dias,
      opening_expected: 0,
      opening_counted: 0,
      closed_at: new Date(ha2dias.getTime() + 3_600_000),
      closed_by_user_id: v1.id,
      close_operation_key: k("velho-enc"),
      closing_expected: 0,
      closing_counted: 0,
      malote_amount: 0,
    }),
  });
  const cxVelho = await Tu.lerTurnoAction(db, cx, velho.id);
  check("o Caixa lê um turno de dois dias atrás: 404", rec(cxVelho, "NOT_FOUND", 404), j(cxVelho));
  check("o Caixa lê o relatório desse turno: 404", rec(await Rel.lerRelatorioDoTurnoAction(db, cx, velho.id), "NOT_FOUND", 404));
  const cxLista = await Tu.listarTurnosAction(db, cx, { establishment_id: L1 });
  check("a lista do Caixa não traz o turno antigo, mas traz o aberto", cxLista.ok && !cxLista.data.some((t: Dado) => t.id === velho.id) && cxLista.data.some((t: Dado) => t.id === T2), j(cxLista.ok ? cxLista.data.map((t: Dado) => t.id) : cxLista));
  check("o Vendedor lê o turno antigo", (await Tu.lerTurnoAction(db, v1, velho.id)).ok);
  check("o Gestor da loja lê o turno antigo", (await Tu.lerTurnoAction(db, gestor, velho.id)).ok);
  check("o Caixa lê o turno aberto de hoje", (await Tu.lerTurnoAction(db, cx, T2)).ok);
  check("listarEntregas: o Caixa recebe 403", rec(await Tu.listarEntregasAction(db, cx, { establishment_id: L1 }), "FORBIDDEN", 403));
  check("listarEntregas: o Vendedor recebe 403", rec(await Tu.listarEntregasAction(db, v1, {}), "FORBIDDEN", 403));
  check("listarEntregas: o Gestor da loja lê", (await Tu.listarEntregasAction(db, gestor, { establishment_id: L1 })).ok);

  // --- listar e ler
  const lc =await Tu.listarCaixasAction(db, v1, L1);
  check(
    "listarCaixas da Loja 1: os 5 caixas, com nome, saldo e o turno aberto",
    lc.ok && lc.data.length === 5 && lc.data[0].nome === "Caixa 1" && lc.data[0].turno_aberto === null && lc.data[1].turno_aberto?.id === T2 && lc.data[4].saldo === 20,
    j(lc),
  );
  const lt = await Tu.lerTurnoAction(db, v1, T5);
  check("lerTurno traz o turno encerrado", lt.ok && lt.data.id === T5 && lt.data.status === "closed", j(lt));

  // --- Histórico
  const acoes = new Set((await db.emporioAuditLog.findMany({ select: { action: true } })).map((x) => x.action));
  for (const a of ["caixa.criar", "caixa.abrir", "caixa.sangria", "caixa.encerrar", "caixa.confirmar_entrega", "caixa.transferir"]) {
    check(`o Histórico grava ${a}`, acoes.has(a));
  }
  check("rótulos novos do Histórico", rotuloDaAcao("caixa.criar") === "Criou um caixa" && rotuloDaAcao("caixa.abrir") === "Abriu o caixa" && rotuloDaAcao("caixa.sangria") === "Fez uma sangria" && rotuloDaAcao("caixa.encerrar") === "Encerrou o caixa" && rotuloDaAcao("caixa.confirmar_entrega") === "Confirmou o dinheiro recebido" && rotuloDaAcao("caixa.transferir") === "Transferiu dinheiro");

  // --- rotas (handler direto)
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const chamar = async (token: string | null, caminho: string, metodo: string, url: string, corpo?: Dado, id = "x") => {
    try {
      const mod = (await import(`@/app/api/v1/emporio/${caminho}/route`)) as Record<string, Handler>;
      const h = mod[metodo];
      if (typeof h !== "function") return { status: -1, json: { error: { message: `sem ${metodo}` } } as Dado };
      const init: RequestInit = { method: metodo };
      if (corpo !== undefined) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(corpo);
      }
      const res = await withBearer(token, () => h(new Request(`http://localhost/api/v1/emporio/${url}`, init), { params: Promise.resolve({ id }) }));
      let json: Dado = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    } catch (e) {
      return { status: 0, json: { error: { message: e instanceof Error ? e.message : String(e) } } as Dado };
    }
  };
  const ROTAS: [string, string, string, Dado][] = [
    ["cash/registers", "GET", `cash/registers?establishment_id=${L1}`, undefined],
    ["cash/registers", "POST", "cash/registers", {}],
    ["cash/sessions", "GET", `cash/sessions?establishment_id=${L1}`, undefined],
    ["cash/sessions", "POST", "cash/sessions", {}],
    ["cash/sessions/[id]", "GET", "cash/sessions/x", undefined],
    ["cash/sessions/[id]/withdrawals", "POST", "cash/sessions/x/withdrawals", {}],
    ["cash/sessions/[id]/close", "POST", "cash/sessions/x/close", {}],
    ["cash/handovers", "GET", "cash/handovers", undefined],
    ["cash/handovers/[id]/confirm", "POST", "cash/handovers/x/confirm", {}],
  ];
  for (const [cam, met, url, corpo] of ROTAS) {
    const r = await chamar(null, cam, met, url, corpo);
    check(`sem sessão: ${met} ${url.split("?")[0]} -> 401`, r.status === 401, `${r.status} ${j(r.json)}`);
  }
  const tOwner = signAccessToken(owner.id);
  const tB = signAccessToken(ownerB.id);
  const gReg = await chamar(tOwner, "cash/registers", "GET", `cash/registers?establishment_id=${L1}`);
  check("GET cash/registers: 200 com os 5 caixas", gReg.status === 200 && gReg.json?.data?.length === 5, `${gReg.status} ${j(gReg.json)}`);
  const gSess = await chamar(tOwner, "cash/sessions", "GET", `cash/sessions?establishment_id=${L1}&status=open`);
  check("GET cash/sessions abertos da Loja 1: 200 com os turnos abertos", gSess.status === 200 && Array.isArray(gSess.json?.data) && gSess.json.data.some((s: Dado) => s.id === T2) && !gSess.json.data.some((s: Dado) => s.id === T5), `${gSess.status} ${j(gSess.json)}`);
  const gT = await chamar(tOwner, "cash/sessions/[id]", "GET", `cash/sessions/${T2}`, undefined, T2);
  check("GET cash/sessions/:id: 200", gT.status === 200 && gT.json?.data?.id === T2, `${gT.status} ${j(gT.json)}`);
  const gTB = await chamar(tB, "cash/sessions/[id]", "GET", `cash/sessions/${T2}`, undefined, T2);
  check("tenant B lendo o turno de A pela rota: 404", gTB.status === 404, `${gTB.status} ${j(gTB.json)}`);
  const pSem = await chamar(tOwner, "cash/sessions", "POST", "cash/sessions", { operation_key: k("rota"), counted: 0 });
  check("POST cash/sessions sem caixa: 422 em cash_register_id", pSem.status === 422 && pSem.json?.error?.field === "cash_register_id", `${pSem.status} ${j(pSem.json)}`);
  const gH = await chamar(tOwner, "cash/handovers", "GET", `cash/handovers?establishment_id=${L1}&status=pending`);
  check("GET cash/handovers pendentes: 200 com a sangria de 30", gH.status === 200 && gH.json?.data?.length === 1, `${gH.status} ${j(gH.json)}`);
  const pCount = await chamar(tOwner, "cash/counts", "POST", "cash/counts", { establishment_id: L1, counted: 0 });
  check("POST cash/counts sem cash_register_id: 422 em cash_register_id", pCount.status === 422 && pCount.json?.error?.field === "cash_register_id", `${pCount.status} ${j(pCount.json)}`);
}

async function secao4(): Promise<Dado> {
  console.log("\nSeção 4: todo dinheiro da gaveta cai no turno (com banco)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const Caixa = await import("@/lib/actions/emporio-caixa");
  const Ven = await import("@/lib/actions/emporio-vendas");
  const Desp = await import("@/lib/actions/emporio-despesas");
  const Cli = await import("@/lib/actions/emporio-clientes");
  const Tu: Dado = await import("@/lib/actions/emporio-turno");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const stamp = Date.now();
  let seq = 0;
  const k = (p: string) => `m92-s4-${stamp}-${p}-${(seq += 1)}`;
  const n = (x: unknown) => Number(x);
  const rec = (r: Dado, code: string, status: number, field?: string) =>
    !!r && !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);

  const t = await prisma.tenant.create({
    data: {
      name: `M92 s4 ${stamp}`,
      document: `M92Q${stamp}`.slice(0, 14),
      plan: "grupo",
      status: "trial",
      trial_ends_at: new Date(Date.now() + 86_400_000),
    },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  const db = prismaForTenant(t.id);
  type Role = "OWNER" | "OPERADOR";
  const mkUser = async (suf: string, role: Role) => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M92 s4 ${suf}`, email: `m92-s4-${suf}-${stamp}@teste.local`, password_hash: "x", role, ...papelDeFixture(role) },
    });
    return { id: u.id, role };
  };
  const owner = await mkUser("own", "OWNER");
  const v1 = await mkUser("v1", "OPERADOR");
  const v2 = await mkUser("v2", "OPERADOR");
  const v3 = await mkUser("v3", "OPERADOR");
  const vA = await mkUser("vA", "OPERADOR");
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M92 Q Loja 1" });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M92 Q Loja 2" });
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j([l1, l2])}`);
  const L1 = l1.data.id;
  const L2 = l2.data.id;
  await vincularTodas(prisma, t.id, [v1.id, v2.id, v3.id], [L1]);
  await vincularTodas(prisma, t.id, [vA.id], [L2]);
  const r1 = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))!.id;
  const c2 = await Tu.criarCaixaAction(db, owner, { establishment_id: L1 });
  if (!c2.ok) throw new Error(j(c2));
  const r2: string = c2.data.id;

  const cat = await db.productCategory.create({ data: scoped({ name: "M92 s4 categoria" }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M92 s4 Sal ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(j(prod));
  const ap = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!ap.ok) throw new Error(j(ap));
  for (const est of [L1, L2]) {
    const p = await Cat.definirPrecoAction(db, owner, { establishment_id: est, presentation_id: ap.data.id, price: 10 });
    if (!p.ok) throw new Error(j(p));
    const e = await Est.implantarEstoqueAction(db, owner, { establishment_id: est, emporio_product_id: prod.data.id, sealed: [], loose_qty: 1000, unit_cost: 4 });
    if (!e.ok) throw new Error(j(e));
  }
  const conta = await Caixa.criarContaAction(db, owner, { name: `M92 s4 Conta ${stamp}`, bank: "Banco" });
  if (!conta.ok) throw new Error(j(conta));
  for (const est of [L1, L2]) {
    const px = await Caixa.definirContaPixAction(db, owner, est, { bank_account_id: conta.data.id });
    if (!px.ok) throw new Error(j(px));
  }
  const cf = (await Cli.garantirConsumidorFinal(db)).id;
  const cliente = (await db.emporioCustomer.create({ data: scoped({ name: `M92 s4 Cliente ${stamp}` }) })).id;
  const item = (quantity: number) => [{ emporio_product_id: prod.data.id, presentation_id: ap.data.id, quantity, unit_price: 10 }];
  const vender = (ator: Dado, loja: string, quantity: number, payments: Dado[], extra: Dado = {}) =>
    Ven.venderAction(db, ator, {
      operation_key: k("venda"),
      establishment_id: loja,
      customer_id: extra.customer_id ?? cf,
      items: item(quantity),
      payments,
      ...(extra.cash_register_id ? { cash_register_id: extra.cash_register_id } : {}),
    } as never);
  const movsDaVenda = (saleId: string) => db.cashMovement.findMany({ where: { sale_id: saleId } });

  // --- venda sem turno aberto
  const movs0 = await db.cashMovement.count();
  const kSem = k("venda");
  const semTurno = await Ven.venderAction(db, owner, {
    operation_key: kSem,
    establishment_id: L1,
    customer_id: cf,
    items: item(1),
    payments: [{ kind: "dinheiro", amount: 10 }],
  });
  check("venda sem turno aberto: 409 CASH_CLOSED em cash_register_id", rec(semTurno, "CASH_CLOSED", 409, "cash_register_id"), j(semTurno));
  check(
    "a recusa não gravou venda nem movimento",
    (await db.emporioSale.count({ where: { operation_key: kSem } })) === 0 && (await db.cashMovement.count()) === movs0,
  );

  // --- dois turnos abertos
  const T1 = await abrirTurnoDeTeste(db, v1, L1, undefined, { cash_register_id: r1 });
  const T2 = await abrirTurnoDeTeste(db, v2, L1, undefined, { cash_register_id: r2 });
  const escolha = await vender(v3, L1, 1, [{ kind: "dinheiro", amount: 10 }]);
  check("dois caixas abertos, vendedor que não abriu nenhum e sem cash_register_id: 422 CASH_REGISTER_REQUIRED", rec(escolha, "CASH_REGISTER_REQUIRED", 422, "cash_register_id"), j(escolha));
  const noCaixa2: Dado = await vender(v3, L1, 1, [{ kind: "dinheiro", amount: 10 }], { cash_register_id: r2 });
  const vNo2 = noCaixa2.ok ? await db.emporioSale.findFirst({ where: { id: noCaixa2.data.id } }) : null;
  const mNo2 = noCaixa2.ok ? await movsDaVenda(noCaixa2.data.id) : [];
  check("com cash_register_id do Caixa 2: a venda cai no turno dele", noCaixa2.ok && vNo2?.cash_session_id === T2.id, j(noCaixa2));
  check(
    "e o dinheiro entra no Caixa 2, no turno",
    mNo2.length === 1 && mNo2[0].establishment_id === L1 && mNo2[0].cash_register_id === r2 && mNo2[0].cash_session_id === T2.id,
    j(mNo2),
  );
  const doV1: Dado = await vender(v1, L1, 1, [{ kind: "dinheiro", amount: 10 }]);
  const mV1 = doV1.ok ? await movsDaVenda(doV1.data.id) : [];
  check("quem abriu o Caixa 1 vende sem escolher: cai no turno dele", doV1.ok && mV1.length === 1 && mV1[0].cash_session_id === T1.id && mV1[0].cash_register_id === r1, j([doV1, mV1]));

  // --- PIX com turno aberto
  const pix: Dado = await vender(v1, L1, 1, [{ kind: "pix", amount: 10 }]);
  const vPix = pix.ok ? await db.emporioSale.findFirst({ where: { id: pix.data.id } }) : null;
  const mPix = pix.ok ? await movsDaVenda(pix.data.id) : [];
  check("venda em PIX com turno aberto: cash_session_id preenchido na venda", pix.ok && vPix?.cash_session_id === T1.id, j(pix));
  check(
    "e nenhum movimento na gaveta: o PIX vai à conta, com o turno",
    mPix.length === 1 && mPix[0].establishment_id === null && mPix[0].cash_register_id === null && mPix[0].bank_account_id === conta.data.id && mPix[0].cash_session_id === T1.id,
    j(mPix),
  );

  // --- a rota leva o cash_register_id até a action
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const rota = (await import("@/app/api/v1/emporio/sales/route")) as unknown as { POST: (req: Request) => Promise<Response> };
  const pelaRota = await withBearer(signAccessToken(v3.id), () =>
    rota.POST(
      new Request("http://localhost/api/v1/emporio/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation_key: k("rota"), establishment_id: L1, customer_id: cf, items: item(1), payments: [{ kind: "dinheiro", amount: 10 }], cash_register_id: r2 }),
      }),
    ),
  );
  const jRota: Dado = await pelaRota.json().catch(() => null);
  const vRota = jRota?.data?.id ? await db.emporioSale.findFirst({ where: { id: jRota.data.id } }) : null;
  check("POST /sales com cash_register_id do Caixa 2: 201 e a venda no turno dele", pelaRota.status === 201 && vRota?.cash_session_id === T2.id, `${pelaRota.status} ${j(jRota)}`);

  // --- o anti-objetivo: o turno fecha sem diferença
  const difs0 = await db.financialEntry.count({ where: { category: "Diferença de caixa" } });
  const ger = await Caixa.saldoInicialCaixaAction(db, owner, { manager_establishment_id: L2, amount: 100 } as never);
  if (!ger.ok) throw new Error(j(ger));
  const T = await abrirTurnoDeTeste(db, vA, L2, 100, { reinforcement: 100 });
  const rL2 = T.cash_register_id;
  check("o turno da Loja 2 abre com 100 de troco vindo da gerência", (await Caixa.saldoDoCaixa(db, rL2)) === 10000);
  const fiadoVenda: Dado = await vender(vA, L2, 3, [{ kind: "fiado", amount: 30 }], { customer_id: cliente });
  check("venda de 30 no fiado", fiadoVenda.ok, j(fiadoVenda));
  const v50: Dado = await vender(vA, L2, 5, [{ kind: "dinheiro", amount: 50 }]);
  check("venda em dinheiro de 50", v50.ok, j(v50));
  const fiado = await Caixa.receberFiadoAction(db, vA, { operation_key: k("fiado"), customer_id: cliente, establishment_id: L2, amount: 30, kind: "dinheiro" });
  check("fiado recebido em dinheiro, 30", fiado.ok, j(fiado));
  const it50 = v50.ok ? (await db.emporioSaleItem.findFirst({ where: { sale_id: v50.data.id } }))!.id : "x";
  const dev = await Ven.devolverAction(db, vA, v50.data?.id, { operation_key: k("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: it50, quantity: 1 }] });
  check("devolução em dinheiro, 10", dev.ok, j(dev));
  const v20: Dado = await vender(vA, L2, 2, [{ kind: "dinheiro", amount: 20 }]);
  const canc = await Ven.cancelarVendaAction(db, owner, v20.data?.id, { reason: "lançada errada" });
  check("venda de 20 em dinheiro e o cancelamento dela, no mesmo turno", v20.ok && canc.ok, j([v20, canc]));
  const troca = await Ven.trocarAction(db, vA, v50.data?.id, {
    operation_key: k("troca"),
    items_devolvidos: [{ sale_item_id: it50, quantity: 1 }],
    venda: { customer_id: cf, items: item(0.5), payments: [] },
  });
  check("troca: devolve 10, leva 5, a diferença de 5 volta em dinheiro", troca.ok, j(troca));
  const fixa = await Desp.criarDespesaFixaAction(db, owner, {
    name: `M92 s4 Luz ${stamp}`, category: "Energia", amount: 15, due_day: 10, split_kind: "percentual", splits: [{ establishment_id: L2, value: 100 }],
  });
  if (!fixa.ok) throw new Error(j(fixa));
  const aPagar = await db.financialEntry.findFirst({
    where: { related_module: "emporio", entry_type: "expense", status: "pending", establishment_id: L2 },
    orderBy: { due_date: "asc" },
  });
  const pagou = await Desp.pagarDespesasAction(db, owner, { entry_ids: [aPagar?.id ?? "x"], from: { establishment_id: L2 } });
  check("despesa de 15 paga da gaveta", pagou.ok, j(pagou));
  const sg = await Tu.sangriaAction(db, vA, T.id, { operation_key: k("sangria"), amount: 40 });
  check("sangria de 40", sg.ok, j(sg));
  const enc = await Tu.encerrarTurnoAction(db, vA, T.id, { operation_key: k("enc"), counted: 110, malote_amount: 0 });
  const sT = await db.cashSession.findFirst({ where: { id: T.id } });
  check(
    "encerrar contando 100 + 50 + 30 + 20 - 10 - 20 - 5 - 15 - 40 = 110: esperado 110, diferença zero",
    enc.ok && n(sT?.closing_expected) === 110 && n(sT?.closing_counted) === 110,
    j([enc, sT]),
  );
  const cntEnc = await db.cashCount.findFirst({ where: { cash_session_id: T.id, kind: "encerramento" } });
  check("a contagem do encerramento tem diferença zero", !!cntEnc && n(cntEnc.difference) === 0, j(cntEnc));
  check("nenhum lançamento 'Diferença de caixa'", (await db.financialEntry.count({ where: { category: "Diferença de caixa" } })) === difs0);
  const daLoja = await db.cashMovement.findMany({ where: { establishment_id: L2 } });
  const foraDoTurno = daLoja.filter((m) => m.cash_session_id !== T.id || m.cash_register_id !== rL2);
  check(
    "todo movimento da gaveta da Loja 2 tem o caixa e o turno",
    daLoja.length >= 9 && foraDoTurno.length === 0,
    j(foraDoTurno.map((m) => ({ origin: m.origin, amount: n(m.amount), s: m.cash_session_id }))),
  );

  // --- cancelar em outro turno uma venda de um turno já encerrado
  const enc1 = await Tu.encerrarTurnoAction(db, v1, T1.id, { operation_key: k("enc"), counted: (await Caixa.saldoDoCaixa(db, r1)) / 100, malote_amount: 0 });
  check("o turno do Caixa 1 encerra", enc1.ok, j(enc1));
  const cancOutro = await Ven.cancelarVendaAction(db, owner, doV1.data?.id, { reason: "cliente desistiu" });
  const saida = await db.cashMovement.findMany({ where: { sale_id: doV1.data?.id ?? "x", origin: "cancelamento_venda" } });
  check(
    "cancelar a venda do turno encerrado: a saída cai no turno aberto agora (Caixa 2)",
    cancOutro.ok && saida.length === 1 && saida[0].cash_session_id === T2.id && saida[0].cash_register_id === r2,
    j([cancOutro, saida]),
  );

  // --- repetir a chave de uma venda depois que o turno dela encerrou
  const repl: Dado = await Ven.venderAction(db, vA, {
    operation_key: v50.data?.operation_key,
    establishment_id: L2,
    customer_id: cf,
    items: item(5),
    payments: [{ kind: "dinheiro", amount: 50 }],
  });
  check("repetir a chave de uma venda com o turno dela encerrado devolve a venda gravada", repl.ok && repl.data.id === v50.data?.id && repl.data.replayed === true, j(repl));

  // --- a Loja 2 sem turno aberto: toda saída ou entrada de dinheiro na gaveta é recusada, sem gravar nada
  const cliente2 = (await db.emporioCustomer.create({ data: scoped({ name: `M92 s4 Cliente 2 ${stamp}` }) })).id;
  const fiadoL1: Dado = await vender(owner, L1, 3, [{ kind: "fiado", amount: 30 }], { customer_id: cliente2 });
  check("uma venda de 30 no fiado na Loja 1 (o Caixa 2 está aberto)", fiadoL1.ok, j(fiadoL1));
  const movsAntes = await db.cashMovement.count();
  const pagosAntes = await db.financialPayment.count();
  const fFechado = await Caixa.receberFiadoAction(db, owner, { operation_key: k("fiado"), customer_id: cliente2, establishment_id: L2, amount: 10, kind: "dinheiro" });
  check("fiado em dinheiro na loja sem turno: 409 CASH_CLOSED em cash_register_id", rec(fFechado, "CASH_CLOSED", 409, "cash_register_id"), j(fFechado));
  const itFiado = fiadoVenda.ok ? (await db.emporioSaleItem.findFirst({ where: { sale_id: fiadoVenda.data.id } }))!.id : "x";
  const dFechado = await Ven.devolverAction(db, vA, fiadoVenda.data?.id, { operation_key: k("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: itFiado, quantity: 1 }] });
  check("devolução em dinheiro na loja sem turno: 409 CASH_CLOSED em cash_register_id", rec(dFechado, "CASH_CLOSED", 409, "cash_register_id"), j(dFechado));
  const cFechado = await Ven.cancelarVendaAction(db, owner, fiadoVenda.data?.id, { reason: "teste sem turno" });
  check("cancelar venda com dinheiro na gaveta da loja sem turno: 409 CASH_CLOSED em cash_register_id", rec(cFechado, "CASH_CLOSED", 409, "cash_register_id"), j(cFechado));
  const outraConta = await db.financialEntry.findFirst({
    where: { related_module: "emporio", entry_type: "expense", status: "pending", establishment_id: L2 },
    orderBy: { due_date: "asc" },
  });
  const pFechado = await Desp.pagarDespesasAction(db, owner, { entry_ids: [outraConta?.id ?? "x"], from: { establishment_id: L2 } });
  check("despesa paga da gaveta da loja sem turno: 409 CASH_CLOSED em cash_register_id", rec(pFechado, "CASH_CLOSED", 409, "cash_register_id"), j(pFechado));
  check(
    "as quatro recusas não gravaram nada: nem movimento, nem pagamento, nem devolução; a venda segue concluída e a conta pendente",
    (await db.cashMovement.count()) === movsAntes &&
      (await db.financialPayment.count()) === pagosAntes &&
      (await db.emporioSaleReturn.count({ where: { sale_id: fiadoVenda.data?.id ?? "x" } })) === 0 &&
      (await db.emporioSale.findFirst({ where: { id: fiadoVenda.data?.id ?? "x" } }))?.status === "concluida" &&
      (await db.financialEntry.findFirst({ where: { id: outraConta?.id ?? "x" } }))?.status === "pending",
  );

  // --- fiado só em PIX: o turno é levado quando houver, sem recusa
  const pixSem: Dado = await Caixa.receberFiadoAction(db, owner, { operation_key: k("fiado"), customer_id: cliente2, establishment_id: L2, amount: 5, kind: "pix" });
  const mPixSem = await db.cashMovement.findMany({ where: { operation_key: pixSem.data?.operation_key ?? "x" } });
  check(
    "fiado só em PIX na loja sem turno: aceito, na conta, sem turno",
    pixSem.ok && mPixSem.length === 1 && mPixSem[0].bank_account_id === conta.data.id && mPixSem[0].cash_session_id === null && mPixSem[0].establishment_id === null,
    j([pixSem, mPixSem]),
  );
  const T1b = await abrirTurnoDeTeste(db, v1, L1, undefined, { cash_register_id: r1 });
  const pixDois: Dado = await Caixa.receberFiadoAction(db, owner, { operation_key: k("fiado"), customer_id: cliente2, establishment_id: L1, amount: 5, kind: "pix" });
  const mPixDois = await db.cashMovement.findMany({ where: { operation_key: pixDois.data?.operation_key ?? "x" } });
  check(
    "fiado só em PIX com dois caixas abertos e nenhum de quem recebe: aceito, sem turno (se_houver não recusa)",
    pixDois.ok && mPixDois.length === 1 && mPixDois[0].cash_session_id === null,
    j([pixDois, mPixDois]),
  );

  // --- a despesa da gaveta compara com o saldo do CAIXA do turno, não com a gaveta inteira da loja
  const s1 = await Caixa.saldoDoCaixa(db, r1);
  const valorDesp = s1 / 100 + 1;
  const fixaL1 = await Desp.criarDespesaFixaAction(db, owner, {
    name: `M92 s4 Água ${stamp}`, category: "Água", amount: valorDesp, due_day: 10, split_kind: "percentual", splits: [{ establishment_id: L1, value: 100 }],
  });
  if (!fixaL1.ok) throw new Error(j(fixaL1));
  const contaL1 = await db.financialEntry.findFirst({
    where: { related_module: "emporio", entry_type: "expense", status: "pending", establishment_id: L1 },
    orderBy: { due_date: "asc" },
  });
  const gavetaL1 = await Caixa.saldoDaGaveta(db, L1);
  const semSaldo = await Desp.pagarDespesasAction(db, owner, { entry_ids: [contaL1?.id ?? "x"], from: { establishment_id: L1 }, cash_register_id: r1 });
  check(
    `despesa de ${valorDesp} no Caixa 1 (que tem ${s1 / 100}), com a gaveta da loja tendo ${gavetaL1 / 100}: 409 INSUFFICIENT_CASH em from`,
    gavetaL1 >= Math.round(valorDesp * 100) && rec(semSaldo, "INSUFFICIENT_CASH", 409, "from"),
    j(semSaldo),
  );

  // --- cancelar uma venda com dinheiro em duas lojas: cada saída no turno da própria loja
  const TL2b = await abrirTurnoDeTeste(db, vA, L2);
  const cliente3 = (await db.emporioCustomer.create({ data: scoped({ name: `M92 s4 Cliente 3 ${stamp}` }) })).id;
  const duasLojas: Dado = await vender(owner, L1, 2, [{ kind: "dinheiro", amount: 10 }, { kind: "fiado", amount: 10 }], { customer_id: cliente3, cash_register_id: r1 });
  check("venda na Loja 1, metade em dinheiro no Caixa 1 e metade no fiado", duasLojas.ok, j(duasLojas));
  const recebeL2 = await Caixa.receberFiadoAction(db, owner, { operation_key: k("fiado"), customer_id: cliente3, establishment_id: L2, amount: 10, kind: "dinheiro" });
  check("o fiado é recebido em dinheiro na Loja 2", recebeL2.ok, j(recebeL2));
  const cancDuas = await Ven.cancelarVendaAction(db, owner, duasLojas.data?.id, { reason: "cancelada nas duas lojas", cash_register_id: r1 });
  const espelhos = await db.cashMovement.findMany({ where: { sale_id: duasLojas.data?.id ?? "x", origin: "cancelamento_venda" } });
  const espelhoL1 = espelhos.find((m) => m.establishment_id === L1);
  const espelhoL2 = espelhos.find((m) => m.establishment_id === L2);
  check("cancelar com cash_register_id do Caixa 1: aceito, duas saídas", cancDuas.ok && espelhos.length === 2, j([cancDuas, espelhos]));
  check(
    "a saída da Loja 1 cai no Caixa 1 e no turno dele",
    espelhoL1?.cash_register_id === r1 && espelhoL1?.cash_session_id === T1b.id,
    j(espelhoL1),
  );
  check(
    "a saída da Loja 2 cai no caixa e no turno da Loja 2 (o caixa pedido é de outra loja)",
    espelhoL2?.cash_register_id === TL2b.cash_register_id && espelhoL2?.cash_session_id === TL2b.id,
    j(espelhoL2),
  );

  // --- a mesma venda em paralelo (mesma chave): as duas ok, uma venda só
  const kPar = k("par");
  const corpoPar = { operation_key: kPar, establishment_id: L1, customer_id: cf, items: item(1), payments: [{ kind: "dinheiro", amount: 10 }], cash_register_id: r1 };
  const [par1, par2]: Dado[] = await Promise.all([Ven.venderAction(db, v1, corpoPar), Ven.venderAction(db, v1, corpoPar)]);
  check(
    "a mesma venda em paralelo: as duas ok, a mesma venda, um movimento na gaveta",
    par1.ok && par2.ok && par1.data.id === par2.data.id && (await db.emporioSale.count({ where: { operation_key: kPar } })) === 1 &&
      (await db.cashMovement.count({ where: { sale_id: par1.data.id } })) === 1,
    j([par1, par2]),
  );
  return { db, owner, vA, v1, turnoFechado: T.id, turnoAberto: T2.id, L2, vender, k, cliente, cf: cf };
}

async function secao5(ctx: Dado) {
  console.log("\nSeção 5: o relatório do encerramento (com banco)");
  const { prisma, prismaForTenant } = await import("@/lib/prisma");
  const Rel: Dado = await import("@/lib/actions/emporio-relatorio-turno");
  const { db, owner, vA, v1, turnoFechado, turnoAberto } = ctx;
  const rec404 = (r: Dado) => !!r && !r.ok && r.status === 404;

  const r = await Rel.lerRelatorioDoTurnoAction(db, vA, turnoFechado);
  if (!r.ok) {
    check("o relatório do turno encerrado lê", false, j(r));
    return;
  }
  const d = r.data;
  const forma = (f: string) => d.vendas_por_forma.find((x: Dado) => x.forma === f)?.valor;
  check("troco inicial 100", d.troco_inicial === 100 && d.reforco === 100, j([d.troco_inicial, d.reforco]));
  check("vendas por forma: Dinheiro 70 (a de 50 e a de 20 cancelada)", forma("Dinheiro") === 70, j(d.vendas_por_forma));
  check("vendas por forma: Fiado 30, com o rótulo de venda-rotulos", forma("Fiado") === 30, j(d.vendas_por_forma));
  check("fiado recebido: Dinheiro 30", d.fiado_recebido.length === 1 && d.fiado_recebido[0].forma === "Dinheiro" && d.fiado_recebido[0].valor === 30, j(d.fiado_recebido));
  check("uma sangria de 40, ainda não confirmada", d.sangrias.length === 1 && d.sangrias[0].valor === 40 && d.sangrias[0].confirmada === false && !!d.sangrias[0].em, j(d.sangrias));
  check("devoluções em dinheiro 15 (10 da devolução e 5 da troca)", d.devolucoes_dinheiro === 15, String(d.devolucoes_dinheiro));
  check("cancelamentos em dinheiro 20", d.cancelamentos_dinheiro === 20, String(d.cancelamentos_dinheiro));
  check("despesas em dinheiro 15", d.despesas_dinheiro === 15, String(d.despesas_dinheiro));
  check("esperado 110, contado 110, diferença 0", d.esperado === 110 && d.contado === 110 && d.diferenca === 0 && d.justificativa === null, j(d));
  const sessao = await db.cashSession.findFirst({ where: { id: turnoFechado } });
  check("malote e troco que ficou iguais aos do encerramento", d.malote === Number(sessao?.malote_amount) && d.troco_que_ficou === 110 - d.malote, j([d.malote, d.troco_que_ficou]));
  check(
    "a conta fecha: troco + vendas em dinheiro + fiado - cancelamento - devoluções - despesas - sangria = esperado",
    d.troco_inicial + forma("Dinheiro") + d.fiado_recebido[0].valor - d.cancelamentos_dinheiro - d.devolucoes_dinheiro - d.despesas_dinheiro - d.sangrias[0].valor === d.esperado,
  );
  check("operador, caixa, datas e loja preenchidos", !!d.operador && /^Caixa \d+$/.test(d.caixa) && !!d.aberto_em && !!d.encerrado_em && !!d.loja.nome && (d.largura_bobina === 80 || d.largura_bobina === 58), j(d));

  const aberto = await Rel.lerRelatorioDoTurnoAction(db, owner, turnoAberto);
  const a = aberto.ok ? aberto.data : null;
  check(
    "turno aberto: campos do encerramento nulos",
    !!a && a.encerrado_em === null && a.esperado === null && a.contado === null && a.diferenca === null && a.malote === null && a.troco_que_ficou === null && a.encerrado_por === null,
    j(aberto),
  );

  check("vendedor de outra loja: 404", rec404(await Rel.lerRelatorioDoTurnoAction(db, v1, turnoFechado)));
  const outra = await prisma.tenant.create({
    data: { name: `M92 s5 ${Date.now()}`, document: `M92R${Date.now()}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
  });
  tenantIds.push(outra.id);
  const dono2 = await prisma.user.create({
    data: { tenant_id: outra.id, name: "M92 s5 dono", email: `m92-s5-${Date.now()}@teste.local`, password_hash: "x", role: "OWNER" },
  });
  check("outro tenant: 404", rec404(await Rel.lerRelatorioDoTurnoAction(prismaForTenant(outra.id), { id: dono2.id, role: "OWNER" }, turnoFechado)));
  check("id inexistente: 404", rec404(await Rel.lerRelatorioDoTurnoAction(db, owner, "nao-existe")));

  // --- segundo turno: PIX, conferência livre com diferença, sangria e malote confirmados
  const { vender, k, cliente, L2 } = ctx;
  const Tu: Dado = await import("@/lib/actions/emporio-turno");
  const Caixa: Dado = await import("@/lib/actions/emporio-caixa");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  // o turno que a seção 4 deixou aberto na Loja 2 sai de cena, para o novo ser o único
  const abertoL2 = await db.cashSession.findFirst({ where: { establishment_id: L2, open_register_id: { not: null } } });
  if (abertoL2) {
    const fecha = await Tu.encerrarTurnoAction(db, vA, abertoL2.id, {
      operation_key: k("enc-sobra"),
      counted: (await Caixa.saldoDoCaixa(db, abertoL2.cash_register_id)) / 100,
      malote_amount: 0,
    });
    if (!fecha.ok) throw new Error(j(fecha));
  }
  const novo = await Tu.criarCaixaAction(db, owner, { establishment_id: L2 });
  if (!novo.ok) throw new Error(j(novo));
  const S = await abrirTurnoDeTeste(db, vA, L2, undefined, { cash_register_id: novo.data.id });
  const rS = S.cash_register_id;
  const ok1 = async (nome: string, p: Promise<Dado>) => {
    const x = await p;
    check(nome, !!x.ok, j(x));
    return x;
  };
  await ok1("venda de 40 em dinheiro", vender(vA, L2, 4, [{ kind: "dinheiro", amount: 40 }], { cash_register_id: rS }));
  await ok1("venda de 10 em PIX", vender(vA, L2, 1, [{ kind: "pix", amount: 10 }], { cash_register_id: rS }));
  await ok1("venda de 20 no fiado", vender(vA, L2, 2, [{ kind: "fiado", amount: 20 }], { customer_id: ctx.cliente, cash_register_id: rS }));
  await ok1("fiado recebido em PIX, 10", Caixa.receberFiadoAction(db, vA, { operation_key: k("fpix"), customer_id: cliente, establishment_id: L2, amount: 10, kind: "pix" }));
  await ok1("fiado recebido em dinheiro, 10", Caixa.receberFiadoAction(db, vA, { operation_key: k("fdin"), customer_id: cliente, establishment_id: L2, amount: 10, kind: "dinheiro" }));
  await ok1("conferência livre contando 45 onde se esperava 50", Caixa.conferirGavetaAction(db, vA, { cash_register_id: rS, counted: 45, justification: "faltou uma nota" }));
  const sg2 = await ok1("sangria de 20", Tu.sangriaAction(db, vA, S.id, { operation_key: k("sg2"), amount: 20 }));
  await ok1("o gerente confirma a sangria", Tu.confirmarEntregaAction(db, owner, sg2.data?.id, { operation_key: k("cf-sg"), received_amount: 20 }));
  await ok1("encerra contando 25, malote de 15", Tu.encerrarTurnoAction(db, vA, S.id, { operation_key: k("enc2"), counted: 25, malote_amount: 15 }));

  const r2 = await Rel.lerRelatorioDoTurnoAction(db, vA, S.id);
  const e = r2.ok ? r2.data : null;
  const forma2 = (f: string) => e?.vendas_por_forma.find((x: Dado) => x.forma === f)?.valor;
  check("o PIX aparece por forma (10) e o fiado também (20)", forma2("PIX") === 10 && forma2("Fiado") === 20 && forma2("Dinheiro") === 40, j(e?.vendas_por_forma));
  const fDin = e?.fiado_recebido.find((x: Dado) => x.forma === "Dinheiro")?.valor;
  const fFora = e?.fiado_recebido.find((x: Dado) => x.forma !== "Dinheiro")?.valor;
  check("fiado em dinheiro 10 e o recebido fora da gaveta (10) com rótulo neutro", fDin === 10 && fFora === 10 && e?.fiado_recebido.length === 2, j(e?.fiado_recebido));
  check("ajustes de conferência: -5", e?.ajustes_conferencia === -5, String(e?.ajustes_conferencia));
  check("esperado 25, diferença 0, malote 15, troco que ficou 10", e?.esperado === 25 && e?.diferenca === 0 && e?.malote === 15 && e?.troco_que_ficou === 10, j(e));
  check(
    "as linhas impressas fecham: troco + dinheiro + fiado em dinheiro + ajustes - cancelamentos - devoluções - despesas - sangrias = esperado (o PIX fica fora)",
    !!e &&
      e.troco_inicial + forma2("Dinheiro") + (fDin ?? 0) + e.ajustes_conferencia - e.cancelamentos_dinheiro - e.devolucoes_dinheiro - e.despesas_dinheiro -
        e.sangrias.reduce((t: number, s: Dado) => t + s.valor, 0) ===
        e.esperado,
    j(e),
  );
  check("a sangria confirmada sai com confirmada: true", e?.sangrias.length === 1 && e.sangrias[0].confirmada === true, j(e?.sangrias));
  check("malote ainda a confirmar: malote_confirmado false", e?.malote_confirmado === false, String(e?.malote_confirmado));
  const maloteH = await db.cashHandover.findFirst({ where: { cash_session_id: S.id, kind: "malote" } });
  await ok1("o gerente confirma o malote", Tu.confirmarEntregaAction(db, owner, maloteH?.id ?? "x", { operation_key: k("cf-mal"), received_amount: 15 }));
  const r3 = await Rel.lerRelatorioDoTurnoAction(db, vA, S.id);
  check("malote_confirmado true depois da confirmação", r3.ok && r3.data.malote_confirmado === true, j(r3));
}

async function secao6() {
  console.log("\nSeção 6: a reaplicação do backfill não conta duas vezes (com banco)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const { readFileSync } = await import("node:fs");
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: {
      name: `M92 reaplicar ${stamp}`,
      document: `R${String(stamp).slice(-13)}`,
      plan: "grupo",
      status: "trial",
      trial_ends_at: new Date(Date.now() + 86_400_000),
    },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  const u = await prisma.user.create({
    data: { tenant_id: t.id, name: "M92 reaplicar", email: `m92-reap-${stamp}@teste.local`, password_hash: "x", role: "OWNER" },
  });
  const owner = { id: u.id, role: "OWNER" as const, email: u.email };
  const db = prismaForTenant(t.id);
  const semTurno = await Cat.criarEstabelecimentoAction(db, owner, { name: "M92 R Sem Turno" });
  const comTurno = await Cat.criarEstabelecimentoAction(db, owner, { name: "M92 R Com Turno" });
  if (!semTurno.ok || !comTurno.ok) throw new Error(`lojas: ${j([semTurno, comTurno])}`);
  const caixaDe = async (loja: string) => (await db.cashRegister.findFirst({ where: { establishment_id: loja, number: 1 } }))!;
  const cxSem = await caixaDe(semTurno.data.id);
  const cxCom = await caixaDe(comTurno.data.id);
  await db.cashSession.create({
    data: scoped({
      establishment_id: comTurno.data.id,
      cash_register_id: cxCom.id,
      open_register_id: cxCom.id,
      operation_key: `m92-reap-${stamp}`,
      opened_by_user_id: u.id,
      opened_at: new Date(),
      opening_expected: 0,
      opening_counted: 0,
    }),
  });
  const solto = (loja: string, amount: number) =>
    db.cashMovement.create({
      data: scoped({ establishment_id: loja, direction: "entrada" as const, origin: "implantacao" as const, occurred_at: new Date(), amount }),
    });
  const mSem = await solto(semTurno.data.id, 40);
  const mCom = await solto(comTurno.data.id, 25);

  // A consulta "rode primeiro" do arquivo: o bloco comentado, tirado do comentário.
  const sql = readFileSync("prisma/sql/emporio-caixa-turno-reaplicar.sql", "utf8");
  const consulta = sql
    .split("\n")
    .filter((l) => l.startsWith("-- SELECT") || l.startsWith("--        ") || l.startsWith("-- FROM") || l.startsWith("-- JOIN") || l.startsWith("-- WHERE") || l.startsWith("--   ") || l.startsWith("-- GROUP"))
    .map((l) => l.replace(/^-- ?/, ""))
    .join("\n")
    .replace(/;\s*$/, "");
  check("o arquivo traz a consulta de conferência comentada", consulta.includes("SELECT") && consulta.includes("CashSession"), consulta.slice(0, 80));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const antes: Dado[] = (await prisma.$queryRawUnsafe(consulta)) as any;
  const minha = antes.filter((r) => r.establishment_id === comTurno.data.id || r.establishment_id === semTurno.data.id);
  check(
    "a consulta lista só a loja com turno (1 movimento, soma 25)",
    minha.length === 1 && minha[0].establishment_id === comTurno.data.id && Number(minha[0].movimentos) === 1 && Number(minha[0].soma_dos_movimentos) === 25,
    JSON.stringify(minha, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );

  // O arquivo tem vários comandos; cada um roda separado.
  const comandos = sql
    .split("\n")
    .filter((l) => !l.startsWith("--"))
    .join("\n")
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  for (const c of comandos) await prisma.$executeRawUnsafe(c);

  const depoisSem = await prisma.cashMovement.findUnique({ where: { id: mSem.id } });
  const depoisCom = await prisma.cashMovement.findUnique({ where: { id: mCom.id } });
  check("loja sem turno: o movimento é preenchido com o Caixa 1", depoisSem?.cash_register_id === cxSem.id, j(depoisSem?.cash_register_id));
  check("loja com turno: o movimento não é tocado", depoisCom?.cash_register_id === null, j(depoisCom?.cash_register_id));
}

/**
 * O relógio interno do turno (`opts.agora`): o cenário de demonstração data o
 * turno de cada dia passado. Só código interno o passa; a rota ignora qualquer
 * data no corpo e grava a hora real.
 */
async function secao7() {
  console.log("\nSeção 7: o relógio interno do turno, e a rota que não aceita data (com banco)");
  const { prisma, prismaForTenant } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Caixa = await import("@/lib/actions/emporio-caixa");
  const Tu: Dado = await import("@/lib/actions/emporio-turno");
  const { papelDeFixture } = await import("./_emporio-papel");
  const stamp = Date.now();
  let seq = 0;
  const k = (p: string) => `m92-s7-${stamp}-${p}-${(seq += 1)}`;
  const t = await prisma.tenant.create({
    data: {
      name: `M92 s7 ${stamp}`,
      document: `M92H${stamp}`.slice(0, 14),
      plan: "grupo",
      status: "trial",
      trial_ends_at: new Date(Date.now() + 86_400_000),
    },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  const u = await prisma.user.create({
    data: { tenant_id: t.id, name: "M92 s7 own", email: `m92-s7-own-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
  });
  const owner = { id: u.id, role: "OWNER" as const };
  const db = prismaForTenant(t.id);
  const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M92 s7 Loja" });
  if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
  const L = loja.data.id;
  const reg = (await db.cashRegister.findFirst({ where: { establishment_id: L, number: 1 } }))!.id;
  await Caixa.saldoInicialCaixaAction(db, owner, { cash_register_id: reg, amount: 200 } as never);

  const D8 = new Date("2026-10-01T11:00:00.000Z"); // 8h em Brasília
  const D12 = new Date("2026-10-01T15:00:00.000Z");
  const D18 = new Date("2026-10-01T21:00:00.000Z");
  const D19 = new Date("2026-10-01T22:00:00.000Z");
  const mesmo = (a: Date | null | undefined, b: Date) => !!a && a.getTime() === b.getTime();

  const ab = await Tu.abrirTurnoAction(db, owner, { operation_key: k("abrir"), cash_register_id: reg, counted: 199, justification: "faltou 1" }, { agora: D8 });
  check("abrir com o relógio interno: ok", ab.ok, j(ab));
  const T: string = ab.data?.id ?? "x";
  const sT = await db.cashSession.findFirst({ where: { id: T } });
  check("o turno grava opened_at na hora dada", mesmo(sT?.opened_at, D8), j(sT?.opened_at));
  const cAb = await db.cashCount.findFirst({ where: { cash_session_id: T, kind: "abertura" } });
  check("a contagem da abertura grava counted_at na hora dada", mesmo(cAb?.counted_at, D8), j(cAb?.counted_at));
  const mAj = await db.cashMovement.findFirst({ where: { cash_session_id: T, cash_count_id: cAb?.id ?? "x" } });
  check("o ajuste da diferença na abertura leva a hora dada", mesmo(mAj?.occurred_at, D8), j(mAj?.occurred_at));

  const sg = await Tu.sangriaAction(db, owner, T, { operation_key: k("sangria"), amount: 50 }, { agora: D12 });
  check("sangria com o relógio interno: ok", sg.ok, j(sg));
  const hS = await db.cashHandover.findFirst({ where: { id: sg.data?.id ?? "x" } });
  const mS = await db.cashMovement.findFirst({ where: { cash_handover_id: hS?.id ?? "x", origin: "sangria" } });
  check("a entrega da sangria grava created_at na hora dada", mesmo(hS?.created_at, D12), j(hS?.created_at));
  check("a saída da sangria grava occurred_at na hora dada", mesmo(mS?.occurred_at, D12), j(mS?.occurred_at));

  const en = await Tu.encerrarTurnoAction(db, owner, T, { operation_key: k("enc"), counted: 149, malote_amount: 100 }, { agora: D18 });
  check("encerrar com o relógio interno: ok", en.ok, j(en));
  const sE = await db.cashSession.findFirst({ where: { id: T } });
  check("o turno grava closed_at na hora dada", mesmo(sE?.closed_at, D18), j(sE?.closed_at));
  const cEn = await db.cashCount.findFirst({ where: { cash_session_id: T, kind: "encerramento" } });
  check("a contagem do encerramento grava counted_at na hora dada", mesmo(cEn?.counted_at, D18), j(cEn?.counted_at));
  const hM = await db.cashHandover.findFirst({ where: { cash_session_id: T, kind: "malote" } });
  const mM = await db.cashMovement.findFirst({ where: { cash_handover_id: hM?.id ?? "x", origin: "malote" } });
  check("o malote grava created_at e a saída occurred_at na hora dada", mesmo(hM?.created_at, D18) && mesmo(mM?.occurred_at, D18), j([hM?.created_at, mM?.occurred_at]));

  const cf = await Tu.confirmarEntregaAction(db, owner, hM?.id ?? "x", { operation_key: k("conf"), received_amount: 98, notes: "faltaram 2" }, { agora: D19 });
  check("confirmar com o relógio interno: ok", cf.ok, j(cf));
  const hC = await db.cashHandover.findFirst({ where: { id: hM?.id ?? "x" } });
  const mG = await db.cashMovement.findFirst({ where: { cash_handover_id: hM?.id ?? "x", origin: "entrega_gerencia" } });
  const fD = await db.financialEntry.findFirst({ where: { related_id: hM?.id ?? "x", category: "Diferença de caixa" } });
  check("a confirmação grava confirmed_at na hora dada", mesmo(hC?.confirmed_at, D19), j(hC?.confirmed_at));
  check("a entrada na gerência grava occurred_at na hora dada", mesmo(mG?.occurred_at, D19), j(mG?.occurred_at));
  check("a Diferença de caixa da confirmação leva a hora dada (vencimento e pagamento)", mesmo(fD?.due_date, D19) && mesmo(fD?.paid_at, D19), j([fD?.due_date, fD?.paid_at]));

  // --- a rota: data no corpo não entra
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const tok = signAccessToken(owner.id);
  const chamar = async (caminho: string, url: string, corpo: Dado, id = "x") => {
    const mod = (await import(`@/app/api/v1/emporio/${caminho}/route`)) as Record<string, Handler>;
    const res = await withBearer(tok, () =>
      mod.POST(
        new Request(`http://localhost/api/v1/emporio/${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }),
        { params: Promise.resolve({ id }) },
      ),
    );
    return { status: res.status, json: (await res.json().catch(() => null)) as Dado };
  };
  const velha = "2020-01-01T12:00:00.000Z";
  const datas = { agora: velha, opened_at: velha, closed_at: velha, occurred_at: velha, created_at: velha, confirmed_at: velha };
  const recente = (d: Date | null | undefined, desde: number) => !!d && d.getTime() >= desde - 1000 && d.getTime() <= Date.now() + 1000;
  const antes = Date.now();
  const rAb = await chamar("cash/sessions", "cash/sessions", { operation_key: k("rota-abrir"), cash_register_id: reg, counted: 49, ...datas });
  const TR: string = rAb.json?.data?.id ?? "x";
  const sR = await db.cashSession.findFirst({ where: { id: TR } });
  check("POST cash/sessions com datas no corpo: 201 e opened_at é a hora real", rAb.status === 201 && recente(sR?.opened_at, antes), `${rAb.status} ${j(sR?.opened_at)}`);
  const rSg = await chamar("cash/sessions/[id]/withdrawals", `cash/sessions/${TR}/withdrawals`, { operation_key: k("rota-sg"), amount: 10, ...datas }, TR);
  const hR = await db.cashHandover.findFirst({ where: { id: rSg.json?.data?.id ?? "x" } });
  const mR = await db.cashMovement.findFirst({ where: { cash_handover_id: hR?.id ?? "x", origin: "sangria" } });
  check("POST withdrawals com datas no corpo: a sangria grava a hora real", rSg.status === 201 && recente(hR?.created_at, antes) && recente(mR?.occurred_at, antes), `${rSg.status} ${j([hR?.created_at, mR?.occurred_at])}`);
  const rEn = await chamar("cash/sessions/[id]/close", `cash/sessions/${TR}/close`, { operation_key: k("rota-enc"), counted: 39, malote_amount: 20, ...datas }, TR);
  const sRE = await db.cashSession.findFirst({ where: { id: TR } });
  check("POST close com datas no corpo: closed_at é a hora real", rEn.status === 200 && recente(sRE?.closed_at, antes), `${rEn.status} ${j(sRE?.closed_at)}`);
  const hRM = await db.cashHandover.findFirst({ where: { cash_session_id: TR, kind: "malote" } });
  const rCf = await chamar("cash/handovers/[id]/confirm", `cash/handovers/${hRM?.id}/confirm`, { operation_key: k("rota-conf"), received_amount: 20, ...datas }, hRM?.id ?? "x");
  const hRC = await db.cashHandover.findFirst({ where: { id: hRM?.id ?? "x" } });
  check("POST confirm com datas no corpo: confirmed_at é a hora real", rCf.status === 200 && recente(hRC?.confirmed_at, antes), `${rCf.status} ${j(hRC?.confirmed_at)}`);
}

async function limpar() {
  const { prisma } = await import("@/lib/prisma");
  const modelos = [
    // filhos antes de CashSession: movimento, conferência, venda; a entrega antes da sessão
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
    await secao2();
    await secao3();
    const ctx4 = await secao4();
    await secao5(ctx4);
    await secao6();
    await secao7();
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M92 verde" : `\n❌ M92: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
