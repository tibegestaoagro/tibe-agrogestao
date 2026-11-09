import "./_env-local";
import { papelDeFixture, vincularTodas, virarGestor } from "./_emporio-papel";
import { AsyncLocalStorage } from "node:async_hooks";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório): frete cobrado na venda, origem e-commerce e editar venda.
 * Roda: `npm run test:m102`
 *
 * Escrita da spec (docs/superpowers/specs/2026-11-09-emporio-frete-ecommerce-design.md,
 * Q244 a Q249) e dos blocos Interfaces das Tasks 2, 3 e 4 do plano, sem ler a
 * implementação. Chama as actions direto, sem rota. Ação ou campo ainda
 * inexistente vira recusa `ACTION_AUSENTE` (a suíte compila e roda, e a asserção
 * falha), nunca erro de sintaxe.
 *
 * Seções: 1 frete na venda, 2 origem, 3 Resultado, 4 A pagar, 5 cancelar,
 * 6 editar, 7 isolamento, 8 impressão.
 *
 * O que o contrato calava e esta suíte ASSUME:
 * - o Resultado é lido por `resultadoDaLojaAction(db, ator, { establishment_id, month })`
 *   (o plano o chama de "lerResultadoAction"; o nome real do código vale);
 * - `listarContasAPagarAction`/`lerQuantidadeDeContasAPagar` aceitam `{ establishment_id }`;
 *   a contagem devolve um número ou um objeto com um número (`count`, `total`, `pending`);
 * - `pagarDespesasAction` recebe `{ entry_ids, from: { bank_account_id } }`;
 * - `lerImpressoDaVendaAction` traz `frete`, `total` e `origem` (a suíte os
 *   procura em qualquer profundidade);
 * - editar/cancelar são do gestor da loja (`gestor`, vinculado às lojas) e o Dono;
 *   o Vendedor sem gestor recebe FORBIDDEN;
 * - a venda em dinheiro editada leva `cash_register_id` do turno aberto;
 * - recusa de editar com turno encerrado: CASH_CLOSED ou CASH_REGISTER_REQUIRED;
 * - o vencimento da conta do frete é o dia de `sold_at` (compara dia, não instante).
 */

let falhas = 0;
let totalChecks = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  totalChecks += 1;
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

const perto = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 0.005;
const recusa = (r: R, code: string, field?: string) => !r.ok && r.code === code && (field === undefined || r.field === field);
const j = (x: unknown) => JSON.stringify(x);
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));
const DIA = 86_400_000;
const CATEGORIA = "Frete de entrega";
const mesAtual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

console.log("🚚 M102: Módulo 39 (Meu Empório), frete na venda, origem e-commerce e editar venda\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const caminhos = {
    catalogo: "@/lib/actions/emporio-catalogo",
    estoque: "@/lib/actions/emporio-estoque",
    vendas: "@/lib/actions/emporio-vendas",
    caixa: "@/lib/actions/emporio-caixa",
    despesas: "@/lib/actions/emporio-despesas",
    resultado: "@/lib/actions/emporio-resultado",
    impressao: "@/lib/actions/emporio-impressao",
    turno: "@/lib/actions/emporio-turno",
  };
  const carregar = async (c: string): Promise<Record<string, Acao>> => {
    try {
      return (await import(c)) as Record<string, Acao>;
    } catch {
      return {};
    }
  };
  const C = await carregar(caminhos.catalogo);
  const E = await carregar(caminhos.estoque);
  const V = await carregar(caminhos.vendas);
  const X = await carregar(caminhos.caixa);
  const D = await carregar(caminhos.despesas);
  const RS = await carregar(caminhos.resultado);
  const IM = await carregar(caminhos.impressao);
  const TU = await carregar(caminhos.turno);

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M102 ${rotulo} ${stamp}`, document: `M102${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
      });
      tenantIds.push(t.id);
      const mkUser = async (suf: string, role: Role): Promise<Ator> => {
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M102 ${rotulo} ${suf}`, email: `m102-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role, ...papelDeFixture(role) },
        });
        return { id: u.id, role };
      };
      return { t, mkUser };
    };
    const TA = await mkTenant("A");
    const TB = await mkTenant("B");
    const owner = await TA.mkUser("own", "OWNER");
    const admin = await TA.mkUser("adm", "ADMIN");
    const vend = await TA.mkUser("vnd", "OPERADOR"); // vendedor sem gestor
    const gestor = await TA.mkUser("ges", "OPERADOR");
    const ownerB = await TB.mkUser("own", "OWNER");
    const db = prismaForTenant(TA.t.id);
    const dbB = prismaForTenant(TB.t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M102 categoria" }) });
    const cf = (await (await import("@/lib/actions/emporio-clientes")).garantirConsumidorFinal(db)).id;
    const cfB = (await (await import("@/lib/actions/emporio-clientes")).garantirConsumidorFinal(dbB)).id;

    const ausente = (nome: string): R => ({ ok: false, code: "ACTION_AUSENTE", message: `action ausente: ${nome}`, status: 501 });
    const chamar = (mods: Record<string, Acao>[], cliente: Dado, nome: string, ...args: unknown[]): Promise<R> => {
      for (const m of mods) if (typeof m[nome] === "function") return m[nome](cliente, ...args);
      return Promise.resolve(ausente(nome));
    };
    const dados = (r: R): Dado => (r.ok ? r.data : undefined);
    const lista = (d: Dado): Dado[] => (Array.isArray(d) ? d : (d?.items ?? []));
    const cc = (nome: string, ...a: unknown[]) => chamar([C], db, nome, ...a);
    const ee = (nome: string, ...a: unknown[]) => chamar([E], db, nome, ...a);
    const vv = (nome: string, ...a: unknown[]) => chamar([V], db, nome, ...a);
    const dd = (nome: string, ...a: unknown[]) => chamar([D, RS], db, nome, ...a);
    const ddB = (nome: string, ...a: unknown[]) => chamar([D, RS], dbB, nome, ...a);
    const vvB = (nome: string, ...a: unknown[]) => chamar([V], dbB, nome, ...a);
    /** Acha o primeiro valor do campo em qualquer profundidade. */
    const acha = (d: Dado, campo: string): Dado => {
      if (Array.isArray(d)) {
        for (const x of d) {
          const r = acha(x, campo);
          if (r !== undefined) return r;
        }
      } else if (d && typeof d === "object") {
        if (campo in d) return d[campo];
        for (const v of Object.values(d)) {
          const r = acha(v, campo);
          if (r !== undefined) return r;
        }
      }
      return undefined;
    };

    // ---- Lojas
    const mkLoja = async (nome: string) => {
      const r = await cc("criarEstabelecimentoAction", owner, { name: `M102 ${nome}`, kind: "ponto_venda" });
      const l = dados(r);
      if (!l) throw new Error(`não criou a loja ${nome}: ${j(r)}`);
      return l as { id: string };
    };
    const L1 = await mkLoja("Loja 1");
    const L2 = await mkLoja("Loja 2 turno encerrado");
    const L3 = await mkLoja("Loja 3 resultado");
    await vincularTodas(prisma, TA.t.id, [vend.id, gestor.id], [L1.id, L2.id, L3.id]);
    const { virarVendedor } = await import("./_emporio-papel");
    await virarGestor(prisma, gestor.id);
    await virarVendedor(prisma, vend.id);
    const { abrirTurnoDeTeste } = await import("./_emporio-turno");
    const turnoL1 = await abrirTurnoDeTeste(db, owner, L1.id);
    const turnoL2 = await abrirTurnoDeTeste(db, owner, L2.id);
    const turnoL3 = await abrirTurnoDeTeste(db, owner, L3.id);

    // ---- Conta bancária (PIX e pagamento das contas)
    const rConta = await chamar([X], db, "criarContaAction", admin, { name: `M102 Conta ${stamp}`, bank: "Sicredi" });
    const conta = dados(rConta)?.id as string;
    if (!conta) throw new Error(`conta: ${j(rConta)}`);
    const rSaldo = await chamar([X], db, "saldoInicialCaixaAction", admin, { bank_account_id: conta, amount: 5000 });
    if (!rSaldo.ok) throw new Error(`saldo inicial: ${j(rSaldo)}`);

    // ---- Produto: R$ 50 o quilo, estoque nas três lojas
    const rP = await cc("criarProdutoEmporioAction", owner, { name: `M102 Ração ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    const P = dados(rP);
    if (!P) throw new Error(`produto: ${j(rP)}`);
    const rAp = await cc("criarApresentacaoAction", owner, P.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!rAp.ok) throw new Error(`apresentação: ${j(rAp)}`);
    const presId = rAp.data.id as string;
    for (const L of [L1, L2, L3]) {
      const rp = await cc("definirPrecoAction", admin, { establishment_id: L.id, presentation_id: presId, price: 50 });
      if (!rp.ok) throw new Error(`preço: ${j(rp)}`);
      const ri = await ee("implantarEstoqueAction", owner, { establishment_id: L.id, emporio_product_id: P.id, sealed: [], loose_qty: 1000, unit_cost: 10 });
      if (!ri.ok) throw new Error(`implantar: ${j(ri)}`);
    }
    const saldoDe = async (est: string): Promise<number> => {
      const l = lista(dados(await ee("saldoDaLojaAction", admin, est))).find((x) => x.emporio_product_id === P.id);
      return l ? n(l.total_qty) : 0;
    };

    let chaveSeq = 0;
    const chave = (p: string) => `m102-${p}-${stamp}-${(chaveSeq += 1)}`;
    const itens = (qtd = 2) => [{ emporio_product_id: P.id, presentation_id: presId, quantity: qtd }]; // 2 x 50 = 100
    const pix = (amount: number) => ({ kind: "pix", amount, bank_account_id: conta });
    const dinheiro = (amount: number) => ({ kind: "dinheiro", amount });
    const vender = (ator: Ator, payments: Dado[], over: Dado = {}) =>
      vv("venderAction", ator, { operation_key: chave("v"), establishment_id: L1.id, customer_id: cf, items: itens(), payments, ...over });
    const idDe = (r: R): string => dados(r)?.id ?? "";
    const freteDe = (saleId: string) => db.financialEntry.findMany({ where: { related_module: "emporio", related_id: saleId, category: CATEGORIA } });
    const receitaDe = (saleId: string) => db.financialEntry.findMany({ where: { related_module: "emporio", related_id: saleId, entry_type: "income" } });
    const dia = (x: Date | string | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : "");
    const rodar = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        check(`${nome}: terminou sem exceção`, false, e instanceof Error ? e.message : String(e));
      }
    };

    // Regra "Vendeu, Pagou" de 10% na Loja 3 (a mesma loja do Resultado e do A pagar).
    const rRegra = await chamar([D, RS, V, X], db, "criarRegraVariavelAction", admin, { establishment_id: L3.id, name: "M102 Comissão 10%", kind: "percentual", value: 10 });
    if (!rRegra.ok) throw new Error(`regra: ${j(rRegra)}`);

    let S1 = ""; // venda com frete na Loja 1 (itens 100, frete 20, pix 120)
    let S3 = ""; // venda com frete e regra de 10% na Loja 3
    let SE = ""; // venda e-commerce com frete na Loja 1
    let freteS3 = "";

    // ---------------------------------------------------------------- 1
    console.log("1. Frete na venda (Q244, Q246, Q248)");
    await rodar("seção 1", async () => {
      const rV = await vender(vend, [pix(120)], { freight_amount: 20 });
      check("itens 100 mais frete 20, pago com pix 120: ok", rV.ok, j(rV));
      S1 = idDe(rV);
      const v = dados(rV);
      check("net_amount 100, freight_amount 20, total_amount 120, origin balcao", perto(n(v?.net_amount), 100) && perto(n(v?.freight_amount), 20) && perto(n(v?.total_amount), 120) && v?.origin === "balcao", j(v));
      const rec = await receitaDe(S1);
      check("o lançamento de receita da venda vale 120", rec.length === 1 && perto(n(rec[0].amount), 120), j(rec));
      const fr = await freteDe(S1);
      const venda = await db.emporioSale.findFirst({ where: { id: S1 } });
      check(
        "uma conta Frete de entrega: expense, pending, vence no dia da venda, na loja, de 20",
        fr.length === 1 && fr[0].entry_type === "expense" && fr[0].status === "pending" && perto(n(fr[0].amount), 20) && fr[0].establishment_id === L1.id && dia(fr[0].due_date) === dia(venda?.sold_at),
        j(fr),
      );

      const rCurto = await vender(vend, [pix(100)], { freight_amount: 20 });
      check("a mesma venda paga com pix 100: 422 payments com 120,00 na mensagem", recusa(rCurto, "VALIDATION_ERROR", "payments") && !rCurto.ok && rCurto.message.includes("120,00"), j(rCurto));
      check("frete -1: VALIDATION_ERROR em freight_amount", recusa(await vender(vend, [pix(100)], { freight_amount: -1 }), "VALIDATION_ERROR", "freight_amount"));

      const rSem = await vender(vend, [pix(100)]);
      const rZero = await vender(vend, [pix(100)], { freight_amount: 0 });
      check("sem frete ou com frete 0: vende e não cria conta do frete", rSem.ok && rZero.ok && (await freteDe(idDe(rSem))).length === 0 && (await freteDe(idDe(rZero))).length === 0, j([rSem, rZero]));
      check("sem frete: total_amount igual aos itens e frete 0", perto(n(dados(rSem)?.total_amount), 100) && perto(n(dados(rSem)?.freight_amount), 0), j(dados(rSem)));

      const r3 = await vender(vend, [pix(120)], { establishment_id: L3.id, freight_amount: 20, cash_register_id: turnoL3.cash_register_id });
      S3 = idDe(r3);
      const sve = await db.saleVariableExpense.findMany({ where: { sale_id: S3 } });
      check("regra de 10% na Loja 3: a despesa variável vale 10,00 (10% dos itens), não 12,00", r3.ok && sve.length === 1 && perto(n(sve[0].amount), 10), j([r3, sve]));
      freteS3 = (await freteDe(S3))[0]?.id ?? "";
    });

    // ---------------------------------------------------------------- 2
    console.log("\n2. Origem da venda (Q245)");
    await rodar("seção 2", async () => {
      const rE = await vender(vend, [pix(120)], { freight_amount: 20, origin: "ecommerce" });
      SE = idDe(rE);
      check("origin ecommerce é gravada e devolvida", rE.ok && dados(rE)?.origin === "ecommerce", j(rE));
      const lE = await vv("listarVendasAction", admin, { establishment_id: L1.id, origin: "ecommerce" });
      const idsE = lista(dados(lE)).map((x) => x.id);
      check("filtrar origin ecommerce traz a venda e só vendas e-commerce", lE.ok && idsE.includes(SE) && lista(dados(lE)).every((x) => x.origin === "ecommerce"), j(lE).slice(0, 300));
      const lB = await vv("listarVendasAction", admin, { establishment_id: L1.id, origin: "balcao" });
      check("filtrar origin balcao traz a venda do balcão e não a e-commerce", lB.ok && lista(dados(lB)).some((x) => x.id === S1) && !lista(dados(lB)).some((x) => x.id === SE), j(lB).slice(0, 300));
      check("origin loja: 422 VALIDATION_ERROR em origin (venda)", recusa(await vender(vend, [pix(100)], { origin: "loja" }), "VALIDATION_ERROR", "origin"));
      check("origin loja: 422 VALIDATION_ERROR em origin (lista)", recusa(await vv("listarVendasAction", admin, { establishment_id: L1.id, origin: "loja" }), "VALIDATION_ERROR", "origin"));
    });

    // ---------------------------------------------------------------- 3
    console.log("\n3. Resultado da Loja: o frete é repasse (Q246, Q247)");
    await rodar("seção 3", async () => {
      const mes = mesAtual();
      const ler = async () => dados(await dd("resultadoDaLojaAction", admin, { establishment_id: L3.id, month: mes }));
      const r0 = await ler();
      check("sales 100 (o faturamento são os itens)", perto(r0?.sales, 100), j(r0)?.slice(0, 300));
      check("variable_expenses 10 (a regra sobre os itens, sem o frete)", perto(r0?.variable_expenses, 10), String(r0?.variable_expenses));
      check("freight.received 20, paid 20, difference 0", perto(r0?.freight?.received, 20) && perto(r0?.freight?.paid, 20) && perto(r0?.freight?.difference, 0), j(r0?.freight));
      const esperado0 = n(r0?.margin) - n(r0?.losses) - n(r0?.fixed_expenses) + n(r0?.freight?.difference);
      check("result = margin - losses - fixed_expenses + freight.difference", perto(r0?.result, esperado0), `${r0?.result} contra ${esperado0}`);

      const rCor = await dd("corrigirDespesaAction", admin, freteS3, { amount: 25 });
      check("corrigir a conta do frete para 25: ok", rCor.ok, j(rCor));
      const r1 = await ler();
      check("depois: freight.paid 25 e difference -5", perto(r1?.freight?.paid, 25) && perto(r1?.freight?.difference, -5) && perto(r1?.freight?.received, 20), j(r1?.freight));
      check("o resultado cai 5", perto(r1?.result, n(r0?.result) - 5), `${r1?.result} contra ${n(r0?.result) - 5}`);
      const rTodas = dados(await dd("resultadoDaLojaAction", admin, { establishment_id: "all", month: mes }));
      const linhaL3 = lista(rTodas?.stores).find((s) => s.establishment_id === L3.id);
      check("a visão somada (stores) traz a Loja 3 com freight", !!linhaL3 && perto(linhaL3?.freight?.difference, -5), j(linhaL3));
    });

    // ---------------------------------------------------------------- 4
    console.log("\n4. A pagar: a conta do frete (Q246)");
    await rodar("seção 4", async () => {
      const list = async (ator: Ator = admin, cli: "A" | "B" = "A") =>
        lista(dados(await (cli === "A" ? dd : ddB)("listarContasAPagarAction", ator, { establishment_id: L3.id })));
      const achar = async () => (await list()).find((x) => x.entry_id === freteS3);
      const c0 = await achar();
      check("a conta do frete aparece com origin frete", c0?.origin === "frete", j(c0));
      check("traz sale_id e sale_number da venda", c0?.sale_id === S3 && c0?.sale_number === (await db.emporioSale.findFirst({ where: { id: S3 } }))?.number, j(c0));
      check("can_correct verdadeiro (pendente sem pagamento)", c0?.can_correct === true, j(c0));
      const rCont = await dd("lerQuantidadeDeContasAPagar", admin, { establishment_id: L3.id });
      const num = typeof dados(rCont) === "number" ? dados(rCont) : (acha(dados(rCont), "count") ?? acha(dados(rCont), "total") ?? acha(dados(rCont), "pending"));
      check("lerQuantidadeDeContasAPagar conta a conta do frete (o número bate com a lista)", rCont.ok && num === (await list()).length && num >= 2, `${j(rCont)} lista ${(await list()).length}`);

      const rPg = await dd("pagarDespesasAction", admin, { entry_ids: [freteS3], from: { bank_account_id: conta } });
      check("pagarDespesasAction paga a conta do frete", rPg.ok && (await db.financialEntry.findFirst({ where: { id: freteS3 } }))?.status === "paid", j(rPg));
      const c1 = lista(dados(await dd("listarContasAPagarAction", admin, { establishment_id: L3.id, status: "all" }))).find((x) => x.entry_id === freteS3);
      check("depois de paga: a conta segue listada (paid) e can_correct é falso", !!c1 && c1.can_correct === false, j(c1));

      // venda cancelada: a conta do frete (pendente) não aparece como pendente
      const rC = await vender(vend, [pix(120)], { establishment_id: L3.id, freight_amount: 20, cash_register_id: turnoL3.cash_register_id });
      const SC = idDe(rC);
      const fC = (await freteDe(SC))[0]?.id;
      const rCan = await vv("cancelarVendaAction", gestor, SC, { reason: "teste do frete", cash_register_id: turnoL3.cash_register_id });
      check("cancelar a venda com frete: ok", rC.ok && rCan.ok, j([rC, rCan]));
      const lPend = lista(dados(await dd("listarContasAPagarAction", admin, { establishment_id: L3.id, status: "pending" })));
      check("a conta do frete da venda cancelada não está entre as pendentes", !!fC && !lPend.some((x) => x.id === fC), j(lPend.map((x) => x.id)));
    });

    // ---------------------------------------------------------------- 5
    console.log("\n5. Cancelar a venda com frete (Q246)");
    await rodar("seção 5", async () => {
      const rA = await vender(vend, [pix(120)], { freight_amount: 20 });
      const SA = idDe(rA);
      const rCanA = await vv("cancelarVendaAction", gestor, SA, { reason: "frete pendente" });
      const fA = await freteDe(SA);
      check("cancelar a venda deixa a conta do frete pendente como cancelled", rCanA.ok && fA.length === 1 && fA[0].status === "cancelled", j([rCanA, fA]));

      const rB = await vender(vend, [pix(120)], { freight_amount: 20 });
      const SB = idDe(rB);
      const fB = (await freteDe(SB))[0];
      const rPg = await dd("pagarDespesasAction", admin, { entry_ids: [fB?.id], from: { bank_account_id: conta } });
      if (!rPg.ok && fB) await db.financialEntry.update({ where: { id: fB.id }, data: { status: "paid" } }); // plano B: a Task 3 ainda não existe
      const rCanB = await vv("cancelarVendaAction", gestor, SB, { reason: "frete já pago" });
      const fB2 = await freteDe(SB);
      check("com a conta do frete paga, cancelar a venda deixa a conta paid", rCanB.ok && fB2.length === 1 && fB2[0].status === "paid", j([rCanB, fB2]));
      check("a receita das duas vendas canceladas fica cancelled", (await receitaDe(SA)).length === 1 && (await receitaDe(SA)).every((x) => x.status === "cancelled") && (await receitaDe(SB)).length === 1 && (await receitaDe(SB)).every((x) => x.status === "cancelled"));
    });

    // ---------------------------------------------------------------- 6
    console.log("\n6. Editar venda (Q249)");
    let A_ID = "";
    let N_ID = "";
    await rodar("seção 6", async () => {
      const rA = await vender(vend, [dinheiro(100)], { cash_register_id: turnoL1.cash_register_id });
      A_ID = idDe(rA);
      const A = dados(rA);
      const saldo0 = await saldoDe(L1.id);
      const chaveEd = chave("ed");
      const corpo = { operation_key: chaveEd, items: itens(), freight_amount: 20, origin: "ecommerce", payments: [dinheiro(120)], cash_register_id: turnoL1.cash_register_id };
      const rEd = await vv("editarVendaAction", gestor, A_ID, corpo);
      check("o gestor edita: ok", rEd.ok, j(rEd));
      const N = dados(rEd);
      N_ID = N?.id ?? "";
      check(
        "a nova: número maior, net 100, frete 20, total 120, origem ecommerce, replaces a antiga",
        n(N?.number) > n(A?.number) && perto(n(N?.net_amount), 100) && perto(n(N?.freight_amount), 20) && perto(n(N?.total_amount), 120) && N?.origin === "ecommerce" && N?.replaces?.id === A_ID,
        j(N),
      );
      const aLida = dados(await vv("lerVendaAction", admin, A_ID));
      check("a antiga fica cancelada, com 'Substituída pela venda nº' e replaced_by = a nova", aLida?.status === "cancelada" && String(aLida?.canceled_reason ?? "").includes("Substituída pela venda nº") && aLida?.replaced_by?.id === N_ID, j(aLida));

      const movA = await db.stockMovement.findMany({ where: { sale_id: A_ID, movement_type: "venda" } });
      const movN = await db.stockMovement.findMany({ where: { sale_id: N_ID, movement_type: "venda" } });
      check("as movimentações de venda da antiga têm canceled_at e as da nova não", movA.length > 0 && movA.every((m) => m.canceled_at) && movN.length > 0 && movN.every((m) => !m.canceled_at), j([movA.length, movN.length]));
      check("o saldo do produto é o mesmo de antes da edição", perto(await saldoDe(L1.id), saldo0), `${await saldoDe(L1.id)} contra ${saldo0}`);

      const saida = await db.cashMovement.findMany({ where: { sale_id: A_ID, origin: "cancelamento_venda", direction: "saida" } });
      const entrada = await db.cashMovement.findMany({ where: { sale_id: N_ID, origin: "venda", direction: "entrada" } });
      check("gaveta: saída cancelamento_venda de 100 da antiga e entrada venda de 120 da nova", saida.length === 1 && perto(n(saida[0].amount), 100) && entrada.length === 1 && perto(n(entrada[0].amount), 120), j([saida, entrada]));

      const frN = await freteDe(N_ID);
      check("a nova tem a conta do frete pendente de 20 e a antiga não tem", frN.length === 1 && frN[0].status === "pending" && perto(n(frN[0].amount), 20) && (await freteDe(A_ID)).length === 0, j(frN));
      const recA = await receitaDe(A_ID);
      const recN = await receitaDe(N_ID);
      check("a receita da antiga está cancelled; a da nova vale 120 e está paid", recA.length === 1 && recA[0].status === "cancelled" && recN.length === 1 && perto(n(recN[0].amount), 120) && recN[0].status === "paid", j([recA, recN]));
      const hist = await db.emporioAuditLog.findMany({ where: { action: "venda.editar" } });
      check("o histórico tem um registro venda.editar", hist.length === 1, j(hist.map((h) => h.summary)));

      const vendasAntes = await db.emporioSale.count();
      const rRe = await vv("editarVendaAction", gestor, A_ID, corpo);
      check("repetir a mesma operation_key: replayed true, mesma venda, sem terceira venda", rRe.ok && dados(rRe)?.replayed === true && dados(rRe)?.id === N_ID && (await db.emporioSale.count()) === vendasAntes, j(rRe));

      // recusas
      const rCurto = await vv("editarVendaAction", gestor, N_ID, { operation_key: chave("ed"), items: itens(), freight_amount: 20, payments: [dinheiro(100)], cash_register_id: turnoL1.cash_register_id });
      check("editar a nova com pagamentos de 100 e frete 20: 422 payments", recusa(rCurto, "VALIDATION_ERROR", "payments"), j(rCurto));
      check("e a nova segue concluida", dados(await vv("lerVendaAction", admin, N_ID))?.status === "concluida");
      check("editar a antiga de novo: SALE_CANCELED", recusa(await vv("editarVendaAction", gestor, A_ID, { ...corpo, operation_key: chave("ed") }), "SALE_CANCELED"));

      const sDev = await vender(vend, [dinheiro(100)], { cash_register_id: turnoL1.cash_register_id });
      const dev = await vv("devolverAction", owner, idDe(sDev), { operation_key: chave("dev"), refund_kind: "dinheiro", cash_register_id: turnoL1.cash_register_id, items: [{ sale_item_id: dados(sDev)?.items?.[0]?.id, quantity: 1 }] });
      check("fixture: devolução registrada", dev.ok, j(dev));
      check("editar venda com devolução: SALE_HAS_RETURNS", recusa(await vv("editarVendaAction", gestor, idDe(sDev), { operation_key: chave("ed"), items: itens(), payments: [dinheiro(100)], cash_register_id: turnoL1.cash_register_id }), "SALE_HAS_RETURNS"));

      const sTr = await vender(vend, [dinheiro(100)], { cash_register_id: turnoL1.cash_register_id });
      const tr = await vv("trocarAction", owner, idDe(sTr), { operation_key: chave("tr"), cash_register_id: turnoL1.cash_register_id, items_devolvidos: [{ sale_item_id: dados(sTr)?.items?.[0]?.id, quantity: 1 }], venda: { customer_id: cf, items: itens(1), payments: [] } });
      check("fixture: troca registrada", tr.ok, j(tr));
      check("editar a venda nova de uma troca: SALE_IS_EXCHANGE", recusa(await vv("editarVendaAction", gestor, dados(tr)?.venda?.id ?? "x", { operation_key: chave("ed"), items: itens(1), payments: [dinheiro(50)], cash_register_id: turnoL1.cash_register_id }), "SALE_IS_EXCHANGE"));

      const sV = await vender(vend, [pix(100)]);
      check("o vendedor sem gestor edita: FORBIDDEN", recusa(await vv("editarVendaAction", vend, idDe(sV), { operation_key: chave("ed"), items: itens(), payments: [pix(100)] }), "FORBIDDEN"));
      check("e a venda segue concluida", dados(await vv("lerVendaAction", admin, idDe(sV)))?.status === "concluida");

      // Fix round 1: venda que faturou orçamento, editada.
      const Orc = await import("@/lib/actions/emporio-orcamentos");
      const rOrc = await Orc.salvarOrcamentoAction(db, vend as never, { operation_key: chave("orc"), establishment_id: L1.id, customer_id: cf, items: itens() } as never);
      const orcId = (rOrc as Dado).ok ? (rOrc as Dado).data?.id : "";
      check("fixture: orçamento salvo", !!orcId, j(rOrc).slice(0, 300));
      const sQ = await vender(vend, [dinheiro(100)], { cash_register_id: turnoL1.cash_register_id, quote_id: orcId });
      check("fixture: venda faturou o orçamento", sQ.ok && dados(sQ)?.quote?.id === orcId, j(sQ).slice(0, 300));
      const rEdQ = await vv("editarVendaAction", gestor, idDe(sQ), { operation_key: chave("ed"), items: itens(), payments: [dinheiro(100)], cash_register_id: turnoL1.cash_register_id });
      check("editar a venda que faturou orçamento: ok, a nova guarda o orçamento", rEdQ.ok && dados(rEdQ)?.quote?.id === orcId, j(rEdQ).slice(0, 300));
      const orcDepois = await db.emporioQuote.findFirst({ where: { id: orcId } });
      check("o orçamento aponta sale_id para a venda nova", !!dados(rEdQ)?.id && orcDepois?.sale_id === dados(rEdQ)?.id, j(orcDepois?.sale_id));
      const movQ = await db.stockMovement.findMany({ where: { sale_id: idDe(sQ), movement_type: "venda" } });
      const numQ = String(dados(rEdQ)?.number ?? "");
      check("o motivo provisório não sobra nas movimentações da antiga", movQ.length > 0 && movQ.every((m) => String(m.canceled_reason).includes("Substituída pela venda nº") && !String(m.canceled_reason).includes("em edição") && numQ !== ""), j(movQ.map((m) => m.canceled_reason)));
      const caixaQ = await db.cashMovement.findMany({ where: { sale_id: idDe(sQ), origin: "cancelamento_venda" } });
      check("nem nas saídas da gaveta", caixaQ.length > 0 && caixaQ.every((m) => !String(m.notes).includes("em edição")), j(caixaQ.map((m) => m.notes)));
      // quote_id null explícito: sem orçamento.
      const rOrc2 = await Orc.salvarOrcamentoAction(db, vend as never, { operation_key: chave("orc"), establishment_id: L1.id, customer_id: cf, items: itens() } as never);
      const orc2 = (rOrc2 as Dado).ok ? (rOrc2 as Dado).data?.id : "";
      const sQ2 = await vender(vend, [dinheiro(100)], { cash_register_id: turnoL1.cash_register_id, quote_id: orc2 });
      const rEdQ2 = await vv("editarVendaAction", gestor, idDe(sQ2), { operation_key: chave("ed"), items: itens(), payments: [dinheiro(100)], cash_register_id: turnoL1.cash_register_id, quote_id: null });
      const orc2Depois = await db.emporioQuote.findFirst({ where: { id: orc2 } });
      check("quote_id null na edição: a nova sai sem orçamento e o orçamento volta a aberto", rEdQ2.ok && !dados(rEdQ2)?.quote && orc2Depois?.sale_id === null, j([rEdQ2.ok, orc2Depois?.sale_id]));

      // Fix round 2: o fiado da própria venda editada não conta na dívida nem no atraso.
      const cliF = await prisma.emporioCustomer.create({ data: { tenant_id: TA.t.id, name: `M102 fiado ${stamp}`, fiado_limit: 1000 } as Dado });
      const chaveOutra = chave("outra");
      const sF1 = await vender(vend, [{ kind: "fiado", amount: 500 }], { customer_id: cliF.id, items: itens(10), operation_key: chaveOutra });
      const sF2 = await vender(vend, [{ kind: "fiado", amount: 400 }], { customer_id: cliF.id, items: itens(8) });
      check("fixture: cliente com limite 1000 e 900 em aberto (400 da venda a editar)", sF1.ok && sF2.ok, j([sF1, sF2]).slice(0, 400));
      const rEdF = await vv("editarVendaAction", gestor, idDe(sF2), { operation_key: chave("ed"), customer_id: cliF.id, items: itens(8), freight_amount: 20, payments: [{ kind: "fiado", amount: 400 }, pix(20)] });
      check("editar mantendo o fiado de 400 e incluindo frete: ok (900 menos os 400 da própria venda)", rEdF.ok, j(rEdF).slice(0, 300));
      const rEdF2 = await vv("editarVendaAction", gestor, idDe(rEdF), { operation_key: chave("ed"), customer_id: cliF.id, items: itens(12), payments: [{ kind: "fiado", amount: 600 }] });
      check("a mesma edição com fiado de 600 (passa do limite de verdade): LIMITE_EXCEDIDO", recusa(rEdF2, "LIMITE_EXCEDIDO"), j(rEdF2).slice(0, 300));

      // Fix round 2: chave de OUTRA venda não é replay; o histórico do cancelamento sai com o texto final.
      check("editar com a chave de outra venda: DUPLICATE_OPERATION_KEY", recusa(await vv("editarVendaAction", gestor, idDe(rEdF), { operation_key: chaveOutra, customer_id: cliF.id, items: itens(8), payments: [{ kind: "fiado", amount: 400 }, pix(20)], freight_amount: 20 }), "DUPLICATE_OPERATION_KEY"));
      const logsCan = await db.emporioAuditLog.findMany({ where: { action: "venda.cancelar", target_id: idDe(sF2) } });
      check("o histórico do cancelamento da edição não traz o texto provisório", logsCan.length === 1 && !logsCan[0].summary.includes("em edição") && logsCan[0].summary.includes("Substituída pela venda nº"), j(logsCan.map((l) => l.summary)));
    });

    // ---- Review Focus 3: dinheiro com o turno encerrado
    await rodar("seção 6 (turno encerrado)", async () => {
      const rD = await vender(vend, [dinheiro(100)], { establishment_id: L2.id, cash_register_id: turnoL2.cash_register_id });
      const SD = idDe(rD);
      const saldoCaixa = (await db.cashMovement.findMany({ where: { establishment_id: L2.id, bank_account_id: null } })).reduce((s, m) => s + (m.direction === "entrada" ? n(m.amount) : -n(m.amount)), 0);
      const rEnc = await chamar([TU], db, "encerrarTurnoAction", owner, turnoL2.id, { operation_key: chave("enc"), counted: saldoCaixa, malote_amount: 0 });
      check("fixture: o turno da Loja 2 é encerrado", rD.ok && rEnc.ok, j([rD, rEnc]).slice(0, 400));
      const antes = (await receitaDe(SD))[0];
      const rEd = await vv("editarVendaAction", gestor, SD, { operation_key: chave("ed"), items: itens(), payments: [dinheiro(100)] });
      check("editar com o turno encerrado e nenhum aberto: CASH_CLOSED ou CASH_REGISTER_REQUIRED", recusa(rEd, "CASH_CLOSED") || recusa(rEd, "CASH_REGISTER_REQUIRED"), j(rEd));
      const depois = (await receitaDe(SD))[0];
      check("a venda segue concluida e o lançamento como estava", dados(await vv("lerVendaAction", admin, SD))?.status === "concluida" && antes?.status === depois?.status && perto(n(antes?.amount), n(depois?.amount)), j([antes?.status, depois?.status]));
    });

    // ---------------------------------------------------------------- 7
    console.log("\n7. Isolamento entre clientes");
    await rodar("seção 7", async () => {
      check("B lê a venda com frete de A: NOT_FOUND", recusa(await vvB("lerVendaAction", ownerB, S1), "NOT_FOUND"));
      check("B edita a venda de A: NOT_FOUND", recusa(await vvB("editarVendaAction", ownerB, A_ID || S1, { operation_key: `m102-b-${stamp}`, items: itens(), payments: [dinheiro(100)], customer_id: cfB }), "NOT_FOUND"));
      check("B cancela a venda de A: NOT_FOUND", recusa(await vvB("cancelarVendaAction", ownerB, S1, { reason: "invasor" }), "NOT_FOUND"));
      const lB = await vvB("listarVendasAction", ownerB, { origin: "ecommerce" });
      check("B lista vendas e-commerce: nenhuma de A", lB.ok && lista(dados(lB)).length === 0, j(lB).slice(0, 200));
      const cB = await ddB("listarContasAPagarAction", ownerB, {});
      check("B não vê a conta do frete de A no A pagar", cB.ok && !j(dados(cB) ?? []).includes(freteS3) && freteS3 !== "", j(cB).slice(0, 200));
      const rCorB = await ddB("corrigirDespesaAction", ownerB, freteS3, { amount: 99 });
      check("B corrige a conta do frete de A: recusado", !rCorB.ok, j(rCorB));
      check("e o valor da conta de A não mudou (25)", perto(n((await db.financialEntry.findFirst({ where: { id: freteS3 } }))?.amount), 25));
    });

    // ---------------------------------------------------------------- 8
    console.log("\n8. Impressão do recibo (Q248)");
    await rodar("seção 8", async () => {
      const r = await chamar([IM], db, "lerImpressoDaVendaAction", admin, SE);
      check("o recibo da venda e-commerce: frete 20, total 120, origem ecommerce", r.ok && perto(acha(dados(r), "frete"), 20) && perto(acha(dados(r), "total"), 120) && acha(dados(r), "origem") === "ecommerce", j(r).slice(0, 400));
      const r2 = await chamar([IM], db, "lerImpressoDaVendaAction", admin, S1);
      check("o recibo da venda de balcão com frete: origem balcao e total 120", r2.ok && acha(dados(r2), "origem") === "balcao" && perto(acha(dados(r2), "total"), 120), j(r2).slice(0, 400));
    });
  } finally {
    // teardown: os tenants criados (o cascade leva o resto)
    const { prisma } = await import("@/lib/prisma");
    for (const id of tenantIds) {
      try {
        await prisma.tenant.delete({ where: { id } });
      } catch (e) {
        console.log(`  ⚠️ não apagou o tenant ${id}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      }
    }
    await prisma.$disconnect();
  }
}

comBanco()
  .then(() => {
    console.log(`\n${totalChecks - falhas}/${totalChecks} verificações`);
    if (falhas > 0) {
      console.log(`❌ ${falhas} falha(s)`);
      process.exit(1);
    }
    console.log("✅ M102 verde");
    process.exit(0);
  })
  .catch((e) => {
    console.error("💥", e);
    process.exit(1);
  });
