import "./_env-local";
import { papelDeFixture, vincularTodas } from "./_emporio-papel";
import { AsyncLocalStorage } from "node:async_hooks";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();
// A seção de rotas usa o escopo de requisição do Next: o AsyncLocalStorage real precisa existir ANTES de carregar o Next (ver m23).
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório), F3b: cartão, cheque, transferência entre caixas e
 * conferência da gaveta.
 * Roda: `npm run test:m82`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F3b: contrato", Q88 a
 * Q95 e o aceite da F3b), sem ler a implementação. Chama as actions direto e,
 * no fim, os route handlers com Bearer. Cada seção roda isolada: se uma
 * quebrar, as outras seguem e a quebra vira falha registrada.
 *
 * O que o contrato calava e esta suíte ASSUME:
 * - as actions novas (regra de cartão, cheque, transferência, conferência)
 *   podem estar em `emporio-caixa` OU em `emporio-vendas`: procura nos dois;
 * - `kind` do pagamento de cartão é o valor do enum `CardKind`: `debito`,
 *   `credito_vista`, `credito_parcelado`; no parcelado `installments` fica no
 *   próprio pagamento; no cheque, `check: { number, bank, good_for }` com
 *   `good_for` como Date (a convenção de `sold_at` e `due_date`); a 1ª
 *   tentativa, com string "AAAA-MM-DD", foi recusada pelo servidor;
 * - `lerCaixaAction` traz `card_receivables` como lista (ou `{ items }`) de
 *   objetos com `net_amount` (ou `amount`/`total`), e o saldo da conta em
 *   `balance`/`saldo` já contando as parcelas que caíram;
 * - a recusa do `chequeVoltouAction` sem motivo nomeia `reason` ou
 *   `return_reason`;
 * - o usuário sem vínculo com a loja de origem leva 403 ou 404;
 * - na rota, criar devolve 200 ou 201 (a repetição idempotente também), e o
 *   DELETE devolve 200 ou 204;
 * - a conferência igual ao esperado pode gravar a linha de conferência, mas
 *   nunca movimento de caixa nem lançamento.
 */

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;
type R = { ok: true; data: Dado } | { ok: false; code: string; message: string; status: number; field?: string };
type Role = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";
type Ator = { id: string; role: Role };
type Acao = (...args: unknown[]) => Promise<R>;

const perto = (a: unknown, b: number) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < 0.005;
const recusa = (r: R, code: string, status: number, field?: string) =>
  !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);
const negada = (r: R) => !r.ok && (r.status === 403 || r.status === 404);
const j = (x: unknown) => JSON.stringify(x);
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));
const DIA = 86_400_000;

// Datas: a spec compara `expected_on` com o dia de hoje em Brasília.
const brDate = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const somaDias = (s: string, dias: number): string => new Date(Date.parse(`${s}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
const diaDe = (d: Date): string => d.toISOString().slice(0, 10); // coluna @db.Date volta como meia-noite UTC

console.log("💳 M82: Módulo 39 (Meu Empório), F3b: cartão, cheque, transferência entre caixas e conferência\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const caminhoCatalogo = "@/lib/actions/emporio-catalogo";
  const caminhoEstoque = "@/lib/actions/emporio-estoque";
  const caminhoVendas = "@/lib/actions/emporio-vendas";
  const caminhoCaixa = "@/lib/actions/emporio-caixa";
  const C = (await import(caminhoCatalogo)) as Record<string, Acao>;
  const E = (await import(caminhoEstoque)) as Record<string, Acao>;
  const V = (await import(caminhoVendas)) as Record<string, Acao>;
  const X = (await import(caminhoCaixa)) as Record<string, Acao>;

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M82 ${rotulo} ${stamp}`, document: `M82${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
      });
      tenantIds.push(t.id);
      const mkUser = async (suf: string, role: Role): Promise<Ator> => {
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M82 ${rotulo} ${suf}`, email: `m82-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role, ...papelDeFixture(role) },
        });
        return { id: u.id, role };
      };
      return { t, mkUser };
    };
    const TA = await mkTenant("A");
    const TB = await mkTenant("B");
    const owner = await TA.mkUser("own", "OWNER");
    const admin = await TA.mkUser("adm", "ADMIN");
    const op = await TA.mkUser("op", "OPERADOR");
    const visu = await TA.mkUser("vis", "VISUALIZADOR");
    const userO = await TA.mkUser("uo", "OPERADOR"); // vinculado só à Loja 3
    const ownerB = await TB.mkUser("own", "OWNER");
    const db = prismaForTenant(TA.t.id);
    const dbB = prismaForTenant(TB.t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M82 categoria" }) });

    const dados = (r: R): Dado => (r.ok ? r.data : undefined);
    const lista = (d: Dado): Dado[] => (Array.isArray(d) ? d : (d?.items ?? []));
    const ausente = (nome: string): R => ({ ok: false, code: "ACTION_AUSENTE", message: `action ausente: ${nome}`, status: 0 });
    const chamarEm = async (mods: Record<string, Acao>[], cliente: Dado, nome: string, ...args: unknown[]): Promise<R> => {
      for (const m of mods) {
        const f = m[nome];
        if (typeof f === "function") return f(cliente, ...args);
      }
      return ausente(nome);
    };
    const cc = (nome: string, ...a: unknown[]) => chamarEm([C], db, nome, ...a);
    const ee = (nome: string, ...a: unknown[]) => chamarEm([E], db, nome, ...a);
    const vv = (nome: string, ...a: unknown[]) => chamarEm([V, X], db, nome, ...a);
    const xx = (nome: string, ...a: unknown[]) => chamarEm([X, V], db, nome, ...a);

    // ---- Lojas
    const rL1 = await cc("criarEstabelecimentoAction", owner, { name: "M82 Loja 1", kind: "ponto_venda" });
    const rL2 = await cc("criarEstabelecimentoAction", owner, { name: "M82 Loja 2", kind: "ponto_venda" });
    const rL3 = await cc("criarEstabelecimentoAction", owner, { name: "M82 Loja 3", kind: "ponto_venda" });
    const L1 = dados(rL1);
    const L2 = dados(rL2);
    const L3 = dados(rL3);
    if (!L1 || !L2 || !L3) throw new Error(`não criou as lojas: ${j([rL1, rL2, rL3])}`);
    await vincularTodas(prisma, TA.t.id, [op.id], [L1.id, L2.id, L3.id]); // F6b: Vendedor só vê as lojas que tem

    // ---- Produto de preço redondo (10 por quilo) para os totais saírem exatos
    const rP = await cc("criarProdutoEmporioAction", op, { name: "M82 Produto", category_id: cat.id, base_unit: "quilograma" });
    const prod = dados(rP);
    if (!prod) throw new Error(`produto: ${j(rP)}`);
    const rPr = await cc("criarApresentacaoAction", op, prod.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!rPr.ok) throw new Error(`apresentação: ${j(rPr)}`);
    const presId = rPr.data.id as string;
    const rPreco = await cc("definirPrecoAction", admin, { establishment_id: L1.id, presentation_id: presId, price: 10 });
    if (!rPreco.ok) throw new Error(`preço: ${j(rPreco)}`);
    const rImp = await ee("implantarEstoqueAction", op, { establishment_id: L1.id, emporio_product_id: prod.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!rImp.ok) throw new Error(`implantar: ${j(rImp)}`);
    const item = (qty: number) => ({ emporio_product_id: prod.id, presentation_id: presId, quantity: qty });

    let chaveSeq = 0;
    const chave = (p: string) => `m82-${p}-${stamp}-${(chaveSeq += 1)}`;
    const vender = (ator: Ator, qty: number, payments: Dado[], over: Dado = {}) =>
      vv("venderAction", ator, { operation_key: chave("v"), establishment_id: L1.id, items: [item(qty)], payments, ...over });
    const saleId = (r: R): string => {
      const d = dados(r);
      return d?.id ?? d?.sale_id ?? "";
    };
    const contato = async (nome: string) => (await db.contact.create({ data: scoped({ name: `M82 ${nome} ${stamp}` }) })).id;
    const mkConta = async (nome: string): Promise<string> => {
      const r = await xx("criarContaAction", admin, { name: `M82 ${nome} ${stamp}`, bank: "Banco" });
      if (!r.ok) throw new Error(`conta ${nome}: ${j(r)}`);
      return r.data.id as string;
    };

    // ---- Consultas independentes ao banco
    const chk = (id?: string) => db.emporioCheck.findFirst({ where: { id: id ?? "inexistente" } });
    // `good_for` segue a convenção de `sold_at` e `due_date` nas actions: Date (meio-dia UTC, o mesmo dia em qualquer fuso)
    const bomPara = (dia: string) => new Date(`${dia}T12:00:00Z`);
    const dinheiro = (amount: number) => ({ kind: "dinheiro", amount });
    const cartao = (kind: string, amount: number, installments?: number) => ({ kind, amount, ...(installments === undefined ? {} : { installments }) });
    const receitaDe = (id: string) => db.financialEntry.findMany({ where: { related_module: "emporio", related_id: id, entry_type: "income" } });
    const taxaDe = (id: string) => db.financialEntry.findMany({ where: { related_module: "emporio", related_id: id, entry_type: "expense", category: "Taxas de cartão" } });
    const pagamentosDe = (entryId: string) => db.financialPayment.findMany({ where: { entry_id: entryId } });
    const pago = async (entryId: string) => (await pagamentosDe(entryId)).reduce((s, p) => s + n(p.amount), 0);
    const caixaDa = async (where: Dado) => {
      const ms = await db.cashMovement.findMany({ where });
      return ms.reduce((s, m) => s + (m.direction === "entrada" ? n(m.amount) : -n(m.amount)), 0);
    };
    const saldoGaveta = (est: string) => caixaDa({ establishment_id: est });
    const hoje = () => brDate(new Date());
    // saldo da conta (Q90): movimentos + parcelas não canceladas de hoje para trás
    const saldoConta = async (conta: string) => {
      const ps = await db.cardReceivable.findMany({ where: { bank_account_id: conta, canceled_at: null } });
      const h = hoje();
      return (await caixaDa({ bank_account_id: conta })) + ps.filter((p) => diaDe(p.expected_on) <= h).reduce((s, p) => s + n(p.net_amount), 0);
    };
    const aReceberDb = async (extra: Dado = {}) => {
      const ps = await db.cardReceivable.findMany({ where: { canceled_at: null, ...extra } });
      const h = hoje();
      return ps.filter((p) => diaDe(p.expected_on) > h).reduce((s, p) => s + n(p.net_amount), 0);
    };
    const achar = (d: Dado, campo: string, id: string): number => {
      if (Array.isArray(d)) {
        for (const x of d) {
          const r = achar(x, campo, id);
          if (!Number.isNaN(r)) return r;
        }
      } else if (d && typeof d === "object") {
        if (d[campo] === id) {
          const v = d.balance ?? d.saldo;
          if (typeof v === "number") return v;
        }
        for (const v of Object.values(d)) {
          const r = achar(v, campo, id);
          if (!Number.isNaN(r)) return r;
        }
      }
      return NaN;
    };
    const somaReceberCaixa = (caixa: Dado): number =>
      lista(caixa?.card_receivables).reduce((s: number, x: Dado) => {
        const v = [x?.net_amount, x?.amount, x?.total].map(n).find((k) => !Number.isNaN(k));
        return s + (v ?? 0);
      }, 0);
    const dividaDe = (lst: Dado[], contact: string): number => {
      const l = lst.find((x) => x.contact_id === contact);
      if (!l) return 0;
      for (const k of ["owed", "due", "devido", "balance", "open_amount", "amount_due"]) if (typeof l[k] === "number") return l[k];
      return NaN;
    };
    const rodar = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        check(`a seção "${nome}" quebrou`, false, e instanceof Error ? e.message : String(e));
      }
    };

    // ---- Contas e regras de cartão (montagem comum)
    const CARD = await mkConta("Cartão");
    const CHQ = await mkConta("Cheque");
    const TR = await mkConta("Transferência");
    const regra = (ator: Ator, kind: string, fee_pct: number, days: number, estab: string = L1.id, conta: string = CARD) =>
      xx("definirRegraCartaoAction", ator, { establishment_id: estab, kind, fee_pct, days, bank_account_id: conta });

    // ---------------------------------------------------------------- 1
    await rodar("regra de cartão", async () => {
      console.log("1. Regra do cartão por loja e forma (Q89)");
      check("OPERADOR define regra: 403", recusa(await regra(op, "credito_vista", 3, 30), "FORBIDDEN", 403));
      check("VISUALIZADOR define regra: 403", recusa(await regra(visu, "credito_vista", 3, 30), "FORBIDDEN", 403));
      const rA = await regra(admin, "credito_vista", 3, 30);
      check("ADMIN define crédito à vista (3% e 30 dias)", rA.ok, j(rA));
      check("OWNER define crédito parcelado (3% e 20 dias)", (await regra(owner, "credito_parcelado", 3, 20)).ok);
      check("taxa acima de 100: 422 fee_pct", recusa(await regra(admin, "debito", 100.01, 1), "VALIDATION_ERROR", 422, "fee_pct"));
      check("prazo acima de 120 dias: 422 days", recusa(await regra(admin, "debito", 2, 121), "VALIDATION_ERROR", 422, "days"));
      check("taxa negativa: 422 fee_pct", recusa(await regra(admin, "debito", -1, 1), "VALIDATION_ERROR", 422, "fee_pct"));
      check("as recusas não gravaram regra de débito", (await db.cardFeeRule.count({ where: { establishment_id: L1.id, kind: "debito" } })) === 0);
      check("taxa 100 e prazo 120 são os limites aceitos", (await regra(admin, "debito", 100, 120, L3.id)).ok);
      const rEdit = await regra(admin, "credito_vista", 4, 25);
      const regras = await db.cardFeeRule.findMany({ where: { establishment_id: L1.id, kind: "credito_vista" } });
      check("PUT de novo SUBSTITUI (uma regra só por loja e forma, com os valores novos)", rEdit.ok && regras.length === 1 && perto(n(regras[0].fee_pct), 4) && regras[0].days === 25, j(regras));
      check("volta a 3% e 30 dias", (await regra(admin, "credito_vista", 3, 30)).ok);
      const ls = await xx("listarRegrasCartaoAction", admin, L1.id);
      const lsAlt = ls.ok ? ls : await xx("listarRegrasCartaoAction", admin);
      check("a lista traz as regras da loja", lista(dados(lsAlt)).filter((r) => r.kind === "credito_vista" || r.kind === "credito_parcelado").length >= 2, j(lsAlt));
      const rTemp = await regra(admin, "credito_vista", 1, 1, L3.id);
      const idTemp = dados(rTemp)?.id ?? (await db.cardFeeRule.findFirst({ where: { establishment_id: L3.id, kind: "credito_vista" } }))?.id ?? "";
      check("regra temporária criada", rTemp.ok && !!idTemp, j(rTemp));
      check("OPERADOR remove regra: 403", recusa(await xx("removerRegraCartaoAction", op, idTemp), "FORBIDDEN", 403));
      check("ADMIN remove regra", (await xx("removerRegraCartaoAction", admin, idTemp)).ok && (await db.cardFeeRule.count({ where: { id: idTemp } })) === 0);
    });

    // ---------------------------------------------------------------- 2
    await rodar("aceite do cartão", async () => {
      console.log("\n2. Aceite: R$ 100 no crédito à vista, 3% e 30 dias (Q88, Q90)");
      const saldoAntes = await saldoConta(CARD);
      const recAntes = await aReceberDb();
      const rS = await vender(op, 10, [cartao("credito_vista", 100)]);
      check("OPERADOR vende no crédito à vista", rS.ok, j(rS));
      const S = saleId(rS);
      const rec = await receitaDe(S);
      check("UM lançamento de receita de R$ 100, pago por inteiro", rec.length === 1 && perto(n(rec[0].amount), 100) && rec[0].status === "paid" && perto(await pago(rec[0].id), 100), j(rec));
      const pgs = rec[0] ? await pagamentosDe(rec[0].id) : [];
      check("o pagamento cheio é método cartao", pgs.length === 1 && pgs[0].method === "cartao", j(pgs));
      const tx = await taxaDe(S);
      check("UMA despesa 'Taxas de cartão' de R$ 3, paga, emporio, ligada à venda", tx.length === 1 && perto(n(tx[0].amount), 3) && tx[0].status === "paid" && perto(await pago(tx[0].id), 3), j(tx));
      check("nenhum CashMovement da venda (cartão não passa pela gaveta)", (await db.cashMovement.count({ where: { sale_id: S } })) === 0);
      const rcs = await db.cardReceivable.findMany({ where: { sale_id: S } });
      check("UMA parcela líquida de 97 (bruto 100), 1 de 1, na conta da regra e na loja", rcs.length === 1 && perto(n(rcs[0].net_amount), 97) && perto(n(rcs[0].gross_amount), 100) && rcs[0].installment === 1 && rcs[0].installments === 1 && rcs[0].bank_account_id === CARD && rcs[0].establishment_id === L1.id, j(rcs));
      check("expected_on = hoje + 30 (Brasília)", rcs[0] && diaDe(rcs[0].expected_on) === somaDias(hoje(), 30), `${rcs[0] && diaDe(rcs[0].expected_on)} contra ${somaDias(hoje(), 30)}`);
      const pay = await db.emporioSalePayment.findMany({ where: { sale_id: S } });
      check("o pagamento da venda grava a regra do momento: 3% e R$ 3", pay.length === 1 && perto(n(pay[0].fee_pct), 3) && perto(n(pay[0].fee_amount), 3), j(pay));
      const caixa = dados(await xx("lerCaixaAction", admin));
      check("o caixa mostra 97 a mais em 'a receber do cartão'", perto(somaReceberCaixa(caixa) - recAntes, 97) && perto((await aReceberDb()) - recAntes, 97), `caixa ${somaReceberCaixa(caixa)}, antes ${recAntes}`);
      check("a conta NÃO ganhou os 97 ainda", perto((await saldoConta(CARD)) - saldoAntes, 0) && perto(achar(caixa, "bank_account_id", CARD), saldoAntes), `${achar(caixa, "bank_account_id", CARD)} contra ${saldoAntes}`);

      // baixa na data: venda 40 dias atrás, a parcela caiu há 10 dias
      const sold = new Date(Date.now() - 40 * DIA);
      const recAntes2 = await aReceberDb();
      const saldoAntes2 = await saldoConta(CARD);
      const rP = await vender(op, 10, [cartao("credito_vista", 100)], { sold_at: sold });
      check("venda 40 dias atrás no crédito à vista", rP.ok, j(rP));
      const rcP = await db.cardReceivable.findMany({ where: { sale_id: saleId(rP) } });
      check("expected_on = data da venda + 30 (já no passado)", rcP.length === 1 && diaDe(rcP[0].expected_on) === somaDias(brDate(sold), 30), j(rcP));
      const caixa2 = dados(await xx("lerCaixaAction", admin));
      check("a parcela já conta no saldo da conta (+97)", perto(achar(caixa2, "bank_account_id", CARD) - saldoAntes2, 97), `${achar(caixa2, "bank_account_id", CARD)} contra ${saldoAntes2}`);
      check("e some do a receber", perto((await aReceberDb()) - recAntes2, 0) && perto(somaReceberCaixa(caixa2) - recAntes2, 0));

      // a regra do momento: mudar a regra não muda a venda passada
      check("muda a regra para 5%", (await regra(admin, "credito_vista", 5, 30)).ok);
      const payDepois = await db.emporioSalePayment.findMany({ where: { sale_id: S } });
      const rcDepois = await db.cardReceivable.findMany({ where: { sale_id: S } });
      const txDepois = await taxaDe(S);
      check("a venda passada segue com 3%, R$ 3 e parcela de 97", perto(n(payDepois[0]?.fee_pct), 3) && perto(n(payDepois[0]?.fee_amount), 3) && perto(n(rcDepois[0]?.net_amount), 97) && perto(n(txDepois[0]?.amount), 3));
      const rN = await vender(op, 10, [cartao("credito_vista", 100)]);
      const txN = await taxaDe(saleId(rN));
      check("a venda nova usa o 5%: taxa de R$ 5", rN.ok && txN.length === 1 && perto(n(txN[0].amount), 5), j(txN));
      check("restaura 3% e 30 dias", (await regra(admin, "credito_vista", 3, 30)).ok);
    });

    // ---------------------------------------------------------------- 3
    await rodar("parcelado", async () => {
      console.log("\n3. Parcelado: centavo na primeira e datas a cada 30 dias");
      const nVendas = () => db.emporioSale.count();
      const nRec = () => db.cardReceivable.count();
      const v0 = await nVendas();
      const r0 = await nRec();
      check("1 parcela: 422 payments", recusa(await vender(op, 10, [cartao("credito_parcelado", 100, 1)]), "VALIDATION_ERROR", 422, "payments"));
      check("13 parcelas: 422 payments", recusa(await vender(op, 10, [cartao("credito_parcelado", 100, 13)]), "VALIDATION_ERROR", 422, "payments"));
      check("as recusas não gravaram nada", (await nVendas()) === v0 && (await nRec()) === r0);
      const rS = await vender(op, 10, [cartao("credito_parcelado", 100, 3)]);
      check("3x de R$ 100 com 3%", rS.ok, j(rS));
      const S = saleId(rS);
      const rcs = (await db.cardReceivable.findMany({ where: { sale_id: S } })).sort((a, b) => a.installment - b.installment);
      check("três parcelas, 1/3, 2/3 e 3/3", rcs.length === 3 && rcs.every((p, i) => p.installment === i + 1 && p.installments === 3), j(rcs));
      check("bruto 33,34 / 33,33 / 33,33 (centavo na primeira)", rcs.length === 3 && perto(n(rcs[0].gross_amount), 33.34) && perto(n(rcs[1].gross_amount), 33.33) && perto(n(rcs[2].gross_amount), 33.33), j(rcs.map((p) => p.gross_amount)));
      check("líquido 32,34 / 32,33 / 32,33 (soma 97,00)", rcs.length === 3 && perto(n(rcs[0].net_amount), 32.34) && perto(n(rcs[1].net_amount), 32.33) && perto(n(rcs[2].net_amount), 32.33), j(rcs.map((p) => p.net_amount)));
      const h = hoje();
      check("datas: +20, +50 e +80 (o prazo da regra e depois 30 em 30)", rcs.length === 3 && diaDe(rcs[0].expected_on) === somaDias(h, 20) && diaDe(rcs[1].expected_on) === somaDias(h, 50) && diaDe(rcs[2].expected_on) === somaDias(h, 80), j(rcs.map((p) => diaDe(p.expected_on))));
      const tx = await taxaDe(S);
      const rec = await receitaDe(S);
      check("uma receita de 100 e uma taxa de 3,00", rec.length === 1 && perto(n(rec[0].amount), 100) && tx.length === 1 && perto(n(tx[0].amount), 3));
      const pay = await db.emporioSalePayment.findMany({ where: { sale_id: S } });
      check("o pagamento grava installments 3, 3% e R$ 3", pay.length === 1 && pay[0].installments === 3 && perto(n(pay[0].fee_pct), 3) && perto(n(pay[0].fee_amount), 3), j(pay));
      check("nenhum CashMovement da venda", (await db.cashMovement.count({ where: { sale_id: S } })) === 0);
    });

    // ---------------------------------------------------------------- 4
    await rodar("débito e sem regra", async () => {
      console.log("\n4. Débito e a forma sem regra");
      const v0 = await db.emporioSale.count();
      const e0 = await db.financialEntry.count();
      const r0 = await db.cardReceivable.count();
      const c0 = await db.cashMovement.count();
      check("débito sem regra cadastrada: 422 payments", recusa(await vender(op, 5, [cartao("debito", 50)]), "VALIDATION_ERROR", 422, "payments"));
      check("nada foi gravado (venda, lançamento, parcela, caixa)", (await db.emporioSale.count()) === v0 && (await db.financialEntry.count()) === e0 && (await db.cardReceivable.count()) === r0 && (await db.cashMovement.count()) === c0);
      check("define débito: 2% e 1 dia", (await regra(admin, "debito", 2, 1)).ok);
      const rS = await vender(op, 5, [cartao("debito", 50)]);
      check("venda de R$ 50 no débito", rS.ok, j(rS));
      const S = saleId(rS);
      const rcs = await db.cardReceivable.findMany({ where: { sale_id: S } });
      check("uma parcela líquida de 49,00 em hoje + 1", rcs.length === 1 && perto(n(rcs[0].net_amount), 49) && perto(n(rcs[0].gross_amount), 50) && diaDe(rcs[0].expected_on) === somaDias(hoje(), 1), j(rcs));
      const tx = await taxaDe(S);
      check("taxa de R$ 1,00", tx.length === 1 && perto(n(tx[0].amount), 1));
    });

    // ---------------------------------------------------------------- 5
    let chequeCompensadoSale = "";
    let chequeId1 = "";
    await rodar("cheque", async () => {
      console.log("\n5. Cheque: recebido, depositado, compensado, devolvido (Q91)");
      const hojeStr = hoje();
      const cheque = (amount: number, over: Dado = {}) => ({ kind: "cheque", amount, check: { number: "1234", bank: "Sicredi", good_for: bomPara(somaDias(hojeStr, 15)), ...over } });
      const C1 = await contato("Cliente cheque");
      const v0 = await db.emporioSale.count();
      check("sem contact_id: 422 contact_id", recusa(await vender(op, 10, [cheque(100)]), "VALIDATION_ERROR", 422, "contact_id"));
      for (const campo of ["number", "bank", "good_for"]) {
        const ck = { number: "1234", bank: "Sicredi", good_for: bomPara(somaDias(hojeStr, 15)) } as Dado;
        delete ck[campo];
        check(`cheque sem ${campo}: 422 payments`, recusa(await vender(op, 10, [{ kind: "cheque", amount: 100, check: ck }], { contact_id: C1 }), "VALIDATION_ERROR", 422, "payments"));
      }
      check("cheque sem o objeto check: 422 payments", recusa(await vender(op, 10, [{ kind: "cheque", amount: 100 }], { contact_id: C1 }), "VALIDATION_ERROR", 422, "payments"));
      check("as recusas não gravaram venda", (await db.emporioSale.count()) === v0);

      const g0 = await saldoConta(CHQ);
      const rS = await vender(op, 10, [cheque(100)], { contact_id: C1 });
      check("venda de R$ 100 no cheque", rS.ok, j(rS));
      const S = saleId(rS);
      chequeCompensadoSale = S;
      const rec = await receitaDe(S);
      const pgs = rec[0] ? await pagamentosDe(rec[0].id) : [];
      check("o pagamento do cheque está no lançamento (100, método cheque) e ele fica paid", rec.length === 1 && pgs.length === 1 && pgs[0].method === "cheque" && perto(n(pgs[0].amount), 100) && rec[0].status === "paid", j([rec, pgs]));
      check("nada no caixa (sem CashMovement)", (await db.cashMovement.count({ where: { sale_id: S } })) === 0);
      const ch = await db.emporioCheck.findFirst({ where: { sale_id: S } });
      chequeId1 = ch?.id ?? "";
      check("o cheque nasce recebido, do cliente, com número, banco, bom para e valor", !!ch && ch.status === "recebido" && ch.contact_id === C1 && ch.number === "1234" && ch.bank === "Sicredi" && diaDe(ch.good_for) === somaDias(hojeStr, 15) && perto(n(ch.amount), 100) && ch.financial_payment_id === pgs[0]?.id, j(ch));
      const caixa = dados(await xx("lerCaixaAction", admin));
      check("o cheque aparece na carteira do caixa", j(caixa?.checks ?? null).includes(chequeId1), j(caixa?.checks));
      const lc = await xx("listarChequesAction", admin);
      check("listarChequesAction traz o cheque", lista(dados(lc)).some((c) => c.id === chequeId1), j(lc));

      check("VISUALIZADOR deposita: 403", recusa(await xx("depositarChequeAction", visu, chequeId1, { bank_account_id: CHQ }), "FORBIDDEN", 403));
      check("OPERADOR com acesso deposita", (await xx("depositarChequeAction", op, chequeId1, { bank_account_id: CHQ })).ok);
      const chD = await chk(chequeId1);
      check("depositado: conta escolhida, deposited_at preenchido", chD?.status === "depositado" && chD.bank_account_id === CHQ && !!chD.deposited_at, j(chD));
      check("depositar não mexe no caixa", (await db.cashMovement.count({ where: { check_id: chequeId1 } })) === 0 && perto(await saldoConta(CHQ), g0));
      check("depositar de novo: 409 CHECK_STATUS", recusa(await xx("depositarChequeAction", op, chequeId1, { bank_account_id: CHQ }), "CHECK_STATUS", 409));
      check("OPERADOR marca compensou: 403", recusa(await xx("compensarChequeAction", op, chequeId1), "FORBIDDEN", 403));
      check("ADMIN marca compensou", (await xx("compensarChequeAction", admin, chequeId1)).ok);
      const chC = await chk(chequeId1);
      const mvC = await db.cashMovement.findMany({ where: { check_id: chequeId1 } });
      check("compensado: cleared_at e UMA entrada de 100 na conta do depósito, origem cheque_compensado", chC?.status === "compensado" && !!chC.cleared_at && mvC.length === 1 && mvC[0].direction === "entrada" && perto(n(mvC[0].amount), 100) && mvC[0].bank_account_id === CHQ && mvC[0].origin === "cheque_compensado", j([chC, mvC]));
      check("a conta ganhou 100", perto((await saldoConta(CHQ)) - g0, 100));
      check("compensar de novo: 409 CHECK_STATUS", recusa(await xx("compensarChequeAction", admin, chequeId1), "CHECK_STATUS", 409));
      check("compensado não volta: 409 CHECK_STATUS", recusa(await xx("chequeVoltouAction", admin, chequeId1, { reason: "x" }), "CHECK_STATUS", 409));
      check("compensado não deposita: 409 CHECK_STATUS", recusa(await xx("depositarChequeAction", op, chequeId1, { bank_account_id: CHQ }), "CHECK_STATUS", 409));

      // fora da ordem: compensar um recebido
      const rS2 = await vender(op, 10, [cheque(100, { number: "2222" })], { contact_id: C1 });
      const ch2 = await db.emporioCheck.findFirst({ where: { sale_id: saleId(rS2) } });
      check("compensar um cheque só recebido: 409 CHECK_STATUS", recusa(await xx("compensarChequeAction", admin, ch2?.id), "CHECK_STATUS", 409));
      check("e nada mudou no cheque nem no caixa", (await chk(ch2?.id))?.status === "recebido" && (await db.cashMovement.count({ where: { check_id: ch2?.id } })) === 0);

      // voltou: a dívida reabre
      const C2 = await contato("Cliente cheque voltou");
      const rS3 = await vender(op, 10, [cheque(100, { number: "3333" })], { contact_id: C2 });
      const S3 = saleId(rS3);
      const ch3 = await db.emporioCheck.findFirst({ where: { sale_id: S3 } });
      const en3 = (await receitaDe(S3))[0];
      check("antes de voltar: lançamento paid e o cliente não deve", en3?.status === "paid" && dividaDe(lista(dados(await xx("listarFiadoAction", op))), C2) === 0);
      check("OPERADOR marca que voltou: 403", recusa(await xx("chequeVoltouAction", op, ch3?.id, { reason: "sem fundos" }), "FORBIDDEN", 403));
      const rSem = await xx("chequeVoltouAction", admin, ch3?.id, { reason: "" });
      check("voltou sem motivo: 422 (reason)", !rSem.ok && rSem.status === 422 && (rSem.field === "reason" || rSem.field === "return_reason"), j(rSem));
      check("ADMIN marca que voltou", (await xx("chequeVoltouAction", admin, ch3?.id, { reason: "sem fundos" })).ok);
      const ch3b = await chk(ch3?.id);
      check("devolvido, com motivo e data", ch3b?.status === "devolvido" && ch3b.return_reason === "sem fundos" && !!ch3b.returned_at, j(ch3b));
      const en3b = await db.financialEntry.findUnique({ where: { id: en3.id } });
      check("o pagamento do cheque SAIU do lançamento e ele voltou a pending", (await pagamentosDe(en3.id)).length === 0 && en3b?.status === "pending", j(en3b));
      const fi = lista(dados(await xx("listarFiadoAction", op)));
      check("o cliente volta a dever 100 no fiado", perto(dividaDe(fi, C2), 100), j(fi.filter((x) => x.contact_id === C2)));
      check("voltar não mexeu no caixa", (await db.cashMovement.count({ where: { check_id: ch3?.id } })) === 0);
      const rRec = await xx("receberFiadoAction", op, { operation_key: chave("rec"), contact_id: C2, establishment_id: L1.id, amount: 100, kind: "dinheiro" });
      check("receber esse fiado em dinheiro funciona", rRec.ok, j(rRec));
      check("o lançamento volta a paid e a dívida zera", (await db.financialEntry.findUnique({ where: { id: en3.id } }))?.status === "paid" && dividaDe(lista(dados(await xx("listarFiadoAction", op))), C2) === 0);

      // voltou depois de depositado
      const rS4 = await vender(op, 10, [cheque(100, { number: "4444" })], { contact_id: C2 });
      const ch4 = await db.emporioCheck.findFirst({ where: { sale_id: saleId(rS4) } });
      await xx("depositarChequeAction", op, ch4?.id, { bank_account_id: CHQ });
      check("cheque depositado também pode voltar", (await xx("chequeVoltouAction", owner, ch4?.id, { reason: "devolvido pelo banco" })).ok && (await chk(ch4?.id))?.status === "devolvido");
      check("devolvido não volta de novo: 409 CHECK_STATUS", recusa(await xx("chequeVoltouAction", owner, ch4?.id, { reason: "x" }), "CHECK_STATUS", 409));
    });

    // ---------------------------------------------------------------- 6
    const TRANSF_KEY = chave("transf");
    let transferAId = "";
    let transferCodeOk = false;
    await rodar("transferência", async () => {
      console.log("\n6. Transferência entre caixas (Q92)");
      check("vincular userO só à Loja 3", (await cc("definirVinculosAction", owner, L3.id, [userO.id])).ok);
      check("saldo inicial da gaveta da Loja 2 (500)", (await xx("saldoInicialCaixaAction", op, { establishment_id: L2.id, amount: 500 })).ok);
      check("saldo inicial da gaveta da Loja 3 (100)", (await xx("saldoInicialCaixaAction", owner, { establishment_id: L3.id, amount: 100 })).ok);
      check("saldo inicial da conta de transferência (1000)", (await xx("saldoInicialCaixaAction", admin, { bank_account_id: TR, amount: 1000 })).ok);
      const e0 = await db.financialEntry.count();
      const pagos0 = await db.financialPayment.count();

      const rT = await xx("transferirCaixaAction", op, { operation_key: TRANSF_KEY, from: { establishment_id: L2.id }, to: { bank_account_id: TR }, amount: 200 });
      transferCodeOk = rT.ok;
      check("OPERADOR leva R$ 200 da gaveta da Loja 2 ao banco", rT.ok, j(rT));
      const tr = await db.cashTransfer.findFirst({ where: { operation_key: TRANSF_KEY } });
      transferAId = tr?.id ?? "";
      check("uma transferência de 200 gravada", !!tr && perto(n(tr.amount), 200), j(tr));
      const mvs = await db.cashMovement.findMany({ where: { cash_transfer_id: tr?.id ?? "x" } });
      check("dois movimentos ligados, origem transferencia: saída na gaveta, entrada na conta", mvs.length === 2 && mvs.every((m) => m.origin === "transferencia" && perto(n(m.amount), 200)) && mvs.some((m) => m.direction === "saida" && m.establishment_id === L2.id) && mvs.some((m) => m.direction === "entrada" && m.bank_account_id === TR), j(mvs));
      check("a gaveta caiu para 300 e a conta subiu para 1200", perto(await saldoGaveta(L2.id), 300) && perto(await saldoConta(TR), 1200));
      const caixa = dados(await xx("lerCaixaAction", admin));
      check("o caixa mostra os dois saldos", perto(achar(caixa, "establishment_id", L2.id), 300) && perto(achar(caixa, "bank_account_id", TR), 1200), `${achar(caixa, "establishment_id", L2.id)} e ${achar(caixa, "bank_account_id", TR)}`);
      const rT2 = await xx("transferirCaixaAction", op, { operation_key: TRANSF_KEY, from: { establishment_id: L2.id }, to: { bank_account_id: TR }, amount: 200 });
      check("mesma chave: devolve o gravado, sem duplicar", rT2.ok && (await db.cashTransfer.count({ where: { operation_key: TRANSF_KEY } })) === 1 && (await db.cashMovement.count({ where: { cash_transfer_id: tr?.id ?? "x" } })) === 2 && perto(await saldoGaveta(L2.id), 300), j(rT2));

      const c0 = await db.cashMovement.count();
      check("mais do que tem (300,01 de 300): 409 INSUFFICIENT_CASH em amount", recusa(await xx("transferirCaixaAction", op, { operation_key: chave("transf"), from: { establishment_id: L2.id }, to: { bank_account_id: TR }, amount: 300.01 }), "INSUFFICIENT_CASH", 409, "amount"));
      check("a recusa não gravou movimento", (await db.cashMovement.count()) === c0);
      check("mesma gaveta na origem e no destino: 422 to", recusa(await xx("transferirCaixaAction", op, { operation_key: chave("transf"), from: { establishment_id: L2.id }, to: { establishment_id: L2.id }, amount: 10 }), "VALIDATION_ERROR", 422, "to"));
      check("mesma conta na origem e no destino: 422 to", recusa(await xx("transferirCaixaAction", admin, { operation_key: chave("transf"), from: { bank_account_id: TR }, to: { bank_account_id: TR }, amount: 10 }), "VALIDATION_ERROR", 422, "to"));
      check("valor zero: 422 amount", recusa(await xx("transferirCaixaAction", op, { operation_key: chave("transf"), from: { establishment_id: L2.id }, to: { bank_account_id: TR }, amount: 0 }), "VALIDATION_ERROR", 422, "amount"));
      check("OPERADOR tirando de CONTA: 403", recusa(await xx("transferirCaixaAction", op, { operation_key: chave("transf"), from: { bank_account_id: TR }, to: { establishment_id: L2.id }, amount: 10 }), "FORBIDDEN", 403));
      check("VISUALIZADOR transfere: 403", recusa(await xx("transferirCaixaAction", visu, { operation_key: chave("transf"), from: { establishment_id: L2.id }, to: { bank_account_id: TR }, amount: 10 }), "FORBIDDEN", 403));
      check("OPERADOR sem vínculo com a Loja 2 tirando da gaveta dela: 403 ou 404", negada(await xx("transferirCaixaAction", userO, { operation_key: chave("transf"), from: { establishment_id: L2.id }, to: { bank_account_id: TR }, amount: 10 })));
      check("OPERADOR vinculado tira da gaveta da própria loja (Loja 3)", (await xx("transferirCaixaAction", userO, { operation_key: chave("transf"), from: { establishment_id: L3.id }, to: { establishment_id: L2.id }, amount: 40 })).ok && perto(await saldoGaveta(L3.id), 60) && perto(await saldoGaveta(L2.id), 340));
      check("ADMIN tira da conta e põe na gaveta", (await xx("transferirCaixaAction", admin, { operation_key: chave("transf"), from: { bank_account_id: TR }, to: { establishment_id: L2.id }, amount: 50 })).ok && perto(await saldoConta(TR), 1150) && perto(await saldoGaveta(L2.id), 390));

      // a conta com parcela de cartão que já caiu pode transferir esse valor
      check("a conta do cartão não tem CashMovement (o saldo vem só da parcela que caiu)", (await db.cashMovement.count({ where: { bank_account_id: CARD } })) === 0);
      const saldoCard = await saldoConta(CARD);
      check("a parcela que caiu dá saldo à conta (pelo menos 97)", saldoCard >= 97, String(saldoCard));
      check("mais do que o saldo da conta do cartão: 409 INSUFFICIENT_CASH", recusa(await xx("transferirCaixaAction", admin, { operation_key: chave("transf"), from: { bank_account_id: CARD }, to: { bank_account_id: TR }, amount: saldoCard + 0.01 }), "INSUFFICIENT_CASH", 409, "amount"));
      const rCard = await xx("transferirCaixaAction", admin, { operation_key: chave("transf"), from: { bank_account_id: CARD }, to: { bank_account_id: TR }, amount: 97 });
      check("transfere R$ 97 da conta do cartão (a parcela que caiu)", rCard.ok, j(rCard));
      check("o saldo da conta do cartão caiu 97 e a de destino subiu 97", perto(await saldoConta(CARD), saldoCard - 97) && perto(await saldoConta(TR), 1247));

      check("nenhum lançamento nem pagamento no Financeiro (o resultado não muda)", (await db.financialEntry.count()) === e0 && (await db.financialPayment.count()) === pagos0);
    });

    // ---------------------------------------------------------------- 7
    let ultimaConferenciaId = "";
    await rodar("conferência", async () => {
      console.log("\n7. Conferência da gaveta (Q93)");
      const conferir = (ator: Ator, counted: number, justification?: string) =>
        xx("conferirGavetaAction", ator, { establishment_id: L2.id, counted, ...(justification === undefined ? {} : { justification }) });
      const ultima = () => db.cashCount.findFirst({ where: { establishment_id: L2.id }, orderBy: { created_at: "desc" } });
      const ajustes = () => db.cashMovement.count({ where: { origin: "conferencia" } });
      const lancs = () => db.financialEntry.count({ where: { category: "Diferença de caixa" } });

      check("VISUALIZADOR confere: 403", recusa(await conferir(visu, 10), "FORBIDDEN", 403));
      check("OPERADOR sem vínculo com a Loja 2: 403 ou 404", negada(await conferir(userO, 10)));
      check("contado negativo: 422 counted", recusa(await conferir(op, -1), "VALIDATION_ERROR", 422, "counted"));

      const esperado = await saldoGaveta(L2.id);
      const a0 = await ajustes();
      const l0 = await lancs();
      const rIgual = await conferir(op, esperado);
      check("contado igual ao esperado: aceito", rIgual.ok, j(rIgual));
      check("e não grava ajuste nem lançamento", (await ajustes()) === a0 && (await lancs()) === l0 && perto(await saldoGaveta(L2.id), esperado));

      // falta
      const a1 = await ajustes();
      const rSem = await conferir(op, esperado - 7.5);
      check("contado menor sem justificativa: 422 justification", recusa(rSem, "VALIDATION_ERROR", 422, "justification"), j(rSem));
      check("justificativa só com espaços: 422 justification", recusa(await conferir(op, esperado - 7.5, "   "), "VALIDATION_ERROR", 422, "justification"));
      check("a recusa não gravou ajuste e o saldo segue igual", (await ajustes()) === a1 && perto(await saldoGaveta(L2.id), esperado));
      const rFalta = await conferir(op, esperado - 7.5, "troco errado");
      check("contado menor com justificativa: aceito", rFalta.ok, j(rFalta));
      const cf = await ultima();
      check("a conferência grava esperado, contado e diferença -7,50 com a justificativa", !!cf && perto(n(cf.expected), esperado) && perto(n(cf.counted), esperado - 7.5) && perto(n(cf.difference), -7.5) && cf.justification === "troco errado", j(cf));
      const mvF = await db.cashMovement.findMany({ where: { cash_count_id: cf?.id ?? "x" } });
      check("UMA saída de ajuste de 7,50 na gaveta, origem conferencia", mvF.length === 1 && mvF[0].direction === "saida" && perto(n(mvF[0].amount), 7.5) && mvF[0].origin === "conferencia" && mvF[0].establishment_id === L2.id, j(mvF));
      const enF = await db.financialEntry.findMany({ where: { related_id: cf?.id ?? "x" } });
      check("despesa 'Diferença de caixa' de 7,50, paga, ligada à conferência", enF.length === 1 && enF[0].entry_type === "expense" && enF[0].category === "Diferença de caixa" && perto(n(enF[0].amount), 7.5) && enF[0].status === "paid" && enF[0].related_module === "emporio", j(enF));
      check("depois do ajuste o saldo da gaveta é o contado", perto(await saldoGaveta(L2.id), esperado - 7.5));

      // sobra
      const contado2 = esperado - 7.5 + 12;
      const rSobra = await conferir(op, contado2, "achou nota esquecida");
      check("contado maior (+12): aceito", rSobra.ok, j(rSobra));
      const cf2 = await ultima();
      ultimaConferenciaId = cf2?.id ?? "";
      const mvS = await db.cashMovement.findMany({ where: { cash_count_id: cf2?.id ?? "x" } });
      check("UMA entrada de ajuste de 12, origem conferencia", mvS.length === 1 && mvS[0].direction === "entrada" && perto(n(mvS[0].amount), 12) && mvS[0].origin === "conferencia", j(mvS));
      const enS = await db.financialEntry.findMany({ where: { related_id: cf2?.id ?? "x" } });
      check("receita 'Diferença de caixa' de 12, paga", enS.length === 1 && enS[0].entry_type === "income" && enS[0].category === "Diferença de caixa" && perto(n(enS[0].amount), 12) && enS[0].status === "paid", j(enS));
      check("a diferença da conferência é +12 e o saldo é o contado", perto(n(cf2?.difference), 12) && perto(await saldoGaveta(L2.id), contado2));
      const lcs = await xx("listarConferenciasAction", admin);
      check("listarConferenciasAction traz as conferências", lista(dados(lcs)).some((c) => c.id === ultimaConferenciaId), j(lcs));
      const caixa = dados(await xx("lerCaixaAction", admin));
      check("o caixa traz a última conferência da gaveta", j(caixa).includes(ultimaConferenciaId));
    });

    // ---------------------------------------------------------------- 8
    await rodar("cancelamento", async () => {
      console.log("\n8. Cancelamento e devolução com cartão e cheque (Q94)");
      const hojeStr = hoje();
      const cheque = (amount: number, number: string) => ({ kind: "cheque", amount, check: { number, bank: "Banco X", good_for: bomPara(somaDias(hojeStr, 10)) } });

      // a) cartão com parcela futura
      const recA = await aReceberDb();
      const rA = await vender(op, 10, [cartao("credito_vista", 100)]);
      const SA = saleId(rA);
      check("(a) venda no cartão, parcela futura", rA.ok && perto((await aReceberDb()) - recA, 97));
      const cx0 = await db.cashMovement.count();
      check("(a) OPERADOR cancela: 403", recusa(await vv("cancelarVendaAction", op, SA, { reason: "x" }), "FORBIDDEN", 403));
      const rCa = await vv("cancelarVendaAction", admin, SA, { reason: "desistiu" });
      check("(a) ADMIN cancela", rCa.ok, j(rCa));
      const pA = await db.cardReceivable.findMany({ where: { sale_id: SA } });
      check("(a) a parcela ganhou canceled_at", pA.length === 1 && pA[0].canceled_at !== null, j(pA));
      const txA = await taxaDe(SA);
      const reA = await receitaDe(SA);
      check("(a) a taxa vira cancelled e a receita também", txA.length === 1 && txA[0].status === "cancelled" && reA.length === 1 && reA[0].status === "cancelled", j([txA, reA]));
      check("(a) nenhuma saída de gaveta nem movimento novo", (await db.cashMovement.count()) === cx0 && (await db.cashMovement.count({ where: { sale_id: SA } })) === 0);
      check("(a) o a receber voltou ao que era", perto(await aReceberDb(), recA));

      // b) cartão com parcela já caída
      const saldoB0 = await saldoConta(CARD);
      const rB = await vender(op, 10, [cartao("credito_vista", 100)], { sold_at: new Date(Date.now() - 40 * DIA) });
      const SB = saleId(rB);
      check("(b) venda antiga no cartão: a parcela já está no saldo (+97)", rB.ok && perto((await saldoConta(CARD)) - saldoB0, 97));
      const rCb = await vv("cancelarVendaAction", admin, SB, { reason: "estorno" });
      check("(b) ADMIN cancela", rCb.ok, j(rCb));
      const pB = await db.cardReceivable.findMany({ where: { sale_id: SB } });
      const mvB = await db.cashMovement.findMany({ where: { sale_id: SB } });
      check("(b) UMA saída de 97 da conta de origem, origem estorno_cartao, ligada à parcela", mvB.length === 1 && mvB[0].direction === "saida" && perto(n(mvB[0].amount), 97) && mvB[0].origin === "estorno_cartao" && mvB[0].bank_account_id === CARD && mvB[0].establishment_id === null && mvB[0].card_receivable_id === pB[0]?.id, j(mvB));
      check("(b) o saldo da conta voltou ao de antes da venda", perto(await saldoConta(CARD), saldoB0), `${await saldoConta(CARD)} contra ${saldoB0}`);
      const caixaB = dados(await xx("lerCaixaAction", admin));
      check("(b) e o caixa diz o mesmo", perto(achar(caixaB, "bank_account_id", CARD), saldoB0));
      check("(b) taxa e receita cancelled", (await taxaDe(SB))[0]?.status === "cancelled" && (await receitaDe(SB))[0]?.status === "cancelled");
      check("(b) nenhuma saída da gaveta de loja", (await db.cashMovement.count({ where: { sale_id: SB, establishment_id: { not: null } } })) === 0);

      // c) cheque recebido
      const Cc = await contato("Cliente cancela cheque");
      const rC = await vender(op, 10, [cheque(100, "5001")], { contact_id: Cc });
      const SC = saleId(rC);
      const rCc = await vv("cancelarVendaAction", admin, SC, { reason: "desistiu" });
      check("(c) cancelar venda com cheque só recebido", rCc.ok, j(rCc));
      check("(c) o cheque volta ao cliente (devolvido_ao_cliente)", (await db.emporioCheck.findFirst({ where: { sale_id: SC } }))?.status === "devolvido_ao_cliente");
      check("(c) lançamento cancelled e nada no caixa", (await receitaDe(SC))[0]?.status === "cancelled" && (await db.cashMovement.count({ where: { sale_id: SC } })) === 0);

      // d) cheque depositado
      const rD = await vender(op, 10, [cheque(100, "5002")], { contact_id: Cc });
      const SD = saleId(rD);
      const chD = await db.emporioCheck.findFirst({ where: { sale_id: SD } });
      await xx("depositarChequeAction", op, chD?.id, { bank_account_id: CHQ });
      check("(d) cheque depositado: 409 SALE_HAS_DEPOSITED_CHECK", recusa(await vv("cancelarVendaAction", admin, SD, { reason: "x" }), "SALE_HAS_DEPOSITED_CHECK", 409));
      check("(d) a venda segue concluída, o lançamento não foi cancelado e o cheque segue depositado", (await db.emporioSale.findUnique({ where: { id: SD } }))?.status === "concluida" && (await receitaDe(SD))[0]?.status === "paid" && (await chk(chD?.id))?.status === "depositado");
      check("(d) cheque compensado também recusa", recusa(await vv("cancelarVendaAction", admin, chequeCompensadoSale, { reason: "x" }), "SALE_HAS_DEPOSITED_CHECK", 409));

      // e) cheque devolvido: nada a estornar
      const rE = await vender(op, 10, [cheque(100, "5003")], { contact_id: Cc });
      const SE = saleId(rE);
      const chE = await db.emporioCheck.findFirst({ where: { sale_id: SE } });
      await xx("chequeVoltouAction", admin, chE?.id, { reason: "sem fundos" });
      const rCe = await vv("cancelarVendaAction", admin, SE, { reason: "dívida perdoada" });
      check("(e) cheque já devolvido: o cancelamento passa", rCe.ok, j(rCe));
      check("(e) o cheque segue devolvido (nada a estornar) e o lançamento fica cancelled", (await chk(chE?.id))?.status === "devolvido" && (await receitaDe(SE))[0]?.status === "cancelled");

      // devolução parcial: cartão conta como pago no teto
      const rF = await vender(op, 10, [cartao("credito_vista", 100)]);
      const SF = saleId(rF);
      const itF = await db.emporioSaleItem.findFirst({ where: { sale_id: SF } });
      const rDev = await vv("devolverAction", op, SF, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: itF?.id, quantity: 1 }] });
      check("devolução de R$ 10 em dinheiro de venda paga no cartão: o teto conta o cartão", rDev.ok, j(rDev));
    });

    // ---------------------------------------------------------------- 9
    await rodar("misto", async () => {
      console.log("\n9. Misto: dinheiro + cartão + fiado na mesma venda");
      const CM = await contato("Cliente misto");
      const gav0 = await saldoGaveta(L1.id);
      const rec0 = await aReceberDb();
      const rM = await vender(op, 30, [dinheiro(100), cartao("credito_vista", 100), { kind: "fiado", amount: 100 }], { contact_id: CM });
      check("venda de R$ 300 em três formas", rM.ok, j(rM));
      const S = saleId(rM);
      const rec = await receitaDe(S);
      check("UMA receita de 300, pending, com 200 pagos", rec.length === 1 && perto(n(rec[0].amount), 300) && rec[0].status === "pending" && perto(await pago(rec[0].id), 200), j(rec));
      const pgs = rec[0] ? await pagamentosDe(rec[0].id) : [];
      check("dois pagamentos no lançamento: um dinheiro e um cartao", pgs.length === 2 && pgs.some((p) => p.method === "cartao" && perto(n(p.amount), 100)) && pgs.some((p) => p.method !== "cartao" && perto(n(p.amount), 100)), j(pgs.map((p) => [p.method, p.amount])));
      check("taxa de R$ 3", perto(n((await taxaDe(S))[0]?.amount), 3));
      const mv = await db.cashMovement.findMany({ where: { sale_id: S } });
      check("UM movimento de caixa: a entrada de 100 do dinheiro na gaveta", mv.length === 1 && mv[0].direction === "entrada" && perto(n(mv[0].amount), 100) && mv[0].establishment_id === L1.id, j(mv));
      check("a gaveta cresceu 100 e o a receber do cartão 97", perto((await saldoGaveta(L1.id)) - gav0, 100) && perto((await aReceberDb()) - rec0, 97));
      check("o cliente deve 100 no fiado", perto(dividaDe(lista(dados(await xx("listarFiadoAction", op))), CM), 100));
      const rc = await db.cardReceivable.findMany({ where: { sale_id: S } });
      check("uma parcela de cartão de 97 líquidos", rc.length === 1 && perto(n(rc[0].net_amount), 97));
    });

    // ---------------------------------------------------------------- 10
    const lojaB = dados(await chamarEm([C], dbB, "criarEstabelecimentoAction", ownerB, { name: "M82 B1", kind: "ponto_venda" }));
    await rodar("isolamento", async () => {
      console.log("\n10. Isolamento: B não vê nem age sobre A");
      const bb = (nome: string, ...a: unknown[]) => chamarEm([X, V], dbB, nome, ...a);
      const contaB = (await bb("criarContaAction", ownerB, { name: `M82 B conta ${stamp}`, bank: "B" })).ok
        ? (await dbB.bankAccount.findFirst({ where: { tenant_id: TB.t.id } }))?.id ?? ""
        : "";
      const regraA = await db.cardFeeRule.findFirst({ where: { establishment_id: L1.id, kind: "credito_vista" } });
      const chequeA = chequeId1 || "sem-cheque";
      const rcA = (await db.cardReceivable.findFirst({ where: { sale_id: { not: "" } } }))?.id ?? "";
      const lsR = await bb("listarRegrasCartaoAction", ownerB);
      check("B não vê as regras de A", !j(dados(lsR) ?? []).includes(regraA?.id ?? "?"), j(lsR));
      check("B define regra na loja de A: 404", recusa(await bb("definirRegraCartaoAction", ownerB, { establishment_id: L1.id, kind: "debito", fee_pct: 1, days: 1, bank_account_id: contaB }), "NOT_FOUND", 404));
      check("B remove regra de A: 404", recusa(await bb("removerRegraCartaoAction", ownerB, regraA?.id ?? "x"), "NOT_FOUND", 404));
      check("B não vê os cheques de A", !j(dados(await bb("listarChequesAction", ownerB)) ?? []).includes(chequeA));
      check("B deposita cheque de A: 404", recusa(await bb("depositarChequeAction", ownerB, chequeA, { bank_account_id: contaB }), "NOT_FOUND", 404));
      check("B compensa cheque de A: 404", recusa(await bb("compensarChequeAction", ownerB, chequeA), "NOT_FOUND", 404));
      check("B marca cheque de A como voltou: 404", recusa(await bb("chequeVoltouAction", ownerB, chequeA, { reason: "x" }), "NOT_FOUND", 404));
      check("B transfere da gaveta de A: 404", recusa(await bb("transferirCaixaAction", ownerB, { operation_key: chave("tb"), from: { establishment_id: L2.id }, to: { bank_account_id: contaB }, amount: 1 }), "NOT_FOUND", 404));
      check("B transfere da conta de A: 404", recusa(await bb("transferirCaixaAction", ownerB, { operation_key: chave("tb"), from: { bank_account_id: TR }, to: { bank_account_id: contaB }, amount: 1 }), "NOT_FOUND", 404));
      const rKey = await bb("transferirCaixaAction", ownerB, { operation_key: TRANSF_KEY, from: { establishment_id: lojaB?.id }, to: { bank_account_id: contaB }, amount: 1 });
      check("a chave de A em B não devolve a transferência de A (a chave é por conta)", transferCodeOk && !(rKey.ok && dados(rKey)?.id === transferAId), j(rKey));
      check("B confere a gaveta de A: 404", recusa(await bb("conferirGavetaAction", ownerB, { establishment_id: L2.id, counted: 0 }), "NOT_FOUND", 404));
      check("B não vê as conferências de A", !j(dados(await bb("listarConferenciasAction", ownerB)) ?? []).includes(ultimaConferenciaId));
      const caixaB = dados(await bb("lerCaixaAction", ownerB));
      check("o caixa de B não traz parcela, cheque nem conferência de A", !j(caixaB).includes(chequeA) && !j(caixaB).includes(ultimaConferenciaId) && !j(caixaB).includes(rcA) && somaReceberCaixa(caixaB) === 0 && Number.isNaN(achar(caixaB, "establishment_id", L2.id)), j(caixaB));
      check("no banco, B não tem regras, parcelas, cheques, transferências nem conferências", (await dbB.cardFeeRule.count()) === 0 && (await dbB.cardReceivable.count()) === 0 && (await dbB.emporioCheck.count()) === 0 && (await dbB.cashTransfer.count()) === 0 && (await dbB.cashCount.count()) === 0);
      check("e A tem os seus (o isolamento não é vazio)", (await db.cardFeeRule.count()) > 0 && (await db.cardReceivable.count()) > 0 && (await db.emporioCheck.count()) > 0 && (await db.cashTransfer.count()) > 0 && (await db.cashCount.count()) > 0);
    });

    // ---------------------------------------------------------------- rotas
    await rodar("rotas", async () => {
      console.log("\n11. Rotas da F3b (route handler direto, sessão por Bearer): 401, 404 desligado, sucesso e 422 em português");
      const { signAccessToken } = await import("@/lib/auth-token");
      const { withBearer } = await import("./_escopo-de-requisicao");
      type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
      const rotaDe = async (caminho: string, metodo: string): Promise<Handler> => {
        const mod = (await import(`@/app/api/v1/emporio/${caminho}/route`)) as Record<string, Handler>;
        if (typeof mod[metodo] !== "function") throw new Error(`rota sem ${metodo}: ${caminho}`);
        return mod[metodo];
      };
      const tokenOwner = signAccessToken(owner.id);
      const tokenVisu = signAccessToken(visu.id);
      const chamar = async (token: string | null, caminho: string, metodo: string, url: string, corpo?: Dado, id = "x") => {
        try {
          const h = await rotaDe(caminho, metodo);
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
          return { status: 0, json: { error: { message: e instanceof Error ? e.message : String(e) } } };
        }
      };
      const ROTAS: [string, string, string, Dado][] = [
        ["card-fee-rules", "GET", "card-fee-rules", undefined],
        ["card-fee-rules", "PUT", "card-fee-rules", {}],
        ["card-fee-rules/[id]", "DELETE", "card-fee-rules/x", undefined],
        ["checks", "GET", "checks", undefined],
        ["checks/[id]/deposit", "POST", "checks/x/deposit", {}],
        ["checks/[id]/clear", "POST", "checks/x/clear", {}],
        ["checks/[id]/return", "POST", "checks/x/return", {}],
        ["cash/transfers", "POST", "cash/transfers", {}],
        ["cash/counts", "GET", "cash/counts", undefined],
        ["cash/counts", "POST", "cash/counts", {}],
      ];

      await prisma.tenantProfile.upsert({
        where: { tenant_id_profile_type: { tenant_id: TA.t.id, profile_type: "emporio" } },
        create: { tenant_id: TA.t.id, profile_type: "emporio", active: true },
        update: { active: true },
      });
      await prisma.tenantFeature.deleteMany({ where: { tenant_id: TA.t.id, feature_key: "emporio" } });

      for (const [cam, met, url, corpo] of ROTAS) {
        const r = await chamar(null, cam, met, url, corpo);
        check(`sem sessão: ${met} ${url} -> 401`, r.status === 401, `${r.status} ${j(r.json)}`);
      }
      for (const [cam, met, url, corpo] of ROTAS) {
        const r = await chamar(tokenOwner, cam, met, url, corpo);
        check(`recurso desligado: ${met} ${url} -> 404`, r.status === 404, `${r.status} ${j(r.json)}`);
      }

      await prisma.tenantFeature.create({ data: { tenant_id: TA.t.id, feature_key: "emporio", enabled: true } });

      const ok2xx = (s: number) => s === 200 || s === 201;
      const emIngles = (m: unknown) => typeof m === "string" && /Too small|Too big|Invalid input|expected|Required/i.test(m);
      const em422 = (nome: string, r: { status: number; json: Dado }, campos: string[]) => {
        const e = r.json?.error;
        check(`${nome}: 422 com error.field em ${campos.join(" ou ")}`, r.status === 422 && campos.includes(e?.field), `${r.status} ${j(r.json)}`);
        check(`  e a mensagem é em português`, typeof e?.message === "string" && e.message.length > 0 && !emIngles(e.message), j(e?.message));
      };

      // regras de cartão
      const vP = await chamar(tokenVisu, "card-fee-rules", "PUT", "card-fee-rules", { establishment_id: L2.id, kind: "debito", fee_pct: 1.5, days: 1, bank_account_id: CARD });
      check("ligado: VISUALIZADOR define regra -> 403", vP.status === 403, `${vP.status} ${j(vP.json)}`);
      const pu = await chamar(tokenOwner, "card-fee-rules", "PUT", "card-fee-rules", { establishment_id: L2.id, kind: "debito", fee_pct: 1.5, days: 1, bank_account_id: CARD });
      check("PUT card-fee-rules: 200 ou 201", ok2xx(pu.status), `${pu.status} ${j(pu.json)}`);
      const regraRota = await db.cardFeeRule.findFirst({ where: { establishment_id: L2.id, kind: "debito" } });
      check("a regra foi gravada (1,5% e 1 dia)", !!regraRota && perto(n(regraRota.fee_pct), 1.5) && regraRota.days === 1);
      const gr = await chamar(tokenOwner, "card-fee-rules", "GET", "card-fee-rules");
      check("GET card-fee-rules: 200 e traz a regra", gr.status === 200 && j(gr.json).includes(regraRota?.id ?? "?"), `${gr.status}`);
      em422("PUT card-fee-rules com taxa 101", await chamar(tokenOwner, "card-fee-rules", "PUT", "card-fee-rules", { establishment_id: L2.id, kind: "debito", fee_pct: 101, days: 1, bank_account_id: CARD }), ["fee_pct"]);
      em422("PUT card-fee-rules com prazo 121", await chamar(tokenOwner, "card-fee-rules", "PUT", "card-fee-rules", { establishment_id: L2.id, kind: "debito", fee_pct: 1, days: 121, bank_account_id: CARD }), ["days"]);
      const del = await chamar(tokenOwner, "card-fee-rules/[id]", "DELETE", `card-fee-rules/${regraRota?.id}`, undefined, regraRota?.id);
      check("DELETE card-fee-rules/[id]: 200 ou 204 e a regra some", (del.status === 200 || del.status === 204) && (await db.cardFeeRule.count({ where: { id: regraRota?.id } })) === 0, `${del.status} ${j(del.json)}`);

      // cheques
      const Cr = await contato("rota cheque");
      const novoCheque = async (num: string) => {
        const r = await vender(owner, 10, [{ kind: "cheque", amount: 100, check: { number: num, bank: "Banco R", good_for: bomPara(somaDias(hoje(), 5)) } }], { contact_id: Cr });
        return (await db.emporioCheck.findFirst({ where: { sale_id: saleId(r) } }))?.id ?? "";
      };
      const cA = await novoCheque("6001");
      const cB = await novoCheque("6002");
      const gc = await chamar(tokenOwner, "checks", "GET", "checks");
      check("GET checks: 200 e traz o cheque", gc.status === 200 && j(gc.json).includes(cA), `${gc.status}`);
      const dp = await chamar(tokenOwner, "checks/[id]/deposit", "POST", `checks/${cA}/deposit`, { bank_account_id: CHQ }, cA);
      check("POST checks/[id]/deposit: 2xx e depositado", ok2xx(dp.status) && (await chk(cA))?.status === "depositado", `${dp.status} ${j(dp.json)}`);
      const cl = await chamar(tokenOwner, "checks/[id]/clear", "POST", `checks/${cA}/clear`, {}, cA);
      check("POST checks/[id]/clear: 2xx e compensado", ok2xx(cl.status) && (await chk(cA))?.status === "compensado", `${cl.status} ${j(cl.json)}`);
      const cl2 = await chamar(tokenOwner, "checks/[id]/clear", "POST", `checks/${cA}/clear`, {}, cA);
      check("compensar de novo pela rota: 409 CHECK_STATUS", cl2.status === 409 && cl2.json?.error?.code === "CHECK_STATUS", `${cl2.status} ${j(cl2.json)}`);
      em422("POST checks/[id]/deposit sem conta", await chamar(tokenOwner, "checks/[id]/deposit", "POST", `checks/${cB}/deposit`, {}, cB), ["bank_account_id"]);
      em422("POST checks/[id]/return sem motivo", await chamar(tokenOwner, "checks/[id]/return", "POST", `checks/${cB}/return`, {}, cB), ["reason", "return_reason"]);
      const rt = await chamar(tokenOwner, "checks/[id]/return", "POST", `checks/${cB}/return`, { reason: "sem fundos" }, cB);
      check("POST checks/[id]/return: 2xx e devolvido", ok2xx(rt.status) && (await chk(cB))?.status === "devolvido", `${rt.status} ${j(rt.json)}`);

      // transferências
      const kTr = chave("rota-tr");
      const corpoTr = { operation_key: kTr, from: { establishment_id: L2.id }, to: { bank_account_id: TR }, amount: 10 };
      const t1 = await chamar(tokenOwner, "cash/transfers", "POST", "cash/transfers", corpoTr);
      check("POST cash/transfers: 201", t1.status === 201 || t1.status === 200, `${t1.status} ${j(t1.json)}`);
      const t2 = await chamar(tokenOwner, "cash/transfers", "POST", "cash/transfers", corpoTr);
      check("repetir a chave: 2xx e uma transferência só", ok2xx(t2.status) && (await db.cashTransfer.count({ where: { operation_key: kTr } })) === 1, `${t2.status} ${j(t2.json)}`);
      em422("POST cash/transfers com origem igual ao destino", await chamar(tokenOwner, "cash/transfers", "POST", "cash/transfers", { operation_key: chave("rt"), from: { bank_account_id: TR }, to: { bank_account_id: TR }, amount: 1 }), ["to"]);
      em422("POST cash/transfers com valor zero", await chamar(tokenOwner, "cash/transfers", "POST", "cash/transfers", { operation_key: chave("rt"), from: { establishment_id: L2.id }, to: { bank_account_id: TR }, amount: 0 }), ["amount"]);
      const ins = await chamar(tokenOwner, "cash/transfers", "POST", "cash/transfers", { operation_key: chave("rt"), from: { establishment_id: L2.id }, to: { bank_account_id: TR }, amount: 99999 });
      check("POST cash/transfers acima do saldo: 409 INSUFFICIENT_CASH em amount", ins.status === 409 && ins.json?.error?.code === "INSUFFICIENT_CASH" && ins.json?.error?.field === "amount", `${ins.status} ${j(ins.json)}`);

      // conferências
      const gcs = await chamar(tokenOwner, "cash/counts", "GET", "cash/counts");
      check("GET cash/counts: 200", gcs.status === 200, `${gcs.status}`);
      const saldoL2 = await saldoGaveta(L2.id);
      const cp = await chamar(tokenOwner, "cash/counts", "POST", "cash/counts", { establishment_id: L2.id, counted: saldoL2 });
      check("POST cash/counts: 201", cp.status === 201 || cp.status === 200, `${cp.status} ${j(cp.json)}`);
      em422("POST cash/counts com contado negativo", await chamar(tokenOwner, "cash/counts", "POST", "cash/counts", { establishment_id: L2.id, counted: -1 }), ["counted"]);
      em422("POST cash/counts com diferença e sem justificativa", await chamar(tokenOwner, "cash/counts", "POST", "cash/counts", { establishment_id: L2.id, counted: saldoL2 + 1 }), ["justification"]);
    });
  } finally {
    for (const id of tenantIds) {
      try {
        await prisma.cashMovement.deleteMany({ where: { tenant_id: id } });
        await prisma.cardReceivable.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioCheck.deleteMany({ where: { tenant_id: id } });
        await prisma.cashTransfer.deleteMany({ where: { tenant_id: id } });
        await prisma.cashCount.deleteMany({ where: { tenant_id: id } });
        await prisma.cardFeeRule.deleteMany({ where: { tenant_id: id } });
        await prisma.stockMovement.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioSalePayment.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioSaleReturnItem.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null } });
        await prisma.emporioSaleReturn.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioSaleItem.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioSale.deleteMany({ where: { tenant_id: id } });
        await prisma.stockTransferItem.deleteMany({ where: { tenant_id: id } });
        await prisma.stockTransfer.deleteMany({ where: { tenant_id: id } });
        await prisma.productionEntry.deleteMany({ where: { tenant_id: id } });
        await prisma.compositionItem.deleteMany({ where: { tenant_id: id } });
        await prisma.composition.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioPurchaseItem.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioPurchase.deleteMany({ where: { tenant_id: id } });
        await prisma.stockLimit.deleteMany({ where: { tenant_id: id } });
        await prisma.shoppingItem.deleteMany({ where: { tenant_id: id } });
        await prisma.financialEntry.deleteMany({ where: { tenant_id: id } });
        await prisma.negotiation.deleteMany({ where: { tenant_id: id } });
        await prisma.presentationPrice.deleteMany({ where: { tenant_id: id } });
        await prisma.productPresentation.deleteMany({ where: { tenant_id: id } });
        await prisma.userEstablishment.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioProduct.deleteMany({ where: { tenant_id: id } });
        await prisma.product.deleteMany({ where: { tenant_id: id } });
        await prisma.establishment.deleteMany({ where: { tenant_id: id } });
        await prisma.bankAccount.deleteMany({ where: { tenant_id: id } });
        await prisma.contact.deleteMany({ where: { tenant_id: id } });
        await prisma.productCategory.deleteMany({ where: { tenant_id: id } });
        await prisma.property.deleteMany({ where: { tenant_id: id } });
        await prisma.tenant.delete({ where: { id } });
      } catch (e) {
        falhas += 1;
        console.log(`  ❌ limpeza do tenant ${id} falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const sobrou = await prisma.tenant.count({ where: { id: { in: tenantIds } } });
    check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
    await prisma.$disconnect();
  }
}

comBanco()
  .catch((e) => {
    falhas += 1;
    console.log(`  ❌ a suíte quebrou: ${e instanceof Error ? e.message : String(e)}`);
  })
  .finally(() => {
    console.log(falhas === 0 ? `\n✅ M82 verde (${total} checagens)` : `\n❌ M82: ${falhas} falha(s) em ${total} checagens`);
    process.exit(falhas === 0 ? 0 : 1);
  });
