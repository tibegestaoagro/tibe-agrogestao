import "./_env-local";
import { AsyncLocalStorage } from "node:async_hooks";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();
// As seções de rota usam o escopo de requisição do Next: o AsyncLocalStorage real precisa existir ANTES de carregar o Next (ver m23).
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório), F4b: visão somada, produtos que mais vendem e que
 * mais dão margem, vendas com margem negativa e o filtro de área do Financeiro.
 * Roda: `npm run test:m84`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F4b: contrato", Q103 a
 * Q107, regras 9 e 10 da seção 5 e o contrato da F4a), sem ler a implementação
 * nova. Cada seção roda isolada: se uma quebrar, as outras seguem.
 *
 * Quatro tenants de cenário (cada um com a conta que só ele precisa):
 * - G: duas lojas, vendas, transferência com diferença e despesa fixa 50/50 (o aceite);
 * - R: uma loja, 13 produtos, regras, cartão e devolução (conta independente do rateio);
 * - N: duas lojas com uma venda de cada causa de margem negativa;
 * - F: lançamentos com loja e sem loja (filtro de área);
 * - B: sem dados, só para provar isolamento.
 *
 * O que o contrato calava e esta suíte ASSUME:
 * - as actions novas estão em `emporio-resultado` (ou `emporio-despesas`);
 * - `produtosDoMesAction(db, ator, { establishment_id | "all", month })` e
 *   `vendasComMargemNegativaAction` idem; a resposta do segundo é uma lista
 *   (ou um objeto cuja primeira lista é a das vendas);
 * - `getDre`/`getCashFlow` recebem `area` no objeto de parâmetros; `getUpcoming`
 *   recebe `area` como 4º argumento posicional OU num objeto de 3º argumento
 *   (a suíte tenta as duas e relata qual vale);
 * - o token do link de relatório carrega a `area` em claro no payload (a suíte
 *   só procura o texto "emporio" ou "fazenda" nele);
 * - `produtos` e `margem negativa` na visão somada seguem a mesma regra 10 do
 *   Resultado (vínculo ou OPERADOR: 403 ou 404);
 * - `margin_pct` pode vir em 0..100 ou 0..1; o ponto de equilíbrio vem como
 *   número em `break_even`, `remaining` é "quanto falta";
 * - o desempate de nome compara como `localeCompare` em pt-BR.
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

const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;
const recusa = (r: R, code: string, status: number, field?: string) =>
  !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);
const negada = (r: R) => !r.ok && (r.status === 403 || r.status === 404);
const j = (x: unknown) => JSON.stringify(x);
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));
const DIA = 86_400_000;
const pctIs = (v: unknown, p100: number) => perto(v, p100, 0.02) || perto(v, p100 / 100, 0.0002);

const brDate = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const mesAtual = (): string => brDate(new Date()).slice(0, 7);
const somaMeses = (ym: string, k: number): string => {
  const t = Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const primeiroDia = (ym: string): Date => new Date(`${ym}-01T12:00:00Z`);

const numDe = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const k of ["amount", "value", "total", "valor"]) {
      const x = (v as Dado)[k];
      if (typeof x === "number") return x;
      if (typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x))) return Number(x);
    }
  }
  return NaN;
};
const pega = (d: Dado, aliases: string[]): number => {
  const fila: Dado[] = [d];
  while (fila.length) {
    const x = fila.shift();
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    for (const a of aliases) {
      if (a in x) {
        const v = numDe(x[a]);
        if (!Number.isNaN(v)) return v;
      }
    }
    for (const v of Object.values(x)) if (v && typeof v === "object" && !Array.isArray(v)) fila.push(v);
  }
  return NaN;
};
const pegaLista = (d: Dado, aliases: string[]): Dado[] | null => {
  const fila: Dado[] = [d];
  while (fila.length) {
    const x = fila.shift();
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    for (const a of aliases) if (Array.isArray(x[a])) return x[a];
    for (const v of Object.values(x)) if (v && typeof v === "object" && !Array.isArray(v)) fila.push(v);
  }
  return null;
};
const pegaBool = (d: Dado, aliases: string[]): boolean | null => {
  const fila: Dado[] = [d];
  while (fila.length) {
    const x = fila.shift();
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    for (const a of aliases) if (typeof x[a] === "boolean") return x[a];
    for (const v of Object.values(x)) if (v && typeof v === "object" && !Array.isArray(v)) fila.push(v);
  }
  return null;
};
const primeiraLista = (d: Dado): Dado[] | null => {
  if (Array.isArray(d)) return d;
  const fila: Dado[] = [d];
  while (fila.length) {
    const x = fila.shift();
    if (!x || typeof x !== "object") continue;
    for (const v of Object.values(x)) if (Array.isArray(v)) return v as Dado[];
    for (const v of Object.values(x)) if (v && typeof v === "object") fila.push(v);
  }
  return null;
};
const A_VENDAS = ["sales", "vendas", "sales_total", "total_sales", "net_sales", "revenue"];
const A_CUSTO = ["cost", "custo", "cogs", "cost_total", "goods_cost"];
const A_VP = ["variable_expenses", "vendeu_pagou", "sold_paid", "variable"];
const A_MARGEM = ["margin", "margem", "gross_margin"];
const A_MARGEM_PCT = ["margin_pct", "margem_pct", "margin_percent"];
const A_PERDAS = ["losses", "perdas", "loss", "perdas_quebras", "losses_and_breakage"];
const A_FIXAS = ["fixed", "fixed_expenses", "fixas", "fixed_total"];
const A_RESULTADO = ["result", "resultado", "net_result"];
const A_PONTO = ["break_even", "ponto_equilibrio", "break_even_point"];
const A_FALTA = ["remaining", "missing", "falta", "shortfall", "remaining_to_break_even"];

console.log("📊 M84: Módulo 39 (Meu Empório), F4b: visão somada, produtos, margem negativa e filtro de área\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const carregar = async (caminho: string): Promise<Record<string, Acao>> => {
    try {
      return (await import(caminho)) as Record<string, Acao>;
    } catch {
      return {};
    }
  };
  const C = await carregar("@/lib/actions/emporio-catalogo");
  const E = await carregar("@/lib/actions/emporio-estoque");
  const V = await carregar("@/lib/actions/emporio-vendas");
  const X = await carregar("@/lib/actions/emporio-caixa");
  const T = await carregar("@/lib/actions/emporio-transferencias");
  const D = await carregar("@/lib/actions/emporio-despesas");
  const RS = await carregar("@/lib/actions/emporio-resultado");
  const FR = (await import("@/lib/actions/financial-reports")) as unknown as Record<string, (...a: unknown[]) => Promise<Dado>>;

  const stamp = Date.now();
  const tenantIds: string[] = [];
  const mes = mesAtual();
  let chaveSeq = 0;
  const chave = (p: string) => `m84-${p}-${stamp}-${(chaveSeq += 1)}`;
  const dados = (r: R): Dado => (r.ok ? r.data : undefined);
  const ausente = (nome: string): R => ({ ok: false, code: "ACTION_AUSENTE", message: `action ausente: ${nome}`, status: 0 });
  const chamarEm = async (mods: Record<string, Acao>[], cliente: Dado, nome: string, ...args: unknown[]): Promise<R> => {
    for (const m of mods) {
      const f = m[nome];
      if (typeof f === "function") return f(cliente, ...args);
    }
    return ausente(nome);
  };
  const rodar = async (nome: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      check(`a seção "${nome}" quebrou`, false, e instanceof Error ? e.message : String(e));
    }
  };

  // ---- Fábrica de cenário: um tenant com os quatro papéis e os atalhos de chamada
  const montar = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: { name: `M84 ${rotulo} ${stamp}`, document: `M84${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
    });
    tenantIds.push(t.id);
    const mkUser = async (suf: string, role: Role): Promise<Ator> => {
      const u = await prisma.user.create({
        data: { tenant_id: t.id, name: `M84 ${rotulo} ${suf}`, email: `m84-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role },
      });
      return { id: u.id, role };
    };
    const owner = await mkUser("own", "OWNER");
    const admin = await mkUser("adm", "ADMIN");
    const op = await mkUser("op", "OPERADOR");
    const visu = await mkUser("vis", "VISUALIZADOR");
    const db = prismaForTenant(t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: `M84 categoria ${rotulo}` }) });
    const cc = (nome: string, ...a: unknown[]) => chamarEm([C], db, nome, ...a);
    const ee = (nome: string, ...a: unknown[]) => chamarEm([E], db, nome, ...a);
    const vv = (nome: string, ...a: unknown[]) => chamarEm([V, X], db, nome, ...a);
    const xx = (nome: string, ...a: unknown[]) => chamarEm([X, V], db, nome, ...a);
    const dd = (nome: string, ...a: unknown[]) => chamarEm([RS, D, V, X], db, nome, ...a);
    const tt = (nome: string, ...a: unknown[]) => chamarEm([T], db, nome, ...a);
    const mkLoja = async (nome: string) => {
      const r = await cc("criarEstabelecimentoAction", owner, { name: `M84 ${rotulo} ${nome}`, kind: "ponto_venda" });
      if (!r.ok) throw new Error(`loja ${nome}: ${j(r)}`);
      return r.data as Dado;
    };
    const mkProduto = async (nome: string, unit = "quilograma") => {
      const r = await cc("criarProdutoEmporioAction", op, { name: `M84 ${nome}`, category_id: cat.id, base_unit: unit });
      if (!r.ok) throw new Error(`produto ${nome}: ${j(r)}`);
      const rp = await cc("criarApresentacaoAction", op, r.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
      if (!rp.ok) throw new Error(`apresentação ${nome}: ${j(rp)}`);
      return { id: r.data.id as string, nome: `M84 ${nome}`, pres: rp.data.id as string };
    };
    type Prod = Awaited<ReturnType<typeof mkProduto>>;
    const preparar = async (est: string, prod: Prod, preco: number, qtd: number, custo: number) => {
      const rp = await cc("definirPrecoAction", admin, { establishment_id: est, presentation_id: prod.pres, price: preco });
      if (!rp.ok) throw new Error(`preço: ${j(rp)}`);
      const ri = await ee("implantarEstoqueAction", op, { establishment_id: est, emporio_product_id: prod.id, sealed: [], loose_qty: qtd, unit_cost: custo });
      if (!ri.ok) throw new Error(`implantar: ${j(ri)}`);
    };
    const mkConta = async (nome: string): Promise<string> => {
      const r = await xx("criarContaAction", admin, { name: `M84 ${nome} ${rotulo} ${stamp}`, bank: "Banco" });
      if (!r.ok) throw new Error(`conta ${nome}: ${j(r)}`);
      return r.data.id as string;
    };
    const regraCartao = async (est: string, conta: string) => {
      const r = await xx("definirRegraCartaoAction", admin, { establishment_id: est, kind: "credito_vista", fee_pct: 3, days: 30, bank_account_id: conta });
      if (!r.ok) throw new Error(`regra de cartão: ${j(r)}`);
    };
    const item = (prod: Prod, qty: number, unit_price?: number) => ({
      emporio_product_id: prod.id,
      presentation_id: prod.pres,
      quantity: qty,
      ...(unit_price === undefined ? {} : { unit_price }),
    });
    const venda = (ator: Ator, est: string, items: Dado[], payments: Dado[]) =>
      vv("venderAction", ator, { operation_key: chave("v"), establishment_id: est, items, payments });
    const saleId = (r: R): string => dados(r)?.id ?? dados(r)?.sale_id ?? "";
    const dinheiro = (amount: number) => ({ kind: "dinheiro", amount });
    const credito = (amount: number) => ({ kind: "credito_vista", amount });
    const limparRegras = () => db.variableExpenseRule.updateMany({ where: { archived_at: null }, data: { archived_at: new Date() } });
    const novaRegra = (est: string, o: Dado) => dd("criarRegraVariavelAction", admin, { establishment_id: est, ...o });
    const resultado = (ator: Ator, est: string, month: string = mes) => dd("resultadoDaLojaAction", ator, { establishment_id: est, month });
    const produtos = (ator: Ator, est: string, month: string = mes) => dd("produtosDoMesAction", ator, { establishment_id: est, month });
    const negativas = (ator: Ator, est: string, month: string = mes) => dd("vendasComMargemNegativaAction", ator, { establishment_id: est, month });
    return { t, owner, admin, op, visu, db, cat, mkUser, cc, ee, vv, xx, dd, tt, mkLoja, mkProduto, preparar, mkConta, regraCartao, item, venda, saleId, dinheiro, credito, limparRegras, novaRegra, resultado, produtos, negativas };
  };

  // ---- Rotas (route handler direto, sessão por Bearer)
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const chamarRota = async (token: string | null, caminho: string, url: string, metodo = "GET") => {
    try {
      const mod = (await import(`@/app/api/v1/${caminho}/route`)) as Record<string, Handler>;
      if (typeof mod[metodo] !== "function") throw new Error(`rota sem ${metodo}: ${caminho}`);
      const res = await withBearer(token, () => mod[metodo](new Request(`http://localhost/api/v1/${url}`, { method: metodo }), { params: Promise.resolve({ id: "x" }) }));
      let json: Dado = null;
      let bytes = 0;
      const tipo = res.headers.get("content-type") ?? "";
      if (tipo.includes("pdf")) bytes = (await res.arrayBuffer()).byteLength;
      else {
        try {
          json = await res.json();
        } catch {
          json = null;
        }
      }
      return { status: res.status, json, tipo, bytes };
    } catch (e) {
      return { status: 0, json: { error: { message: e instanceof Error ? e.message : String(e) } }, tipo: "", bytes: 0 };
    }
  };
  const emIngles = (m: unknown) => typeof m === "string" && /Too small|Too big|Invalid input|expected|Required|Invalid/i.test(m);
  const em422 = (nome: string, r: { status: number; json: Dado }, campo: string) => {
    const e = r.json?.error;
    check(`${nome}: 422 com error.field = ${campo}`, r.status === 422 && e?.field === campo, `${r.status} ${j(r.json)}`);
    check(`  e a mensagem é em português`, typeof e?.message === "string" && e.message.length > 0 && !emIngles(e.message), j(e?.message));
  };

  try {
    // ================================================================ G: o aceite
    const G = await montar("G");
    const B = await montar("B"); // sem dados: isolamento
    const admV = await G.mkUser("admv", "ADMIN");
    let g1 = "", g2 = "";
    const esperadoG = { vendas: 1500, custo: 700, margem: 800, perdas: 8, fixas: 3000, resultado: -2208, ponto: 5625 };

    await rodar("G: montagem", async () => {
      const L1 = await G.mkLoja("Loja G1");
      const L2 = await G.mkLoja("Loja G2");
      const L3 = await G.mkLoja("Loja G3 arquivada");
      g1 = L1.id;
      g2 = L2.id;
      const P = await G.mkProduto("Produto P");
      await G.preparar(L1.id, P, 10, 1000, 4);
      await G.preparar(L2.id, P, 10, 1000, 6);
      // G1 vende 100 kg (R$ 1.000, custo 400) em duas vendas; G2 vende 50 kg (R$ 500, custo 300)
      const a = await G.venda(G.op, L1.id, [G.item(P, 60)], [G.dinheiro(600)]);
      const b = await G.venda(G.op, L1.id, [G.item(P, 40)], [G.dinheiro(400)]);
      const c = await G.venda(G.op, L2.id, [G.item(P, 50)], [G.dinheiro(500)]);
      if (!a.ok || !b.ok || !c.ok) throw new Error(`vendas: ${j([a, b, c])}`);
      // transferência da G1 para a G2: 20 kg que chegam 18 (diferença 2 x custo 4 = R$ 8, perda só da origem)
      const rEnv = await G.tt("enviarTransferenciaAction", G.op, { operation_key: chave("tr"), origin_establishment_id: L1.id, destination_establishment_id: L2.id, items: [{ emporio_product_id: P.id, quantity: 20 }] });
      const trId = dados(rEnv)?.id ?? dados(rEnv)?.transfer_id ?? "";
      const itT = await G.db.stockTransferItem.findMany({ where: { transfer_id: trId } });
      const rRec = await G.tt("receberTransferenciaAction", G.op, trId, { items: itT.map((i) => ({ item_id: i.id, received_qty: 18, loss_reason: "avaria" })) });
      if (!rEnv.ok || !rRec.ok) throw new Error(`transferência: ${j([rEnv, rRec])}`);
      // despesa fixa de R$ 3.000 dividida 50/50
      const rFx = await G.dd("criarDespesaFixaAction", G.admin, {
        name: "M84 Aluguel dividido", category: "Aluguel", amount: 3000, due_day: 28, split_kind: "percentual", starts_on: primeiroDia(mes),
        splits: [{ establishment_id: L1.id, value: 50 }, { establishment_id: L2.id, value: 50 }],
      });
      if (!rFx.ok) throw new Error(`fixa: ${j(rFx)}`);
      await G.db.establishment.update({ where: { id: L3.id }, data: { archived_at: new Date() } });
      const rv = await G.cc("definirVinculosAction", G.owner, L1.id, [admV.id]);
      if (!rv.ok) throw new Error(`vínculo: ${j(rv)}`);
    });

    await rodar("G: visão somada", async () => {
      console.log("1. Visão somada (Q103, regra 9): o somado é a soma das lojas, sem duplicar");
      const rAll = await G.resultado(G.admin, "all");
      const all = dados(rAll);
      check("ADMIN sem vínculo lê 'all'", rAll.ok, j(rAll));
      const r1 = dados(await G.resultado(G.admin, g1));
      const r2 = dados(await G.resultado(G.admin, g2));
      const soma = (alias: string[]) => pega(r1, alias) + pega(r2, alias);
      check("vendas do somado = R$ 1.500", perto(pega(all, A_VENDAS), esperadoG.vendas), String(pega(all, A_VENDAS)));
      check("vendas do somado = soma das duas lojas (transferência não é venda)", perto(pega(all, A_VENDAS), soma(A_VENDAS)), `${pega(all, A_VENDAS)} contra ${soma(A_VENDAS)}`);
      check("custo do somado = R$ 700 (400 + 300; a transferência não é custo do destino)", perto(pega(all, A_CUSTO), esperadoG.custo) && perto(pega(all, A_CUSTO), soma(A_CUSTO)), String(pega(all, A_CUSTO)));
      check("margem do somado = R$ 800 e soma das lojas", perto(pega(all, A_MARGEM), esperadoG.margem) && perto(pega(all, A_MARGEM), soma(A_MARGEM)), String(pega(all, A_MARGEM)));
      check("'Vendeu, Pagou' do somado = 0 (sem regra)", perto(pega(all, A_VP) || 0, 0));
      check("a diferença da transferência conta UMA vez: perdas do somado = R$ 8 (só a origem)", perto(pega(all, A_PERDAS), esperadoG.perdas), String(pega(all, A_PERDAS)));
      check("perdas da Loja 1 = R$ 8 e da Loja 2 = 0", perto(pega(r1, A_PERDAS), 8) && perto(pega(r2, A_PERDAS) || 0, 0), `${pega(r1, A_PERDAS)} e ${pega(r2, A_PERDAS)}`);
      check("fixas do somado = R$ 3.000 (a despesa dividida entra uma vez, pelas partes 1.500 + 1.500)", perto(pega(all, A_FIXAS), esperadoG.fixas) && perto(soma(A_FIXAS), 3000), `${pega(all, A_FIXAS)} e ${soma(A_FIXAS)}`);
      check("resultado do somado = 800 - 8 - 3.000 = R$ -2.208 e soma das lojas", perto(pega(all, A_RESULTADO), esperadoG.resultado) && perto(pega(all, A_RESULTADO), soma(A_RESULTADO)), String(pega(all, A_RESULTADO)));
      check("margem % do somado = 800 / 1.500 (53,33%), e não a média das lojas (50%)", pctIs(pega(all, A_MARGEM_PCT), (800 / 1500) * 100), String(pega(all, A_MARGEM_PCT)));
      check("margem % das lojas: 60% e 40%", pctIs(pega(r1, A_MARGEM_PCT), 60) && pctIs(pega(r2, A_MARGEM_PCT), 40));
      check("ponto de equilíbrio do somado = 3.000 / 53,33% = R$ 5.625 (a soma dos pontos das lojas seria 6.250)", perto(pega(all, A_PONTO), esperadoG.ponto, 0.05), String(pega(all, A_PONTO)));
      check("quanto falta no somado = 5.625 - 1.500 = R$ 4.125", perto(pega(all, A_FALTA), esperadoG.ponto - esperadoG.vendas, 0.05), String(pega(all, A_FALTA)));
      const motivos = pegaLista(all, ["estimated_reasons", "reasons", "motivos", "estimate_reasons"]);
      const est = pegaBool(all, ["estimated", "estimado", "is_estimated"]);
      check("estimado no somado (a fixa do mês ainda não foi paga) e com motivo em lista", (est === true || (motivos?.length ?? 0) > 0) && Array.isArray(motivos) && motivos.length >= 1, j(motivos));

      // tabela das lojas
      const stores = pegaLista(all, ["stores"]);
      check("'stores' é uma lista só com as duas lojas ativas (a arquivada fica fora)", Array.isArray(stores) && stores.length === 2 && stores.some((s) => s.establishment_id === g1) && stores.some((s) => s.establishment_id === g2), j(stores));
      const s1 = (stores ?? []).find((s) => s.establishment_id === g1);
      const s2 = (stores ?? []).find((s) => s.establishment_id === g2);
      check("cada linha de 'stores' traz o nome da loja", typeof s1?.name === "string" && s1.name.includes("Loja G1") && typeof s2?.name === "string" && s2.name.includes("Loja G2"), j([s1?.name, s2?.name]));
      check("Loja 1: vendas 1.000, margem 600 (60%), perdas 8, fixas 1.500, resultado -908", !!s1 && perto(n(s1.sales), 1000) && perto(n(s1.margin), 600) && pctIs(n(s1.margin_pct), 60) && perto(n(s1.losses), 8) && perto(n(s1.fixed_expenses), 1500) && perto(n(s1.result), -908), j(s1));
      check("Loja 2: vendas 500, margem 200 (40%), perdas 0, fixas 1.500, resultado -1.300", !!s2 && perto(n(s2.sales), 500) && perto(n(s2.margin), 200) && pctIs(n(s2.margin_pct), 40) && perto(n(s2.losses), 0) && perto(n(s2.fixed_expenses), 1500) && perto(n(s2.result), -1300), j(s2));
      check("a soma das linhas de 'stores' fecha com o somado (vendas e resultado)", !!s1 && !!s2 && perto(n(s1.sales) + n(s2.sales), pega(all, A_VENDAS)) && perto(n(s1.result) + n(s2.result), pega(all, A_RESULTADO)));

      // regressão da F4a: o resultado por loja não mudou
      check("regressão F4a, Loja 1: vendas 1.000, custo 400, margem 600, perdas 8, fixas 1.500, resultado -908", perto(pega(r1, A_VENDAS), 1000) && perto(pega(r1, A_CUSTO), 400) && perto(pega(r1, A_MARGEM), 600) && perto(pega(r1, A_FIXAS), 1500) && perto(pega(r1, A_RESULTADO), -908), j(r1).slice(0, 300));
      check("regressão F4a, Loja 1: ponto de equilíbrio = 1.500 / 60% = R$ 2.500", perto(pega(r1, A_PONTO), 2500, 0.05), String(pega(r1, A_PONTO)));
      check("regressão F4a, Loja 2: ponto de equilíbrio = 1.500 / 40% = R$ 3.750", perto(pega(r2, A_PONTO), 3750, 0.05), String(pega(r2, A_PONTO)));
      check("a resposta por loja não traz 'stores'", pegaLista(r1, ["stores"]) === null || (pegaLista(r1, ["stores"]) ?? []).length === 0);

      // mês sem nada: o somado zera sem quebrar
      const rVazio = await G.resultado(G.admin, "all", somaMeses(mes, -3));
      check("'all' num mês sem movimento: ok e vendas zeradas", rVazio.ok && (pega(dados(rVazio), A_VENDAS) || 0) === 0, j(rVazio).slice(0, 200));
    });

    await rodar("G: quem vê", async () => {
      console.log("\n2. Quem vê o somado (regra 10)");
      check("OWNER lê 'all'", (await G.resultado(G.owner, "all")).ok);
      check("ADMIN sem vínculo lê 'all'", (await G.resultado(G.admin, "all")).ok);
      check("ADMIN com vínculo a uma loja: 403 FORBIDDEN em 'all'", recusa(await G.resultado(admV, "all"), "FORBIDDEN", 403));
      check("OPERADOR: 403 em 'all'", recusa(await G.resultado(G.op, "all"), "FORBIDDEN", 403));
      check("VISUALIZADOR: 403 em 'all'", recusa(await G.resultado(G.visu, "all"), "FORBIDDEN", 403));
      check("ADMIN com vínculo ainda lê a loja dele (regressão)", (await G.resultado(admV, g1)).ok);
      check("ADMIN com vínculo não lê a outra loja", negada(await G.resultado(admV, g2)));
      check("produtos 'all': OWNER e ADMIN leem", (await G.produtos(G.owner, "all")).ok && (await G.produtos(G.admin, "all")).ok);
      check("produtos 'all': ADMIN com vínculo, OPERADOR e VISUALIZADOR são recusados", negada(await G.produtos(admV, "all")) && negada(await G.produtos(G.op, "all")) && negada(await G.produtos(G.visu, "all")));
      check("margem negativa 'all': OWNER e ADMIN leem", (await G.negativas(G.owner, "all")).ok && (await G.negativas(G.admin, "all")).ok);
      check("margem negativa 'all': ADMIN com vínculo, OPERADOR e VISUALIZADOR são recusados", negada(await G.negativas(admV, "all")) && negada(await G.negativas(G.op, "all")) && negada(await G.negativas(G.visu, "all")));
      check("produtos de uma loja: OPERADOR é recusado", negada(await G.produtos(G.op, g1)));
      check("produtos da loja que o ADMIN com vínculo não tem: recusado", negada(await G.produtos(admV, g2)));
      check("mês inválido: 422 month nas três", recusa(await G.resultado(G.admin, "all", "2026-13"), "VALIDATION_ERROR", 422, "month") && recusa(await G.produtos(G.admin, "all", "2026-13"), "VALIDATION_ERROR", 422, "month") && recusa(await G.negativas(G.admin, "all", "2026-13"), "VALIDATION_ERROR", 422, "month"));
      const rLixo = await G.resultado(G.admin, "nao-existe");
      check("establishment_id que não é 'all' nem loja do tenant: recusado (404 ou 422 establishment_id)", !rLixo.ok && (rLixo.status === 404 || (rLixo.status === 422 && rLixo.field === "establishment_id")), j(rLixo));
    });

    await rodar("G: produtos e negativas no somado", async () => {
      console.log("\n3. A transferência não vira venda nem em produtos, e o isolamento do somado");
      const rp = await G.produtos(G.admin, "all");
      const ts = pegaLista(dados(rp), ["top_sales"]) ?? [];
      const linhaP = ts.find((l) => String(l.name ?? "").includes("Produto P"));
      check("produtos 'all': o produto P vendeu 150 kg e R$ 1.500 (os 20 kg transferidos não contam)", !!linhaP && perto(n(linhaP.quantity), 150) && perto(n(linhaP.sales), 1500) && perto(n(linhaP.cost), 700), j(linhaP));
      const rn = await G.negativas(G.admin, "all");
      check("margem negativa 'all' sem venda negativa: lista vazia", rn.ok && (primeiraLista(dados(rn)) ?? []).length === 0, j(rn));

      const rB = await B.resultado(B.owner, "all");
      check("OUTRO tenant em 'all': zero vendas e nenhuma loja de A", rB.ok && (pega(dados(rB), A_VENDAS) || 0) === 0 && !j(dados(rB)).includes(g1) && !j(dados(rB)).includes("Loja G1"), j(rB).slice(0, 200));
      check("OUTRO tenant em 'all': 'stores' vazio", (pegaLista(dados(rB), ["stores"]) ?? []).length === 0);
      const rpB = await B.produtos(B.owner, "all");
      check("OUTRO tenant: produtos 'all' vazios", rpB.ok && (pegaLista(dados(rpB), ["top_sales"]) ?? []).length === 0 && (pegaLista(dados(rpB), ["top_margin"]) ?? []).length === 0, j(rpB).slice(0, 200));
      const rnB = await B.negativas(B.owner, "all");
      check("OUTRO tenant: margem negativa 'all' vazia", rnB.ok && (primeiraLista(dados(rnB)) ?? []).length === 0, j(rnB).slice(0, 200));
      check("OUTRO tenant não lê produtos nem margem negativa de uma loja de A", negada(await B.produtos(B.owner, g1)) && negada(await B.negativas(B.owner, g1)));
      check("OUTRO tenant não lê o resultado de uma loja de A", recusa(await B.resultado(B.owner, g1), "NOT_FOUND", 404));
    });

    // ================================================================ R: produtos
    await rodar("R: produtos", async () => {
      console.log("\n4. Produtos que mais vendem e que mais dão margem (Q104): contra uma conta independente");
      const Rt = await montar("R");
      const L = await Rt.mkLoja("Loja R1");
      const conta = await Rt.mkConta("Cartão");
      await Rt.regraCartao(L.id, conta);
      type Def = { p: number; c: number; q: number };
      const DEFS: Record<string, Def> = {
        B01: { p: 100, c: 90, q: 10 }, B02: { p: 10, c: 1, q: 50 }, B03: { p: 20, c: 10, q: 20 }, B04: { p: 30, c: 20, q: 10 },
        B05: { p: 5, c: 1, q: 40 }, B06: { p: 7, c: 2, q: 20 }, B07: { p: 3, c: 1, q: 40 }, B08: { p: 6, c: 1, q: 10 },
        B09: { p: 9, c: 3, q: 5 }, B10: { p: 4, c: 3.9, q: 100 }, B11: { p: 2, c: 1, q: 10 }, B12: { p: 1, c: 0.5, q: 20 },
      };
      const prods: Record<string, Awaited<ReturnType<typeof Rt.mkProduto>>> = {};
      type Led = { sales: number; cost: number; vp: number; qty: number };
      const led = new Map<string, Led>();
      const L0 = (k: string): Led => {
        let x = led.get(k);
        if (!x) led.set(k, (x = { sales: 0, cost: 0, vp: 0, qty: 0 }));
        return x;
      };
      const catalogo: Record<string, { p: number; c: number }> = { C1: { p: 40, c: 10 } };
      for (const [k, d] of Object.entries(DEFS)) catalogo[k] = { p: d.p, c: d.c };
      for (const k of [...Object.keys(DEFS), "C1"]) {
        prods[k] = await Rt.mkProduto(k);
        await Rt.preparar(L.id, prods[k], catalogo[k].p, 10000, catalogo[k].c);
      }
      const vender = async (itens: [string, number][], pagto: Dado, ator = Rt.op) => {
        const r = await Rt.venda(ator, L.id, itens.map(([k, q]) => Rt.item(prods[k], q)), [pagto]);
        if (!r.ok) throw new Error(`venda ${j(itens)}: ${j(r)}`);
        for (const [k, q] of itens) {
          const x = L0(k);
          x.sales += catalogo[k].p * q;
          x.cost += catalogo[k].c * q;
          x.qty += q;
        }
        return Rt.saleId(r);
      };
      // 1) uma venda por produto, sem regra
      const saleDe: Record<string, string> = {};
      for (const [k, d] of Object.entries(DEFS)) saleDe[k] = await vender([[k, d.q]], Rt.dinheiro(d.p * d.q));
      // 2) venda no cartão de um produto só: a taxa de 3% é toda dele
      await vender([["B02", 10]], Rt.credito(100));
      L0("B02").vp += 3;
      // 3) cartão com dois itens: a taxa (2,52) é rateada pelo valor (60 e 24)
      await vender([["B04", 2], ["B08", 4]], Rt.credito(84));
      L0("B04").vp += 1.8;
      L0("B08").vp += 0.72;
      // 4) devolução de 2 kg de B05 (R$ 10, custo R$ 2)
      const itB05 = await Rt.db.emporioSaleItem.findFirst({ where: { sale_id: saleDe.B05 } });
      const rDev = await Rt.vv("devolverAction", Rt.op, saleDe.B05, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: itB05?.id, quantity: 2 }] });
      check("devolve 2 kg do B05", rDev.ok, j(rDev));
      L0("B05").sales -= 10;
      L0("B05").cost -= 2;
      // 5) regras: 10% só do C1 (condição de produto) e R$ 6 fixo por venda (sem condição)
      const rg1 = await Rt.novaRegra(L.id, { name: "M84 Comissão C1", kind: "percentual", value: 10, emporio_product_id: prods.C1.id });
      const rg2 = await Rt.novaRegra(L.id, { name: "M84 Entrega", kind: "fixo_por_venda", value: 6 });
      check("as duas regras foram criadas", rg1.ok && rg2.ok, j([rg1, rg2]));
      await vender([["B03", 5], ["C1", 5]], Rt.dinheiro(300));
      L0("C1").vp += 20 + 4; // comissão só nos itens do C1; entrega rateada por valor (100 e 200 de 300)
      L0("B03").vp += 2;
      await Rt.limparRegras();

      const rp = await Rt.produtos(Rt.admin, L.id);
      check("ADMIN lê os produtos do mês", rp.ok, j(rp));
      const topS: Dado[] = pegaLista(dados(rp), ["top_sales"]) ?? [];
      const topM: Dado[] = pegaLista(dados(rp), ["top_margin"]) ?? [];
      const todos = [...led.entries()].map(([k, x]) => ({ k, nome: prods[k].nome, id: prods[k].id, ...x, margin: x.sales - x.cost - x.vp }));
      const ord = (campo: "sales" | "margin") =>
        [...todos].sort((a, b) => b[campo] - a[campo] || a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 10);
      const eS = ord("sales");
      const eM = ord("margin");
      const idsS = (l: Dado[]) => l.map((x) => x.emporio_product_id);
      check("o cenário tem 13 produtos (para provar o corte em 10)", todos.length === 13);
      check("o cenário discrimina: as duas listas esperadas têm membros diferentes", j(eS.map((x) => x.k).sort()) !== j(eM.map((x) => x.k).sort()), `${eS.map((x) => x.k)} | ${eM.map((x) => x.k)}`);
      check("top_sales: no máximo 10 linhas", topS.length === 10, String(topS.length));
      check("top_margin: no máximo 10 linhas", topM.length === 10, String(topM.length));
      check("top_sales: os 10 produtos esperados, na ordem do valor vendido (empate pelo nome)", j(idsS(topS)) === j(eS.map((x) => x.id)), `${topS.map((x) => x.name)} contra ${eS.map((x) => x.nome)}`);
      check("top_margin: os 10 produtos esperados, na ordem da margem em R$ (empate pelo nome)", j(idsS(topM)) === j(eM.map((x) => x.id)), `${topM.map((x) => x.name)} contra ${eM.map((x) => x.nome)}`);
      check("o B02 (margem alta, vendas médias) lidera a margem; o B01 (vendas altas, margem baixa) lidera as vendas", topS[0]?.name?.includes("B01") && topM[0]?.name?.includes("B02"), `${topS[0]?.name} e ${topM[0]?.name}`);
      check("B10, B11 e B12 ficam fora do top_margin (vendas altas, margem baixa); B09, B11 e B12 fora do top_sales", !topM.some((x) => /B1[012]/.test(x.name)) && !topS.some((x) => /B09|B11|B12/.test(x.name)) && topS.some((x) => x.name.includes("B10")) && topM.some((x) => x.name.includes("B09")));
      let numerosOk = true;
      let det = "";
      for (const linha of [...topS, ...topM]) {
        const e = todos.find((x) => x.id === linha.emporio_product_id);
        if (!e) {
          numerosOk = false;
          det = `produto desconhecido ${linha.name}`;
          continue;
        }
        const margemPct = e.sales > 0 ? (e.margin / e.sales) * 100 : 0;
        const ok = perto(n(linha.sales), e.sales) && perto(n(linha.cost), e.cost) && perto(n(linha.variable_expenses), e.vp) && perto(n(linha.margin), e.margin) && pctIs(n(linha.margin_pct), margemPct) && linha.base_unit === "quilograma" && (e.k === "B05" || perto(n(linha.quantity), e.qty));
        if (!ok) {
          numerosOk = false;
          det = `${e.k}: ${j(linha)} contra ${j(e)}`;
        }
      }
      check("cada linha: vendas, custo, 'Vendeu, Pagou', margem, margem % e quantidade batem com a conta independente", numerosOk, det);
      const lB02 = topM.find((x) => x.name.includes("B02"));
      check("B02: taxa de cartão de R$ 3 inteira no produto (vendas 600, margem 537)", !!lB02 && perto(n(lB02.sales), 600) && perto(n(lB02.variable_expenses), 3) && perto(n(lB02.margin), 537), j(lB02));
      const lB04 = [...topS, ...topM].find((x) => x.name.includes("B04"));
      const lB08 = [...topS, ...topM].find((x) => x.name.includes("B08"));
      check("taxa de cartão rateada pelo valor entre os itens: B04 R$ 1,80 e B08 R$ 0,72", !!lB04 && !!lB08 && perto(n(lB04.variable_expenses), 1.8) && perto(n(lB08.variable_expenses), 0.72), j([lB04, lB08]));
      const lB05 = [...topS, ...topM].find((x) => x.name.includes("B05"));
      check("a devolução desconta do produto: B05 vendeu 200 - 10 = R$ 190, custo 40 - 2 = 38, margem 152", !!lB05 && perto(n(lB05.sales), 190) && perto(n(lB05.cost), 38) && perto(n(lB05.margin), 152), j(lB05));
      const lC1 = [...topS, ...topM].find((x) => x.name.includes("C1"));
      check("C1: comissão de 10% (R$ 20) só nele + R$ 4 da entrega rateada = R$ 24; margem 200 - 50 - 24 = 126", !!lC1 && perto(n(lC1.sales), 200) && perto(n(lC1.variable_expenses), 24) && perto(n(lC1.margin), 126), j(lC1));
      const lB03 = [...topS, ...topM].find((x) => x.name.includes("B03"));
      check("B03: sem condição de produto na entrega, leva R$ 2 (100 de 300); a comissão do C1 não pesa nele", !!lB03 && perto(n(lB03.variable_expenses), 2) && perto(n(lB03.sales), 500), j(lB03));
      // o total dos produtos fecha com o Resultado quando todos cabem: soma de todos os 13
      const resR = dados(await Rt.resultado(Rt.admin, L.id));
      const somaTodos = todos.reduce((s, x) => s + x.margin, 0);
      check("a soma da margem dos 13 produtos (conta independente) = margem do Resultado da loja", perto(pega(resR, A_MARGEM), somaTodos), `${pega(resR, A_MARGEM)} contra ${somaTodos}`);
      const rAll = await Rt.produtos(Rt.admin, "all");
      check("produtos 'all' num tenant de uma loja só = produtos da loja", rAll.ok && j(idsS(pegaLista(dados(rAll), ["top_sales"]) ?? [])) === j(idsS(topS)) && j(idsS(pegaLista(dados(rAll), ["top_margin"]) ?? [])) === j(idsS(topM)));
      const rPassado = await Rt.produtos(Rt.admin, L.id, somaMeses(mes, -3));
      check("mês sem venda: as duas listas vazias", rPassado.ok && (pegaLista(dados(rPassado), ["top_sales"]) ?? ["x"]).length === 0 && (pegaLista(dados(rPassado), ["top_margin"]) ?? ["x"]).length === 0, j(rPassado).slice(0, 200));
    });

    // ================================================================ N: margem negativa
    await rodar("N: margem negativa", async () => {
      console.log("\n5. Vendas com margem negativa (Q105): cada causa, a ordem e o que não entra");
      const Nt = await montar("N");
      const N1 = await Nt.mkLoja("Loja N1");
      const N2 = await Nt.mkLoja("Loja N2");
      await Nt.db.establishment.updateMany({ where: { id: { in: [N1.id, N2.id] } }, data: { allow_negative_stock: true, max_discount_pct: 0 } });
      const conta = await Nt.mkConta("Cartão");
      await Nt.regraCartao(N1.id, conta);
      await Nt.regraCartao(N2.id, conta);
      const Pa = await Nt.mkProduto("Pa");
      const Pb = await Nt.mkProduto("Pb");
      const Pd = await Nt.mkProduto("Pd");
      const Pe = await Nt.mkProduto("Pe");
      await Nt.preparar(N1.id, Pa, 10, 1000, 4);
      await Nt.preparar(N1.id, Pb, 3, 1000, 5); // preço abaixo do custo
      await Nt.preparar(N1.id, Pd, 10, 1000, 9.9); // margem mínima de R$ 1 por venda de 10 kg
      await Nt.preparar(N1.id, Pe, 10, 2, 4); // só 2 em estoque
      await Nt.preparar(N2.id, Pb, 3, 1000, 5);
      const ok = (r: R, nome: string) => {
        if (!r.ok) throw new Error(`${nome}: ${j(r)}`);
        return Nt.saleId(r);
      };
      const sPos = ok(await Nt.venda(Nt.op, N1.id, [Nt.item(Pa, 10)], [Nt.dinheiro(100)]), "positiva");
      const sPos2 = ok(await Nt.venda(Nt.op, N1.id, [Nt.item(Pa, 10)], [Nt.credito(100)]), "positiva no cartão");
      const sPb = ok(await Nt.venda(Nt.op, N1.id, [Nt.item(Pb, 10)], [Nt.dinheiro(30)]), "preço abaixo do custo");
      const sCanc = ok(await Nt.venda(Nt.op, N1.id, [Nt.item(Pb, 1)], [Nt.dinheiro(3)]), "a cancelar");
      check("cancela a venda negativa", (await Nt.vv("cancelarVendaAction", Nt.admin, sCanc, { reason: "teste" })).ok);
      const sProv = ok(await Nt.venda(Nt.admin, N1.id, [Nt.item(Pe, 5, 3)], [Nt.dinheiro(15)]), "custo provisório");
      const sTaxa = ok(await Nt.venda(Nt.op, N1.id, [Nt.item(Pd, 10)], [Nt.credito(100)]), "taxa de cartão");
      const sN2 = ok(await Nt.venda(Nt.op, N2.id, [Nt.item(Pb, 2)], [Nt.dinheiro(6)]), "N2");
      await Nt.novaRegra(N1.id, { name: "M84 Entrega 5", kind: "fixo_por_venda", value: 5 });
      const sDesc = ok(await Nt.venda(Nt.admin, N1.id, [Nt.item(Pa, 1, 6)], [Nt.dinheiro(6)]), "desconto");
      await Nt.limparRegras();
      await Nt.novaRegra(N1.id, { name: "M84 Entrega 8,5", kind: "fixo_por_venda", value: 8.5 });
      const sDesp = ok(await Nt.venda(Nt.op, N1.id, [Nt.item(Pa, 1)], [Nt.dinheiro(10)]), "despesas da venda");
      await Nt.limparRegras();

      const rAll = await Nt.negativas(Nt.admin, "all");
      const lista = primeiraLista(dados(rAll)) ?? [];
      check("ADMIN lê as vendas com margem negativa", rAll.ok, j(rAll));
      check("da pior para a melhor: -20, -5, -4, -3, -2,5, -2", j(lista.map((x) => x.sale_id)) === j([sPb, sProv, sN2, sDesc, sDesp, sTaxa]), `${lista.map((x) => `${x.sale_id.slice(-4)}:${x.margin}`)}`);
      const por = (id: string) => lista.find((x) => x.sale_id === id);
      const causa = (id: string, c: string, m: number, net: number) => {
        const x = por(id);
        return !!x && x.cause === c && perto(n(x.margin), m) && perto(n(x.net_amount), net);
      };
      check("preco_abaixo_do_custo: 10 kg a R$ 3 com custo 5 (margem -20, líquido 30)", causa(sPb, "preco_abaixo_do_custo", -20, 30), j(por(sPb)));
      check("custo_provisorio vence as outras causas (preço abaixo do custo E desconto): margem -5", causa(sProv, "custo_provisorio", -5, 15), j(por(sProv)));
      check("desconto: vendeu a R$ 6 um item de R$ 10 (custo 4) com R$ 5 de despesa: margem -3", causa(sDesc, "desconto", -3, 6), j(por(sDesc)));
      check("despesas_da_venda: preço cheio, acima do custo, só a despesa de R$ 8,50 leva a -2,50", causa(sDesp, "despesas_da_venda", -2.5, 10), j(por(sDesp)));
      check("taxa_cartao: margem de R$ 1 que a taxa de R$ 3 leva para -2", causa(sTaxa, "taxa_cartao", -2, 100), j(por(sTaxa)));
      check("N2 aparece com o nome da loja e a causa de preço abaixo do custo (margem -4)", causa(sN2, "preco_abaixo_do_custo", -4, 6) && String(por(sN2)?.establishment_name).includes("Loja N2"), j(por(sN2)));
      check("a loja N1 aparece com o nome", String(por(sPb)?.establishment_name).includes("Loja N1"));
      check("cada linha traz sold_at", lista.every((x) => !!x.sold_at));
      check("a venda positiva, a positiva no cartão e a cancelada NÃO aparecem", !por(sPos) && !por(sPos2) && !por(sCanc), `${lista.length} linhas`);
      const rN1 = primeiraLista(dados(await Nt.negativas(Nt.admin, N1.id))) ?? [];
      check("filtrando a loja N1: as 5 dela e nenhuma da N2", rN1.length === 5 && !rN1.some((x) => x.sale_id === sN2) && rN1[0]?.sale_id === sPb, `${rN1.length}`);
      const rN2 = primeiraLista(dados(await Nt.negativas(Nt.admin, N2.id))) ?? [];
      check("filtrando a loja N2: só a dela", rN2.length === 1 && rN2[0]?.sale_id === sN2);
      const rOld = await Nt.negativas(Nt.admin, "all", somaMeses(mes, -3));
      check("mês sem venda: lista vazia", rOld.ok && (primeiraLista(dados(rOld)) ?? ["x"]).length === 0);

      // a venda com margem negativa continua no ranking de produtos
      const rp = await Nt.produtos(Nt.admin, N1.id);
      const linhaPb = (pegaLista(dados(rp), ["top_sales"]) ?? []).find((x) => String(x.name).includes("Pb"));
      check("o item segue no ranking de produtos: Pb vendeu R$ 30 (a cancelada fora) com margem -20", !!linhaPb && perto(n(linhaPb.sales), 30) && perto(n(linhaPb.margin), -20), j(linhaPb));
      check("OPERADOR não lê a lista: recusado", negada(await Nt.negativas(Nt.op, N1.id)));
      check("outro tenant não lê a lista dessa loja", negada(await B.negativas(B.owner, N1.id)));
    });

    // ================================================================ F: filtro de área
    const F = await montar("F");
    let tokenF = "";
    let tokenFVisu = "";
    const janela = { start: new Date(Date.now() - DIA), end: new Date(Date.now() + 10 * DIA) };
    await rodar("F: filtro de área (actions)", async () => {
      console.log("\n6. Filtro de área do Financeiro (Q106): actions");
      const loja = await F.mkLoja("Loja F1");
      const agora = new Date();
      const pendDia = new Date(Date.now() + 3 * DIA);
      const mk = async (o: Dado) => {
        const e = await F.db.financialEntry.create({ data: scoped({ related_module: "geral", ...o }) });
        if (o.status === "paid") await F.db.financialPayment.create({ data: scoped({ entry_id: e.id, amount: o.amount, paid_at: agora }) });
        return e;
      };
      // com loja (Empório): +1000, -300 pagos, -70 a vencer; sem loja (fazenda): +500, -200 pagos, -30 a vencer
      await mk({ entry_type: "income", amount: 1000, category: "M84 venda", status: "paid", due_date: agora, paid_at: agora, establishment_id: loja.id, related_module: "emporio" });
      await mk({ entry_type: "expense", amount: 300, category: "M84 aluguel", status: "paid", due_date: agora, paid_at: agora, establishment_id: loja.id, related_module: "emporio" });
      await mk({ entry_type: "expense", amount: 70, category: "M84 luz", status: "pending", due_date: pendDia, establishment_id: loja.id, related_module: "emporio" });
      await mk({ entry_type: "income", amount: 500, category: "M84 bezerro", status: "paid", due_date: agora, paid_at: agora });
      await mk({ entry_type: "expense", amount: 200, category: "M84 racao", status: "paid", due_date: agora, paid_at: agora });
      await mk({ entry_type: "expense", amount: 30, category: "M84 diesel", status: "pending", due_date: pendDia });
      tokenF = signAccessToken(F.owner.id);
      tokenFVisu = signAccessToken(F.visu.id);

      const dre = async (area?: string) => dados({ ok: true, data: await FR.getDre(F.db, { ...janela, ...(area ? { area } : {}) }) });
      check("DRE area=emporio: resultado 1.000 - 300 - 70 = R$ 630", perto(n((await dre("emporio")).total_result), 630), j(await dre("emporio")));
      check("DRE area=fazenda: resultado 500 - 200 - 30 = R$ 270", perto(n((await dre("fazenda")).total_result), 270));
      check("DRE area=tudo: R$ 900", perto(n((await dre("tudo")).total_result), 900));
      check("DRE sem area: R$ 900 (igual a hoje)", perto(n((await dre()).total_result), 900));
      check("DRE: emporio + fazenda = tudo", perto(n((await dre("emporio")).total_result) + n((await dre("fazenda")).total_result), n((await dre("tudo")).total_result)));

      const saldo = async (area?: string) => {
        const s = (await FR.getCashFlow(F.db, { ...janela, groupBy: "month", ...(area ? { area } : {}) })) as Dado[];
        return s.reduce((t, x) => t + n(x.balance), 0);
      };
      check("fluxo de caixa area=emporio: saldo 1.000 - 300 = R$ 700", perto(await saldo("emporio"), 700), String(await saldo("emporio")));
      check("fluxo de caixa area=fazenda: saldo 500 - 200 = R$ 300", perto(await saldo("fazenda"), 300));
      check("fluxo de caixa area=tudo e sem area: R$ 1.000", perto(await saldo("tudo"), 1000) && perto(await saldo(), 1000));

      const valores = (l: Dado[]) => l.map((x) => n(x.amount)).sort((a, b) => a - b);
      const chamadaUpcoming = async (area: string, forma: "posicional" | "objeto"): Promise<Dado[] | null> => {
        try {
          const r = forma === "posicional" ? await FR.getUpcoming(F.db, 7, undefined, area) : await FR.getUpcoming(F.db, 7, { area });
          return Array.isArray(r) ? r : null;
        } catch {
          return null;
        }
      };
      let forma: "posicional" | "objeto" = "posicional";
      const teste = await chamadaUpcoming("emporio", "posicional");
      if (!teste || teste.length !== 1) forma = "objeto";
      const u = (area: string) => chamadaUpcoming(area, forma);
      console.log(`  (getUpcoming: forma '${forma}' de passar a area)`);
      check("a vencer area=emporio: só os R$ 70 (com loja)", j(valores((await u("emporio")) ?? [])) === j([70]), j(await u("emporio")));
      check("a vencer area=fazenda: só os R$ 30 (sem loja)", j(valores((await u("fazenda")) ?? [])) === j([30]));
      check("a vencer area=tudo: os dois", j(valores((await u("tudo")) ?? [])) === j([30, 70]));
      const semArea = (await FR.getUpcoming(F.db, 7)) as Dado[];
      check("a vencer sem area: os dois (igual a hoje)", j(valores(semArea)) === j([30, 70]));
    });

    await rodar("F: filtro de área (rotas)", async () => {
      console.log("\n7. Filtro de área do Financeiro: rotas, 422 e o link do PDF");
      const iso = (d: Date) => encodeURIComponent(d.toISOString());
      const per = `start=${iso(janela.start)}&end=${iso(janela.end)}`;
      const lista = async (area?: string) => {
        const r = await chamarRota(tokenF, "financial-entries", `financial-entries?${area ? `area=${area}&` : ""}${per}`);
        return { r, valores: ((r.json?.data ?? []) as Dado[]).map((x) => n(x.amount)).sort((a, b) => a - b) };
      };
      const ent = await lista("emporio");
      check("financial-entries area=emporio: só os 3 com loja (70, 300, 1.000)", ent.r.status === 200 && j(ent.valores) === j([70, 300, 1000]), `${ent.r.status} ${j(ent.valores)}`);
      check("financial-entries area=fazenda: só os 3 sem loja (30, 200, 500)", j((await lista("fazenda")).valores) === j([30, 200, 500]));
      check("financial-entries area=tudo: os 6", j((await lista("tudo")).valores) === j([30, 70, 200, 300, 500, 1000]));
      check("financial-entries sem area: os 6 (igual a hoje)", j((await lista()).valores) === j([30, 70, 200, 300, 500, 1000]));
      em422("financial-entries com area inválida", await chamarRota(tokenF, "financial-entries", `financial-entries?area=lixo&${per}`), "area");

      const dreR = async (area?: string) => (await chamarRota(tokenF, "financial/dre", `financial/dre?${area ? `area=${area}&` : ""}${per}`)).json?.data?.total_result;
      check("rota financial/dre: emporio 630, fazenda 270, tudo e sem area 900", perto(n(await dreR("emporio")), 630) && perto(n(await dreR("fazenda")), 270) && perto(n(await dreR("tudo")), 900) && perto(n(await dreR()), 900), `${await dreR("emporio")} ${await dreR("fazenda")}`);
      em422("financial/dre com area inválida", await chamarRota(tokenF, "financial/dre", `financial/dre?area=lixo&${per}`), "area");

      const cfR = async (area?: string) => {
        const r = await chamarRota(tokenF, "financial/cash-flow", `financial/cash-flow?${area ? `area=${area}&` : ""}group_by=month&${per}`);
        return ((r.json?.data ?? []) as Dado[]).reduce((t, x) => t + n(x.balance), 0);
      };
      check("rota financial/cash-flow: emporio 700, fazenda 300, tudo e sem area 1.000", perto(await cfR("emporio"), 700) && perto(await cfR("fazenda"), 300) && perto(await cfR("tudo"), 1000) && perto(await cfR(), 1000));
      em422("financial/cash-flow com area inválida", await chamarRota(tokenF, "financial/cash-flow", `financial/cash-flow?area=lixo&${per}`), "area");

      const upR = async (area?: string) => {
        const r = await chamarRota(tokenF, "financial/upcoming", `financial/upcoming${area ? `?area=${area}` : ""}`);
        return ((r.json?.data ?? []) as Dado[]).map((x) => n(x.amount)).sort((a, b) => a - b);
      };
      check("rota financial/upcoming: emporio [70], fazenda [30], tudo e sem area [30, 70]", j(await upR("emporio")) === j([70]) && j(await upR("fazenda")) === j([30]) && j(await upR("tudo")) === j([30, 70]) && j(await upR()) === j([30, 70]));
      em422("financial/upcoming com area inválida", await chamarRota(tokenF, "financial/upcoming", "financial/upcoming?area=lixo"), "area");

      // link do relatório
      const link = async (area?: string) => chamarRota(tokenF, "financial/report/link", `financial/report/link?${area ? `area=${area}&` : ""}${per}`);
      const tokenDe = (r: { json: Dado }): string | null => {
        const u = r.json?.data?.report_url;
        return typeof u === "string" ? new URL(u, "http://localhost").searchParams.get("token") : null;
      };
      const payloadDe = (tk: string | null): string => {
        try {
          return Buffer.from(String(tk).split(".")[0], "base64url").toString("utf8");
        } catch {
          return "";
        }
      };
      const lE = await link("emporio");
      const tkE = tokenDe(lE);
      check("report/link area=emporio: 200 com report_url e token", lE.status === 200 && !!tkE, `${lE.status} ${j(lE.json)}`);
      check("o token assinado carrega a area emporio", /emporio/i.test(payloadDe(tkE)), payloadDe(tkE));
      const lF = await link("fazenda");
      check("o token de area=fazenda carrega fazenda (e não emporio)", /fazenda/i.test(payloadDe(tokenDe(lF))) && !/emporio/i.test(payloadDe(tokenDe(lF))), payloadDe(tokenDe(lF)));
      const lT = await link("tudo");
      const lS = await link();
      check("area=tudo e sem area: link 200, sem restringir a emporio nem fazenda", lT.status === 200 && lS.status === 200 && !/emporio|fazenda/i.test(payloadDe(tokenDe(lT))) && !/emporio|fazenda/i.test(payloadDe(tokenDe(lS))), `${payloadDe(tokenDe(lT))} | ${payloadDe(tokenDe(lS))}`);
      em422("report/link com area inválida", await link("lixo"), "area");
      const pdfE = await chamarRota(null, "financial/report", `financial/report?token=${encodeURIComponent(tkE ?? "")}`);
      check("o relatório abre com o token da area=emporio: 200, application/pdf, com conteúdo", pdfE.status === 200 && pdfE.tipo.includes("pdf") && pdfE.bytes > 500, `${pdfE.status} ${pdfE.tipo} ${pdfE.bytes}`);
      const pdfF = await chamarRota(null, "financial/report", `financial/report?token=${encodeURIComponent(tokenDe(lF) ?? "")}`);
      check("o relatório abre com o token da area=fazenda", pdfF.status === 200 && pdfF.tipo.includes("pdf") && pdfF.bytes > 500, `${pdfF.status} ${pdfF.bytes}`);
      console.log("  (o conteúdo do PDF por área não é observável sem ler o PDF: a suíte prova o token e a abertura)");
      check("sem sessão: 401 nas rotas com area", (await chamarRota(null, "financial/dre", "financial/dre?area=emporio")).status === 401 && (await chamarRota(null, "financial/report/link", "financial/report/link?area=emporio")).status === 401);
      void tokenFVisu;
    });

    // ================================================================ rotas do Empório
    await rodar("rotas do Empório", async () => {
      console.log("\n8. Rotas da F4b: 401, 404 desligado, caminho feliz e 422 em português");
      const tokenOwner = signAccessToken(G.owner.id);
      const tokenAdmV = signAccessToken(admV.id);
      const tokenVisu = signAccessToken(G.visu.id);
      const ROTAS: [string, string][] = [
        ["emporio/result", `emporio/result?establishment_id=all&month=${mes}`],
        ["emporio/result/products", `emporio/result/products?establishment_id=all&month=${mes}`],
        ["emporio/result/negative-sales", `emporio/result/negative-sales?establishment_id=all&month=${mes}`],
      ];
      await prisma.tenantProfile.upsert({
        where: { tenant_id_profile_type: { tenant_id: G.t.id, profile_type: "emporio" } },
        create: { tenant_id: G.t.id, profile_type: "emporio", active: true },
        update: { active: true },
      });
      await prisma.tenantFeature.deleteMany({ where: { tenant_id: G.t.id, feature_key: "emporio" } });
      for (const [cam, url] of ROTAS) {
        const r = await chamarRota(null, cam, url);
        check(`sem sessão: GET ${cam} -> 401`, r.status === 401, `${r.status} ${j(r.json)}`);
      }
      for (const [cam, url] of ROTAS) {
        const r = await chamarRota(tokenOwner, cam, url);
        check(`recurso desligado: GET ${cam} -> 404`, r.status === 404, `${r.status} ${j(r.json)}`);
      }
      await prisma.tenantFeature.create({ data: { tenant_id: G.t.id, feature_key: "emporio", enabled: true } });

      const rr = await chamarRota(tokenOwner, "emporio/result", ROTAS[0][1]);
      check("GET result?establishment_id=all: 200 com vendas R$ 1.500 e 'stores' de 2 lojas", rr.status === 200 && perto(pega(rr.json, A_VENDAS), 1500) && (pegaLista(rr.json, ["stores"]) ?? []).length === 2, `${rr.status} ${j(rr.json).slice(0, 200)}`);
      const rv = await chamarRota(tokenOwner, "emporio/result/products", ROTAS[1][1]);
      const linha = (pegaLista(rr.status === 200 ? rv.json : null, ["top_sales"]) ?? []).find((x) => String(x.name).includes("Produto P"));
      check("GET result/products: 200 com top_sales e o produto P (R$ 1.500)", rv.status === 200 && !!linha && perto(n(linha.sales), 1500), `${rv.status} ${j(rv.json).slice(0, 200)}`);
      check("GET result/products traz top_margin", Array.isArray(pegaLista(rv.json, ["top_margin"])));
      const rn = await chamarRota(tokenOwner, "emporio/result/negative-sales", ROTAS[2][1]);
      check("GET result/negative-sales: 200 e lista vazia (sem venda negativa)", rn.status === 200 && (primeiraLista(rn.json?.data) ?? []).length === 0, `${rn.status} ${j(rn.json).slice(0, 200)}`);
      const r1 = await chamarRota(tokenOwner, "emporio/result/products", `emporio/result/products?establishment_id=${g1}&month=${mes}`);
      check("GET result/products de uma loja: 200", r1.status === 200, `${r1.status}`);

      for (const [cam, url] of ROTAS) {
        const v = await chamarRota(tokenVisu, cam, url);
        check(`VISUALIZADOR em ${cam}: 403`, v.status === 403, `${v.status}`);
        const av = await chamarRota(tokenAdmV, cam, url);
        check(`ADMIN com vínculo em ${cam} com 'all': 403 ou 404`, av.status === 403 || av.status === 404, `${av.status}`);
      }
      const avR = await chamarRota(tokenAdmV, "emporio/result", `emporio/result?establishment_id=all&month=${mes}`);
      check("ADMIN com vínculo em result 'all': 403 FORBIDDEN", avR.status === 403 && avR.json?.error?.code === "FORBIDDEN", `${avR.status} ${j(avR.json)}`);

      for (const [cam, base] of [["emporio/result", "emporio/result"], ["emporio/result/products", "emporio/result/products"], ["emporio/result/negative-sales", "emporio/result/negative-sales"]] as [string, string][]) {
        em422(`GET ${cam} com mês inválido`, await chamarRota(tokenOwner, cam, `${base}?establishment_id=all&month=2026-13`), "month");
        em422(`GET ${cam} sem a loja`, await chamarRota(tokenOwner, cam, `${base}?month=${mes}`), "establishment_id");
      }
      const bTok = signAccessToken(B.owner.id);
      await prisma.tenantProfile.upsert({
        where: { tenant_id_profile_type: { tenant_id: B.t.id, profile_type: "emporio" } },
        create: { tenant_id: B.t.id, profile_type: "emporio", active: true },
        update: { active: true },
      });
      await prisma.tenantFeature.create({ data: { tenant_id: B.t.id, feature_key: "emporio", enabled: true } });
      const bAll = await chamarRota(bTok, "emporio/result", ROTAS[0][1]);
      check("outro tenant em result 'all' pela rota: 200 e nada de A", bAll.status === 200 && (pega(bAll.json, A_VENDAS) || 0) === 0 && !j(bAll.json).includes("Loja G1"), `${bAll.status} ${j(bAll.json).slice(0, 200)}`);
      const bLoja = await chamarRota(bTok, "emporio/result/products", `emporio/result/products?establishment_id=${g1}&month=${mes}`);
      check("outro tenant pede os produtos de uma loja de A pela rota: 404", bLoja.status === 404, `${bLoja.status} ${j(bLoja.json)}`);
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
        await prisma.saleVariableExpense.deleteMany({ where: { tenant_id: id } });
        await prisma.variableExpenseRule.deleteMany({ where: { tenant_id: id } });
        await prisma.fixedExpenseOccurrence.deleteMany({ where: { tenant_id: id } });
        await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id: id } });
        await prisma.fixedExpenseTemplate.deleteMany({ where: { tenant_id: id } });
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
    console.log(falhas === 0 ? `\n✅ M84 verde (${total} checagens)` : `\n❌ M84: ${falhas} falha(s) em ${total} checagens`);
    process.exit(falhas === 0 ? 0 : 1);
  });
