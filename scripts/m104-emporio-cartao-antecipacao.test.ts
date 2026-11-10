import "./_env-local";
import { papelDeFixture, vincularTodas, virarGestor, virarVendedor } from "./_emporio-papel";
import { AsyncLocalStorage } from "node:async_hooks";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório): cartão, entregas 2 e 3 (dia útil, taxa por parcela,
 * antecipação pontual e automática, cancelamento como a Stone) e dívidas 2.37 e 2.59.
 * Roda: `npm run test:m104`
 *
 * Escrita da spec (docs/superpowers/specs/2026-11-09-emporio-cartao-entregas-2-e-3-design.md,
 * Q259 a Q267) e dos blocos Interfaces e Step 1 das Tasks 1 a 4 do plano, sem ler a
 * implementação. Módulo, action ou campo ainda inexistente vira recusa `ACTION_AUSENTE`
 * ou asserção que falha, nunca erro de sintaxe.
 *
 * Seções: 1 calendário e funções puras (sem banco), 2 venda, 3 saldo e a receber,
 * 4 cancelamento, 5 antecipação pontual, 6 fiado concorrente, 7 Resultado e
 * configuração da adquirente, 8 isolamento.
 *
 * O que os briefs calavam e esta suíte ASSUME:
 * - as datas dos campos novos de adquirente (`auto_anticipation_since`) e `operated_on`
 *   entram como Date (meio-dia UTC); as colunas Date voltam do Prisma como Date;
 * - a venda no débito do sábado usa `sold_at` fixo 2026-11-07 (sábado, 10h Brasília):
 *   a suíte aceita venda com data passada, como a m103 faz com "ontem". O brief fala em
 *   2026-11-14, que ainda está no futuro em 09/11, então usei o sábado anterior (o
 *   domingo seguinte é 2026-11-08 e a segunda é 2026-11-09, sem feriado);
 * - o dia da automática é "o dia da venda (Brasília) mais N dias úteis", e o oráculo
 *   desse dia útil é o próprio `somarDiasUteis` (a seção 1 prova a função);
 * - custo pro rata da automática: líquido x pct/100 x dias entre o efetivo e o previsto / 30,
 *   com tolerância de 1 centavo por parcela;
 * - "estorno por líquido efetivo" no cancelamento é lido pela queda do saldo da conta
 *   (`saldosDasContas`, em centavos), sem supor o tipo da movimentação;
 * - despesa cancelada tem `status: "cancelled"`; despesa paga, `status: "paid"`;
 * - o carimbo da conciliação é `CardReceivable.reconciled_at` (gravado por Prisma);
 * - a recusa de permissão da antecipação é `FORBIDDEN` (Vendedor sem Financeiro);
 * - parcela ou operação de outro tenant: status 404;
 * - o fiado concorrente: uma venda ok e a outra recusada com status 409
 *   (`LIMITE_EXCEDIDO`, ou conflito serializável), nunca as duas ok;
 * - o limite do cliente é gravado por Prisma (`fiado_limit`), como a m99;
 * - `listarContasAReceberAction` devolve `cards` com `effective_on`, `effective_net`,
 *   `fee_amount`, `anticipated`; `lerFluxoProjetadoAction` traz `receivables.cards`;
 * - o teardown apaga na ordem da m103, mais `cardAnticipation`, com `as any` nos models novos.
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

const perto = (a: unknown, b: number, tol = 0.005) => typeof a === "number" && Math.abs(a - b) < tol;
const recusa = (r: R, code: string, field?: string, status?: number) =>
  !r.ok && r.code === code && (field === undefined || r.field === field || (r.field ?? "").startsWith(`${field}.`)) && (status === undefined || r.status === status);
const j = (x: unknown): string => JSON.stringify(x) ?? "undefined";
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));
const DIA = 86_400_000;
const brDia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const meioDia = (s: string) => new Date(`${s}T12:00:00Z`);
const somaDias = (s: string, k: number) => new Date(meioDia(s).getTime() + k * DIA).toISOString().slice(0, 10);
const dia = (x: Date | string | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const mesAtual = () => brDia(new Date()).slice(0, 7);
const cent = (x: unknown) => Math.round(n(x) * 100);
const diasEntre = (de: string, ate: string) => Math.round((meioDia(ate).getTime() - meioDia(de).getTime()) / DIA);

console.log("💳 M104: Módulo 39 (Meu Empório), cartão: dia útil, taxa por parcela, antecipação, cancelamento, fiado sem corrida\n");

const HOJE = brDia(new Date());
const ONTEM = somaDias(HOJE, -1);
const AMANHA = somaDias(HOJE, 1);

// ------------------------------------------------------------------ 1 (sem banco)
async function secao1() {
  console.log("1. Calendário e funções puras (Q259, Q260, Q262)");
  const cDia = "@/lib/emporio/dia-util";
  const cCartao = "@/lib/emporio/cartao";
  let D: Record<string, Dado> = {};
  let C: Record<string, Dado> = {};
  try {
    D = (await import(cDia)) as Record<string, Dado>;
  } catch (e) {
    check("o módulo @/lib/emporio/dia-util carrega", false, e instanceof Error ? e.message : String(e));
  }
  try {
    C = (await import(cCartao)) as Record<string, Dado>;
  } catch (e) {
    check("o módulo @/lib/emporio/cartao carrega", false, e instanceof Error ? e.message : String(e));
  }
  const u = (s: string) => new Date(`${s}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const { pascoa, feriadosNacionais, ehDiaUtil, proximoDiaUtil, somarDiasUteis } = D;
  check("dia-util exporta as cinco funções", [pascoa, feriadosNacionais, ehDiaUtil, proximoDiaUtil, somarDiasUteis].every((f) => typeof f === "function"));
  if (typeof pascoa === "function") check("pascoa(2026) = 2026-04-05", iso(pascoa(2026)) === "2026-04-05", String(pascoa(2026)));
  if (typeof feriadosNacionais === "function") {
    const f: Set<string> = feriadosNacionais(2026);
    for (const d of ["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"]) {
      check(`feriado nacional de 2026: ${d}`, f.has(d), j([...f].sort()));
    }
    check("2026-11-16 não é feriado", !f.has("2026-11-16"));
  }
  if (typeof ehDiaUtil === "function") {
    check("sábado 2026-11-14 não é dia útil", ehDiaUtil(u("2026-11-14")) === false);
    check("domingo 2026-11-15 não é dia útil", ehDiaUtil(u("2026-11-15")) === false);
    check("segunda 2026-11-16 é dia útil", ehDiaUtil(u("2026-11-16")) === true);
    check("sexta 2026-11-20 (feriado) não é dia útil", ehDiaUtil(u("2026-11-20")) === false);
  }
  if (typeof proximoDiaUtil === "function") {
    check("proximoDiaUtil(sábado 2026-11-14) = 2026-11-16", iso(proximoDiaUtil(u("2026-11-14"))) === "2026-11-16");
    check("proximoDiaUtil(segunda 2026-11-16) é o próprio dia", iso(proximoDiaUtil(u("2026-11-16"))) === "2026-11-16");
    check("proximoDiaUtil(sexta 2026-11-20, feriado) = 2026-11-23", iso(proximoDiaUtil(u("2026-11-20"))) === "2026-11-23");
  }
  if (typeof somarDiasUteis === "function") {
    check("somarDiasUteis(sexta 2026-11-13, 1) = 2026-11-16", iso(somarDiasUteis(u("2026-11-13"), 1)) === "2026-11-16");
    check("somarDiasUteis(sexta 2026-11-13, 0) = ela mesma (útil)", iso(somarDiasUteis(u("2026-11-13"), 0)) === "2026-11-13");
    check("somarDiasUteis(sábado 2026-11-14, 0) = 2026-11-16", iso(somarDiasUteis(u("2026-11-14"), 0)) === "2026-11-16");
    check("somarDiasUteis(quinta 2026-11-19, 1) pula o feriado de sexta: 2026-11-23", iso(somarDiasUteis(u("2026-11-19"), 1)) === "2026-11-23");
  }
  const { datasDasParcelas, custoAntecipacaoCent, ratearCustoCent, CATEGORIA_ANTECIPACAO } = C;
  check("CATEGORIA_ANTECIPACAO é 'Antecipação de recebíveis'", CATEGORIA_ANTECIPACAO === "Antecipação de recebíveis", String(CATEGORIA_ANTECIPACAO));
  if (typeof datasDasParcelas === "function") {
    const sab = new Date("2026-11-14T13:00:00Z"); // sábado 10h em Brasília
    check("1x débito de sábado, próximo dia útil: segunda 2026-11-16", j((datasDasParcelas(sab, 1, 1, "proximo_dia_util") as Date[]).map(iso)) === j(["2026-11-16"]), j(datasDasParcelas(sab, 1, 1, "proximo_dia_util")));
    check("1x débito de sábado, dias corridos: domingo 2026-11-15", j((datasDasParcelas(sab, 1, 1, "dias_corridos") as Date[]).map(iso)) === j(["2026-11-15"]), j(datasDasParcelas(sab, 1, 1, "dias_corridos")));
    const tres = datasDasParcelas(new Date("2026-11-09T15:00:00Z"), 30, 3, "proximo_dia_util") as Date[];
    check("3x de 30 dias a partir de 2026-11-09: 12-09, 01-08 e 02-10 (Carnaval e domingo)", j(tres.map(iso)) === j(["2026-12-09", "2027-01-08", "2027-02-10"]), j(tres));
    const padrao = datasDasParcelas(sab, 1, 1) as Date[];
    check("sem a regra o padrão é o próximo dia útil (Q260)", j(padrao.map(iso)) === j(["2026-11-16"]), j(padrao));
  } else check("datasDasParcelas existe", false);
  if (typeof custoAntecipacaoCent === "function") {
    check("custoAntecipacaoCent(10000, 2,5% a.m., 30 dias) = 250", custoAntecipacaoCent(10000, 2.5, u("2026-11-10"), u("2026-12-10")) === 250, String(custoAntecipacaoCent(10000, 2.5, u("2026-11-10"), u("2026-12-10"))));
    check("custoAntecipacaoCent: zero dias, custo zero", custoAntecipacaoCent(10000, 2.5, u("2026-11-10"), u("2026-11-10")) === 0);
  } else check("custoAntecipacaoCent existe", false);
  if (typeof ratearCustoCent === "function") {
    check("ratearCustoCent(100, [5000, 3000, 2000]) = [50, 30, 20]", j(ratearCustoCent(100, [5000, 3000, 2000])) === j([50, 30, 20]), j(ratearCustoCent(100, [5000, 3000, 2000])));
    const r = ratearCustoCent(10, [3333, 3333, 3334]) as number[];
    check("ratearCustoCent(10, [3333, 3333, 3334]) soma 10, em 3 partes", r.length === 3 && r.reduce((a, b) => a + b, 0) === 10, j(r));
  } else check("ratearCustoCent existe", false);
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const caminhos = {
    catalogo: "@/lib/actions/emporio-catalogo",
    estoque: "@/lib/actions/emporio-estoque",
    vendas: "@/lib/actions/emporio-vendas",
    caixa: "@/lib/actions/emporio-caixa",
    cartoes: "@/lib/actions/emporio-cartoes",
    antecipacao: "@/lib/actions/emporio-antecipacao",
    financeiro: "@/lib/actions/emporio-financeiro",
    projecao: "@/lib/actions/emporio-projecao",
    resultado: "@/lib/actions/emporio-resultado",
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
  const K = await carregar(caminhos.cartoes);
  const AN = await carregar(caminhos.antecipacao);
  const F = await carregar(caminhos.financeiro);
  const PJ = await carregar(caminhos.projecao);
  const RS = await carregar(caminhos.resultado);
  let DU: Record<string, Dado> = {};
  try {
    DU = (await import("@/lib/emporio/dia-util" as string)) as Record<string, Dado>;
  } catch {
    DU = {};
  }
  const somarUteis = (s: string, k: number): string => {
    if (typeof DU.somarDiasUteis === "function") return dia(DU.somarDiasUteis(new Date(`${s}T00:00:00Z`), k));
    let d = s;
    let faltam = k;
    while (faltam > 0) {
      d = somaDias(d, 1);
      const w = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (w !== 0 && w !== 6) faltam -= 1;
    }
    return d;
  };

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M104 ${rotulo} ${stamp}`, document: `M104${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
      });
      tenantIds.push(t.id);
      const mkUser = async (suf: string, role: Role): Promise<Ator> => {
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M104 ${rotulo} ${suf}`, email: `m104-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role, ...papelDeFixture(role) },
        });
        return { id: u.id, role };
      };
      return { t, mkUser };
    };
    const TA = await mkTenant("A");
    const TB = await mkTenant("B");
    const owner = await TA.mkUser("own", "OWNER");
    const admin = await TA.mkUser("adm", "ADMIN");
    const vend = await TA.mkUser("vnd", "OPERADOR");
    const gestor = await TA.mkUser("ges", "OPERADOR");
    const ownerB = await TB.mkUser("own", "OWNER");
    const db = prismaForTenant(TA.t.id);
    const dbB = prismaForTenant(TB.t.id);
    const dbx = db as Dado;
    const dbBx = dbB as Dado;
    const cat = await db.productCategory.create({ data: scoped({ name: "M104 categoria" }) });
    const cf = (await (await import("@/lib/actions/emporio-clientes")).garantirConsumidorFinal(db)).id;

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
    const kk = (nome: string, ...a: unknown[]) => chamar([K], db, nome, ...a);
    const kkB = (nome: string, ...a: unknown[]) => chamar([K], dbB, nome, ...a);
    const xx = (nome: string, ...a: unknown[]) => chamar([X], db, nome, ...a);
    const xxB = (nome: string, ...a: unknown[]) => chamar([X], dbB, nome, ...a);
    const aa = (nome: string, ...a: unknown[]) => chamar([AN], db, nome, ...a);
    const aaB = (nome: string, ...a: unknown[]) => chamar([AN], dbB, nome, ...a);
    const ff = (nome: string, ...a: unknown[]) => chamar([F], db, nome, ...a);
    const pj = (nome: string, ...a: unknown[]) => chamar([PJ], db, nome, ...a);
    const rs = (nome: string, ...a: unknown[]) => chamar([RS], db, nome, ...a);
    const rodar = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        check(`${nome}: terminou sem exceção`, false, e instanceof Error ? e.message : String(e));
      }
    };

    const mkLoja = async (nome: string) => {
      const r = await cc("criarEstabelecimentoAction", owner, { name: `M104 ${nome}`, kind: "ponto_venda" });
      const l = dados(r);
      if (!l) throw new Error(`não criou a loja ${nome}: ${j(r)}`);
      return l as { id: string };
    };
    const L2 = await mkLoja("Loja 2 venda");
    const L3 = await mkLoja("Loja 3 saldo");
    const L4 = await mkLoja("Loja 4 cancelamento");
    const L5 = await mkLoja("Loja 5 antecipacao");
    const L6 = await mkLoja("Loja 6 fiado");
    const L7 = await mkLoja("Loja 7 resultado");
    const lojas = [L2, L3, L4, L5, L6, L7];
    await vincularTodas(prisma, TA.t.id, [vend.id, gestor.id], lojas.map((l) => l.id));
    await virarGestor(prisma, gestor.id);
    await virarVendedor(prisma, vend.id);
    const { abrirTurnoDeTeste } = await import("./_emporio-turno");
    const turnos: Record<string, string> = {};
    for (const L of lojas) turnos[L.id] = (await abrirTurnoDeTeste(db, owner, L.id)).cash_register_id;

    const mkConta = async (rotulo: string) => {
      const r = await xx("criarContaAction", admin, { name: `M104 Conta ${rotulo} ${stamp}`, bank: "Sicredi" });
      const id = dados(r)?.id as string;
      if (!id) throw new Error(`conta ${rotulo}: ${j(r)}`);
      return id;
    };
    const contaB = dados(await xxB("criarContaAction", ownerB, { name: `M104 B conta ${stamp}`, bank: "B" }))?.id as string;
    if (!contaB) throw new Error("conta B não criou");

    // ---- Produto: R$ 50 o quilo, estoque nas lojas
    const rP = await cc("criarProdutoEmporioAction", owner, { name: `M104 Ração ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    const P = dados(rP);
    if (!P) throw new Error(`produto: ${j(rP)}`);
    const rAp = await cc("criarApresentacaoAction", owner, P.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!rAp.ok) throw new Error(`apresentação: ${j(rAp)}`);
    const presId = rAp.data.id as string;
    for (const L of lojas) {
      const rp = await cc("definirPrecoAction", admin, { establishment_id: L.id, presentation_id: presId, price: 50 });
      if (!rp.ok) throw new Error(`preço: ${j(rp)}`);
      const ri = await ee("implantarEstoqueAction", owner, { establishment_id: L.id, emporio_product_id: P.id, sealed: [], loose_qty: 1000, unit_cost: 10 });
      if (!ri.ok) throw new Error(`implantar: ${j(ri)}`);
    }

    let chaveSeq = 0;
    const chave = (p: string) => `m104-${p}-${stamp}-${(chaveSeq += 1)}`;
    const itens = (qtd: number) => [{ emporio_product_id: P.id, presentation_id: presId, quantity: qtd }]; // qtd x 50
    const cartao = (kind: string, amount: number, extra: Dado = {}) => ({ kind, amount, ...extra });
    const vender = (ator: Ator, loja: { id: string }, qtd: number, payments: Dado[], over: Dado = {}) =>
      vv("venderAction", ator, { operation_key: chave("v"), establishment_id: loja.id, customer_id: cf, items: itens(qtd), payments, cash_register_id: turnos[loja.id], ...over });
    const idDe = (r: R): string => dados(r)?.id ?? "";
    const DESDE = meioDia("2020-01-01");

    const mkAdq = async (nome: string, extra: Dado = {}) => {
      const r = await kk("criarAdquirenteAction", admin, { name: `${nome} ${stamp}`, ...extra });
      return { r, id: (dados(r)?.id as string) ?? "" };
    };
    const taxa = (loja: { id: string }, acq: string, conta: string, kind: string, de: number, ate: number, pct: number, days: number, brand = "qualquer") =>
      kk("criarTaxaAction", admin, {
        establishment_id: loja.id,
        acquirer_id: acq,
        brand,
        kind,
        installments_from: de,
        installments_to: ate,
        fee_pct: pct,
        days,
        bank_account_id: conta,
        valid_from: DESDE,
      });
    const recebiveisDe = async (saleId: string): Promise<Dado[]> =>
      ((await dbx.cardReceivable.findMany({ where: { sale_id: saleId } })) as Dado[]).sort((x, y) => x.installment - y.installment);
    const despesas = (where: Dado) => dbx.financialEntry.findMany({ where: { entry_type: "expense", ...where } }) as Promise<Dado[]>;
    const CAT_ANT = "Antecipação de recebíveis";
    const CAT_TAXA = "Taxas de cartão";
    const saldoDe = async (conta: string) => {
      const m = (await (X.saldosDasContas as unknown as (d: Dado) => Promise<Map<string, number>>)?.(db)) ?? new Map();
      return m.get(conta) ?? 0;
    };

    const cartoesDaProjecao = (r: R): number => ((dados(r)?.weeks ?? []) as Dado[]).reduce((s, w) => s + n(w.receivables?.cards), 0);
    // ---------------------------------------------------------------- 1
    try {
      await secao1();
    } catch (e) {
      check("seção 1: terminou sem exceção", false, e instanceof Error ? e.message : String(e));
    }

    // ---------------------------------------------------------------- 2
    console.log("\n2. A venda grava dia útil, taxa por parcela, efetivos e a antecipação automática (Q259 a Q262)");
    let AUTO_SALE = "";
    let AUTO_ANT_ID = "";
    await rodar("seção 2", async () => {
      const conta = await mkConta("L2");
      const aD = await mkAdq("Dia util");
      const aC = await mkAdq("Corridos", { business_day_rule: "dias_corridos" });
      check("adquirente com business_day_rule dias_corridos nasce", aC.r.ok && dados(aC.r)?.business_day_rule === "dias_corridos", j(aC.r));
      check("o padrão da adquirente é proximo_dia_util e refunds_mdr_on_cancel verdadeiro", dados(aD.r)?.business_day_rule === "proximo_dia_util" && dados(aD.r)?.refunds_mdr_on_cancel === true, j(aD.r));
      await taxa(L2, aD.id, conta, "debito", 1, 1, 1.5, 1);
      await taxa(L2, aC.id, conta, "debito", 1, 1, 1.5, 1);
      await taxa(L2, aD.id, conta, "credito_parcelado", 2, 12, 3.5, 30, "visa_master");

      const SAB = new Date("2026-11-07T13:00:00Z"); // sábado, 10h em Brasília
      const rSab = await vender(vend, L2, 2, [cartao("debito", 100, { acquirer_id: aD.id, brand: "visa_master" })], { sold_at: SAB });
      const rcSab = rSab.ok ? await recebiveisDe(idDe(rSab)) : [];
      check("débito vendido no sábado, próximo dia útil: a parcela cai na segunda 2026-11-09", rSab.ok && rcSab.length === 1 && dia(rcSab[0].expected_on) === "2026-11-09", j([rSab, rcSab.map((r) => r.expected_on)]).slice(0, 300));
      check("e o efetivo acompanha o previsto", rcSab.length === 1 && dia(rcSab[0].effective_on) === "2026-11-09" && perto(n(rcSab[0].effective_net), n(rcSab[0].net_amount)), j(rcSab[0]));
      const rDom = await vender(vend, L2, 2, [cartao("debito", 100, { acquirer_id: aC.id, brand: "visa_master" })], { sold_at: SAB });
      const rcDom = rDom.ok ? await recebiveisDe(idDe(rDom)) : [];
      check("a mesma venda numa adquirente dias_corridos: a parcela cai no domingo 2026-11-08", rDom.ok && rcDom.length === 1 && dia(rcDom[0].expected_on) === "2026-11-08", j([rDom, rcDom.map((r) => r.expected_on)]).slice(0, 300));

      const r3 = await vender(vend, L2, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: aD.id, brand: "visa_master" })]);
      const rc3 = r3.ok ? await recebiveisDe(idDe(r3)) : [];
      check("venda 3x de 300 a 3,5%: três parcelas", r3.ok && rc3.length === 3, j(r3).slice(0, 300));
      check("fee_amount das parcelas soma 10,50", rc3.length === 3 && perto(rc3.reduce((s, r) => s + n(r.fee_amount), 0), 10.5, 0.011), j(rc3.map((r) => r.fee_amount)));
      check("cada fee_amount é a bruta menos a líquida da parcela", rc3.length === 3 && rc3.every((r) => perto(n(r.fee_amount), n(r.gross_amount) - n(r.net_amount), 0.011)), j(rc3.map((r) => [r.gross_amount, r.net_amount, r.fee_amount])));
      check("effective_on = expected_on e effective_net = net_amount em todas", rc3.length === 3 && rc3.every((r) => dia(r.effective_on) === dia(r.expected_on) && perto(n(r.effective_net), n(r.net_amount))), j(rc3.map((r) => [r.expected_on, r.effective_on, r.net_amount, r.effective_net])));
      check("nenhuma parcela cai em fim de semana (próximo dia útil)", rc3.length === 3 && rc3.every((r) => ![0, 6].includes(new Date(r.expected_on).getUTCDay())), j(rc3.map((r) => r.expected_on)));
      check("venda sem automática: sem antecipação, anticipation_fee e anticipation_id nulos", rc3.length === 3 && rc3.every((r) => (r.anticipation_fee ?? null) === null && (r.anticipation_id ?? null) === null), j(rc3.map((r) => [r.anticipation_fee, r.anticipation_id])));

      // automática: 2,5% a.m. desde ontem, 1 dia útil
      const aA = await mkAdq("Automatica", { auto_anticipation_enabled: true, auto_anticipation_pct_month: 2.5, auto_anticipation_business_days: 1, auto_anticipation_since: meioDia(ONTEM) });
      check("adquirente com a automática ligada nasce", aA.r.ok && dados(aA.r)?.auto_anticipation_enabled === true && perto(n(dados(aA.r)?.auto_anticipation_pct_month), 2.5), j(aA.r));
      await taxa(L2, aA.id, conta, "credito_parcelado", 2, 12, 3.5, 30, "visa_master");
      await taxa(L2, aA.id, conta, "debito", 1, 1, 1.5, 1);
      const rA = await vender(vend, L2, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: aA.id, brand: "visa_master" })]);
      AUTO_SALE = idDe(rA);
      const rcA = rA.ok ? await recebiveisDe(AUTO_SALE) : [];
      check("venda 3x com a automática ligada: ok com 3 parcelas", rA.ok && rcA.length === 3, j(rA).slice(0, 300));
      const antId = rcA[0]?.anticipation_id as string | undefined;
      AUTO_ANT_ID = antId ?? "";
      const ant = antId ? ((await dbx.cardAnticipation.findFirst({ where: { id: antId } })) as Dado) : null;
      const diaAnt = somarUteis(HOJE, 1);
      check("nasce uma CardAnticipation automática, no dia da venda mais 1 dia útil", !!ant && ant.kind === "automatica" && dia(ant.operated_on) === diaAnt, j(ant));
      check("as três parcelas apontam para a mesma antecipação", rcA.length === 3 && rcA.every((r) => r.anticipation_id === antId), j(rcA.map((r) => r.anticipation_id)));
      check("effective_on das parcelas é o dia da antecipação", rcA.length === 3 && rcA.every((r) => dia(r.effective_on) === diaAnt), j(rcA.map((r) => r.effective_on)));
      const custoEsperado = rcA.map((r) => Math.round((cent(r.net_amount) * 2.5 * diasEntre(diaAnt, dia(r.expected_on))) / 100 / 30));
      check(
        "o custo é pro rata pelos dias até cada previsto (tolerância de 1 centavo)",
        rcA.length === 3 && rcA.every((r, i) => Math.abs(cent(r.anticipation_fee) - custoEsperado[i]) <= 1 && cent(r.anticipation_fee) > 0),
        j(rcA.map((r) => r.anticipation_fee)) + " esperado " + j(custoEsperado),
      );
      check("effective_net = líquido menos o custo de cada parcela", rcA.length === 3 && rcA.every((r) => Math.abs(cent(r.effective_net) - (cent(r.net_amount) - cent(r.anticipation_fee))) <= 0), j(rcA.map((r) => [r.net_amount, r.anticipation_fee, r.effective_net])));
      const somaFee = rcA.reduce((s, r) => s + cent(r.anticipation_fee), 0);
      const somaNet = rcA.reduce((s, r) => s + cent(r.net_amount), 0);
      check("a operação grava bruto 300, previsto = soma dos líquidos, custo = soma e recebido = previsto menos custo", !!ant && perto(n(ant.gross_amount), 300) && cent(ant.expected_net) === somaNet && cent(ant.fee_amount) === somaFee && cent(ant.received_net) === somaNet - somaFee, j(ant));
      const dAnt = antId ? await despesas({ category: CAT_ANT, related_id: antId }) : [];
      check("despesa 'Antecipação de recebíveis' paga, com o total, na loja da venda", dAnt.length === 1 && dAnt[0].status === "paid" && cent(dAnt[0].amount) === somaFee && dAnt[0].establishment_id === L2.id, j(dAnt));
      check("a despesa de taxas de cartão da venda continua à parte (categoria Taxas de cartão)", (await despesas({ category: CAT_TAXA, related_id: AUTO_SALE })).length === 1);

      const rAd = await vender(vend, L2, 2, [cartao("debito", 100, { acquirer_id: aA.id, brand: "visa_master" })]);
      const rcAd = rAd.ok ? await recebiveisDe(idDe(rAd)) : [];
      check("débito com a automática ligada: não antecipa", rAd.ok && rcAd.length === 1 && (rcAd[0].anticipation_id ?? null) === null && dia(rcAd[0].effective_on) === dia(rcAd[0].expected_on), j([rAd, rcAd[0]]).slice(0, 300));

      const aF = await mkAdq("Automatica futura", { auto_anticipation_enabled: true, auto_anticipation_pct_month: 2.5, auto_anticipation_business_days: 1, auto_anticipation_since: meioDia(AMANHA) });
      await taxa(L2, aF.id, conta, "credito_parcelado", 2, 12, 3.5, 30, "visa_master");
      const rF = await vender(vend, L2, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: aF.id, brand: "visa_master" })]);
      const rcF = rF.ok ? await recebiveisDe(idDe(rF)) : [];
      check("automática com since amanhã: a venda de hoje não antecipa", rF.ok && rcF.length === 3 && rcF.every((r) => (r.anticipation_id ?? null) === null && dia(r.effective_on) === dia(r.expected_on)), j([rF, rcF.map((r) => r.anticipation_id)]).slice(0, 300));
    });

    // ---------------------------------------------------------------- 3
    console.log("\n3. Saldo da conta e 'a receber do cartão' pelos efetivos (Q261)");
    await rodar("seção 3", async () => {
      const conta = await mkConta("L3");
      const aq = await mkAdq("Saldo");
      await taxa(L3, aq.id, conta, "credito_parcelado", 2, 12, 3.5, 5, "visa_master");
      const r = await vender(vend, L3, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: aq.id, brand: "visa_master" })]);
      const rc = r.ok ? await recebiveisDe(idDe(r)) : [];
      check("a venda 3x de preparação gerou 3 parcelas futuras", r.ok && rc.length === 3 && rc.every((p) => dia(p.expected_on) > HOJE), j(r).slice(0, 300));
      if (rc.length !== 3) return;
      const saldo0 = await saldoDe(conta);
      const cards0 = await ff("listarContasAReceberAction", admin, { establishment_id: L3.id });
      check("o gestor da loja (sem Financeiro) não lê o a receber: FORBIDDEN", recusa(await ff("listarContasAReceberAction", gestor, { establishment_id: L3.id }), "FORBIDDEN"));
      const proj0 = await pj("lerFluxoProjetadoAction", admin, { establishment_id: L3.id, days: 90 });
      const aReceber0 = cartoesDaProjecao(proj0);
      check("antes: o saldo da conta não conta parcela futura", saldo0 === 0, String(saldo0));
      check("antes: a projeção de 90 dias conta as três parcelas (289,50)", perto(aReceber0, 289.5, 0.011), j(dados(proj0)?.weeks));
      check("antes: as três aparecem a receber", lista(dados(cards0)?.cards).length === 3, j(dados(cards0)?.cards));

      // estado de uma antecipação pontual, direto no banco (a ação é da seção 5)
      const hojeDate = new Date(`${HOJE}T00:00:00Z`);
      const opManual = (await dbx.cardAnticipation.create({
        data: scoped({ bank_account_id: conta, operated_on: hojeDate, kind: "pontual", gross_amount: 200, expected_net: 193, received_net: 180, fee_amount: 13 }),
      })) as Dado;
      for (const p of rc.slice(0, 2)) {
        await dbx.cardReceivable.update({ where: { id: p.id }, data: { effective_on: hojeDate, effective_net: 90, anticipation_fee: n(p.net_amount) - 90, anticipation_id: opManual.id } });
      }
      const saldo1 = await saldoDe(conta);
      check("depois: o saldo da conta soma os líquidos efetivos de hoje (90 + 90)", saldo1 === 18000, String(saldo1));
      const cards1 = await ff("listarContasAReceberAction", admin, { establishment_id: L3.id });
      const linhas1 = lista(dados(cards1)?.cards);
      const idsAnt = new Set(rc.slice(0, 2).map((p) => p.id));
      const futuras = linhas1.filter((l) => idsAnt.has(l.id) && l.received === false);
      check("depois: as antecipadas não são listadas como futuras", cards1.ok && futuras.length === 0, j(linhas1).slice(0, 400));
      const restante = linhas1.find((l) => l.id === rc[2].id);
      check("depois: a não antecipada segue a receber, com os campos novos", !!restante && restante.anticipated === false && dia(restante.effective_on) === dia(rc[2].expected_on) && perto(n(restante.effective_net), n(rc[2].net_amount)) && perto(n(restante.fee_amount), n(rc[2].fee_amount)) && dia(restante.expected_on) === dia(rc[2].expected_on) && perto(n(restante.net_amount), n(rc[2].net_amount)), j(restante));
      const feitas = linhas1.filter((l) => idsAnt.has(l.id));
      check("depois: se listadas, mostram anticipated, effective_on hoje e 90", feitas.every((l) => l.anticipated === true && dia(l.effective_on) === HOJE && perto(n(l.effective_net), 90)), j(feitas));
      const proj1 = await pj("lerFluxoProjetadoAction", admin, { establishment_id: L3.id, days: 90 });
      check("depois: a projeção de 90 dias conta só a parcela que sobrou (96,50)", perto(cartoesDaProjecao(proj1), 96.5, 0.011), j(dados(proj1)?.weeks));
    });

    // ---------------------------------------------------------------- 4
    console.log("\n4. Cancelamento como a Stone (Q263)");
    const cancelar = async (taxaSegue: boolean) => {
      const rotulo = taxaSegue ? "mantem" : "devolve";
      const conta = await mkConta(`L4 ${rotulo}`);
      const aq = await mkAdq(`Cancel ${rotulo}`, taxaSegue ? { refunds_mdr_on_cancel: false } : {});
      check(`adquirente (${rotulo}): refunds_mdr_on_cancel = ${!taxaSegue}`, aq.r.ok && dados(aq.r)?.refunds_mdr_on_cancel === !taxaSegue, j(aq.r));
      await taxa(L4, aq.id, conta, "credito_parcelado", 2, 12, 3.5, 5, "visa_master");
      const r = await vender(vend, L4, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: aq.id, brand: "visa_master" })]);
      const venda = idDe(r);
      const rc = r.ok ? await recebiveisDe(venda) : [];
      if (rc.length !== 3) {
        check(`(${rotulo}) a venda de preparação gerou 3 parcelas`, false, j(r).slice(0, 300));
        return;
      }
      const soma = rc.slice(0, 2).reduce((s, p) => s + cent(p.net_amount), 0);
      const rAnt = await aa("anteciparAction", admin, { receivable_ids: [rc[0].id, rc[1].id], operated_on: meioDia(HOJE), received_net: (soma - 600) / 100 });
      check(`(${rotulo}) antecipou as duas primeiras recebendo o líquido menos 6,00`, rAnt.ok, j(rAnt));
      if (!rAnt.ok) return;
      const efetivos = (await recebiveisDe(venda)).slice(0, 2).reduce((s, p) => s + cent(p.effective_net), 0);
      const saldoAntes = await saldoDe(conta);
      check(`(${rotulo}) antes de cancelar o saldo da conta é a soma dos efetivos`, saldoAntes === efetivos && efetivos === soma - 600, `${saldoAntes} ${efetivos}`);
      const rCan = await vv("cancelarVendaAction", gestor, venda, { reason: "teste da taxa" });
      check(`(${rotulo}) o gestor cancela a venda`, rCan.ok, j(rCan));
      const rcDepois = await recebiveisDe(venda);
      const saldoDepois = await saldoDe(conta);
      check(`(${rotulo}) a parcela futura não antecipada é cancelada`, rcDepois[2]?.canceled_at !== null && rcDepois[2]?.canceled_at !== undefined, j(rcDepois[2]));
      check(`(${rotulo}) o estorno é pelo líquido efetivo: o saldo cai ${efetivos / 100} e não ${soma / 100}`, saldoAntes - saldoDepois === efetivos, `${saldoAntes} -> ${saldoDepois}`);
      const dTaxa = await despesas({ category: CAT_TAXA, related_id: venda });
      check(`(${rotulo}) a despesa de taxas de cartão ${taxaSegue ? "fica (a adquirente não devolve a taxa)" : "é cancelada"}`, dTaxa.length === 1 && (dTaxa[0].status === "cancelled") === !taxaSegue, j(dTaxa));
      const dAnt = await despesas({ category: CAT_ANT, related_id: dados(rAnt)?.id });
      check(`(${rotulo}) a despesa de antecipação nunca é cancelada pelo cancelamento da venda`, dAnt.length === 1 && dAnt[0].status === "paid", j(dAnt));
    };
    await rodar("seção 4 (devolve)", () => cancelar(false));
    await rodar("seção 4 (mantém)", () => cancelar(true));

    // ---------------------------------------------------------------- 5
    console.log("\n5. Antecipação pontual (Q264, Q265)");
    let RESULTADO_DEPOIS: Dado = null;
    let RESULTADO_ANTES: Dado = null;
    let ANT_DESFEITA_ID = "";
    await rodar("seção 5", async () => {
      const conta = await mkConta("L5");
      const outraConta = await mkConta("L5 outra");
      const aq = await mkAdq("Pontual");
      const aqOutra = await mkAdq("Pontual outra conta");
      await taxa(L5, aq.id, conta, "credito_parcelado", 2, 12, 3.5, 30, "visa_master");
      await taxa(L5, aqOutra.id, outraConta, "credito_parcelado", 2, 12, 3.5, 30, "visa_master");
      const novaVenda = async (acq: string) => {
        const r = await vender(vend, L5, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: acq, brand: "visa_master" })]);
        return { r, rc: r.ok ? await recebiveisDe(idDe(r)) : [] };
      };
      const V1 = await novaVenda(aq.id);
      check("a venda 3x de preparação gerou 3 parcelas futuras", V1.rc.length === 3 && V1.rc.every((p) => dia(p.expected_on) > HOJE), j(V1.r).slice(0, 300));
      if (V1.rc.length !== 3) return;
      const ids = V1.rc.map((p) => p.id as string);
      const S = V1.rc.reduce((s, p) => s + cent(p.net_amount), 0);
      const bruto = V1.rc.reduce((s, p) => s + cent(p.gross_amount), 0);
      const antecipar = (rid: string[], recebido: number, over: Dado = {}) => aa("anteciparAction", admin, { receivable_ids: rid, operated_on: meioDia(HOJE), received_net: recebido, ...over });

      // recusas (nenhuma grava)
      const ant0 = await dbx.cardAnticipation.count();
      check("lista vazia: VALIDATION_ERROR em receivable_ids", recusa(await antecipar([], 1), "VALIDATION_ERROR", "receivable_ids"));
      check("received_net zero: VALIDATION_ERROR em received_net", recusa(await antecipar(ids, 0), "VALIDATION_ERROR", "received_net"));
      check("received_net maior que a soma dos líquidos efetivos: VALIDATION_ERROR em received_net", recusa(await antecipar(ids, (S + 1) / 100), "VALIDATION_ERROR", "received_net"));
      check("operated_on no futuro: VALIDATION_ERROR em operated_on", recusa(await antecipar(ids, (S - 900) / 100, { operated_on: meioDia(AMANHA) }), "VALIDATION_ERROR", "operated_on"));
      const rInex = await antecipar(["m104-nao-existe"], 1);
      check("parcela inexistente: 404", !rInex.ok && rInex.status === 404, j(rInex));
      check("o Vendedor (sem Financeiro) não antecipa: FORBIDDEN", recusa(await aa("anteciparAction", vend, { receivable_ids: ids, operated_on: meioDia(HOJE), received_net: (S - 900) / 100 }), "FORBIDDEN"));
      const VO = await novaVenda(aqOutra.id);
      if (VO.rc.length === 3) check("parcelas de contas bancárias diferentes: VALIDATION_ERROR em receivable_ids", recusa(await antecipar([ids[0], VO.rc[0].id], 1), "VALIDATION_ERROR", "receivable_ids"));
      const VV = await novaVenda(aq.id);
      if (VV.rc.length === 3) {
        await dbx.cardReceivable.update({ where: { id: VV.rc[0].id }, data: { canceled_at: new Date() } });
        await dbx.cardReceivable.update({ where: { id: VV.rc[1].id }, data: { effective_on: new Date(`${ONTEM}T00:00:00Z`) } });
        check("parcela cancelada: VALIDATION_ERROR em receivable_ids", recusa(await antecipar([VV.rc[0].id], 1), "VALIDATION_ERROR", "receivable_ids"));
        check("parcela com effective_on até a data da operação: VALIDATION_ERROR em receivable_ids", recusa(await antecipar([VV.rc[1].id], 1), "VALIDATION_ERROR", "receivable_ids"));
      }
      check("as recusas não gravaram operação", (await dbx.cardAnticipation.count()) === ant0);

      // sucesso: recebe o previsto menos 9,00
      const saldoBase = await saldoDe(conta); // a parcela de VV com effective_on de ontem já está no saldo
      RESULTADO_ANTES = dados(await rs("resultadoDaLojaAction", admin, { establishment_id: L5.id, month: mesAtual() }));
      const rOk = await antecipar(ids, (S - 900) / 100, { notes: "m104" });
      const a = dados(rOk);
      check("antecipar as três parcelas: ok", rOk.ok, j(rOk));
      if (!rOk.ok) return;
      ANT_DESFEITA_ID = a.id;
      check("a view traz pontual, a conta, bruto, previsto, recebido e custo 9,00", a.kind === "pontual" && a.bank_account_id === conta && cent(a.gross_amount) === bruto && cent(a.expected_net) === S && cent(a.received_net) === S - 900 && cent(a.fee_amount) === 900 && a.receivables_count === 3, j(a));
      check("effective_pct_month vem preenchido (número positivo)", typeof a.effective_pct_month === "number" && a.effective_pct_month > 0, String(a.effective_pct_month));
      check("a operação é desfazível e não está desfeita", a.can_undo === true && (a.undone_at ?? null) === null, j(a));
      const ap = await recebiveisDe(idDe(V1.r));
      check("o custo 9,00 é rateado 3,00 em cada parcela", ap.every((p) => cent(p.anticipation_fee) === 300), j(ap.map((p) => p.anticipation_fee)));
      check("as parcelas passam a valer hoje, com o líquido menos o custo", ap.every((p) => dia(p.effective_on) === HOJE && cent(p.effective_net) === cent(p.net_amount) - 300 && p.anticipation_id === a.id), j(ap.map((p) => [p.effective_on, p.effective_net, p.anticipation_id])));
      check("expected_on e net_amount não mudam", ap.every((p, i) => dia(p.expected_on) === dia(V1.rc[i].expected_on) && cent(p.net_amount) === cent(V1.rc[i].net_amount)));
      const dd1 = await despesas({ category: CAT_ANT, related_id: a.id });
      check("uma despesa 'Antecipação de recebíveis' paga de 9,00 na loja", dd1.length === 1 && dd1[0].status === "paid" && cent(dd1[0].amount) === 900 && dd1[0].establishment_id === L5.id, j(dd1));
      check("o saldo da conta soma os três efetivos", (await saldoDe(conta)) - saldoBase === S - 900, String(await saldoDe(conta)));
      RESULTADO_DEPOIS = dados(await rs("resultadoDaLojaAction", admin, { establishment_id: L5.id, month: mesAtual() }));
      const lst = await aa("listarAntecipacoesAction", admin, {});
      check("listarAntecipacoesAction traz a operação", lst.ok && lista(dados(lst)).some((x) => x.id === a.id), j(lst).slice(0, 300));
      check("antecipar de novo as mesmas parcelas: VALIDATION_ERROR em receivable_ids (já antecipada)", recusa(await antecipar(ids, 1), "VALIDATION_ERROR", "receivable_ids"));

      // desfazer
      const rDes = await aa("desfazerAntecipacaoAction", admin, a.id);
      check("desfazer: ok", rDes.ok, j(rDes));
      const vol = await recebiveisDe(idDe(V1.r));
      check("as parcelas voltam: efetivo = previsto, sem custo e sem operação", vol.every((p) => dia(p.effective_on) === dia(p.expected_on) && cent(p.effective_net) === cent(p.net_amount) && (p.anticipation_fee ?? null) === null && (p.anticipation_id ?? null) === null), j(vol.map((p) => [p.effective_on, p.effective_net, p.anticipation_fee, p.anticipation_id])));
      const dd2 = await despesas({ category: CAT_ANT, related_id: a.id });
      check("a despesa da antecipação é cancelada", dd2.length === 1 && dd2[0].status === "cancelled", j(dd2));
      const opDesfeita = (await dbx.cardAnticipation.findFirst({ where: { id: a.id } })) as Dado;
      check("a operação guarda undone_at", !!opDesfeita?.undone_at, j(opDesfeita));
      check("desfazer de novo: 409 ANTECIPACAO_DESFEITA", recusa(await aa("desfazerAntecipacaoAction", admin, a.id), "ANTECIPACAO_DESFEITA", undefined, 409));
      check("o saldo volta a não contar as parcelas futuras", (await saldoDe(conta)) === saldoBase, String(await saldoDe(conta)));

      // conciliada
      const rOk2 = await antecipar(ids, (S - 900) / 100);
      check("antecipar de novo depois de desfeita: ok", rOk2.ok, j(rOk2));
      if (rOk2.ok) {
        await dbx.cardReceivable.update({ where: { id: ids[0] }, data: { reconciled_at: new Date() } });
        check("desfazer com uma parcela carimbada: 409 ANTECIPACAO_CONCILIADA", recusa(await aa("desfazerAntecipacaoAction", admin, dados(rOk2).id), "ANTECIPACAO_CONCILIADA", undefined, 409));
        const aindaAtiva = (await dbx.cardAnticipation.findFirst({ where: { id: dados(rOk2).id } })) as Dado;
        check("a operação conciliada segue de pé", !!aindaAtiva && !aindaAtiva.undone_at, j(aindaAtiva));
      }
      // venda cancelada depois de antecipar: desfazer é recusado (revisão I1)
      const VC = await novaVenda(aq.id);
      if (VC.rc.length === 3) {
        const idsC = VC.rc.map((p) => p.id as string);
        const SC = VC.rc.reduce((s, p) => s + cent(p.net_amount), 0);
        const rAntC = await antecipar(idsC, (SC - 900) / 100);
        check("antecipar as três parcelas de uma venda que será cancelada: ok", rAntC.ok, j(rAntC));
        if (rAntC.ok) {
          const opC = dados(rAntC).id as string;
          const rCanC = await vv("cancelarVendaAction", gestor, idDe(VC.r), { reason: "m104 desfazer depois de cancelar" });
          check("o gestor cancela a venda antecipada", rCanC.ok, j(rCanC));
          const saldoCancelada = await saldoDe(conta);
          const lstC = await aa("listarAntecipacoesAction", admin, {});
          const viewC = lista(dados(lstC)).find((x) => x.id === opC);
          check("com a venda cancelada, can_undo é falso", !!viewC && viewC.can_undo === false, j(viewC));
          check("desfazer com a venda cancelada: 409 ANTECIPACAO_VENDA_CANCELADA", recusa(await aa("desfazerAntecipacaoAction", admin, opC), "ANTECIPACAO_VENDA_CANCELADA", undefined, 409));
          const ddC = await despesas({ category: CAT_ANT, related_id: opC });
          check("a despesa da antecipação continua paga", ddC.length === 1 && ddC[0].status === "paid", j(ddC));
          check("o saldo da conta não muda com a recusa", (await saldoDe(conta)) === saldoCancelada, `${saldoCancelada} -> ${await saldoDe(conta)}`);
          const opAindaC = (await dbx.cardAnticipation.findFirst({ where: { id: opC } })) as Dado;
          check("a operação segue sem undone_at", !!opAindaC && !opAindaC.undone_at, j(opAindaC));
        }
      }
      // a automática não se desfaz
      if (AUTO_ANT_ID) check("desfazer a automática: VALIDATION_ERROR", recusa(await aa("desfazerAntecipacaoAction", admin, AUTO_ANT_ID), "VALIDATION_ERROR"));
      else check("há uma antecipação automática da seção 2 para tentar desfazer", false);
    });

    await rodar("antecipação multiloja respeita o alcance de leitura", async () => {
      const uma = await TA.mkUser("gestor-uma", "OPERADOR");
      const duas = await TA.mkUser("gestor-duas", "OPERADOR");
      const fora = await TA.mkUser("gestor-fora", "OPERADOR");
      const financeiro = await TA.mkUser("financeiro", "OPERADOR");
      for (const u of [uma, duas, fora]) await virarGestor(prisma, u.id);
      await prisma.user.update({ where: { id: financeiro.id }, data: { emporio_role: "financeiro" } });
      await vincularTodas(prisma, TA.t.id, [uma.id], [L6.id]);
      await vincularTodas(prisma, TA.t.id, [duas.id], [L6.id, L7.id]);
      await vincularTodas(prisma, TA.t.id, [fora.id], [L2.id]);
      const conta = await mkConta("alcance");
      const aq = await mkAdq("Alcance");
      await taxa(L6, aq.id, conta, "credito_parcelado", 2, 12, 0, 30);
      await taxa(L7, aq.id, conta, "credito_parcelado", 2, 12, 0, 60);
      const criar = async (custo: number) => {
        const a = await vender(admin, L6, 2, [cartao("credito_parcelado", 100, { installments: 2, acquirer_id: aq.id })]);
        const b = await vender(admin, L7, 4, [cartao("credito_parcelado", 200, { installments: 2, acquirer_id: aq.id })]);
        const parcelas = [...await recebiveisDe(idDe(a)), ...await recebiveisDe(idDe(b))];
        const r = await aa("anteciparAction", duas, { receivable_ids: parcelas.map((p) => p.id), operated_on: meioDia(HOJE), received_net: 300 - custo });
        check(`criar multiloja com custo ${custo}: retorno total`, r.ok && dados(r).gross_amount === 300 && dados(r).receivables_count === 4, j(r));
        if (!r.ok) throw new Error(j(r));
        return dados(r).id as string;
      };
      const ler = async (ator: Ator, id: string, filtro: Dado = {}) => lista(dados(await aa("listarAntecipacoesAction", ator, filtro))).find((v) => v.id === id);
      const id = await criar(30);
      const parcial = await ler(uma, id);
      check("gestor de uma loja sem filtro: todos os valores e contagem são locais", !!parcial && parcial.gross_amount === 100 && parcial.expected_net === 100 && parcial.received_net === 90 && parcial.fee_amount === 10 && parcial.receivables_count === 2, j(parcial));
      const p6 = await dbx.cardReceivable.findMany({ where: { anticipation_id: id, establishment_id: L6.id } });
      const media = p6.reduce((s: number, p: Dado) => s + diasEntre(HOJE, dia(p.expected_on)) * n(p.net_amount), 0) / 100;
      check("percentual mensal usa apenas os dias e valores da loja visível", perto(parcial?.effective_pct_month, 10 * 30 / media), j(parcial));
      check("gestor parcial não recebe sinal de conciliação da outra loja em can_undo", parcial?.can_undo === false, j(parcial));
      for (const ator of [duas, owner, admin, financeiro]) {
        const v = await ler(ator, id);
        check(`papel ${ator.id}: visão total preservada`, !!v && v.gross_amount === 300 && v.expected_net === 300 && v.received_net === 270 && v.fee_amount === 30 && v.receivables_count === 4, j(v));
      }
      check("gestor de outra loja não vê a operação", !await ler(fora, id));
      check("filtro explícito preserva recorte", (await ler(owner, id, { establishment_id: L6.id }))?.received_net === 90);
      check("filtro fora do alcance não mostra operação", !await ler(uma, id, { establishment_id: L7.id }));
      check("gestor parcial não desfaz operação multiloja", recusa(await aa("desfazerAntecipacaoAction", uma, id), "NOT_FOUND"));
      const desfeita = await aa("desfazerAntecipacaoAction", duas, id);
      check("gestor de ambas desfaz e recebe total histórico", desfeita.ok && dados(desfeita).received_net === 270 && dados(desfeita).fee_amount === 30, j(desfeita));
      for (const [ator, custo] of [[uma, 10], [duas, 30]] as const) {
        const v = await ler(ator, id);
        check("desfeita restrita: apenas custo documentado, sem inferir parcelas", !!v && v.gross_amount === 0 && v.expected_net === 0 && v.received_net === 0 && v.fee_amount === custo && v.receivables_count === 0 && v.effective_pct_month === null, j(v));
      }
      check("desfeita continua invisível a outra loja", !await ler(fora, id));
      check("desfeita com filtro explícito não devolve total global", (await ler(owner, id, { establishment_id: L6.id }))?.gross_amount === 0);
      for (const ator of [owner, admin, financeiro]) check("papel global mantém histórico após desfazer", (await ler(ator, id))?.received_net === 270);
      const zero = await criar(0);
      check("sem custo, operação ativa continua visível por parcela", (await ler(uma, zero))?.received_net === 100);
      await aa("desfazerAntecipacaoAction", duas, zero);
      check("sem custo, desfeita não inventa vínculo com loja", !await ler(uma, zero) && !await ler(duas, zero));
      check("sem custo, Dono mantém total histórico", (await ler(owner, zero))?.received_net === 300);
    });

    // ---------------------------------------------------------------- 6
    console.log("\n6. Fiado sem corrida: o limite é conferido de novo dentro da transação (dívida 2.37)");
    await rodar("seção 6", async () => {
      const cli = (await prisma.emporioCustomer.create({ data: { tenant_id: TA.t.id, name: `M104 Fiado ${stamp}`, fiado_limit: 500 } as Dado })) as Dado;
      const deve450 = await vender(admin, L6, 9, [{ kind: "fiado", amount: 450 }], { customer_id: cli.id });
      check("preparação: o cliente fica devendo 450 (limite 500)", deve450.ok, j(deve450).slice(0, 300));
      if (!deve450.ok) return;
      const [a, b] = await Promise.all([
        vender(admin, L6, 0.8, [{ kind: "fiado", amount: 40 }], { customer_id: cli.id }),
        vender(admin, L6, 0.8, [{ kind: "fiado", amount: 40 }], { customer_id: cli.id }),
      ]);
      const oks = [a, b].filter((x) => x.ok).length;
      check("duas vendas de 40 em fiado ao mesmo tempo: nunca as duas ok", oks <= 1, j([a, b]).slice(0, 400));
      const falha = [a, b].find((x) => !x.ok);
      check("a que perde é recusada (LIMITE_EXCEDIDO ou conflito 409)", !!falha && !falha.ok && (falha.code === "LIMITE_EXCEDIDO" || falha.status === 409), j(falha).slice(0, 300));
      const fiados = (await dbx.emporioSalePayment.findMany({ where: { kind: "fiado", sale: { customer_id: cli.id, canceled_at: null } } })) as Dado[];
      const total = fiados.reduce((s, p) => s + cent(p.amount), 0);
      check("o fiado do cliente no banco nunca passa do limite de 500", total <= 50000, String(total));
      const sequencial = await vender(admin, L6, 0.8, [{ kind: "fiado", amount: 40 }], { customer_id: cli.id });
      check("depois do teto, uma terceira venda sozinha também é recusada (LIMITE_EXCEDIDO)", recusa(sequencial, "LIMITE_EXCEDIDO"), j(sequencial).slice(0, 300));
    });

    // ---------------------------------------------------------------- 7
    console.log("\n7. Resultado e configuração da adquirente (Q266, Q267)");
    await rodar("seção 7 (Resultado)", async () => {
      check("antes da antecipação o Resultado da Loja 5 não tem custo de antecipação", !!RESULTADO_ANTES && perto(n(RESULTADO_ANTES.anticipation_costs), 0), j(RESULTADO_ANTES)?.slice(0, 300));
      check("depois: anticipation_costs 9,00", !!RESULTADO_DEPOIS && perto(n(RESULTADO_DEPOIS.anticipation_costs), 9, 0.011), j(RESULTADO_DEPOIS)?.slice(0, 300));
      check("depois: result é 9,00 menor", !!RESULTADO_DEPOIS && !!RESULTADO_ANTES && perto(n(RESULTADO_DEPOIS.result), n(RESULTADO_ANTES.result) - 9, 0.011), `${RESULTADO_DEPOIS?.result} contra ${RESULTADO_ANTES?.result}`);
      const todas = dados(await rs("resultadoDaLojaAction", admin, { establishment_id: "all", month: mesAtual() }));
      const linha = lista(todas?.stores).find((s) => s.establishment_id === L5.id);
      check("a visão somada traz anticipation_costs na linha da loja", !!linha && typeof linha.anticipation_costs === "number" && linha.anticipation_costs >= 0, j(linha)?.slice(0, 300));
      check("e o total traz anticipation_costs", typeof todas?.anticipation_costs === "number", String(todas?.anticipation_costs));
    });
    await rodar("seção 7 (configuração)", async () => {
      const semPct = await kk("criarAdquirenteAction", admin, { name: `Sem pct ${stamp}`, auto_anticipation_enabled: true, auto_anticipation_since: meioDia(ONTEM) });
      check("ligar a automática sem percentual: recusa no campo auto_anticipation_pct_month", recusa(semPct, "VALIDATION_ERROR", "auto_anticipation_pct_month"), j(semPct));
      const semSince = await kk("criarAdquirenteAction", admin, { name: `Sem since ${stamp}`, auto_anticipation_enabled: true, auto_anticipation_pct_month: 2 });
      check("ligar a automática sem data inicial: recusa no campo auto_anticipation_since", recusa(semSince, "VALIDATION_ERROR", "auto_anticipation_since"), j(semSince));
      const pct21 = await kk("criarAdquirenteAction", admin, { name: `Pct 21 ${stamp}`, auto_anticipation_enabled: true, auto_anticipation_pct_month: 21, auto_anticipation_since: meioDia(ONTEM) });
      check("percentual acima de 20: recusa no campo auto_anticipation_pct_month", recusa(pct21, "VALIDATION_ERROR", "auto_anticipation_pct_month"), j(pct21));
      const dias31 = await kk("criarAdquirenteAction", admin, { name: `Dias 31 ${stamp}`, auto_anticipation_business_days: 31 });
      check("dias úteis acima de 30: recusa no campo auto_anticipation_business_days", recusa(dias31, "VALIDATION_ERROR", "auto_anticipation_business_days"), j(dias31));
      const regraRuim = await kk("criarAdquirenteAction", admin, { name: `Regra ${stamp}`, business_day_rule: "quando_der" });
      check("regra de dia útil desconhecida: recusa no campo business_day_rule", recusa(regraRuim, "VALIDATION_ERROR", "business_day_rule"), j(regraRuim));
      const e = await mkAdq("Editada");
      const ed = await kk("editarAdquirenteAction", admin, e.id, { business_day_rule: "dias_corridos", refunds_mdr_on_cancel: false, auto_anticipation_enabled: true, auto_anticipation_pct_month: 1.8, auto_anticipation_business_days: 2, auto_anticipation_since: meioDia(HOJE) });
      const v = dados(ed);
      check("editar aceita e devolve os seis campos", ed.ok && v?.business_day_rule === "dias_corridos" && v?.refunds_mdr_on_cancel === false && v?.auto_anticipation_enabled === true && perto(n(v?.auto_anticipation_pct_month), 1.8) && v?.auto_anticipation_business_days === 2 && dia(v?.auto_anticipation_since) === HOJE, j(ed));
      const linhaBanco = (await dbx.cardAcquirer.findFirst({ where: { id: e.id } })) as Dado;
      check("e grava no banco", linhaBanco?.business_day_rule === "dias_corridos" && linhaBanco?.refunds_mdr_on_cancel === false && linhaBanco?.auto_anticipation_enabled === true && perto(n(linhaBanco?.auto_anticipation_pct_month), 1.8) && linhaBanco?.auto_anticipation_business_days === 2 && dia(linhaBanco?.auto_anticipation_since) === HOJE, j(linhaBanco));
      const lst = lista(dados(await kk("listarAdquirentesAction", admin))).find((x) => x.id === e.id);
      check("a lista de adquirentes traz os seis campos", !!lst && "business_day_rule" in lst && "refunds_mdr_on_cancel" in lst && "auto_anticipation_enabled" in lst && "auto_anticipation_pct_month" in lst && "auto_anticipation_business_days" in lst && "auto_anticipation_since" in lst, j(lst));
      const desliga = await kk("editarAdquirenteAction", admin, e.id, { auto_anticipation_pct_month: null });
      check("tirar o percentual com a automática ligada: recusa no campo auto_anticipation_pct_month", recusa(desliga, "VALIDATION_ERROR", "auto_anticipation_pct_month"), j(desliga));
    });

    // ---------------------------------------------------------------- 8
    console.log("\n8. Isolamento entre tenants");
    await rodar("seção 8", async () => {
      const proprias = (await dbx.cardReceivable.findMany({ where: { anticipation_id: { not: null } } })) as Dado[];
      check("há parcelas antecipadas no tenant A para tentar alcançar", proprias.length > 0);
      const idsA = proprias.slice(0, 2).map((p) => p.id as string);
      const rB = await aaB("anteciparAction", ownerB, { receivable_ids: idsA, operated_on: meioDia(HOJE), received_net: 1 });
      check("o tenant B não antecipa parcela do A: 404", !rB.ok && rB.status === 404, j(rB));
      if (ANT_DESFEITA_ID) {
        const rD = await aaB("desfazerAntecipacaoAction", ownerB, ANT_DESFEITA_ID);
        check("o tenant B não desfaz operação do A: 404", !rD.ok && rD.status === 404, j(rD));
      }
      const lB = await aaB("listarAntecipacoesAction", ownerB, {});
      check("o tenant B lista zero antecipações", lB.ok && lista(dados(lB)).length === 0, j(lB).slice(0, 300));
      check("no banco, o tenant B não enxerga operação nem parcela do A", (await dbBx.cardAnticipation.count()) === 0 && (await dbBx.cardReceivable.count()) === 0);
      const adqB = lista(dados(await kkB("listarAdquirentesAction", ownerB)));
      check("o tenant B não vê adquirente do A", adqB.length === 0, j(adqB).slice(0, 200));
      void contaB;
    });
  } finally {
    const p = prisma as Dado;
    for (const id of tenantIds) {
      try {
        await p.tenant.delete({ where: { id } });
        continue;
      } catch {
        // o cascade esbarra em Restrict (venda aponta para a taxa, antecipação para a conta): limpa na ordem
      }
      try {
        await p.cashMovement.deleteMany({ where: { tenant_id: id } });
        await p.cardReceivable.deleteMany({ where: { tenant_id: id } });
        await p.cardAnticipation?.deleteMany({ where: { tenant_id: id } });
        await p.cashCount.deleteMany({ where: { tenant_id: id } });
        await p.cashTransfer.deleteMany({ where: { tenant_id: id } });
        await p.emporioCheck.deleteMany({ where: { tenant_id: id } });
        await p.stockMovement.deleteMany({ where: { tenant_id: id } });
        await p.emporioSalePayment.deleteMany({ where: { tenant_id: id } });
        await p.cardFeeRate?.deleteMany({ where: { tenant_id: id } });
        await p.cardAcquirer?.deleteMany({ where: { tenant_id: id } });
        await p.emporioSaleReturnItem.deleteMany({ where: { tenant_id: id } });
        await p.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, replaces_sale_id: null } });
        await p.emporioSaleReturn.deleteMany({ where: { tenant_id: id } });
        await p.emporioSaleItem.deleteMany({ where: { tenant_id: id } });
        await p.emporioSale.deleteMany({ where: { tenant_id: id } });
        await p.stockLimit.deleteMany({ where: { tenant_id: id } });
        await p.shoppingItem.deleteMany({ where: { tenant_id: id } });
        await p.financialEntry.deleteMany({ where: { tenant_id: id } });
        await p.presentationPrice.deleteMany({ where: { tenant_id: id } });
        await p.productPresentation.deleteMany({ where: { tenant_id: id } });
        await p.userEstablishment.deleteMany({ where: { tenant_id: id } });
        await p.emporioProduct.deleteMany({ where: { tenant_id: id } });
        await p.product.deleteMany({ where: { tenant_id: id } });
        await p.establishment.deleteMany({ where: { tenant_id: id } });
        await p.bankAccount.deleteMany({ where: { tenant_id: id } });
        await p.emporioCustomer.deleteMany({ where: { tenant_id: id } });
        await p.contact.deleteMany({ where: { tenant_id: id } });
        await p.productCategory.deleteMany({ where: { tenant_id: id } });
        await p.property.deleteMany({ where: { tenant_id: id } });
        await p.tenant.delete({ where: { id } });
      } catch (e) {
        falhas += 1;
        console.log(`  ❌ limpeza do tenant ${id} falhou: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
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
    console.log(falhas === 0 ? `\n✅ M104 verde (${totalChecks} checagens)` : `\n❌ M104: ${falhas} falha(s) em ${totalChecks} checagens`);
    process.exit(falhas === 0 ? 0 : 1);
  });
