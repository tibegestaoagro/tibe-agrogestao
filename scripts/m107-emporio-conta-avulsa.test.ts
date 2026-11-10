import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";
import assert from "node:assert/strict";

exigirBancoLocal();
process.env.EMAIL_PROVIDER = "gmail_smtp";
delete process.env.GMAIL_SMTP_USER;
delete process.env.GMAIL_SMTP_APP_PASSWORD;
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

async function main() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const especificador = "@/lib/actions/emporio-despesas";
  const actions = await import(especificador) as typeof import("@/lib/actions/emporio-despesas");
  assert.equal(typeof actions.criarContaAvulsaAction, "function", "action de criação deve existir");
  const ids: string[] = [];
  const stamp = Date.now().toString(36);
  try {
    async function mundo(suf: string) {
      const t = await prisma.tenant.create({ data: { name: `M107 ${suf}`, document: `M107${suf}${stamp}`, plan: "grupo", status: "trial" } });
      ids.push(t.id);
      const db = prismaForTenant(t.id);
      const u = await db.user.create({ data: scoped({ name: "Dono", email: `m107-${suf}-${stamp}@teste.local`, password_hash: "teste", role: "OWNER" }) });
      const loja = await db.establishment.create({ data: scoped({ name: "Loja" }) });
      const conta = await db.bankAccount.create({ data: scoped({ name: "Banco" }) });
      const fornecedor = await db.emporioSupplier.create({ data: scoped({ name: "Fornecedor", kind: "externo" }) });
      return { db, ator: { id: u.id, role: u.role }, loja, conta, fornecedor };
    }
    const a = await mundo("A");
    const b = await mundo("B");
    const loja2 = await a.db.establishment.create({ data: scoped({ name: "Outra loja" }) });
    const gestor = await a.db.user.create({ data: scoped({ name: "Gestor", email: `m107-gestor-${stamp}@teste.local`, password_hash: "teste", role: "OPERADOR", emporio_role: "gestor" }) });
    const atorGestor = { id: gestor.id, role: gestor.role };
    await a.db.userEstablishment.create({ data: scoped({ user_id: gestor.id, establishment_id: a.loja.id }) });
    const criar = (patch: Partial<Parameters<typeof actions.criarContaAvulsaAction>[2]> = {}) => actions.criarContaAvulsaAction(a.db, a.ator, { establishment_id: a.loja.id, description: "Conserto", amount: 100, due_date: new Date("2026-11-20T12:00:00Z"), status: "pending", ...patch });
    for (const [field, patch] of [
      ["description", { description: " " }], ["amount", { amount: 0 }], ["amount", { amount: Number.NaN }],
      ["due_date", { due_date: new Date("inválida") }], ["establishment_id", { establishment_id: "" }],
      ["establishment_id", { establishment_id: b.loja.id }], ["emporio_supplier_id", { emporio_supplier_id: b.fornecedor.id }],
      ["emporio_other_name", { emporio_other_name: " " }], ["emporio_other_name", { emporio_supplier_id: a.fornecedor.id, emporio_other_name: "Prestador" }],
      ["from", { from: { bank_account_id: a.conta.id } }], ["paid_at", { status: "paid" as const }],
    ] as const) {
      const r = await criar(patch);
      assert.ok(!r.ok, `${field} deve ser recusado`);
      if (!r.ok) assert.equal(r.field, field);
    }
    assert.equal(await a.db.financialEntry.count(), 0, "recusas não criam obrigação");
    const foraDaLoja = await actions.criarContaAvulsaAction(a.db, atorGestor, { establishment_id: loja2.id, description: "Fora", amount: 10, due_date: new Date(), status: "pending" });
    assert.ok(!foraDaLoja.ok && foraDaLoja.field === "establishment_id");
    const outraGaveta = await criar({ status: "paid", paid_at: new Date(), from: { establishment_id: loja2.id } });
    assert.ok(!outraGaveta.ok && outraGaveta.field === "from");
    const { resultadoDaLojaAction } = await import("@/lib/actions/emporio-resultado");
    const { lerAPagarPorVencimentoCsvAction } = await import("@/lib/actions/emporio-relatorios-financeiro");
    const { lerFluxoProjetadoAction } = await import("@/lib/actions/emporio-projecao");
    const mes = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
    const resultadoAntes = await resultadoDaLojaAction(a.db, a.ator, { establishment_id: a.loja.id, month: mes });
    const pendente = await criar({ emporio_other_name: "Eletricista", due_date: new Date() });
    assert.ok(pendente.ok);
    if (!pendente.ok) return;
    assert.equal(pendente.data.entry.origin, "avulsa");
    assert.equal(pendente.data.entry.name, "Conserto");
    assert.equal(pendente.data.entry.supplier_name, "Eletricista");
    assert.equal(pendente.data.entry.purchase_id, null);
    const entryId = pendente.data.entry.entry_id;
    const gravada = await a.db.financialEntry.findFirstOrThrow({ where: { id: entryId } });
    assert.equal(gravada.emporio_manual, true);
    assert.equal(gravada.emporio_manual_description, "Conserto");
    assert.equal(gravada.emporio_other_name, "Eletricista");
    assert.equal(await a.db.financialPayment.count(), 0);
    assert.equal(await a.db.cashMovement.count(), 0);
    const lista = await actions.listarContasAPagarAction(a.db, a.ator);
    assert.ok(lista.ok && lista.data.some((e) => e.entry_id === entryId));
    const listaB = await actions.listarContasAPagarAction(b.db, b.ator);
    assert.ok(listaB.ok && !listaB.data.some((e) => e.entry_id === entryId));
    const relatorio = await lerAPagarPorVencimentoCsvAction(a.db, a.ator, { establishment_id: a.loja.id, de: new Date(`${mes}-01T00:00:00Z`), ate: new Date(Date.now() + 30 * 86400000) });
    assert.ok(relatorio.ok && relatorio.data.entries.some((e) => e.entry_id === entryId && e.total === 100));
    const projecao = await lerFluxoProjetadoAction(a.db, a.ator, { establishment_id: a.loja.id, days: 30 });
    assert.ok(projecao.ok && projecao.data.weeks.reduce((s, w) => s + w.payables.entries, 0) === 100);
    const resultadoDepois = await resultadoDaLojaAction(a.db, a.ator, { establishment_id: a.loja.id, month: mes });
    assert.ok(resultadoAntes.ok && resultadoDepois.ok && resultadoAntes.data.result === resultadoDepois.data.result);
    const corrigida = await actions.corrigirDespesaAction(a.db, a.ator, entryId, { amount: 120 });
    assert.ok(corrigida.ok && corrigida.data.amount === 120);
    assert.ok((await actions.adiarVencimentoContaAction(a.db, a.ator, { entry_id: entryId, due_date: new Date("2026-12-01T12:00:00Z") })).ok);
    assert.ok((await actions.cancelarContaAction(a.db, a.ator, { entry_id: entryId, reason: "Duplicada" })).ok);
    const antes = await a.db.financialEntry.count();
    const semSaldo = await criar({ status: "paid", paid_at: new Date(), from: { bank_account_id: a.conta.id } });
    assert.ok(!semSaldo.ok && semSaldo.code === "INSUFFICIENT_CASH");
    assert.equal(await a.db.financialEntry.count(), antes, "falha de pagamento reverte a conta nova");
    await a.db.cashMovement.create({ data: scoped({ bank_account_id: a.conta.id, direction: "entrada", origin: "implantacao", amount: 1000, occurred_at: new Date() }) });
    const paga = await criar({ status: "paid", paid_at: new Date(), from: { bank_account_id: a.conta.id }, emporio_supplier_id: a.fornecedor.id });
    assert.ok(paga.ok && paga.data.entry.status === "paid" && paga.data.payment?.waiting_approval === false);
    const pendentes = await actions.listarContasAPagarAction(a.db, a.ator);
    assert.ok(pendentes.ok && paga.ok && !pendentes.data.some((e) => e.entry_id === paga.data.entry.entry_id));
    const resultadoComPaga = await resultadoDaLojaAction(a.db, a.ator, { establishment_id: a.loja.id, month: mes });
    assert.ok(resultadoComPaga.ok && resultadoAntes.ok && resultadoAntes.data.result === resultadoComPaga.data.result, "a conta avulsa PAGA também não mexe no Resultado");
    if (paga.ok) {
      assert.equal(await a.db.financialPayment.count({ where: { entry_id: paga.data.entry.entry_id } }), 1);
      assert.ok(!(await actions.corrigirDespesaAction(a.db, a.ator, paga.data.entry.entry_id, { amount: 2 })).ok);
      assert.ok(!(await actions.cancelarContaAction(a.db, a.ator, { entry_id: paga.data.entry.entry_id, reason: "Não" })).ok);
    }
    const caixa = await a.db.cashRegister.create({ data: scoped({ establishment_id: a.loja.id, number: 1 }) });
    const semTurno = await criar({ status: "paid", paid_at: new Date(), from: { establishment_id: a.loja.id }, cash_register_id: caixa.id });
    assert.ok(!semTurno.ok);
    assert.equal(await a.db.financialEntry.count(), antes + 1, "falta de turno também reverte obrigação");
    await a.db.cashMovement.create({ data: scoped({ establishment_id: a.loja.id, cash_register_id: caixa.id, direction: "entrada", origin: "implantacao", amount: 500, occurred_at: new Date() }) });
    const { abrirTurnoDeTeste } = await import("./_emporio-turno");
    await abrirTurnoDeTeste(a.db, a.ator, a.loja.id);
    const gaveta = await criar({ status: "paid", paid_at: new Date(), from: { establishment_id: a.loja.id }, cash_register_id: caixa.id });
    assert.ok(gaveta.ok && gaveta.data.entry.status === "paid");
    await a.db.emporioSettings.create({ data: scoped({ payment_approval_limit: 50 }) });
    const aprovar = await actions.criarContaAvulsaAction(a.db, atorGestor, { establishment_id: a.loja.id, description: "Com alçada", amount: 60, due_date: new Date(), status: "paid", paid_at: new Date(), from: { bank_account_id: a.conta.id }, emporio_other_name: "Eletricista avulso" });
    assert.ok(aprovar.ok && aprovar.data.payment?.waiting_approval && aprovar.data.entry.status === "pending");
    if (aprovar.ok) {
      assert.ok(aprovar.data.payment?.waiting_approval);
      if (aprovar.data.payment?.waiting_approval) {
        assert.equal(aprovar.data.payment.request.entries[0].description, "Com alçada");
        assert.equal(aprovar.data.payment.request.entries[0].supplier_or_category, "Eletricista avulso");
      }
      assert.equal(await a.db.financialPayment.count({ where: { entry_id: aprovar.data.entry.entry_id } }), 0);
      assert.equal(await a.db.emporioPaymentRequest.count({ where: { entry_ids: { has: aprovar.data.entry.entry_id }, status: "pendente" } }), 1);
      const bloqueada = await actions.corrigirDespesaAction(a.db, a.ator, aprovar.data.entry.entry_id, { amount: 70 });
      assert.ok(!bloqueada.ok && bloqueada.code === "CONTA_EM_APROVACAO");
    }
    const comFornecedor = await actions.criarContaAvulsaAction(a.db, atorGestor, { establishment_id: a.loja.id, description: "Serviço do fornecedor", amount: 60, due_date: new Date(), status: "paid", paid_at: new Date(), from: { bank_account_id: a.conta.id }, emporio_supplier_id: a.fornecedor.id });
    assert.ok(comFornecedor.ok && comFornecedor.data.payment?.waiting_approval);
    if (comFornecedor.ok && comFornecedor.data.payment?.waiting_approval) {
      assert.equal(comFornecedor.data.payment.request.entries[0].description, "Serviço do fornecedor");
      assert.equal(comFornecedor.data.payment.request.entries[0].supplier_or_category, "Fornecedor");
    }
    // Abaixo do teto da alçada o Gestor paga direto; acima dele, o Dono também.
    const gestorAbaixo = await actions.criarContaAvulsaAction(a.db, atorGestor, { establishment_id: a.loja.id, description: "Abaixo do teto", amount: 30, due_date: new Date(), status: "paid", paid_at: new Date(), from: { bank_account_id: a.conta.id } });
    assert.ok(gestorAbaixo.ok && gestorAbaixo.data.payment?.waiting_approval === false && gestorAbaixo.data.entry.status === "paid", "Gestor abaixo do teto paga direto");
    const donoAcima = await actions.criarContaAvulsaAction(a.db, a.ator, { establishment_id: a.loja.id, description: "Dono acima do teto", amount: 60, due_date: new Date(), status: "paid", paid_at: new Date(), from: { bank_account_id: a.conta.id } });
    assert.ok(donoAcima.ok && donoAcima.data.payment?.waiting_approval === false && donoAcima.data.entry.status === "paid", "Dono acima do teto paga direto");
    // Papel sem permissão de mexer nas despesas leva 403 e nada é criado.
    for (const papel of ["vendedor", "caixa"] as const) {
      const u = await a.db.user.create({ data: scoped({ name: papel, email: `m107-${papel}-${stamp}@teste.local`, password_hash: "teste", role: "OPERADOR", emporio_role: papel }) });
      await a.db.userEstablishment.create({ data: scoped({ user_id: u.id, establishment_id: a.loja.id }) });
      const antesPapel = await a.db.financialEntry.count();
      const negado = await actions.criarContaAvulsaAction(a.db, { id: u.id, role: u.role }, { establishment_id: a.loja.id, description: "Sem permissão", amount: 10, due_date: new Date(), status: "pending" });
      assert.ok(!negado.ok && negado.status === 403, `${papel} deve levar 403`);
      assert.equal(await a.db.financialEntry.count(), antesPapel, `${papel} não cria obrigação`);
    }
    // Sem descrição, o pedido de pagamento dá nome próprio à avulsa (e não "Compra sem fornecedor").
    const semDescricao = await actions.criarContaAvulsaAction(a.db, a.ator, { establishment_id: a.loja.id, description: "Será apagada", amount: 70, due_date: new Date(), status: "pending", emporio_supplier_id: a.fornecedor.id });
    assert.ok(semDescricao.ok);
    if (semDescricao.ok) {
      await a.db.financialEntry.update({ where: { id: semDescricao.data.entry.entry_id }, data: { emporio_manual_description: null } });
      const pedido = await actions.pagarDespesasAction(a.db, atorGestor, { entry_ids: [semDescricao.data.entry.entry_id], from: { bank_account_id: a.conta.id } });
      assert.ok(pedido.ok && pedido.data.waiting_approval);
      if (pedido.ok && pedido.data.waiting_approval) {
        const nome = pedido.data.request.entries[0].description;
        assert.equal(nome, "Conta avulsa de Fornecedor", "a avulsa sem descrição tem nome próprio no pedido");
      }
    }
    const { aprovarPedidoDePagamentoAction } = await import("@/lib/actions/emporio-aprovacoes");
    for (const [criada, description, destinatario] of [
      [aprovar, "Com alçada", "Eletricista avulso"],
      [comFornecedor, "Serviço do fornecedor", "Fornecedor"],
    ] as const) {
      assert.ok(criada.ok && criada.data.payment?.waiting_approval);
      if (!criada.ok || !criada.data.payment?.waiting_approval) continue;
      const aprovada = await aprovarPedidoDePagamentoAction(a.db, a.ator, criada.data.payment.request.id);
      assert.ok(aprovada.ok && aprovada.data.status === "aprovado");
      if (aprovada.ok) {
        assert.equal(aprovada.data.entries[0].description, description);
        assert.equal(aprovada.data.entries[0].supplier_or_category, destinatario);
      }
      const entrada = await a.db.financialEntry.findFirstOrThrow({ where: { id: criada.data.entry.entry_id } });
      assert.equal(entrada.status, "paid");
      assert.equal(await a.db.financialPayment.count({ where: { entry_id: entrada.id } }), 1);
    }
    await prisma.tenantProfile.create({ data: { tenant_id: ids[0], profile_type: "emporio", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: ids[0], feature_key: "emporio", enabled: true } });
    await prisma.tenant.update({ where: { id: ids[0] }, data: { trial_ends_at: new Date(Date.now() + 86400000) } });
    const { emitirCookieTenant } = await import("./_sessao-cookie");
    const { withCookie } = await import("./_escopo-de-requisicao");
    const owner = await a.db.user.findFirstOrThrow({ where: { id: a.ator.id } });
    const cookie = await emitirCookieTenant(owner.email);
    const rota = await import("@/app/api/v1/emporio/payables/route");
    assert.equal(typeof rota.POST, "function", "rota deve exportar POST");
    const chamarPost = (body: unknown) => withCookie(`${cookie.nome}=${cookie.valor}`, () => rota.POST(new Request("http://localhost/api/v1/emporio/payables", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    })));
    const corpo = { establishment_id: a.loja.id, description: "Conta pela API", amount: 23, due_date: "2026-11-30", status: "pending" };
    const httpCriada = await chamarPost(corpo);
    assert.equal(httpCriada.status, 201);
    const criadaJson = await httpCriada.json();
    assert.equal(criadaJson.data.entry.origin, "avulsa");
    assert.equal(criadaJson.data.entry.due_date, "2026-11-30");
    assert.deepEqual(criadaJson.meta, {});
    for (const [field, patch] of [["due_date", { due_date: "inválida" }], ["amount", { amount: "23" }], ["amount", { amount: 0 }], ["establishment_id", { establishment_id: b.loja.id }]] as const) {
      const resposta = await chamarPost({ ...corpo, ...patch });
      assert.ok(resposta.status >= 400 && resposta.status < 500);
      assert.equal((await resposta.json()).error.field, field);
    }
    // paid_at no futuro: recusa do schema da rota, em português, apontando o campo (nada é criado).
    const antesFuturo = await a.db.financialEntry.count();
    const futuroResp = await chamarPost({ ...corpo, status: "paid", paid_at: new Date(Date.now() + 3 * 86400000).toISOString(), from: { bank_account_id: a.conta.id } });
    assert.ok(futuroResp.status >= 400 && futuroResp.status < 500);
    const futuroErro = (await futuroResp.json()).error;
    assert.equal(futuroErro.field, "paid_at");
    assert.match(futuroErro.message, /data de pagamento n[ãa]o pode ser futura/i);
    assert.equal(await a.db.financialEntry.count(), antesFuturo);
    const httpLista =await withCookie(`${cookie.nome}=${cookie.valor}`, () => rota.GET(new Request("http://localhost/api/v1/emporio/payables")));
    assert.equal(httpLista.status, 200);
    assert.ok((await httpLista.json()).data.some((e: { entry_id: string }) => e.entry_id === criadaJson.data.entry.entry_id));
    console.log("M107: criação, validação, isolamento, ciclo pendente, pagamento atômico e rota passaram.");
  } finally {
    for (const id of ids.reverse()) await prisma.tenant.delete({ where: { id } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
