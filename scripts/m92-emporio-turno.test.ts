import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M92: Módulo 39 (Meu Empório), entrega 2: caixa com turno.
 * Roda: `npm run test:m92`
 *
 * Seção 1: o modelo (caixas numerados, sessão única por caixa, "Com a gerência").
 * Seção 2: o papel Caixa (Equipe, permissões, páginas, leituras recusadas, vendas de hoje, desconto).
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
  let seq = 0;
  const vender = (ator: { id: string; role: "OWNER" | "OPERADOR" }, est: string, preco: number) =>
    Ven.venderAction(db, ator, {
      operation_key: `m92-s2-${stamp}-${(seq += 1)}`,
      establishment_id: est,
      contact_id: cf,
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

async function limpar() {
  const { prisma } = await import("@/lib/prisma");
  const modelos = [
    // filhos antes de CashSession: movimento, conferência, venda; a entrega antes da sessão
    "emporioAuditLog", "cashMovement", "cashCount", "emporioSale", "cashHandover", "cashSession", "cashRegister", "stockMovement",
    "emporioCounter", "emporioSettings", "userEstablishment", "establishment", "bankAccount", "contact",
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
