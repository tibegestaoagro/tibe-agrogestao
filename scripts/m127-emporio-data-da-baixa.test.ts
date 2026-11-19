import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório): a data da baixa espelha o extrato do banco (Q370 a Q373).
 * Roda: `npm run test:m127`
 *
 * Seção 1: o helper puro da data (janela de 31 dias, instante gravado).
 * Seção 2: o saldo da conta só conta movimento com data até hoje; o de data futura
 * é "Agendado" no extrato, entra na Projeção e não paga despesa.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;
const DIA = 86_400_000;
const j = (x: unknown) => JSON.stringify(x);

let falhas = 0;
let total = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  total += 1;
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const SENHA = "SenhaForte#2026";

/**
 * Seção 3: a data da baixa nas rotas de receber (fiado, boleto, depósito e compensação do
 * cheque). Tudo pela ROTA (Request construído, com token Bearer); as fixtures vêm das rotas
 * de venda e do Prisma.
 */
async function secao3() {
  console.log("\n3. A data da baixa nas rotas de receber");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const { papelDeFixture, papelFinanceiro, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat: Dado = await import("@/lib/actions/emporio-catalogo");
  const Est: Dado = await import("@/lib/actions/emporio-estoque");
  const Cli: Dado = await import("@/lib/actions/emporio-clientes");
  const F: Dado = await import("@/lib/actions/emporio-financeiro");
  const rotaTok: Dado = await import("@/app/api/v1/auth/token/route");
  const cru = prisma as Dado;

  const hoje = hojeEmBrasilia();
  const somar = (d: Date, k: number) => new Date(d.getTime() + k * DIA);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const br = (d: Date) => `${iso(d).slice(8, 10)}/${iso(d).slice(5, 7)}/${iso(d).slice(0, 4)}`;
  const ontem = somar(hoje, -1);
  const anteontem = somar(hoje, -2);
  const amanha = somar(hoje, 1);
  const meioDia = (d: Date) => d.getTime() + 15 * 3_600_000;
  const MSG_PERMISSAO = "Só o Financeiro, o Gerente geral e o Dono mudam a data.";
  const stamp = `${Date.now().toString(36)}`;
  let seq = 0;

  const t = await prisma.tenant.create({
    data: { name: `M127b ${stamp}`, document: `M127B${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    const padrao = { fiado_due_days: 30, fiado_block_after_days: 365, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null };
    await cru.emporioSettings.upsert({ where: { tenant_id: t.id }, create: { tenant_id: t.id, ...padrao }, update: padrao });
    const hash = await bcrypt.hash(SENHA, 4);
    const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}) =>
      prisma.user.create({
        data: { tenant_id: t.id, name: `M127 ${suf}`, email: `m127b-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
      });
    const owner = await mk("own", "OWNER");
    const vend = await mk("vend", "OPERADOR");
    const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
    const gestorOutro = await mk("gest2", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
    const fin = await mk("fin", "OPERADOR", papelFinanceiro());
    const db: Dado = prismaForTenant(t.id);
    const dono = { id: owner.id, role: "OWNER" as const };
    const lojaR = await Cat.criarEstabelecimentoAction(db, dono, { name: "M127b Loja" });
    const loja = lojaR.data.id as string;
    const loja2 = (await Cat.criarEstabelecimentoAction(db, dono, { name: "M127b Loja 2" })).data.id as string;
    await vincularTodas(prisma, t.id, [vend.id, gestor.id], [loja]);
    await vincularTodas(prisma, t.id, [gestorOutro.id], [loja2]);
    const cat = await db.productCategory.create({ data: scoped({ name: "M127b categoria" }) });
    const prod = await Cat.criarProdutoEmporioAction(db, dono, { name: `M127b Ração ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    const pres = await Cat.criarApresentacaoAction(db, dono, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    await Cat.definirPrecoAction(db, dono, { establishment_id: loja, presentation_id: pres.data.id, price: 10 });
    await Est.implantarEstoqueAction(db, dono, { establishment_id: loja, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    await abrirTurnoDeTeste(db, dono, loja);
    const reg = (await db.cashRegister.findFirst({ where: { establishment_id: loja, number: 1 } })).id as string;
    const cliente = (await cru.emporioCustomer.create({ data: { tenant_id: t.id, name: "M127b Cliente" } })).id as string;
    await Cli.garantirConsumidorFinal(db);
    const conta = (await prisma.bankAccount.create({ data: { tenant_id: t.id, name: "M127b Banco" } })).id as string;

    const tok: Record<string, string> = {};
    for (const [k, u] of [["owner", owner], ["fin", fin], ["vend", vend], ["gestor", gestor], ["gestorOutro", gestorOutro]] as const) {
      const r = await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }));
      tok[k] = String(((await r.json()) as Dado)?.data?.access_token ?? "");
    }

    type Resp = { status: number; corpo: Dado };
    async function chamar(token: string, rota: () => Promise<Dado>, url: string, corpo?: unknown, id?: string): Promise<Resp> {
      let m: Dado;
      try {
        m = await rota();
      } catch (e) {
        return { status: 0, corpo: { import_error: String(e).slice(0, 120) } };
      }
      const req = new Request(`http://localhost/api/v1/${url}`, {
        method: "POST", headers: { "content-type": "application/json" }, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      });
      try {
        const res = await withBearer(token, (): Promise<Response> => m.POST(req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
        return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
      } catch (e) {
        return { status: 0, corpo: { throw: String(e).slice(0, 160) } };
      }
    }
    const R = {
      sales: () => import("@/app/api/v1/emporio/sales/route"),
      receive: () => import("@/app/api/v1/emporio/receivables/receive/route"),
      pay: () => import("@/app/api/v1/emporio/boletos/[id]/pay/route"),
      deposit: () => import("@/app/api/v1/emporio/checks/[id]/deposit/route"),
      clear: () => import("@/app/api/v1/emporio/checks/[id]/clear/route"),
    };
    const recusou = (r: Resp, status: number, field: string, msg?: string) =>
      r.status === status && r.corpo?.error?.field === field && (msg === undefined || r.corpo?.error?.message === msg);
    const resumo = (r: Resp) => `${r.status} ${j(r.corpo).slice(0, 240)}`;

    async function vender(payments: Dado[]): Promise<string> {
      const total = payments.reduce((s, p) => s + Number(p.amount), 0);
      const r = await chamar(tok.owner, R.sales, "emporio/sales", {
        operation_key: `m127b-venda-${stamp}-${(seq += 1)}`, establishment_id: loja, cash_register_id: reg, customer_id: cliente,
        items: [{ emporio_product_id: prod.data.id, presentation_id: pres.data.id, quantity: total / 10 }],
        payments,
      });
      if (r.status !== 201) throw new Error(`venda de preparação: ${resumo(r)}`);
      return String(r.corpo.data.id);
    }
    const receber = (token: string, extra: Dado) =>
      chamar(token, R.receive, "emporio/receivables/receive", {
        operation_key: `m127b-rec-${stamp}-${(seq += 1)}`, customer_id: cliente, establishment_id: loja, amount: 10, kind: "pix", bank_account_id: conta, ...extra,
      });
    const historico = async (acao: string) => (await cru.emporioAuditLog.findMany({ where: { tenant_id: t.id, action: acao }, orderBy: { created_at: "asc" } })) as Dado[];

    console.log("  (a) fiado");
    await vender([{ kind: "fiado", amount: 100 }]);
    const vendaPequena = await vender([{ kind: "fiado", amount: 10 }]);
    const entradaPequena = await cru.financialEntry.findFirst({ where: { tenant_id: t.id, related_id: vendaPequena } });
    const rOntem = await receber(tok.fin, { received_on: iso(ontem), entry_id: entradaPequena?.id });
    check("Financeiro: fiado PIX com received_on de ontem: 201", rOntem.status === 201, resumo(rOntem));
    const mov = await cru.cashMovement.findFirst({ where: { tenant_id: t.id, origin: "recebimento_fiado", financial_payment_id: { not: null } }, orderBy: { created_at: "desc" } });
    check("o movimento vai para ontem ao meio-dia de Brasília", mov?.occurred_at?.getTime() === meioDia(ontem), String(mov?.occurred_at?.toISOString()));
    const fp = await cru.financialPayment.findFirst({ where: { id: mov?.financial_payment_id ?? "x" } });
    check("o FinancialPayment.paid_at é ontem ao meio-dia", fp?.paid_at?.getTime() === meioDia(ontem), String(fp?.paid_at?.toISOString()));
    const ent = await cru.financialEntry.findFirst({ where: { id: entradaPequena?.id ?? "x" } });
    check("o lançamento quitado tem paid_at de ontem ao meio-dia", ent?.status === "paid" && ent?.paid_at?.getTime() === meioDia(ontem), `${ent?.status} ${ent?.paid_at?.toISOString()}`);
    const logs = await historico("fiado.receber");
    check("o Histórico cita a data quando não é hoje", logs.some((l) => String(l.summary).includes(br(ontem))), j(logs.map((l) => l.summary)));

    const rDin = await receber(tok.fin, { kind: "dinheiro", bank_account_id: undefined, received_on: iso(ontem) });
    check("Financeiro: fiado em dinheiro com data de ontem: 422 em received_on", recusou(rDin, 422, "received_on", "Dinheiro na gaveta é sempre de hoje."), resumo(rDin));
    const rDinOwner = await receber(tok.owner, { kind: "dinheiro", bank_account_id: undefined, received_on: iso(ontem) });
    check("Dono: fiado em dinheiro com data de ontem: 422 em received_on", recusou(rDinOwner, 422, "received_on", "Dinheiro na gaveta é sempre de hoje."), resumo(rDinOwner));
    const rJanela = await receber(tok.fin, { received_on: iso(somar(hoje, 32)) });
    check("Financeiro: received_on além da janela: 422 com a mensagem da janela", recusou(rJanela, 422, "received_on", `A data precisa estar entre ${br(somar(hoje, -31))} e ${br(somar(hoje, 31))}.`), resumo(rJanela));

    const rVend = await receber(tok.vend, { received_on: iso(ontem) });
    check("Vendedor: fiado PIX com data de ontem: 403 em received_on", recusou(rVend, 403, "received_on", MSG_PERMISSAO), resumo(rVend));
    const rVendHoje = await receber(tok.vend, { received_on: iso(hoje) });
    check("Vendedor: received_on igual a hoje é aceito", rVendHoje.status === 201, resumo(rVendHoje));
    const antes = Date.now();
    const rVendSem = await receber(tok.vend, {});
    check("Vendedor: sem data, grava agora", rVendSem.status === 201, resumo(rVendSem));
    const movAgora = await cru.cashMovement.findFirst({ where: { tenant_id: t.id, created_by_user_id: vend.id, origin: "recebimento_fiado" }, orderBy: { created_at: "desc" } });
    check("o movimento sem data é de agora", !!movAgora && Math.abs(movAgora.occurred_at.getTime() - antes) < 60_000, String(movAgora?.occurred_at?.toISOString()));

    console.log("  (b) boleto");
    const vB1 = await vender([{ kind: "boleto", amount: 30, boleto: { due_on: iso(somar(hoje, 20)) } }]);
    const vB2 = await vender([{ kind: "boleto", amount: 30, boleto: { due_on: iso(somar(hoje, 20)) } }]);
    const vB3 = await vender([{ kind: "boleto", amount: 30, boleto: { due_on: iso(somar(hoje, 20)) } }]);
    const bol = async (venda: string) => (await cru.emporioBoleto.findFirst({ where: { sale_id: venda } })).id as string;
    const [b1, b2, b3] = [await bol(vB1), await bol(vB2), await bol(vB3)];
    const pB1 = await chamar(tok.fin, R.pay, `emporio/boletos/${b1}/pay`, { bank_account_id: conta, paid_on: iso(amanha) }, b1);
    check("Financeiro: boleto com paid_on de amanhã: 200", pB1.status === 200, resumo(pB1));
    const movB = await cru.cashMovement.findFirst({ where: { tenant_id: t.id, boleto_id: b1 } });
    check("o movimento do boleto vai para amanhã ao meio-dia de Brasília", movB?.occurred_at?.getTime() === meioDia(amanha), String(movB?.occurred_at?.toISOString()));
    const ext = await F.lerExtratoDaContaAction(db, dono, { bank_account_id: conta, de: somar(hoje, -3), ate: somar(hoje, 3) });
    check("o boleto de amanhã está em scheduled do extrato", ext.ok && ext.data.scheduled.some((s: Dado) => s.id === movB?.id), j(ext.ok ? ext.data.scheduled : ext));
    const pB2 = await chamar(tok.fin, R.pay, `emporio/boletos/${b2}/pay`, { bank_account_id: conta, paid_on: iso(somar(hoje, 32)) }, b2);
    check("boleto com hoje mais 32: 422 com a mensagem da janela em paid_on", recusou(pB2, 422, "paid_on", `A data precisa estar entre ${br(somar(hoje, -31))} e ${br(somar(hoje, 31))}.`), resumo(pB2));
    check("o boleto recusado segue aberto", (await cru.emporioBoleto.findFirst({ where: { id: b2 } })).status === "aberto");
    const pB3 = await chamar(tok.vend, R.pay, `emporio/boletos/${b3}/pay`, { bank_account_id: conta, paid_on: iso(ontem) }, b3);
    check("Vendedor (sem a chave do dinheiro) não baixa boleto: 403", pB3.status === 403, resumo(pB3));
    const vB4 = await vender([{ kind: "boleto", amount: 30, boleto: { due_on: iso(somar(hoje, 20)) } }]);
    const b4 = await bol(vB4);
    const pOutro = await chamar(tok.gestorOutro, R.pay, `emporio/boletos/${b4}/pay`, { bank_account_id: conta, paid_on: iso(ontem) }, b4);
    // O boleto de outra loja nem é visível ao Gestor dela: a action devolve o 404 de "não achado".
    check("Gestor de outra loja com data passada: 404 (boleto invisível a ele)", pOutro.status === 404, resumo(pOutro));
    check("o boleto segue aberto", (await cru.emporioBoleto.findFirst({ where: { id: b4 } })).status === "aberto");
    const pGestor = await chamar(tok.gestor, R.pay, `emporio/boletos/${b4}/pay`, { bank_account_id: conta, paid_on: iso(ontem) }, b4);
    check("Gestor da loja do boleto com data passada: 200 (Q371 não revogou)", pGestor.status === 200, resumo(pGestor));
    const movG = await cru.cashMovement.findFirst({ where: { tenant_id: t.id, boleto_id: b4 } });
    check("o movimento do Gestor está em ontem ao meio-dia", movG?.occurred_at?.getTime() === meioDia(ontem), String(movG?.occurred_at?.toISOString()));
    const pVendData = await chamar(tok.vend, R.pay, `emporio/boletos/${b3}/pay`, { bank_account_id: conta, paid_on: iso(ontem) }, b3);
    check("Vendedor com data de ontem: recusado e o boleto segue aberto", pVendData.status === 403 && (await cru.emporioBoleto.findFirst({ where: { id: b3 } })).status === "aberto", resumo(pVendData));

    console.log("  (c) cheque");
    const cheque = async () => {
      const venda = await vender([{ kind: "cheque", amount: 50, check: { holder_name: "Titular", number: "9001", bank: "Sicredi", good_for: iso(somar(hoje, 5)) } }]);
      return (await cru.emporioCheck.findFirst({ where: { sale_id: venda } })).id as string;
    };
    const c1 = await cheque();
    const c2 = await cheque();
    const dV = await chamar(tok.vend, R.deposit, `emporio/checks/${c2}/deposit`, { bank_account_id: conta, deposited_on: iso(ontem) }, c2);
    check("Vendedor: depositar com data de ontem: 403 em deposited_on", recusou(dV, 403, "deposited_on", MSG_PERMISSAO), resumo(dV));
    check("o cheque recusado segue recebido", (await cru.emporioCheck.findFirst({ where: { id: c2 } })).status === "recebido");
    const dF = await chamar(tok.fin, R.deposit, `emporio/checks/${c1}/deposit`, { bank_account_id: conta, deposited_on: iso(ontem) }, c1);
    check("Financeiro: depositar com deposited_on de ontem: 200", dF.status === 200, resumo(dF));
    const ck1 = await cru.emporioCheck.findFirst({ where: { id: c1 } });
    check("deposited_at é ontem ao meio-dia", ck1?.deposited_at?.getTime() === meioDia(ontem), String(ck1?.deposited_at?.toISOString()));
    const cF = await chamar(tok.fin, R.clear, `emporio/checks/${c1}/clear`, { cleared_on: iso(anteontem) }, c1);
    check("Financeiro: compensar com cleared_on de anteontem: 200", cF.status === 200, resumo(cF));
    const ck1b = await cru.emporioCheck.findFirst({ where: { id: c1 } });
    check("cleared_at é anteontem ao meio-dia", ck1b?.cleared_at?.getTime() === meioDia(anteontem), String(ck1b?.cleared_at?.toISOString()));
    const movC = await cru.cashMovement.findFirst({ where: { tenant_id: t.id, check_id: c1, origin: "cheque_compensado" } });
    check("o movimento do cheque compensado está em anteontem", movC?.occurred_at?.getTime() === meioDia(anteontem), String(movC?.occurred_at?.toISOString()));
    check("o Histórico do depósito cita a data", (await historico("cheque.depositar")).some((l) => String(l.summary).includes(br(ontem))));
    check("o Histórico da compensação cita a data", (await historico("cheque.compensar")).some((l) => String(l.summary).includes(br(anteontem))));
    const cV = await chamar(tok.vend, R.clear, `emporio/checks/${c2}/clear`, { cleared_on: iso(ontem) }, c2);
    check("Vendedor sem a chave não compensa: 403", cV.status === 403, resumo(cV));
  } catch (e) {
    check("a seção 3 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    await prisma.emporioSale.updateMany({ where: { tenant_id: t.id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
    const modelos = [
      "emporioBoleto", "emporioAuditLog", "cashMovement", "emporioSalePayment", "stockMovement", "emporioSaleItem", "emporioCheck", "emporioSale",
      "financialPayment", "financialEntry", "emporioCustomer", "cashSession", "cashRegister", "emporioCounter", "emporioSettings",
      "userEstablishment", "establishment", "bankAccount", "user", "tenantProfile", "tenantFeature",
    ];
    for (let passada = 0; passada < 2; passada += 1) {
      for (const m of modelos) await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: t.id } }).catch(() => undefined);
    }
    await prisma.tenant.delete({ where: { id: t.id } }).catch((e: unknown) => console.log(`  (teardown 3: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
  }
}

/**
 * Seção 4: o Financeiro corrige a data da linha de venda (PIX ou transferência) no extrato (Q372).
 * Tudo pela ROTA (PATCH com token Bearer); as fixtures vêm das rotas de venda e do Prisma.
 */
async function secao4() {
  console.log("\n4. Corrigir a data da linha de venda no extrato");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const { papelDeFixture, papelFinanceiro, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat: Dado = await import("@/lib/actions/emporio-catalogo");
  const Est: Dado = await import("@/lib/actions/emporio-estoque");
  const Cli: Dado = await import("@/lib/actions/emporio-clientes");
  const F: Dado = await import("@/lib/actions/emporio-financeiro");
  const rotaTok: Dado = await import("@/app/api/v1/auth/token/route");
  const cru = prisma as Dado;

  const hoje = hojeEmBrasilia();
  const somar = (d: Date, k: number) => new Date(d.getTime() + k * DIA);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const br = (d: Date) => `${iso(d).slice(8, 10)}/${iso(d).slice(5, 7)}/${iso(d).slice(0, 4)}`;
  const ontem = somar(hoje, -1);
  const amanha = somar(hoje, 1);
  const meioDia = (d: Date) => d.getTime() + 15 * 3_600_000;
  const stamp = `${Date.now().toString(36)}`;
  let seq = 0;

  const t = await prisma.tenant.create({
    data: { name: `M127c ${stamp}`, document: `M127C${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  const t2 = await prisma.tenant.create({
    data: { name: `M127d ${stamp}`, document: `M127D${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    for (const x of [t, t2]) {
      await prisma.tenantProfile.create({ data: { tenant_id: x.id, profile_type: "emporio", active: true } });
      await prisma.tenantProfile.create({ data: { tenant_id: x.id, profile_type: "fazenda", active: true } });
      await prisma.tenantFeature.create({ data: { tenant_id: x.id, feature_key: "emporio", enabled: true } });
    }
    const padrao = { fiado_due_days: 30, fiado_block_after_days: 365, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null };
    await cru.emporioSettings.upsert({ where: { tenant_id: t.id }, create: { tenant_id: t.id, ...padrao }, update: padrao });
    const hash = await bcrypt.hash(SENHA, 4);
    const mk = async (tenant: string, suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}) =>
      prisma.user.create({
        data: { tenant_id: tenant, name: `M127c ${suf}`, email: `m127c-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
      });
    const owner = await mk(t.id, "own", "OWNER");
    const vend = await mk(t.id, "vend", "OPERADOR");
    const fin = await mk(t.id, "fin", "OPERADOR", papelFinanceiro());
    const dono2 = await mk(t2.id, "own2", "OWNER");
    const db: Dado = prismaForTenant(t.id);
    const dono = { id: owner.id, role: "OWNER" as const };
    const loja = (await Cat.criarEstabelecimentoAction(db, dono, { name: "M127c Loja" })).data.id as string;
    await vincularTodas(prisma, t.id, [vend.id], [loja]);
    const cat = await db.productCategory.create({ data: scoped({ name: "M127c categoria" }) });
    const prod = await Cat.criarProdutoEmporioAction(db, dono, { name: `M127c Ração ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    const pres = await Cat.criarApresentacaoAction(db, dono, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    await Cat.definirPrecoAction(db, dono, { establishment_id: loja, presentation_id: pres.data.id, price: 10 });
    await Est.implantarEstoqueAction(db, dono, { establishment_id: loja, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    await abrirTurnoDeTeste(db, dono, loja);
    const reg = (await db.cashRegister.findFirst({ where: { establishment_id: loja, number: 1 } })).id as string;
    const cliente = (await cru.emporioCustomer.create({ data: { tenant_id: t.id, name: "M127c Cliente" } })).id as string;
    await Cli.garantirConsumidorFinal(db);
    const conta = (await prisma.bankAccount.create({ data: { tenant_id: t.id, name: "M127c Banco", receives_pix: true, pix_all_establishments: true } })).id as string;

    const tok: Record<string, string> = {};
    for (const [k, u] of [["owner", owner], ["fin", fin], ["vend", vend], ["dono2", dono2]] as const) {
      const r = await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }));
      tok[k] = String(((await r.json()) as Dado)?.data?.access_token ?? "");
    }

    type Resp = { status: number; corpo: Dado };
    async function chamar(token: string, metodo: "POST" | "PATCH", rota: () => Promise<Dado>, url: string, corpo: unknown, id?: string): Promise<Resp> {
      let m: Dado;
      try {
        m = await rota();
      } catch (e) {
        return { status: 0, corpo: { import_error: String(e).slice(0, 160) } };
      }
      const req = new Request(`http://localhost/api/v1/${url}`, {
        method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
      });
      try {
        const res = await withBearer(token, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
        return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
      } catch (e) {
        return { status: 0, corpo: { throw: String(e).slice(0, 160) } };
      }
    }
    const R = {
      sales: () => import("@/app/api/v1/emporio/sales/route"),
      mov: () => import("@/app/api/v1/emporio/finance/statement/movements/[id]/route"),
    };
    const resumo = (r: Resp) => `${r.status} ${j(r.corpo).slice(0, 240)}`;
    const recusou = (r: Resp, status: number, field: string, msg?: string) =>
      r.status === status && r.corpo?.error?.field === field && (msg === undefined || r.corpo?.error?.message === msg);

    async function vendaPix(): Promise<{ venda: string; numero: number; mov: Dado }> {
      const r = await chamar(tok.owner, "POST", R.sales, "emporio/sales", {
        operation_key: `m127c-venda-${stamp}-${(seq += 1)}`, establishment_id: loja, cash_register_id: reg, customer_id: cliente,
        items: [{ emporio_product_id: prod.data.id, presentation_id: pres.data.id, quantity: 5 }],
        payments: [{ kind: "pix", amount: 50, bank_account_id: conta }],
      });
      if (r.status !== 201) throw new Error(`venda de preparação: ${resumo(r)}`);
      const venda = String(r.corpo.data.id);
      const mov = await cru.cashMovement.findFirst({ where: { tenant_id: t.id, sale_id: venda, bank_account_id: conta } });
      return { venda, numero: Number(r.corpo.data.number), mov };
    }
    const corrigir = (token: string, id: string, occurred_on: unknown) =>
      chamar(token, "PATCH", R.mov, `emporio/finance/statement/movements/${id}`, { occurred_on }, id);
    const extrato = () => F.lerExtratoDaContaAction(db, dono, { bank_account_id: conta, de: somar(hoje, -3), ate: somar(hoje, 3) });
    const historico = async (acao: string) => (await cru.emporioAuditLog.findMany({ where: { tenant_id: t.id, action: acao }, orderBy: { created_at: "asc" } })) as Dado[];

    console.log("  (a) corrige para ontem e para amanhã");
    const v1 = await vendaPix();
    check("a venda PIX gerou o movimento na conta", !!v1.mov, "sem movimento");
    const rOntem = await corrigir(tok.fin, v1.mov.id, iso(ontem));
    check("Financeiro: corrigir para ontem: 200", rOntem.status === 200, resumo(rOntem));
    check("a resposta é a linha do extrato com a data de ontem", rOntem.corpo?.data?.kind === "movimento" && rOntem.corpo?.data?.id === v1.mov.id && rOntem.corpo?.data?.occurred_on === iso(ontem), j(rOntem.corpo?.data));
    const m1 = await cru.cashMovement.findFirst({ where: { id: v1.mov.id } });
    check("occurred_at é ontem ao meio-dia de Brasília", m1?.occurred_at?.getTime() === meioDia(ontem), String(m1?.occurred_at?.toISOString()));
    const logs = await historico("financeiro.data_corrigida");
    check(
      "o Histórico traz as duas datas e o número da venda",
      logs.some((l) => String(l.summary) === `Corrigiu a data do PIX da venda nº ${v1.numero} de ${br(hoje)} para ${br(ontem)}`),
      j(logs.map((l) => l.summary)),
    );
    const ext1 = await extrato();
    check("a linha está em lines, no dia de ontem", ext1.ok && ext1.data.lines.some((l: Dado) => l.id === v1.mov.id && l.occurred_on === iso(ontem)), j(ext1.ok ? ext1.data.lines.length : ext1));

    const rAmanha = await corrigir(tok.fin, v1.mov.id, iso(amanha));
    check("Financeiro: corrigir para amanhã: 200", rAmanha.status === 200, resumo(rAmanha));
    const ext2 = await extrato();
    check("a linha de amanhã vai para scheduled e sai de lines", ext2.ok && ext2.data.scheduled.some((l: Dado) => l.id === v1.mov.id) && !ext2.data.lines.some((l: Dado) => l.id === v1.mov.id), j(ext2.ok ? ext2.data.scheduled : ext2));
    const rHoje = await corrigir(tok.fin, v1.mov.id, iso(hoje));
    const m1b = await cru.cashMovement.findFirst({ where: { id: v1.mov.id } });
    check("corrigir para hoje: 200 e o instante é agora", rHoje.status === 200 && Math.abs(m1b.occurred_at.getTime() - Date.now()) < 60_000, resumo(rHoje));

    console.log("  (b) recusas");
    const rJanela = await corrigir(tok.fin, v1.mov.id, iso(somar(hoje, 32)));
    check("data fora da janela: 422 em occurred_on com a mensagem da janela", recusou(rJanela, 422, "occurred_on", `A data precisa estar entre ${br(somar(hoje, -31))} e ${br(somar(hoje, 31))}.`), resumo(rJanela));
    const rSem = await corrigir(tok.fin, v1.mov.id, null);
    check("sem data: 422 em occurred_on", rSem.status === 422 && rSem.corpo?.error?.field === "occurred_on", resumo(rSem));
    const rVend = await corrigir(tok.vend, v1.mov.id, iso(ontem));
    check("Vendedor: 403", rVend.status === 403, resumo(rVend));
    const rOutro = await corrigir(tok.dono2, v1.mov.id, iso(ontem));
    check("outro tenant: 404", rOutro.status === 404, resumo(rOutro));
    const m1c = await cru.cashMovement.findFirst({ where: { id: v1.mov.id } });
    check("as recusas não mexeram na data", m1c.occurred_at.getTime() === m1b.occurred_at.getTime());

    const v2 = await vendaPix();
    await cru.cashMovement.update({ where: { id: v2.mov.id }, data: { reconciled_at: new Date(), reconciled_by_user_id: fin.id } });
    const rCar = await corrigir(tok.fin, v2.mov.id, iso(ontem));
    check("linha carimbada: 409 JA_CARIMBADA", rCar.status === 409 && rCar.corpo?.error?.code === "JA_CARIMBADA" && rCar.corpo?.error?.message === "Tire o carimbo antes de corrigir a data.", resumo(rCar));
    const m2 = await cru.cashMovement.findFirst({ where: { id: v2.mov.id } });
    check("a carimbada segue com a data de antes", m2.occurred_at.getTime() === v2.mov.occurred_at.getTime());

    const MSG_ORIGEM = "Só a data do PIX ou da transferência da venda se corrige aqui.";
    const transf = await cru.cashMovement.create({ data: { tenant_id: t.id, bank_account_id: conta, direction: "entrada", origin: "transferencia", amount: 5, occurred_at: new Date() } });
    const rTr = await corrigir(tok.fin, transf.id, iso(ontem));
    check("linha de transferência entre contas: 422", rTr.status === 422 && rTr.corpo?.error?.message === MSG_ORIGEM, resumo(rTr));
    const fiado = await cru.cashMovement.create({ data: { tenant_id: t.id, bank_account_id: conta, direction: "entrada", origin: "recebimento_fiado", amount: 5, occurred_at: new Date() } });
    const rFi = await corrigir(tok.fin, fiado.id, iso(ontem));
    check("linha de fiado: 422", rFi.status === 422 && rFi.corpo?.error?.message === MSG_ORIGEM, resumo(rFi));
    const gaveta = await cru.cashMovement.create({ data: { tenant_id: t.id, establishment_id: loja, direction: "entrada", origin: "venda", amount: 5, occurred_at: new Date() } });
    const rGa = await corrigir(tok.fin, gaveta.id, iso(ontem));
    check("movimento da gaveta: 422", rGa.status === 422, resumo(rGa));
    const rNada = await corrigir(tok.fin, "nao-existe", iso(ontem));
    check("id inexistente: 404", rNada.status === 404, resumo(rNada));
  } catch (e) {
    check("a seção 4 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    for (const x of [t, t2]) {
      await prisma.emporioSale.updateMany({ where: { tenant_id: x.id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
    }
    const modelos = [
      "emporioBoleto", "emporioAuditLog", "cashMovement", "emporioSalePayment", "stockMovement", "emporioSaleItem", "emporioCheck", "emporioSale",
      "financialPayment", "financialEntry", "emporioCustomer", "cashSession", "cashRegister", "emporioCounter", "emporioSettings",
      "userEstablishment", "establishment", "bankAccount", "user", "tenantProfile", "tenantFeature",
    ];
    for (const x of [t, t2]) {
      for (let passada = 0; passada < 2; passada += 1) {
        for (const m of modelos) await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: x.id } }).catch(() => undefined);
      }
      await prisma.tenant.delete({ where: { id: x.id } }).catch((e: unknown) => console.log(`  (teardown 4: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
  }
}

/**
 * Seção 5: o valor pago do boleto (Q373). O Financeiro digita o que o banco recebeu: o movimento da conta leva esse valor,
 * o boleto guarda o original, e a diferença vira juros (pagou mais) ou desconto (pagou menos) no Resultado da loja.
 */
async function secao5() {
  console.log("\n5. Valor pago do boleto: juros e desconto no Resultado");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const { papelDeFixture } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat: Dado = await import("@/lib/actions/emporio-catalogo");
  const Est: Dado = await import("@/lib/actions/emporio-estoque");
  const Cli: Dado = await import("@/lib/actions/emporio-clientes");
  const Res: Dado = await import("@/lib/actions/emporio-resultado");
  const rotaTok: Dado = await import("@/app/api/v1/auth/token/route");
  const cru = prisma as Dado;

  const hoje = hojeEmBrasilia();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const mes = iso(hoje).slice(0, 7);
  const vencimento = iso(new Date(hoje.getTime() + 10 * DIA));
  const stamp = `${Date.now().toString(36)}`;
  let seq = 0;

  const t = await prisma.tenant.create({
    data: { name: `M127e ${stamp}`, document: `M127E${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    const padrao = { fiado_due_days: 30, fiado_block_after_days: 365, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null };
    await cru.emporioSettings.upsert({ where: { tenant_id: t.id }, create: { tenant_id: t.id, ...padrao }, update: padrao });
    const hash = await bcrypt.hash(SENHA, 4);
    const owner = await prisma.user.create({
      data: { tenant_id: t.id, name: "M127e own", email: `m127e-own-${stamp}@teste.local`, password_hash: hash, role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const db: Dado = prismaForTenant(t.id);
    const dono = { id: owner.id, role: "OWNER" as const };
    const loja = (await Cat.criarEstabelecimentoAction(db, dono, { name: "M127e Loja" })).data.id as string;
    const loja2 = (await Cat.criarEstabelecimentoAction(db, dono, { name: "M127e Loja 2" })).data.id as string;
    const cat = await db.productCategory.create({ data: scoped({ name: "M127e categoria" }) });
    const prod = await Cat.criarProdutoEmporioAction(db, dono, { name: `M127e Ração ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    const pres = await Cat.criarApresentacaoAction(db, dono, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    await Cat.definirPrecoAction(db, dono, { establishment_id: loja, presentation_id: pres.data.id, price: 9.99 });
    await Est.implantarEstoqueAction(db, dono, { establishment_id: loja, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    await abrirTurnoDeTeste(db, dono, loja);
    const reg = (await db.cashRegister.findFirst({ where: { establishment_id: loja, number: 1 } })).id as string;
    const cliente = (await cru.emporioCustomer.create({ data: { tenant_id: t.id, name: "M127e Cliente" } })).id as string;
    await Cli.garantirConsumidorFinal(db);
    const conta = (await prisma.bankAccount.create({ data: { tenant_id: t.id, name: "M127e Banco", receives_pix: true, pix_all_establishments: true } })).id as string;

    const r0 = await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: owner.email, password: SENHA }),
    }));
    const tok = String(((await r0.json()) as Dado)?.data?.access_token ?? "");

    type Resp = { status: number; corpo: Dado };
    async function chamar(rota: () => Promise<Dado>, url: string, corpo: unknown, id?: string): Promise<Resp> {
      const m = await rota();
      const req = new Request(`http://localhost/api/v1/${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
      const res = await withBearer(tok, (): Promise<Response> => m.POST(req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
      return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
    }
    const vendaComBoleto = async (): Promise<string> => {
      const r = await chamar(() => import("@/app/api/v1/emporio/sales/route"), "emporio/sales", {
        operation_key: `m127e-venda-${stamp}-${(seq += 1)}`, establishment_id: loja, cash_register_id: reg, customer_id: cliente,
        items: [{ emporio_product_id: prod.data.id, presentation_id: pres.data.id, quantity: 10 }],
        payments: [{ kind: "boleto", amount: 99.9, boleto: { due_on: vencimento } }],
      });
      if (r.status !== 201) throw new Error(`venda de preparação: ${r.status} ${j(r.corpo).slice(0, 240)}`);
      const b = await cru.emporioBoleto.findFirst({ where: { tenant_id: t.id, sale_id: String(r.corpo.data.id) } });
      return b.id as string;
    };
    const pagar = (id: string, corpo: Dado) => chamar(() => import("@/app/api/v1/emporio/boletos/[id]/pay/route"), `emporio/boletos/${id}/pay`, { bank_account_id: conta, ...corpo }, id);
    const resultado = async (estab: string) => {
      const r = await Res.resultadoDaLojaAction(db, dono, { establishment_id: estab, month: mes });
      if (!r.ok) throw new Error(`resultado: ${j(r)}`);
      return r.data as Dado;
    };
    const movimento = async (id: string) => (await cru.cashMovement.findFirst({ where: { tenant_id: t.id, boleto_id: id, origin: "boleto_pago" } })) as Dado;

    const base = await resultado(loja);
    check("antes de qualquer baixa o Resultado tem juros e desconto zerados", base.boleto_interest === 0 && base.boleto_discount === 0, j([base.boleto_interest, base.boleto_discount]));

    console.log("  (a) pago a mais: R$ 100,10 sobre R$ 99,90");
    const b1 = await vendaComBoleto();
    const r1 = await pagar(b1, { paid_amount: 100.1 });
    check("pagar com paid_amount 100,10: 200", r1.status === 200, `${r1.status} ${j(r1.corpo).slice(0, 240)}`);
    check("a resposta traz amount 99,90, paid_amount 100,10 e difference 0,20", r1.corpo?.data?.amount === 99.9 && r1.corpo?.data?.paid_amount === 100.1 && r1.corpo?.data?.difference === 0.2, j(r1.corpo?.data));
    check("o movimento da conta é de 100,10", Number((await movimento(b1))?.amount) === 100.1, j(await movimento(b1)));
    const bd1 = await cru.emporioBoleto.findFirst({ where: { id: b1 } });
    check("o boleto guarda amount 99,90 e paid_amount 100,10", Number(bd1.amount) === 99.9 && Number(bd1.paid_amount) === 100.1);
    const log1 = (await cru.emporioAuditLog.findMany({ where: { tenant_id: t.id, action: "boleto.pagar", target_id: b1 } })) as Dado[];
    check("o Histórico diz pago R$ 100,10 e juros R$ 0,20", log1.some((l) => /100,10/.test(String(l.summary)) && /juros/.test(String(l.summary)) && /0,20/.test(String(l.summary))), j(log1.map((l) => l.summary)));
    const a1 = await resultado(loja);
    check("o Resultado da loja traz juros 0,20 e desconto 0", a1.boleto_interest === 0.2 && a1.boleto_discount === 0, j([a1.boleto_interest, a1.boleto_discount]));
    const esperado = (x: Dado) =>
      Math.round((x.margin - x.losses - x.fixed_expenses + x.freight.difference - x.anticipation_costs - x.card_cost.adjustments + x.boleto_interest - x.boleto_discount) * 100);
    check("o result inclui os juros (0,20)", Math.round(a1.result * 100) === esperado(a1) && a1.boleto_interest === 0.2, `${a1.result} esperado ${esperado(a1) / 100}`);

    console.log("  (b) pago a menos: R$ 95,00");
    const b2 = await vendaComBoleto();
    const r2 = await pagar(b2, { paid_amount: 95 });
    check("pagar com paid_amount 95: 200 e difference -4,90", r2.status === 200 && r2.corpo?.data?.difference === -4.9, `${r2.status} ${j(r2.corpo?.data)}`);
    check("o movimento da conta é de 95,00", Number((await movimento(b2))?.amount) === 95, j(await movimento(b2)));
    const log2 = (await cru.emporioAuditLog.findMany({ where: { tenant_id: t.id, action: "boleto.pagar", target_id: b2 } })) as Dado[];
    check("o Histórico diz pago R$ 95,00 e desconto R$ 4,90", log2.some((l) => /95,00/.test(String(l.summary)) && /desconto/.test(String(l.summary)) && /4,90/.test(String(l.summary))), j(log2.map((l) => l.summary)));
    const a2 = await resultado(loja);
    check("o Resultado traz juros 0,20 e desconto 4,90", a2.boleto_interest === 0.2 && a2.boleto_discount === 4.9, j([a2.boleto_interest, a2.boleto_discount]));
    check("o result inclui os juros e o desconto (0,20 menos 4,90)", Math.round(a2.result * 100) === esperado(a2), `${a2.result} esperado ${esperado(a2) / 100}`);
    const all = await resultado("all");
    check("a visão de todas as lojas soma o mesmo", all.boleto_interest === 0.2 && all.boleto_discount === 4.9, j([all.boleto_interest, all.boleto_discount]));
    const outra = await resultado(loja2);
    check("o Resultado de outra loja não recebe nada", outra.boleto_interest === 0 && outra.boleto_discount === 0, j([outra.boleto_interest, outra.boleto_discount]));

    console.log("  (c) sem paid_amount, igual a hoje");
    const b3 = await vendaComBoleto();
    const r3 = await pagar(b3, {});
    check("sem paid_amount: 200, paid_amount 99,90 e difference 0", r3.status === 200 && r3.corpo?.data?.paid_amount === 99.9 && r3.corpo?.data?.difference === 0, `${r3.status} ${j(r3.corpo?.data)}`);
    check("o movimento é do valor do boleto", Number((await movimento(b3))?.amount) === 99.9);
    const a3 = await resultado(loja);
    check("o Resultado não mudou", a3.boleto_interest === 0.2 && a3.boleto_discount === 4.9, j([a3.boleto_interest, a3.boleto_discount]));

    console.log("  (d) recusas");
    const b4 = await vendaComBoleto();
    for (const [rotulo, v] of [["zero", 0], ["negativo", -5]] as const) {
      const r = await pagar(b4, { paid_amount: v });
      check(`paid_amount ${rotulo}: 422 em paid_amount`, r.status === 422 && r.corpo?.error?.field === "paid_amount", `${r.status} ${j(r.corpo)}`);
    }
    const rTexto = await pagar(b4, { paid_amount: "100.1" });
    check("paid_amount em texto: 422 em paid_amount pela rota", rTexto.status === 422 && rTexto.corpo?.error?.field === "paid_amount", `${rTexto.status} ${j(rTexto.corpo)}`);
    const X: Dado = await import("@/lib/actions/emporio-caixa");
    for (const [rotulo, v] of [["NaN", Number.NaN], ["Infinity", Number.POSITIVE_INFINITY], ["acima do limite da coluna", 1e12]] as const) {
      const r = await X.pagarBoletoAction(db, dono, b4, { bank_account_id: conta, paid_amount: v });
      check(`ação: paid_amount ${rotulo}: 422 em paid_amount`, !r.ok && r.status === 422 && r.field === "paid_amount", j(r));
    }
    const aindaAberto =await cru.emporioBoleto.findFirst({ where: { id: b4 } });
    check("a recusa deixou o boleto aberto", aindaAberto.status === "aberto" && aindaAberto.paid_amount === null);
  } catch (e) {
    check("a seção 5 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    await prisma.emporioSale.updateMany({ where: { tenant_id: t.id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
    const modelos = [
      "emporioBoleto", "emporioAuditLog", "cashMovement", "emporioSalePayment", "stockMovement", "emporioSaleItem", "emporioCheck", "emporioSale",
      "financialPayment", "financialEntry", "emporioCustomer", "cashSession", "cashRegister", "emporioCounter", "emporioSettings",
      "userEstablishment", "establishment", "bankAccount", "user", "tenantProfile", "tenantFeature",
    ];
    for (let passada = 0; passada < 2; passada += 1) {
      for (const m of modelos) await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: t.id } }).catch(() => undefined);
    }
    await prisma.tenant.delete({ where: { id: t.id } }).catch((e: unknown) => console.log(`  (teardown 5: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
  }
}

async function main() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const H: Dado = await import("@/lib/emporio/data-da-baixa");
  const X: Dado = await import("@/lib/actions/emporio-caixa");
  const F: Dado = await import("@/lib/actions/emporio-financeiro");
  const P: Dado = await import("@/lib/actions/emporio-projecao");
  const D: Dado = await import("@/lib/actions/emporio-despesas");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");

  console.log("🗓️ M127: Módulo 39 (Meu Empório), a data da baixa espelha o extrato do banco\n");

  console.log("1. O helper da data da baixa");
  const hoje = hojeEmBrasilia();
  const agora = new Date();
  const somar = (d: Date, k: number) => new Date(d.getTime() + k * DIA);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const nulo = H.lerDataDaBaixa(null, hoje);
  check("nulo é hoje", nulo.ok && nulo.dia.getTime() === hoje.getTime(), j(nulo));
  check("indefinido é hoje", H.lerDataDaBaixa(undefined, hoje).ok);
  check("hoje menos 31 é aceito", H.lerDataDaBaixa(iso(somar(hoje, -31)), hoje).ok);
  check("hoje mais 31 é aceito", H.lerDataDaBaixa(iso(somar(hoje, 31)), hoje).ok);
  check("aceita um Date (dia de calendário em UTC)", H.lerDataDaBaixa(somar(hoje, 3), hoje).ok);
  const antes = H.lerDataDaBaixa(iso(somar(hoje, -32)), hoje);
  const depois = H.lerDataDaBaixa(iso(somar(hoje, 32)), hoje);
  const br = (d: Date) => `${iso(d).slice(8, 10)}/${iso(d).slice(5, 7)}/${iso(d).slice(0, 4)}`;
  const mensagem = `A data precisa estar entre ${br(somar(hoje, -31))} e ${br(somar(hoje, 31))}.`;
  check("hoje menos 32 é recusado com a janela", !antes.ok && antes.mensagem === mensagem, j(antes));
  check("hoje mais 32 é recusado com a janela", !depois.ok && depois.mensagem === mensagem, j(depois));
  check("2026-02-30 é recusado", !H.lerDataDaBaixa("2026-02-30", hoje).ok);
  check("abc é recusado", !H.lerDataDaBaixa("abc", hoje).ok);
  check("o instante de hoje é agora", H.instanteDaBaixa(hoje, hoje, agora).getTime() === agora.getTime());
  const amanha = somar(hoje, 1);
  check("o instante de outro dia é o meio-dia de Brasília (dia mais 15 h)", H.instanteDaBaixa(amanha, hoje, agora).getTime() === amanha.getTime() + 15 * 3_600_000);
  const fim = H.fimDeHojeEmBrasilia(agora);
  check("fimDeHojeEmBrasilia é o início de amanhã em Brasília (03:00 UTC)", fim.getTime() === amanha.getTime() + 3 * 3_600_000, fim.toISOString());

  console.log("\n2. O saldo da conta só conta movimento com data até hoje");
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M127 ${stamp}`, document: `M127${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M127 dono", email: `m127-${stamp}@teste.local`, password_hash: "x", role: "OWNER" },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const db = prismaForTenant(t.id);
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M127 Loja", kind: "ponto_venda" })).data;
    const conta = await db.bankAccount.create({ data: scoped({ name: `M127 Conta ${stamp}` }) });
    const meioDiaDeAmanha = new Date(amanha.getTime() + 15 * 3_600_000);

    await db.cashMovement.create({ data: scoped({ bank_account_id: conta.id, direction: "entrada", origin: "implantacao", amount: 100, occurred_at: new Date() }) });
    const agendado = await db.cashMovement.create({
      data: scoped({ bank_account_id: conta.id, direction: "entrada", origin: "implantacao", amount: 50, occurred_at: meioDiaDeAmanha, notes: "Agendado de teste" }),
    });

    const saldo = async () => ((await X.saldosDasContas(db)).get(conta.id) ?? 0) / 100;
    check("o saldo da conta é 100 (o de amanhã não entra)", (await saldo()) === 100, String(await saldo()));

    const ext = await F.lerExtratoDaContaAction(db, dono, { bank_account_id: conta.id, de: somar(hoje, -1), ate: somar(hoje, 3) });
    check("o extrato devolve ok", ext.ok, j(ext));
    if (ext.ok) {
      const v = ext.data;
      check("o agendado de 50 está em scheduled", v.scheduled.length === 1 && v.scheduled[0].id === agendado.id && v.scheduled[0].amount === 50, j(v.scheduled));
      check("o agendado não está em lines", !v.lines.some((l: Dado) => l.id === agendado.id), j(v.lines));
      check("o saldo final das linhas é 100", v.closing_balance === 100, String(v.closing_balance));
    }

    const proj = await P.lerFluxoProjetadoAction(db, dono, { days: 30 });
    check("a projeção devolve ok", proj.ok, j(proj));
    if (proj.ok) {
      const dAmanha = iso(amanha);
      const semana = proj.data.weeks.find((w: Dado) => w.de <= dAmanha && dAmanha <= w.ate);
      check("a projeção soma 50 em scheduled da semana de amanhã", semana?.receivables.scheduled === 50, j(semana));
      check("o saldo de abertura da projeção segue 100", proj.data.opening_balance === 100, String(proj.data.opening_balance));
    }

    const conta120 = await D.criarContaAvulsaAction(db, dono, {
      establishment_id: loja.id, description: "Despesa de 120", amount: 120, due_date: new Date(), status: "pending", emporio_other_name: "Avulso",
    });
    check("a despesa de 120 nasce pendente", conta120.ok, j(conta120));
    if (conta120.ok) {
      const pago = await D.pagarDespesasAction(db, dono, { entry_ids: [conta120.data.entry.entry_id], from: { bank_account_id: conta.id } });
      check("pagar 120 por essa conta é recusado por saldo insuficiente", !pago.ok && pago.code === "INSUFFICIENT_CASH", j(pago));
    }

    await db.cashMovement.update({ where: { id: agendado.id }, data: { occurred_at: new Date() } });
    check("o mesmo movimento com a data de hoje entra no saldo (150)", (await saldo()) === 150, String(await saldo()));
  } catch (e) {
    check("a suíte terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    const por = { where: { tenant_id: t.id } };
    const cru = prisma as Dado;
    for (const m of ["cashMovement", "financialPayment"]) {
      await cru[m].deleteMany(por).catch((e: unknown) => console.log(`  (teardown ${m}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.tenant.delete({ where: { id: t.id } }).catch((e: unknown) => console.log(`  (teardown: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
  }

  await secao3();
  await secao4();
  await secao5();
  await prisma.$disconnect();
  console.log(`\nChecagens: ${total}`);
  console.log(falhas === 0 ? "\n✅ M127 (Módulo 39, Empório): data da baixa passou." : `\n❌ M127 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
