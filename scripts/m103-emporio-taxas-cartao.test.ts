import "./_env-local";
import { papelDeFixture, papelFinanceiro, vincularTodas, virarGestor, virarVendedor } from "./_emporio-papel";
import { AsyncLocalStorage } from "node:async_hooks";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório): taxas de cartão por adquirente, bandeira, faixa de
 * parcelas e vigência (entrega 1). Roda: `npm run test:m103`
 *
 * Escrita da spec (docs/superpowers/specs/2026-11-09-emporio-taxas-de-cartao-design.md,
 * Q250 a Q258) e dos blocos Interfaces e Step 1 das Tasks 1 a 3 do plano, sem ler a
 * implementação. Chama as actions direto, sem rota. Módulo, action ou campo ainda
 * inexistente vira recusa `ACTION_AUSENTE` (a suíte compila e roda, e a asserção
 * falha), nunca erro de sintaxe. Não toca a tabela antiga `CardFeeRule`.
 *
 * Seções: 1 resolverTaxa (pura, sem banco), 2 adquirente, 3 taxas e sobreposição,
 * 4 wrappers da regra antiga, 5 venda, 6 edição e vigência, 7 isolamento, 8 impressão.
 *
 * O que os briefs calavam e esta suíte ASSUME:
 * - `listarTaxasAction` e `listarAdquirentesAction` devolvem array ou `{ items }`;
 *   as datas da linha (`valid_from`, `valid_to`) saem como AAAA-MM-DD (ou Date);
 * - `criarAdquirenteAction`/`criarTaxaAction` devolvem `{ id, ... }` em `data`;
 * - `novaVigenciaAction` e `criarTaxaAction` recebem datas como Date (meio-dia UTC);
 * - o dono e o gerente geral (ADMIN) configuram; o Vendedor sem gestor recebe FORBIDDEN
 *   ao criar adquirente (papel `dono` ou `gerente_geral`, Task 2);
 * - recusa de bandeira ausente ou "qualquer" na venda: campo `payments` (ou
 *   `payments.N.brand`, aceito por prefixo); a mensagem da bandeira ausente diz
 *   "informe a bandeira";
 * - `cancelarVendaAction(db, ator, id, { reason })` e `lerVendaAction(db, ator, id)`;
 * - `listarRegrasCartaoAction(db, ator, establishment_id)` (como a m82 chama hoje);
 * - o RATE_IN_USE da seção 3 usa uma venda REAL feita com a linha (Task 3), em vez
 *   de pagamento forjado no banco: sem a Task 3, essa asserção falha por ausência;
 * - a venda de "ontem" usa `sold_at` = agora menos 24h (Brasília), a de "hoje" não o informa;
 * - o teardown apaga na ordem da m82 e usa `as any` nos models novos (o client
 *   Prisma pode ainda não os conhecer ao compilar).
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
const recusa = (r: R, code: string, field?: string, status?: number) =>
  !r.ok && r.code === code && (field === undefined || r.field === field || (r.field ?? "").startsWith(`${field}.`)) && (status === undefined || r.status === status);
const j = (x: unknown) => JSON.stringify(x);
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));
const DIA = 86_400_000;
const brDia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const meioDia = (s: string) => new Date(`${s}T12:00:00Z`);
const somaDias = (s: string, k: number) => new Date(meioDia(s).getTime() + k * DIA).toISOString().slice(0, 10);
const dia = (x: Date | string | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const primeiroDoProximoMes = (s: string) => {
  const [a, m] = s.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
};

console.log("💳 M103: Módulo 39 (Meu Empório), taxas de cartão por adquirente, bandeira, faixa e vigência\n");

const HOJE = brDia(new Date());
const ONTEM = somaDias(HOJE, -1);

// ------------------------------------------------------------------ 1 (sem banco)
async function secao1() {
  console.log("1. resolverTaxa, taxaDoPagamentoCent e adquirentesComTaxa (pura, Q252)");
  const caminho = "@/lib/emporio/cartao";
  let M: Record<string, Dado> = {};
  try {
    M = (await import(caminho)) as Record<string, Dado>;
  } catch (e) {
    check("o módulo @/lib/emporio/cartao carrega", false, e instanceof Error ? e.message : String(e));
  }
  const resolverTaxa = M.resolverTaxa as undefined | ((l: Dado[], q: Dado) => Dado);
  const taxaDoPagamentoCent = M.taxaDoPagamentoCent as undefined | ((v: number, l: Dado) => number);
  const adquirentesComTaxa = M.adquirentesComTaxa as undefined | ((l: Dado[], d: string) => string[]);
  const DESDE = (M.VIGENCIA_DESDE_SEMPRE as string | undefined) ?? "2020-01-01";
  check("VIGENCIA_DESDE_SEMPRE é 2020-01-01", M.VIGENCIA_DESDE_SEMPRE === "2020-01-01", String(M.VIGENCIA_DESDE_SEMPRE));
  check("BANDEIRAS lista as cinco bandeiras da venda", j(M.BANDEIRAS) === j(["visa_master", "elo", "hipercard", "amex", "outra"]), j(M.BANDEIRAS));
  check("resolverTaxa existe", typeof resolverTaxa === "function");
  check("taxaDoPagamentoCent existe", typeof taxaDoPagamentoCent === "function");
  check("adquirentesComTaxa existe", typeof adquirentesComTaxa === "function");
  if (typeof resolverTaxa !== "function") return;

  const linha = (id: string, brand: string, kind: string, de: number, ate: number, pct: number, valid_from: string, valid_to: string | null, acq = "ac1") => ({
    id,
    acquirer_id: acq,
    brand,
    kind,
    installments_from: de,
    installments_to: ate,
    fee_pct: pct,
    fee_fixed: 0,
    days: 30,
    bank_account_id: "conta",
    valid_from,
    valid_to,
  });
  const linhas = [
    linha("elo", "elo", "credito_parcelado", 2, 12, 3.5, DESDE, null),
    linha("q33", "qualquer", "credito_parcelado", 3, 3, 2.9, DESDE, null),
    linha("q212", "qualquer", "credito_parcelado", 2, 12, 4, DESDE, null),
    linha("vmOld", "visa_master", "credito_vista", 1, 1, 2.5, DESDE, ONTEM),
    linha("vmNew", "visa_master", "credito_vista", 1, 1, 2.7, HOJE, null),
  ];
  const q = (brand: string, kind: string, installments: number, d: string, acq = "ac1") => resolverTaxa(linhas, { acquirer_id: acq, brand, kind, installments, dia: d });
  check("Elo 3x hoje: a linha Elo (a bandeira vence a faixa)", q("elo", "credito_parcelado", 3, HOJE)?.id === "elo", j(q("elo", "credito_parcelado", 3, HOJE)));
  check("Visa/Master 3x: qualquer 3-3 (a faixa estreita vence)", q("visa_master", "credito_parcelado", 3, HOJE)?.id === "q33", j(q("visa_master", "credito_parcelado", 3, HOJE)));
  check("Visa/Master 5x: qualquer 2-12", q("visa_master", "credito_parcelado", 5, HOJE)?.id === "q212", j(q("visa_master", "credito_parcelado", 5, HOJE)));
  const vOntem = q("visa_master", "credito_vista", 1, ONTEM);
  const vHoje = q("visa_master", "credito_vista", 1, HOJE);
  check("Visa/Master crédito à vista ontem: 2,5%", vOntem?.id === "vmOld" && perto(vOntem?.fee_pct, 2.5), j(vOntem));
  check("Visa/Master crédito à vista hoje: 2,7%", vHoje?.id === "vmNew" && perto(vHoje?.fee_pct, 2.7), j(vHoje));
  check("Hipercard 7x: qualquer 2-12", q("hipercard", "credito_parcelado", 7, HOJE)?.id === "q212", j(q("hipercard", "credito_parcelado", 7, HOJE)));
  check("outra adquirente: null", q("elo", "credito_parcelado", 3, HOJE, "ac-outra") === null, j(q("elo", "credito_parcelado", 3, HOJE, "ac-outra")));
  if (typeof taxaDoPagamentoCent === "function") {
    check("taxaDoPagamentoCent(10000, 2,5% e 0,30) = 280", taxaDoPagamentoCent(10000, { fee_pct: 2.5, fee_fixed: 0.3 }) === 280, String(taxaDoPagamentoCent(10000, { fee_pct: 2.5, fee_fixed: 0.3 })));
  }
  if (typeof adquirentesComTaxa === "function") {
    const duas = [...linhas, linha("velha", "qualquer", "debito", 1, 1, 1, DESDE, ONTEM, "ac2")];
    const ids = adquirentesComTaxa(duas, HOJE);
    check("adquirentesComTaxa lista a adquirente com linha vigente", ids.includes("ac1"), j(ids));
    check("adquirentesComTaxa não lista a adquirente sem linha vigente", !ids.includes("ac2"), j(ids));
  }
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const caminhos = {
    catalogo: "@/lib/actions/emporio-catalogo",
    estoque: "@/lib/actions/emporio-estoque",
    vendas: "@/lib/actions/emporio-vendas",
    caixa: "@/lib/actions/emporio-caixa",
    cartoes: "@/lib/actions/emporio-cartoes",
    impressao: "@/lib/actions/emporio-impressao",
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
  const IM = await carregar(caminhos.impressao);

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M103 ${rotulo} ${stamp}`, document: `M103${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
      });
      tenantIds.push(t.id);
      const mkUser = async (suf: string, role: Role): Promise<Ator> => {
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M103 ${rotulo} ${suf}`, email: `m103-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role, ...papelDeFixture(role) },
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
    const dbx = db as Dado; // models novos fora do tipo até o generate
    const dbBx = dbB as Dado;
    const cat = await db.productCategory.create({ data: scoped({ name: "M103 categoria" }) });
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
    const kk = (nome: string, ...a: unknown[]) => chamar([K], db, nome, ...a);
    const kkB = (nome: string, ...a: unknown[]) => chamar([K], dbB, nome, ...a);
    const vvB = (nome: string, ...a: unknown[]) => chamar([V], dbB, nome, ...a);
    const xx = (nome: string, ...a: unknown[]) => chamar([X], db, nome, ...a);
    const xxB = (nome: string, ...a: unknown[]) => chamar([X], dbB, nome, ...a);
    const rodar = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        check(`${nome}: terminou sem exceção`, false, e instanceof Error ? e.message : String(e));
      }
    };

    // ---- Lojas (uma por assunto, para uma seção não sujar a outra)
    const mkLoja = async (nome: string) => {
      const r = await cc("criarEstabelecimentoAction", owner, { name: `M103 ${nome}`, kind: "ponto_venda" });
      const l = dados(r);
      if (!l) throw new Error(`não criou a loja ${nome}: ${j(r)}`);
      return l as { id: string };
    };
    const L2 = await mkLoja("Loja 2 adquirente");
    const L3 = await mkLoja("Loja 3 taxas");
    const L4 = await mkLoja("Loja 4 wrappers");
    const L5 = await mkLoja("Loja 5 venda");
    const L6 = await mkLoja("Loja 6 vigencia");
    const L7 = await mkLoja("Loja 7 duas adquirentes");
    const lojas = [L2, L3, L4, L5, L6, L7];
    await vincularTodas(prisma, TA.t.id, [vend.id, gestor.id], lojas.map((l) => l.id));
    await virarGestor(prisma, gestor.id);
    await virarVendedor(prisma, vend.id);
    const { abrirTurnoDeTeste } = await import("./_emporio-turno");
    const turnos: Record<string, string> = {};
    for (const L of [L5, L6, L7]) turnos[L.id] = (await abrirTurnoDeTeste(db, owner, L.id)).cash_register_id;

    const rConta = await xx("criarContaAction", admin, { name: `M103 Conta ${stamp}`, bank: "Sicredi" });
    const conta = dados(rConta)?.id as string;
    if (!conta) throw new Error(`conta: ${j(rConta)}`);
    const rContaB = await xxB("criarContaAction", ownerB, { name: `M103 B conta ${stamp}`, bank: "B" });
    const contaB = dados(rContaB)?.id as string;
    if (!contaB) throw new Error(`conta B: ${j(rContaB)}`);

    // ---- Produto: R$ 50 o quilo, estoque nas lojas de venda
    const rP = await cc("criarProdutoEmporioAction", owner, { name: `M103 Ração ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    const P = dados(rP);
    if (!P) throw new Error(`produto: ${j(rP)}`);
    const rAp = await cc("criarApresentacaoAction", owner, P.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!rAp.ok) throw new Error(`apresentação: ${j(rAp)}`);
    const presId = rAp.data.id as string;
    for (const L of [L5, L6, L7]) {
      const rp = await cc("definirPrecoAction", admin, { establishment_id: L.id, presentation_id: presId, price: 50 });
      if (!rp.ok) throw new Error(`preço: ${j(rp)}`);
      const ri = await ee("implantarEstoqueAction", owner, { establishment_id: L.id, emporio_product_id: P.id, sealed: [], loose_qty: 1000, unit_cost: 10 });
      if (!ri.ok) throw new Error(`implantar: ${j(ri)}`);
    }
    const rPB = await chamar([C], dbB, "criarProdutoEmporioAction", ownerB, { name: `M103 B ${stamp}`, category_id: (await dbB.productCategory.create({ data: scoped({ name: "M103 B cat" }) })).id, base_unit: "quilograma" });
    void rPB;

    let chaveSeq = 0;
    const chave = (p: string) => `m103-${p}-${stamp}-${(chaveSeq += 1)}`;
    const itens = (qtd: number) => [{ emporio_product_id: P.id, presentation_id: presId, quantity: qtd }]; // qtd x 50
    const cartao = (kind: string, amount: number, extra: Dado = {}) => ({ kind, amount, ...extra });
    const vender = (ator: Ator, loja: { id: string }, qtd: number, payments: Dado[], over: Dado = {}) =>
      vv("venderAction", ator, { operation_key: chave("v"), establishment_id: loja.id, customer_id: cf, items: itens(qtd), payments, cash_register_id: turnos[loja.id], ...over });
    const idDe = (r: R): string => dados(r)?.id ?? "";
    const DESDE = meioDia("2020-01-01");

    // adquirentes e linhas
    const mkAdq = async (nome: string) => {
      const r = await kk("criarAdquirenteAction", admin, { name: nome });
      return { r, id: (dados(r)?.id as string) ?? "" };
    };
    type Taxa = { loja: { id: string }; acq: string; brand: string; kind: string; de: number; ate: number; pct: number; fixo?: number; days?: number; from?: Date };
    const taxa = (t: Taxa) =>
      kk("criarTaxaAction", admin, {
        establishment_id: t.loja.id,
        acquirer_id: t.acq,
        brand: t.brand,
        kind: t.kind,
        installments_from: t.de,
        installments_to: t.ate,
        fee_pct: t.pct,
        ...(t.fixo === undefined ? {} : { fee_fixed: t.fixo }),
        days: t.days ?? 30,
        bank_account_id: conta,
        valid_from: t.from ?? DESDE,
      });
    const taxasDe = async (loja: { id: string }, acq?: string, incluirEncerradas = false, ator: Ator = admin) =>
      lista(dados(await kk("listarTaxasAction", ator, { establishment_id: loja.id, ...(acq ? { acquirer_id: acq } : {}), ...(incluirEncerradas ? { incluir_encerradas: true } : {}) })));

    // ---------------------------------------------------------------- 1
    try {
      await secao1();
    } catch (e) {
      check("seção 1: terminou sem exceção", false, e instanceof Error ? e.message : String(e));
    }

    // ---------------------------------------------------------------- 2
    console.log("\n2. Adquirente (Q250)");
    let STONE_L3 = ""; // adquirente da conta, usada nas seções 3, 5, 6, 7
    await rodar("seção 2", async () => {
      const a = await mkAdq("Stone");
      STONE_L3 = a.id;
      check("o dono cria a adquirente Stone", a.r.ok && !!a.id && dados(a.r)?.name === "Stone", j(a.r));
      check("nome duplicado: 409 VALIDATION_ERROR em name", recusa(await kk("criarAdquirenteAction", admin, { name: "Stone" }), "VALIDATION_ERROR", "name", 409), j(await kk("criarAdquirenteAction", admin, { name: "Stone" })));
      check("nome duplicado sem caixa (stone): 409 em name", recusa(await kk("criarAdquirenteAction", admin, { name: "stone" }), "VALIDATION_ERROR", "name", 409));
      check("nome vazio: VALIDATION_ERROR em name", recusa(await kk("criarAdquirenteAction", admin, { name: "  " }), "VALIDATION_ERROR", "name"));
      check("o Vendedor sem gestor cria adquirente: FORBIDDEN", recusa(await kk("criarAdquirenteAction", vend, { name: "Vendedor SA" }), "FORBIDDEN"));
      const lst = lista(dados(await kk("listarAdquirentesAction", vend)));
      check("qualquer papel do Empório lê: o Vendedor lista e vê a Stone", lst.some((x) => x.id === STONE_L3 && x.name === "Stone" && x.archived_at === null && x.rates_count === 0), j(lst));
      const rEd = await kk("editarAdquirenteAction", admin, STONE_L3, { name: "Stone Pagamentos" });
      check("editar o nome: ok", rEd.ok && dados(rEd)?.name === "Stone Pagamentos", j(rEd));
      await kk("editarAdquirenteAction", admin, STONE_L3, { name: "Stone" });
      const b = await mkAdq("Cielo teste");
      const rAr = await kk("arquivarAdquirenteAction", admin, b.id);
      check("arquivar adquirente sem linha: ok", rAr.ok, j(rAr));
      const nomes = lista(dados(await kk("listarAdquirentesAction", admin))).map((x) => x.id);
      check("a arquivada some da lista padrão", !nomes.includes(b.id), j(nomes));
      const comArq = lista(dados(await kk("listarAdquirentesAction", admin, { incluir_arquivadas: true }))).find((x) => x.id === b.id);
      check("com incluir_arquivadas ela volta, com archived_at", !!comArq && comArq.archived_at !== null, j(comArq));
    });

    // ---------------------------------------------------------------- 3
    console.log("\n3. Taxas e sobreposição (Q252, decisões 3 e 4)");
    await rodar("seção 3", async () => {
      const t26 = await taxa({ loja: L3, acq: STONE_L3, brand: "visa_master", kind: "credito_parcelado", de: 2, ate: 6, pct: 3.5 });
      const t712 = await taxa({ loja: L3, acq: STONE_L3, brand: "visa_master", kind: "credito_parcelado", de: 7, ate: 12, pct: 4.2 });
      check("Visa/Master parcelado 2-6 a 3,5% e 7-12 a 4,2%: ok", t26.ok && t712.ok, j([t26, t712]));
      const rSob = await taxa({ loja: L3, acq: STONE_L3, brand: "visa_master", kind: "credito_parcelado", de: 3, ate: 8, pct: 3.9 });
      check("faixa 3-8 sobrepõe: 409 VALIDATION_ERROR em valid_from", recusa(rSob, "VALIDATION_ERROR", "valid_from", 409), j(rSob));
      const rElo = await taxa({ loja: L3, acq: STONE_L3, brand: "elo", kind: "credito_parcelado", de: 3, ate: 8, pct: 4.5 });
      check("a mesma faixa com bandeira Elo não é sobreposição: ok", rElo.ok, j(rElo));
      const rQual = await taxa({ loja: L3, acq: STONE_L3, brand: "qualquer", kind: "credito_parcelado", de: 3, ate: 8, pct: 5 });
      check("qualquer não cruza com bandeira exata: ok", rQual.ok, j(rQual));

      // nova vigência a partir do dia 1 do mês que vem
      const prox = primeiroDoProximoMes(HOJE);
      const ultimo = somaDias(prox, -1);
      const rNv = await kk("novaVigenciaAction", admin, dados(t26)?.id, { valid_from: meioDia(prox), fee_pct: 3.8 });
      check("nova vigência no dia 1 do mês que vem: ok", rNv.ok, j(rNv));
      const todas = await taxasDe(L3, STONE_L3, true);
      const antiga = todas.find((x) => x.id === dados(t26)?.id);
      const nova = todas.find((x) => x.id !== dados(t26)?.id && x.brand === "visa_master" && x.installments_from === 2 && dia(x.valid_from) === prox);
      check("a antiga ganha valid_to = último dia deste mês", dia(antiga?.valid_to) === ultimo, j(antiga));
      check("a nova nasce com valid_from = dia 1, 3,8%, mesma faixa e sem valid_to", !!nova && perto(n(nova.fee_pct), 3.8) && nova.installments_to === 6 && !nova.valid_to, j(nova));
      const rNvAnt = await kk("novaVigenciaAction", admin, dados(t712)?.id, { valid_from: meioDia("2019-12-01"), fee_pct: 1 });
      check("nova vigência anterior ao início da linha: recusa 422", !rNvAnt.ok && rNvAnt.status === 422, j(rNvAnt));

      // linha usada por venda: precisa de loja com estoque (L5 faz a venda real; aqui, a Elo da L3 não tem estoque)
      // Aproveita a L5: ver seção 6 (RATE_IN_USE). Aqui a arquivada com linha vigente:
      const rArq = await kk("arquivarAdquirenteAction", admin, STONE_L3);
      check("arquivar adquirente com linha vigente: 409 VALIDATION_ERROR", recusa(rArq, "VALIDATION_ERROR", undefined, 409) && /encerre/i.test(!rArq.ok ? rArq.message : ""), j(rArq));

      // Q232: o Financeiro mantém as taxas (sem vínculo com loja); o Vendedor não
      const uFin = await prisma.user.create({
        data: { tenant_id: TA.t.id, name: "M103 A fin", email: `m103-A-fin-${stamp}@teste.local`, password_hash: "x", role: "VISUALIZADOR", ...papelFinanceiro() },
      });
      const fin: Ator = { id: uFin.id, role: "VISUALIZADOR" };
      const taxaFin = (ator: Ator) =>
        kk("criarTaxaAction", ator, { establishment_id: L3.id, acquirer_id: STONE_L3, brand: "hipercard", kind: "debito", installments_from: 1, installments_to: 1, fee_pct: 1.9, days: 1, bank_account_id: conta, valid_from: DESDE });
      const rFin = await taxaFin(fin);
      check("o Financeiro cria uma taxa: ok", rFin.ok, j(rFin));
      check("o Vendedor cria uma taxa: FORBIDDEN", recusa(await taxaFin(vend), "FORBIDDEN", undefined, 403), j(await taxaFin(vend)));

      // isolamento de listagem
      const doB = await taxasDe(L3, undefined, true, ownerB).catch(() => []);
      const rB = await kkB("listarTaxasAction", ownerB, { establishment_id: L3.id });
      check("o tenant B não vê as taxas de A", (rB.ok ? lista(rB.data).length === 0 : rB.status === 404) && doB.length === 0, j(rB).slice(0, 200));
    });

    // ---------------------------------------------------------------- 4
    console.log("\n4. Wrappers da regra antiga (decisão 10)");
    await rodar("seção 4", async () => {
      const antes = lista(dados(await kk("listarAdquirentesAction", admin))).filter((x) => x.name === "Maquininha").length;
      const rDef = await xx("definirRegraCartaoAction", admin, { establishment_id: L4.id, kind: "credito_parcelado", fee_pct: 3, days: 20, bank_account_id: conta });
      check("definirRegraCartaoAction numa loja sem nada: ok", rDef.ok, j(rDef));
      const adqs = lista(dados(await kk("listarAdquirentesAction", admin)));
      check("cria a adquirente Maquininha (uma só)", adqs.filter((x) => x.name === "Maquininha").length === antes + 1, j(adqs.map((x) => x.name)));
      const maq = adqs.find((x) => x.name === "Maquininha");
      const linhas = await taxasDe(L4, maq?.id);
      const q = linhas.filter((x) => x.brand === "qualquer" && x.kind === "credito_parcelado");
      check("grava a linha qualquer 2-12, 3% e 20 dias, desde sempre", q.length === 1 && q[0].installments_from === 2 && q[0].installments_to === 12 && perto(n(q[0].fee_pct), 3) && q[0].days === 20 && dia(q[0].valid_from) === "2020-01-01", j(q));
      const ls = await xx("listarRegrasCartaoAction", admin, L4.id);
      const r0 = lista(dados(ls)).find((x) => x.kind === "credito_parcelado");
      check("listarRegrasCartaoAction devolve no formato antigo (kind, fee_pct, days, bank_account_id)", ls.ok && !!r0 && perto(n(r0.fee_pct), 3) && r0.days === 20 && r0.bank_account_id === conta, j(ls));
      const rDef2 = await xx("definirRegraCartaoAction", admin, { establishment_id: L4.id, kind: "credito_parcelado", fee_pct: 4, days: 20, bank_account_id: conta });
      const linhas2 = (await taxasDe(L4, maq?.id)).filter((x) => x.brand === "qualquer" && x.kind === "credito_parcelado");
      check("chamar de novo com outro pct edita no lugar (uma linha só, 4%)", rDef2.ok && linhas2.length === 1 && perto(n(linhas2[0].fee_pct), 4) && linhas2[0].id === q[0]?.id, j(linhas2));
      const rRem = await xx("removerRegraCartaoAction", admin, q[0]?.id ?? "x");
      check("removerRegraCartaoAction remove a linha não usada", rRem.ok && (await taxasDe(L4, maq?.id)).filter((x) => x.kind === "credito_parcelado").length === 0, j(rRem));
    });

    // ---------------------------------------------------------------- 5
    console.log("\n5. A venda congela adquirente, bandeira e linha (Q254)");
    let S3X = ""; // venda 3x Visa/Master (recibo, seção 8)
    let STONE5 = "";
    let LINHA3X = "";
    await rodar("seção 5", async () => {
      const a = await mkAdq("Stone L5");
      STONE5 = a.id;
      const t1 = await taxa({ loja: L5, acq: STONE5, brand: "visa_master", kind: "credito_parcelado", de: 2, ate: 6, pct: 3.5 });
      LINHA3X = dados(t1)?.id ?? "";
      await taxa({ loja: L5, acq: STONE5, brand: "visa_master", kind: "credito_parcelado", de: 7, ate: 12, pct: 4.2 });
      await taxa({ loja: L5, acq: STONE5, brand: "elo", kind: "credito_parcelado", de: 2, ate: 12, pct: 4.5 });
      await taxa({ loja: L5, acq: STONE5, brand: "qualquer", kind: "debito", de: 1, ate: 1, pct: 1.5, fixo: 0.1, days: 1 });
      await taxa({ loja: L5, acq: STONE5, brand: "visa_master", kind: "credito_vista", de: 1, ate: 1, pct: 2.5 });
      check("a fixture de taxas da Stone nasceu", t1.ok && (await taxasDe(L5, STONE5)).length === 5, j(await taxasDe(L5, STONE5)).slice(0, 300));

      const pagamentosDe = (saleId: string) => dbx.emporioSalePayment.findMany({ where: { sale_id: saleId } }) as Promise<Dado[]>;
      const recebiveisDe = async (saleId: string): Promise<Dado[]> =>
        ((await dbx.cardReceivable.findMany({ where: { sale_id: saleId } })) as Dado[]).sort((x, y) => x.installment - y.installment);

      const r3 = await vender(vend, L5, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: STONE5, brand: "visa_master" })]);
      S3X = idDe(r3);
      check("venda 300 em 3x Visa/Master: ok", r3.ok, j(r3));
      const p3 = (await pagamentosDe(S3X))[0];
      check("fee_pct 3,5 e fee_amount 10,50, com adquirente, bandeira e a linha congelados", !!p3 && perto(n(p3.fee_pct), 3.5) && perto(n(p3.fee_amount), 10.5) && p3.acquirer_id === STONE5 && p3.brand === "visa_master" && p3.fee_rate_id === LINHA3X, j(p3));
      const rc3 = await recebiveisDe(S3X);
      check("3 recebíveis com brand visa_master e acquirer_id da Stone", rc3.length === 3 && rc3.every((r) => r.brand === "visa_master" && r.acquirer_id === STONE5), j(rc3).slice(0, 300));
      check("líquidos 96,50 + 96,50 + 96,50", rc3.length === 3 && rc3.every((r) => perto(n(r.net_amount), 96.5)), j(rc3.map((r) => r.net_amount)));

      const rElo = await vender(vend, L5, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: STONE5, brand: "elo" })]);
      const pElo = (await pagamentosDe(idDe(rElo)))[0];
      check("venda 300 em 3x Elo: 4,5%", rElo.ok && !!pElo && perto(n(pElo.fee_pct), 4.5) && perto(n(pElo.fee_amount), 13.5), j([rElo, pElo]));

      const rDeb = await vender(vend, L5, 2, [cartao("debito", 100, { acquirer_id: STONE5, brand: "visa_master" })]);
      const pDeb = (await pagamentosDe(idDe(rDeb)))[0];
      check("débito 100: fee_amount 1,60 (1,5% mais 0,10)", rDeb.ok && !!pDeb && perto(n(pDeb.fee_amount), 1.6) && perto(n(pDeb.fee_fixed_amount), 0.1), j([rDeb, pDeb]));

      const r7 = await vender(vend, L5, 14, [cartao("credito_parcelado", 700, { installments: 7, acquirer_id: STONE5, brand: "visa_master" })]);
      const p7 = (await pagamentosDe(idDe(r7)))[0];
      check("venda 7x Visa/Master: 4,2%", r7.ok && !!p7 && perto(n(p7.fee_pct), 4.2), j([r7, p7]));

      const rVista = await vender(vend, L5, 2, [cartao("credito_vista", 100, { acquirer_id: STONE5, brand: "visa_master" })]);
      const pVista = (await pagamentosDe(idDe(rVista)))[0];
      check("crédito à vista Visa/Master: 2,5%", rVista.ok && !!pVista && perto(n(pVista.fee_pct), 2.5), j([rVista, pVista]));

      const vendas0 = await db.emporioSale.count();
      const rSemBandeira = await vender(vend, L5, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: STONE5 })]);
      check("3x sem brand (sem linha qualquer para parcelado): VALIDATION_ERROR em payments, 'informe a bandeira'", recusa(rSemBandeira, "VALIDATION_ERROR", "payments") && !rSemBandeira.ok && rSemBandeira.message.toLowerCase().includes("informe a bandeira"), j(rSemBandeira));
      const rQualquer = await vender(vend, L5, 6, [cartao("credito_parcelado", 300, { installments: 3, acquirer_id: STONE5, brand: "qualquer" })]);
      check("brand 'qualquer' na venda: VALIDATION_ERROR em payments", recusa(rQualquer, "VALIDATION_ERROR", "payments"), j(rQualquer));
      check("as recusas não gravaram venda", (await db.emporioSale.count()) === vendas0);

      // uma só adquirente com linha vigente: acquirer_id é opcional e vem preenchido
      const rSem = await vender(vend, L5, 2, [cartao("debito", 100)]);
      const pSem = (await pagamentosDe(idDe(rSem)))[0];
      check("venda sem acquirer_id em loja com uma só: ok e acquirer_id preenchido", rSem.ok && pSem?.acquirer_id === STONE5, j([rSem, pSem]));

      // duas adquirentes na L7
      const cielo = await mkAdq("Cielo L7");
      const stone7 = await mkAdq("Stone L7");
      await taxa({ loja: L7, acq: cielo.id, brand: "qualquer", kind: "debito", de: 1, ate: 1, pct: 1.2 });
      await taxa({ loja: L7, acq: stone7.id, brand: "qualquer", kind: "debito", de: 1, ate: 1, pct: 1.4 });
      const rAmb = await vender(vend, L7, 2, [cartao("debito", 100)]);
      check("duas adquirentes com linha vigente e sem acquirer_id: VALIDATION_ERROR em acquirer_id", recusa(rAmb, "VALIDATION_ERROR", "acquirer_id"), j(rAmb));
      const rCielo = await vender(vend, L7, 2, [cartao("debito", 100, { acquirer_id: cielo.id })]);
      const pCielo = (await pagamentosDe(idDe(rCielo)))[0];
      check("com acquirer_id escolhido a venda segue, na taxa daquela adquirente (1,2%)", rCielo.ok && !!pCielo && perto(n(pCielo.fee_pct), 1.2), j([rCielo, pCielo]));

      // leitura
      const lida = await vv("lerVendaAction", admin, S3X);
      const pl = lista(dados(lida)?.payments)[0];
      check(
        "lerVendaAction traz acquirer_id, brand, fee_pct, fee_amount, fee_fixed_amount e fee_rate_id",
        lida.ok && !!pl && pl.acquirer_id === STONE5 && pl.brand === "visa_master" && perto(n(pl.fee_pct), 3.5) && perto(n(pl.fee_amount), 10.5) && "fee_fixed_amount" in pl && pl.fee_rate_id === LINHA3X,
        j(pl),
      );

      // cancelar
      const rCan = await vv("cancelarVendaAction", gestor, S3X, { reason: "teste da taxa" });
      const rcCan = await recebiveisDe(S3X);
      check("cancelar cancela os 3 recebíveis como antes", rCan.ok && rcCan.length === 3 && rcCan.every((r) => r.canceled_at), j([rCan, rcCan.map((r) => r.canceled_at)]));
    });

    // ---------------------------------------------------------------- 6
    console.log("\n6. Edição e vigência: venda retroativa, venda antiga e linha usada (decisão 4)");
    await rodar("seção 6", async () => {
      const a = await mkAdq("Stone L6");
      const t0 = await taxa({ loja: L6, acq: a.id, brand: "visa_master", kind: "credito_parcelado", de: 2, ate: 6, pct: 3.5 });
      const rNv = await kk("novaVigenciaAction", admin, dados(t0)?.id, { valid_from: meioDia(HOJE), fee_pct: 3.9 });
      check("a linha Visa/Master 3x muda hoje por novaVigenciaAction (3,5% para 3,9%)", t0.ok && rNv.ok, j([t0, rNv]));
      const linhas = await taxasDe(L6, a.id, true);
      const velha = linhas.find((x) => x.id === dados(t0)?.id);
      check("a antiga fecha ontem", dia(velha?.valid_to) === ONTEM, j(velha));

      const pag = (saleId: string) => dbx.emporioSalePayment.findMany({ where: { sale_id: saleId } }) as Promise<Dado[]>;
      const pagamento3x = (extra: Dado = {}) => cartao("credito_parcelado", 100, { installments: 3, acquirer_id: a.id, brand: "visa_master", ...extra });
      const rOntem = await vender(vend, L6, 2, [pagamento3x()], { sold_at: new Date(Date.now() - DIA) });
      const pOntem = (await pag(idDe(rOntem)))[0];
      check("venda datada de ontem: 3,5%", rOntem.ok && !!pOntem && perto(n(pOntem.fee_pct), 3.5), j([rOntem, pOntem]));
      const rHoje = await vender(vend, L6, 2, [pagamento3x()]);
      const pHoje = (await pag(idDe(rHoje)))[0];
      check("venda de hoje: 3,9%", rHoje.ok && !!pHoje && perto(n(pHoje.fee_pct), 3.9), j([rHoje, pHoje]));

      // venda pré-entrega: sem adquirente, bandeira e linha
      await dbx.emporioSalePayment.updateMany({ where: { sale_id: idDe(rHoje) }, data: { acquirer_id: null, brand: null, fee_rate_id: null } });
      const rEd = await vv("editarVendaAction", gestor, idDe(rHoje), {
        operation_key: chave("ed"),
        items: itens(2),
        payments: [pagamento3x()],
        cash_register_id: turnos[L6.id],
      });
      check("venda antiga (sem adquirente) editada com brand informado: ok", rEd.ok, j(rEd));
      const nova = await vv("lerVendaAction", admin, idDe(rEd));
      const pn = lista(dados(nova)?.payments)[0];
      check("a nova tem acquirer_id e brand", nova.ok && !!pn && pn.acquirer_id === a.id && pn.brand === "visa_master", j(pn));

      // linha usada: nunca editada no lugar nem removida
      const usada = (await pag(idDe(rOntem)))[0]?.fee_rate_id as string | undefined;
      check("o pagamento de ontem guarda a linha usada (fee_rate_id)", !!usada, String(usada));
      const rEdTaxa = await kk("editarTaxaAction", admin, usada ?? "x", { fee_pct: 9 });
      check("editarTaxaAction na linha usada pela venda: 409 RATE_IN_USE", recusa(rEdTaxa, "RATE_IN_USE", undefined, 409), j(rEdTaxa));
      const rRem = await kk("removerTaxaAction", admin, usada ?? "x");
      check("removerTaxaAction na linha usada: 409 RATE_IN_USE", recusa(rRem, "RATE_IN_USE", undefined, 409), j(rRem));
      const rEnc = await kk("removerTaxaAction", admin, usada ?? "x", { encerrar: true });
      const aposEnc = (await taxasDe(L6, a.id, true)).find((x) => x.id === usada);
      check("removerTaxaAction com { encerrar: true } na linha usada: ok e valid_to = ontem", rEnc.ok && dia(aposEnc?.valid_to) === ONTEM, j([rEnc, aposEnc]));
      check("a linha usada continua no banco (o histórico da venda aponta para ela)", (await dbx.cardFeeRate.count({ where: { id: usada ?? "x" } })) === 1);
    });

    // ---------------------------------------------------------------- 7
    console.log("\n7. Isolamento entre tenants");
    await rodar("seção 7", async () => {
      const linhaA = (await taxasDe(L5, STONE5)).find((x) => x.brand === "elo");
      check("(base) A tem a linha Elo da L5", !!linhaA);
      const lstB = lista(dados(await kkB("listarAdquirentesAction", ownerB)));
      check("B não vê as adquirentes de A", !lstB.some((x) => x.id === STONE5 || x.id === STONE_L3), j(lstB));
      const rIns = await kkB("criarTaxaAction", ownerB, {
        establishment_id: L5.id,
        acquirer_id: STONE5,
        brand: "elo",
        kind: "credito_parcelado",
        installments_from: 2,
        installments_to: 12,
        fee_pct: 1,
        days: 30,
        bank_account_id: contaB,
        valid_from: DESDE,
      });
      check("B cria taxa na loja de A: 404 NOT_FOUND", recusa(rIns, "NOT_FOUND", undefined, 404), j(rIns));
      check("B edita taxa de A: 404 NOT_FOUND", recusa(await kkB("editarTaxaAction", ownerB, linhaA?.id ?? "x", { fee_pct: 1 }), "NOT_FOUND", undefined, 404));
      check("B remove taxa de A: 404 NOT_FOUND", recusa(await kkB("removerTaxaAction", ownerB, linhaA?.id ?? "x"), "NOT_FOUND", undefined, 404));
      check("B nova vigência na taxa de A: 404 NOT_FOUND", recusa(await kkB("novaVigenciaAction", ownerB, linhaA?.id ?? "x", { valid_from: meioDia(HOJE) }), "NOT_FOUND", undefined, 404));
      check("B edita adquirente de A: 404 NOT_FOUND", recusa(await kkB("editarAdquirenteAction", ownerB, STONE5, { name: "invadida" }), "NOT_FOUND", undefined, 404));
      check("B arquiva adquirente de A: 404 NOT_FOUND", recusa(await kkB("arquivarAdquirenteAction", ownerB, STONE5), "NOT_FOUND", undefined, 404));
      check("B define regra antiga na loja de A: 404 NOT_FOUND", recusa(await xxB("definirRegraCartaoAction", ownerB, { establishment_id: L5.id, kind: "debito", fee_pct: 1, days: 1, bank_account_id: contaB }), "NOT_FOUND", undefined, 404));
      const rVendaB = await vvB("venderAction", ownerB, { operation_key: chave("vb"), establishment_id: L5.id, customer_id: cfB, items: itens(2), payments: [cartao("debito", 100, { acquirer_id: STONE5 })] });
      check("B vende na loja de A com a adquirente de A: recusado", !rVendaB.ok && (rVendaB.status === 404 || rVendaB.status === 422), j(rVendaB));
      check("no banco, B não tem adquirentes nem taxas", (await dbBx.cardAcquirer.count()) === 0 && (await dbBx.cardFeeRate.count()) === 0);
      check("e A tem as suas (o isolamento não é vazio)", (await dbx.cardAcquirer.count()) > 0 && (await dbx.cardFeeRate.count()) > 0);
    });

    // ---------------------------------------------------------------- 8
    console.log("\n8. Recibo: bandeira e adquirente");
    await rodar("seção 8", async () => {
      const r = await chamar([IM], db, "lerImpressoDaVendaAction", admin, S3X);
      const txt = j(dados(r) ?? {});
      check("o recibo da venda 3x traz 'Visa/Master' e 'Stone'", r.ok && txt.includes("Visa/Master") && txt.includes("Stone"), txt.slice(0, 400));
      check("e traz a adquirente rotulada pelo nome da conta (Stone L5)", r.ok && txt.includes("Stone L5"), txt.slice(0, 400));
    });
  } finally {
    const p = prisma as Dado;
    for (const id of tenantIds) {
      try {
        await p.tenant.delete({ where: { id } });
        continue;
      } catch {
        // o cascade esbarra em Restrict (venda aponta para a taxa): limpa na ordem
      }
      try {
        await p.cashMovement.deleteMany({ where: { tenant_id: id } });
        await p.cardReceivable.deleteMany({ where: { tenant_id: id } });
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
    console.log(falhas === 0 ? `\n✅ M103 verde (${totalChecks} checagens)` : `\n❌ M103: ${falhas} falha(s) em ${totalChecks} checagens`);
    process.exit(falhas === 0 ? 0 : 1);
  });
