import "./_env-local";
import { AsyncLocalStorage } from "node:async_hooks";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();
// A seção de rotas usa o escopo de requisição do Next: o AsyncLocalStorage real precisa existir ANTES de carregar o Next (ver m23).
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório), F4a: "Vendeu, Pagou", despesa fixa com rateio e
 * Resultado da Loja do mês.
 * Roda: `npm run test:m83`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F4a: contrato", Q96 a
 * Q102, Q26 e o aceite da F4a), sem ler a implementação. Chama as actions
 * direto e, no fim, os route handlers com Bearer. Cada seção roda isolada: se
 * uma quebrar, as outras seguem e a quebra vira falha registrada.
 *
 * Todo o mês do teste é o MÊS ATUAL em Brasília: perda, transferência e
 * conferência gravam "agora" (as actions não aceitam data), então o Resultado
 * só os enxerga no mês corrente. As vendas usam `sold_at` de agora.
 *
 * O que o contrato calava e esta suíte ASSUME:
 * - as actions novas estão em `emporio-despesas` e `emporio-resultado` (ou em
 *   `emporio-vendas` / `emporio-caixa`): procura em todos;
 * - assinatura `(db, ator, input)`; `editar*`, `corrigir*`, `encerrar*` e
 *   `renovar*` recebem o id antes do corpo: `editarRegraVariavelAction(db,
 *   ator, id, corpo)`, `corrigirDespesaAction(db, ator, entry_id, { amount })`;
 * - regra: `{ establishment_id, name, kind, value, payment_kind?,
 *   emporio_product_id?, presentation_id?, packaging_emporio_product_id? }`; o
 *   arquivar aceita `{ archived: true }` (ou variações: a suíte tenta e confere
 *   `archived_at`); a recusa de percentual > 100 nomeia `value`;
 * - despesa fixa: `{ name, category, amount, due_day, split_kind, starts_on
 *   (Date), splits: [{ establishment_id, value }] }`; `starts_on` no passado é
 *   aceito (é o único jeito de provar a renovação);
 * - `pagarDespesasAction`: `{ entry_ids, paid_at?, from: { establishment_id }
 *   | { bank_account_id } }`;
 * - `resultadoDaLojaAction` devolve números em snake_case com nomes de
 *   alias (a suíte procura em profundidade): vendas (`sales`), custo (`cost`),
 *   "Vendeu, Pagou" (`variable_expenses`), margem (`margin`, `margin_pct`),
 *   perdas (`losses`), fixas (`fixed`), resultado (`result`), ponto
 *   (`break_even`), falta (`remaining`), `estimated` e uma lista de motivos
 *   (`estimated_reasons`); `margin_pct` pode vir em 0..100 ou 0..1; "sem
 *   dados ainda" e "a loja não se paga" aparecem como texto no resultado;
 * - "últimos 30 dias" conta de hoje para trás;
 * - na rota, criar devolve 200 ou 201.
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

const perto = (a: unknown, b: number, tol = 0.005) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;
const recusa = (r: R, code: string, status: number, field?: string) =>
  !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);
const negada = (r: R) => !r.ok && (r.status === 403 || r.status === 404);
const j = (x: unknown) => JSON.stringify(x);
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));
const DIA = 86_400_000;

// Datas em Brasília
const brDate = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const diaDe = (d: Date): string => d.toISOString().slice(0, 10); // coluna de data volta como meia-noite UTC
const mesAtual = (): string => brDate(new Date()).slice(0, 7);
const diasNoMes = (ym: string): number => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
const somaMeses = (ym: string, k: number): string => {
  const t = Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const vencEsperado = (ym: string, dueDay: number): string => `${ym}-${String(Math.min(dueDay, diasNoMes(ym))).padStart(2, "0")}`;
const primeiroDia = (ym: string): Date => new Date(`${ym}-01T12:00:00Z`);
const periodoDb = (ym: string): Date => new Date(`${ym}-01T00:00:00Z`);

// Leitura tolerante do Resultado: procura o campo por nome, do mais raso para o mais fundo
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

console.log("📊 M83: Módulo 39 (Meu Empório), F4a: \"Vendeu, Pagou\", despesa fixa e Resultado da Loja\n");

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

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M83 ${rotulo} ${stamp}`, document: `M83${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
      });
      tenantIds.push(t.id);
      const mkUser = async (suf: string, role: Role): Promise<Ator> => {
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M83 ${rotulo} ${suf}`, email: `m83-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role },
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
    const admV = await TA.mkUser("admv", "ADMIN"); // vinculado só à Loja 3
    const ownerB = await TB.mkUser("own", "OWNER");
    const db = prismaForTenant(TA.t.id);
    const dbB = prismaForTenant(TB.t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M83 categoria" }) });

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
    const dd = (nome: string, ...a: unknown[]) => chamarEm([D, RS, V, X], db, nome, ...a);
    const tt = (nome: string, ...a: unknown[]) => chamarEm([T], db, nome, ...a);
    const ddB = (nome: string, ...a: unknown[]) => chamarEm([D, RS, V, X], dbB, nome, ...a);
    const rodar = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        check(`a seção "${nome}" quebrou`, false, e instanceof Error ? e.message : String(e));
      }
    };

    // ---- Lojas
    const mkLoja = async (nome: string) => {
      const r = await cc("criarEstabelecimentoAction", owner, { name: `M83 ${nome}`, kind: "ponto_venda" });
      if (!r.ok) throw new Error(`loja ${nome}: ${j(r)}`);
      return r.data as Dado;
    };
    const L1 = await mkLoja("Loja 1 regras");
    const L2 = await mkLoja("Loja 2 resultado");
    const L3 = await mkLoja("Loja 3 vinculo");
    const L4 = await mkLoja("Loja 4 equilibrio");
    const L5 = await mkLoja("Loja 5 fixas");
    const L6 = await mkLoja("Loja 6 fixas");
    const L7 = await mkLoja("Loja 7 fixas");
    const L8 = await mkLoja("Loja 8 margem zero");

    // ---- Produtos: P (10/kg), Q (20/kg) e as embalagens K e K2 (unidade)
    const mkProduto = async (nome: string, unit: string, apres: string) => {
      const r = await cc("criarProdutoEmporioAction", op, { name: `M83 ${nome}`, category_id: cat.id, base_unit: unit });
      if (!r.ok) throw new Error(`produto ${nome}: ${j(r)}`);
      const rp = await cc("criarApresentacaoAction", op, r.data.id, { name: apres, base_qty: 1, is_sealed_package: false });
      if (!rp.ok) throw new Error(`apresentação ${nome}: ${j(rp)}`);
      return { id: r.data.id as string, product_id: r.data.product_id as string, pres: rp.data.id as string };
    };
    const P = await mkProduto("Produto P", "quilograma", "Quilo");
    const Q = await mkProduto("Produto Q", "quilograma", "Quilo");
    const K = await mkProduto("Embalagem K", "unidade", "Unidade");
    const K2 = await mkProduto("Embalagem K2", "unidade", "Unidade");
    const preparar = async (est: string, prod: typeof P, preco: number | null, qtd: number, custo: number) => {
      if (preco !== null) {
        const rp = await cc("definirPrecoAction", admin, { establishment_id: est, presentation_id: prod.pres, price: preco });
        if (!rp.ok) throw new Error(`preço: ${j(rp)}`);
      }
      const ri = await ee("implantarEstoqueAction", op, { establishment_id: est, emporio_product_id: prod.id, sealed: [], loose_qty: qtd, unit_cost: custo });
      if (!ri.ok) throw new Error(`implantar: ${j(ri)}`);
    };
    await preparar(L1.id, P, 10, 100000, 4);
    await preparar(L1.id, Q, 20, 1000, 5);
    await preparar(L1.id, K, null, 100, 0.3);
    await preparar(L1.id, K2, null, 1, 0.5);
    await preparar(L2.id, P, 10, 1000, 4);
    await preparar(L2.id, Q, 20, 1000, 5);
    await preparar(L3.id, P, 10, 1000, 4);
    await preparar(L4.id, P, 10, 100000, 4);
    await preparar(L8.id, P, 4, 1000, 4); // preço igual ao custo: margem zero

    const mkConta = async (nome: string): Promise<string> => {
      const r = await xx("criarContaAction", admin, { name: `M83 ${nome} ${stamp}`, bank: "Banco" });
      if (!r.ok) throw new Error(`conta ${nome}: ${j(r)}`);
      return r.data.id as string;
    };
    const CARD = await mkConta("Cartão");
    for (const est of [L1.id, L2.id]) {
      const r = await xx("definirRegraCartaoAction", admin, { establishment_id: est, kind: "credito_vista", fee_pct: 3, days: 30, bank_account_id: CARD });
      if (!r.ok) throw new Error(`regra de cartão: ${j(r)}`);
    }
    for (const [est, v] of [[L1.id, 20000], [L2.id, 6000]] as [string, number][]) {
      const r = await xx("saldoInicialCaixaAction", owner, { establishment_id: est, amount: v });
      if (!r.ok) throw new Error(`saldo inicial: ${j(r)}`);
    }
    const rVinc = await cc("definirVinculosAction", owner, L3.id, [admV.id]);
    if (!rVinc.ok) throw new Error(`vínculo: ${j(rVinc)}`);

    // ---- Auxiliares de venda
    let chaveSeq = 0;
    const chave = (p: string) => `m83-${p}-${stamp}-${(chaveSeq += 1)}`;
    const itP = (qty: number) => ({ emporio_product_id: P.id, presentation_id: P.pres, quantity: qty });
    const itQ = (qty: number) => ({ emporio_product_id: Q.id, presentation_id: Q.pres, quantity: qty });
    const venda = (ator: Ator, est: string, items: Dado[], payments: Dado[], over: Dado = {}) =>
      vv("venderAction", ator, { operation_key: chave("v"), establishment_id: est, items, payments, ...over });
    const saleId = (r: R): string => dados(r)?.id ?? dados(r)?.sale_id ?? "";
    const dinheiro = (amount: number) => ({ kind: "dinheiro", amount });
    const credito = (amount: number) => ({ kind: "credito_vista", amount });
    const sveDe = (sale: string) => db.saleVariableExpense.findMany({ where: { sale_id: sale } });
    const entrada = (id: string | null | undefined) => db.financialEntry.findUnique({ where: { id: id ?? "inexistente" } });
    const receitaDe = (id: string) => db.financialEntry.findMany({ where: { related_module: "emporio", related_id: id, entry_type: "income" } });
    const taxaDe = (id: string) => db.financialEntry.findMany({ where: { related_module: "emporio", related_id: id, entry_type: "expense", category: "Taxas de cartão" } });
    const pagamentosDe = (entryId: string) => db.financialPayment.findMany({ where: { entry_id: entryId } });
    const caixaDa = async (where: Dado) => {
      const ms = await db.cashMovement.findMany({ where });
      return ms.reduce((s, m) => s + (m.direction === "entrada" ? n(m.amount) : -n(m.amount)), 0);
    };
    const saldoGaveta = (est: string) => caixaDa({ establishment_id: est });
    const saldoConta = (conta: string) => caixaDa({ bank_account_id: conta });
    const saldoEstoque = async (est: string, prod: typeof P): Promise<number> => {
      const l = lista(dados(await ee("saldoDaLojaAction", admin, est))).find((x) => x.emporio_product_id === prod.id);
      return l ? n(l.total_qty) : 0;
    };
    const limparRegras = () => db.variableExpenseRule.updateMany({ where: { archived_at: null }, data: { archived_at: new Date() } });
    const novaRegra = (ator: Ator, est: string, o: Dado) => dd("criarRegraVariavelAction", ator, { establishment_id: est, ...o });
    const regraId = (r: R): string => dados(r)?.id ?? "";
    const arquivar = async (ator: Ator, id: string): Promise<R> => {
      let ultima: R = ausente("editarRegraVariavelAction");
      for (const corpo of [{ archived: true }, { archive: true }, { archived_at: new Date() }, { active: false }]) {
        ultima = await dd("editarRegraVariavelAction", ator, id, corpo);
        if (ultima.ok && (await db.variableExpenseRule.findUnique({ where: { id } }))?.archived_at) return ultima;
      }
      return ultima;
    };
    const mes = mesAtual();
    const ultimoDiaDoMes = `${mes}-${String(diasNoMes(mes)).padStart(2, "0")}`;
    const pagar = (ator: Ator, ids: string[], from: Dado, extra: Dado = {}) => dd("pagarDespesasAction", ator, { entry_ids: ids, from, ...extra });
    const daGaveta = (est: string) => ({ establishment_id: est });
    const resultado = (ator: Ator, est: string, month: string = mes) => dd("resultadoDaLojaAction", ator, { establishment_id: est, month });
    const estimadoDe = (r: Dado): boolean | null => {
      const b = pegaBool(r, ["estimated", "estimado", "is_estimated"]);
      if (b !== null) return b;
      const l = pegaLista(r, ["estimated_reasons", "reasons", "motivos", "estimate_reasons"]);
      return l === null ? null : l.length > 0;
    };

    // ---- Despesa fixa
    const criarFixa = (ator: Ator, o: Dado = {}) =>
      dd("criarDespesaFixaAction", ator, { name: "M83 Aluguel", category: "Aluguel", amount: 1000, due_day: 10, split_kind: "percentual", starts_on: primeiroDia(mes), splits: [], ...o });
    const fixaId = (r: R): string => dados(r)?.id ?? "";
    const ocorrencia = (tpl: string, est: string, ym: string) => db.fixedExpenseOccurrence.findFirst({ where: { template_id: tpl, establishment_id: est, period: periodoDb(ym) } });
    const entradaFixa = async (tpl: string, est: string, ym: string) => entrada((await ocorrencia(tpl, est, ym))?.financial_entry_id);
    const ocorrenciasDe = (tpl: string, est?: string) =>
      db.fixedExpenseOccurrence.findMany({ where: { template_id: tpl, ...(est ? { establishment_id: est } : {}) }, orderBy: { period: "asc" } });

    // ---------------------------------------------------------------- 1
    await rodar("regras", async () => {
      console.log("1. Regras do 'Vendeu, Pagou' (Q97)");
      check("OPERADOR cria regra: 403", recusa(await novaRegra(op, L1.id, { name: "M83 x", kind: "percentual", value: 5 }), "FORBIDDEN", 403));
      check("VISUALIZADOR cria regra: 403", recusa(await novaRegra(visu, L1.id, { name: "M83 x", kind: "percentual", value: 5 }), "FORBIDDEN", 403));
      const rOk = await novaRegra(admin, L1.id, { name: "M83 Regra base", kind: "percentual", value: 5 });
      check("ADMIN cria regra de 5%", rOk.ok, j(rOk));
      check("OWNER cria regra fixa por venda", (await novaRegra(owner, L1.id, { name: "M83 Regra fixa", kind: "fixo_por_venda", value: 3 })).ok);
      const r0 = await db.variableExpenseRule.count({ where: { establishment_id: L1.id } });
      check("percentual 100,01: 422 value", recusa(await novaRegra(admin, L1.id, { name: "M83 y", kind: "percentual", value: 100.01 }), "VALIDATION_ERROR", 422, "value"));
      check("percentual negativo: 422 value", recusa(await novaRegra(admin, L1.id, { name: "M83 y", kind: "percentual", value: -1 }), "VALIDATION_ERROR", 422, "value"));
      check("embalagem sem produto de embalagem: 422 packaging_emporio_product_id", recusa(await novaRegra(admin, L1.id, { name: "M83 y", kind: "embalagem", value: 1 }), "VALIDATION_ERROR", 422, "packaging_emporio_product_id"));
      check("nome vazio: 422 name", recusa(await novaRegra(admin, L1.id, { name: "", kind: "percentual", value: 5 }), "VALIDATION_ERROR", 422, "name"));
      check("as recusas não gravaram regra", (await db.variableExpenseRule.count({ where: { establishment_id: L1.id } })) === r0);
      const ls = await dd("listarRegrasVariaveisAction", admin, L1.id);
      const lsAlt = ls.ok ? ls : await dd("listarRegrasVariaveisAction", admin);
      check("a lista traz a regra criada", lista(dados(lsAlt)).some((x) => x.id === regraId(rOk)), j(lsAlt));
      check("OPERADOR lista regras: 403", recusa(await dd("listarRegrasVariaveisAction", op, L1.id), "FORBIDDEN", 403));
      check("OPERADOR arquiva regra: 403", negada(await dd("editarRegraVariavelAction", op, regraId(rOk), { archived: true })));
      await limparRegras();

      // arquivar tira a regra das vendas novas
      const rA = await novaRegra(admin, L1.id, { name: "M83 Arquivável", kind: "fixo_por_venda", value: 7 });
      const S1 = saleId(await venda(op, L1.id, [itP(2)], [dinheiro(20)]));
      check("regra ativa: a venda gera a despesa", (await sveDe(S1)).length === 1);
      const rArq = await arquivar(admin, regraId(rA));
      check("ADMIN arquiva a regra (archived_at preenchido)", rArq.ok && !!(await db.variableExpenseRule.findUnique({ where: { id: regraId(rA) } }))?.archived_at, j(rArq));
      const S2 = saleId(await venda(op, L1.id, [itP(2)], [dinheiro(20)]));
      check("regra arquivada: a venda nova não gera despesa", S2 !== "" && (await sveDe(S2)).length === 0);
      check("a despesa da venda antiga continua", (await sveDe(S1)).length === 1);
    });

    // ---------------------------------------------------------------- 2
    await rodar("na venda", async () => {
      console.log("\n2. Na venda: cada cálculo grava SaleVariableExpense e conta a pagar (Q97, Q98)");
      await limparRegras();

      // 2a) percentual
      const rPct = await novaRegra(admin, L1.id, { name: "M83 Comissão 5%", kind: "percentual", value: 5 });
      const Sa = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
      const sa = await sveDe(Sa);
      check("5% de R$ 200: UMA despesa de R$ 10 ligada à regra", sa.length === 1 && perto(n(sa[0].amount), 10) && sa[0].rule_id === regraId(rPct), j(sa));
      const ea = await entrada(sa[0]?.financial_entry_id);
      check("conta a pagar pending de R$ 10, categoria = nome da regra, emporio, ligada à venda e à loja", !!ea && ea.entry_type === "expense" && ea.status === "pending" && perto(n(ea.amount), 10) && ea.category === "M83 Comissão 5%" && ea.related_module === "emporio" && ea.related_id === Sa && ea.establishment_id === L1.id, j(ea));
      check("vencimento no último dia do mês da venda", !!ea?.due_date && diaDe(ea.due_date) === ultimoDiaDoMes, `${ea?.due_date && diaDe(ea.due_date)} contra ${ultimoDiaDoMes}`);
      check("o snapshot da regra guarda o nome", j(sa[0]?.rule_snapshot ?? null).includes("M83 Comissão 5%"), j(sa[0]?.rule_snapshot));
      check("um lançamento de receita só na venda (regressão da F3)", (await receitaDe(Sa)).length === 1);
      await limparRegras();

      // 2b) fixo por venda
      await novaRegra(admin, L1.id, { name: "M83 Entrega", kind: "fixo_por_venda", value: 3 });
      const Sb = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
      const sb = await sveDe(Sb);
      const eb = await entrada(sb[0]?.financial_entry_id);
      check("fixo R$ 3 por venda: despesa de R$ 3 e conta de R$ 3", sb.length === 1 && perto(n(sb[0].amount), 3) && perto(n(eb?.amount), 3) && eb?.status === "pending", j([sb, eb]));
      await limparRegras();

      // 2c) por unidade
      await novaRegra(admin, L1.id, { name: "M83 Por unidade", kind: "por_unidade", value: 0.5 });
      const Sc = saleId(await venda(op, L1.id, [itP(4)], [dinheiro(40)]));
      const sc = await sveDe(Sc);
      check("R$ 0,50 por unidade com 4 unidades: R$ 2", sc.length === 1 && perto(n(sc[0].amount), 2) && perto(n((await entrada(sc[0].financial_entry_id))?.amount), 2), j(sc));
      await limparRegras();

      // 2d) condição de produto
      await novaRegra(admin, L1.id, { name: "M83 So Q", kind: "percentual", value: 10, emporio_product_id: Q.id });
      const Sd = saleId(await venda(op, L1.id, [itP(10), itQ(5)], [dinheiro(200)]));
      const sd = await sveDe(Sd);
      check("10% só do produto Q (R$ 100 dos R$ 200): despesa de R$ 10", sd.length === 1 && perto(n(sd[0].amount), 10), j(sd));
      const Sd2 = saleId(await venda(op, L1.id, [itP(10)], [dinheiro(100)]));
      check("venda sem o produto da condição: nenhuma despesa e nenhuma conta", (await sveDe(Sd2)).length === 0 && (await db.financialEntry.count({ where: { related_id: Sd2, entry_type: "expense" } })) === 0);
      await limparRegras();

      // 2e) condição de forma de pagamento (cartão)
      await novaRegra(admin, L1.id, { name: "M83 So cartao", kind: "percentual", value: 5, payment_kind: "credito_vista" });
      const rMix = await venda(op, L1.id, [itP(20)], [dinheiro(100), credito(100)]);
      const Se = saleId(rMix);
      const se = await sveDe(Se);
      check("venda mista 100 dinheiro + 100 crédito: 5% só da parte do cartão = R$ 5", rMix.ok && se.length === 1 && perto(n(se[0].amount), 5), j([rMix, se]));
      const txe = await taxaDe(Se);
      check("a taxa de cartão segue sendo UMA despesa da F3b (R$ 3), sem regra nova", txe.length === 1 && perto(n(txe[0].amount), 3) && se.length === 1);
      const Se2 = saleId(await venda(op, L1.id, [itP(10)], [dinheiro(100)]));
      check("venda toda em dinheiro: a regra de cartão não pega", Se2 !== "" && (await sveDe(Se2)).length === 0);
      await limparRegras();

      // 2f) embalagem
      const kAntes = await saldoEstoque(L1.id, K);
      const rEmb = await novaRegra(admin, L1.id, { name: "M83 Sacola", kind: "embalagem", value: 1, packaging_emporio_product_id: K.id });
      check("regra de embalagem criada", rEmb.ok, j(rEmb));
      const Sf = saleId(await venda(op, L1.id, [itP(4)], [dinheiro(40)]));
      const sf = await sveDe(Sf);
      check("embalagem: 1 por unidade vendida, 4 unidades, custo médio 0,30 = R$ 1,20", sf.length === 1 && perto(n(sf[0].amount), 1.2), j(sf));
      check("embalagem não gera conta a pagar", sf[0]?.financial_entry_id === null && (await db.financialEntry.count({ where: { related_id: Sf, entry_type: "expense" } })) === 0, j(sf));
      const mvf = sf[0] ? await db.stockMovement.findMany({ where: { sale_variable_expense_id: sf[0].id } }) : [];
      check("UMA utilizacao de 4 do produto de embalagem, ligada à despesa, na loja", mvf.length === 1 && mvf[0].movement_type === "utilizacao" && perto(Math.abs(n(mvf[0].quantity)), 4) && mvf[0].product_id === K.product_id && mvf[0].establishment_id === L1.id && mvf[0].canceled_at === null, j(mvf));
      check("o estoque da embalagem caiu 4", perto((await saldoEstoque(L1.id, K)) - kAntes, -4), `${await saldoEstoque(L1.id, K)} contra ${kAntes}`);
      await limparRegras();

      // 2g) embalagem sem saldo não bloqueia
      await novaRegra(admin, L1.id, { name: "M83 Sacola sem saldo", kind: "embalagem", value: 1, packaging_emporio_product_id: K2.id });
      const rG = await venda(op, L1.id, [itP(3)], [dinheiro(30)]);
      check("embalagem com 1 em estoque e 3 a baixar: a venda NÃO é bloqueada", rG.ok, j(rG));
      const sg = await sveDe(saleId(rG));
      check("custo é o último médio (0,50 x 3 = R$ 1,50) e marcado provisório", sg.length === 1 && perto(n(sg[0].amount), 1.5) && sg[0].cost_provisional === true, j(sg));
      check("o estoque da embalagem ficou negativo (-2)", perto(await saldoEstoque(L1.id, K2), -2), String(await saldoEstoque(L1.id, K2)));
      await limparRegras();
    });

    // ---------------------------------------------------------------- 3
    let contaCanceladaId = "";
    await rodar("cancelamento", async () => {
      console.log("\n3. Cancelamento e devolução (Q99)");
      await limparRegras();
      await novaRegra(admin, L1.id, { name: "M83 Comissão cancela", kind: "percentual", value: 5 });
      await novaRegra(admin, L1.id, { name: "M83 Entrega cancela", kind: "fixo_por_venda", value: 3 });
      await novaRegra(admin, L1.id, { name: "M83 Sacola cancela", kind: "embalagem", value: 1, packaging_emporio_product_id: K.id });
      const kAntes = await saldoEstoque(L1.id, K);
      const S = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
      const sv = await sveDe(S);
      check("a venda gerou 3 despesas (comissão, entrega, sacola)", sv.length === 3, j(sv.map((x) => x.amount)));
      const nomeDe = (x: Dado) => String((x.rule_snapshot as Dado)?.name ?? (x.rule_snapshot as Dado)?.rule_name ?? "");
      const svCom = sv.find((x) => nomeDe(x).includes("Comissão"));
      const svEnt = sv.find((x) => nomeDe(x).includes("Entrega"));
      const svSac = sv.find((x) => nomeDe(x).includes("Sacola"));
      check("achou cada despesa pelo nome da regra", !!svCom && !!svEnt && !!svSac, j(sv.map((x) => x.rule_snapshot)));
      check("o estoque da embalagem caiu 20", perto((await saldoEstoque(L1.id, K)) - kAntes, -20));
      // paga a entrega antes de cancelar
      const rPg = await pagar(admin, [svEnt?.financial_entry_id ?? "x"], daGaveta(L1.id));
      check("paga a conta da entrega antes do cancelamento", rPg.ok, j(rPg));
      const rCx = await vv("cancelarVendaAction", admin, S, { reason: "desistiu" });
      check("ADMIN cancela a venda", rCx.ok, j(rCx));
      const sv2 = await sveDe(S);
      check("todas as despesas ganham canceled_at", sv2.length === 3 && sv2.every((x) => x.canceled_at !== null), j(sv2.map((x) => x.canceled_at)));
      const eCom = await entrada(svCom?.financial_entry_id);
      const eEnt = await entrada(svEnt?.financial_entry_id);
      contaCanceladaId = eCom?.id ?? "";
      check("a conta SEM pagamento (comissão) vira cancelled", eCom?.status === "cancelled", j(eCom));
      check("a conta JÁ paga (entrega) fica paga", eEnt?.status === "paid" && (await pagamentosDe(eEnt.id)).length === 1, j(eEnt));
      const mv = svSac ? await db.stockMovement.findMany({ where: { sale_variable_expense_id: svSac.id } }) : [];
      check("a utilizacao da embalagem ganha canceled_at", mv.length >= 1 && mv.every((m) => m.canceled_at !== null), j(mv.map((m) => m.canceled_at)));
      check("o estoque da embalagem volta ao de antes", perto(await saldoEstoque(L1.id, K), kAntes), `${await saldoEstoque(L1.id, K)} contra ${kAntes}`);

      // devolução parcial não mexe
      const S2 = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
      const antes = await sveDe(S2);
      const item = await db.emporioSaleItem.findFirst({ where: { sale_id: S2 } });
      const rDev = await vv("devolverAction", op, S2, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: item?.id, quantity: 2 }] });
      check("devolve 2 kg em dinheiro", rDev.ok, j(rDev));
      const depois = await sveDe(S2);
      check("devolução parcial: nenhuma despesa cancelada, valores iguais", depois.length === antes.length && depois.every((x) => x.canceled_at === null) && depois.every((x) => perto(n(x.amount), n(antes.find((a) => a.id === x.id)?.amount))), j(depois));
      const ents = await Promise.all(depois.map((x) => entrada(x.financial_entry_id)));
      check("as contas seguem pendentes com o mesmo valor", ents.filter(Boolean).length === 2 && ents.every((e) => !e || (e.status === "pending")), j(ents.map((e) => e?.status)));
      const movS2 = await db.stockMovement.findMany({ where: { sale_variable_expense_id: { in: depois.map((x) => x.id) } } });
      check("a embalagem não volta na devolução (utilizacao sem canceled_at)", movS2.length >= 1 && movS2.every((m) => m.canceled_at === null));
      await limparRegras();
    });

    // ---------------------------------------------------------------- 4
    await rodar("corrigir e pagar", async () => {
      console.log("\n4. Corrigir e pagar várias (Q98)");
      await limparRegras();
      await novaRegra(admin, L1.id, { name: "M83 Comissão pagar", kind: "percentual", value: 5 });
      const novaConta = async (): Promise<string> => {
        const S = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
        return (await sveDe(S))[0]?.financial_entry_id ?? "";
      };
      const ids = [await novaConta(), await novaConta(), await novaConta()];
      check("três contas a pagar de R$ 10", ids.every((x) => x !== ""), j(ids));

      const lc = await dd("listarContasAPagarAction", admin);
      check("listarContasAPagarAction traz as três", ids.every((id) => j(dados(lc) ?? []).includes(id)), j(lc).slice(0, 300));
      check("OPERADOR lista as contas: 403", recusa(await dd("listarContasAPagarAction", op), "FORBIDDEN", 403));

      // corrigir
      const [c1, c2, c3] = ids;
      check("OPERADOR corrige: 403", recusa(await dd("corrigirDespesaAction", op, c3, { amount: 12.5 }), "FORBIDDEN", 403));
      check("valor zero: 422 amount", recusa(await dd("corrigirDespesaAction", admin, c3, { amount: 0 }), "VALIDATION_ERROR", 422, "amount"));
      check("valor negativo: 422 amount", recusa(await dd("corrigirDespesaAction", admin, c3, { amount: -5 }), "VALIDATION_ERROR", 422, "amount"));
      const rCor = await dd("corrigirDespesaAction", admin, c3, { amount: 12.5 });
      check("ADMIN corrige a conta pendente para R$ 12,50", rCor.ok && perto(n((await entrada(c3))?.amount), 12.5), j(rCor));

      // manual de fora do Empório
      const manual = await db.financialEntry.create({ data: scoped({ entry_type: "expense", amount: 10, category: "M83 manual", related_module: "geral", status: "pending", due_date: new Date() }) });
      check("corrigir conta de fora do Empório não é aceito", !(await dd("corrigirDespesaAction", admin, manual.id, { amount: 11 })).ok && perto(n((await entrada(manual.id))?.amount), 10));
      check("pagar conta de fora do Empório: 422 entry_ids", recusa(await pagar(admin, [manual.id], daGaveta(L1.id)), "VALIDATION_ERROR", 422, "entry_ids"));
      check("pagar conta cancelada: 422 entry_ids", recusa(await pagar(admin, [contaCanceladaId || "x"], daGaveta(L1.id)), "VALIDATION_ERROR", 422, "entry_ids"));
      check("lista vazia: 422 entry_ids", recusa(await pagar(admin, [], daGaveta(L1.id)), "VALIDATION_ERROR", 422, "entry_ids"));

      // saldo insuficiente na conta (25 para pagar 10 + 10 + 12,50)
      const CTA = await mkConta("Despesas");
      check("saldo inicial de R$ 25 na conta", (await xx("saldoInicialCaixaAction", admin, { bank_account_id: CTA, amount: 25 })).ok);
      const rIns = await pagar(admin, ids, { bank_account_id: CTA });
      check("total 32,50 com saldo 25: 409 INSUFFICIENT_CASH em from", recusa(rIns, "INSUFFICIENT_CASH", 409, "from"), j(rIns));
      check("nada foi pago (contas pendentes, sem pagamento nem movimento)", (await Promise.all(ids.map(async (id) => (await entrada(id))?.status === "pending" && (await pagamentosDe(id)).length === 0))).every(Boolean) && (await db.cashMovement.count({ where: { origin: "pagamento_despesa", bank_account_id: CTA } })) === 0);
      check("OPERADOR paga: 403", recusa(await pagar(op, ids, daGaveta(L1.id)), "FORBIDDEN", 403));
      check("VISUALIZADOR paga: 403", recusa(await pagar(visu, ids, daGaveta(L1.id)), "FORBIDDEN", 403));
      const rDois = await pagar(admin, [c1, c2], { bank_account_id: CTA });
      check("pagar as duas de R$ 10 pela conta: aceito", rDois.ok, j(rDois));
      check("o saldo da conta caiu para R$ 5", perto(await saldoConta(CTA), 5), String(await saldoConta(CTA)));

      // pagar várias na gaveta
      const S3 = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
      const S4 = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
      const idsG = [c3, (await sveDe(S3))[0]?.financial_entry_id ?? "", (await sveDe(S4))[0]?.financial_entry_id ?? ""];
      const g0 = await saldoGaveta(L1.id);
      const rPg = await pagar(admin, idsG, daGaveta(L1.id));
      check("ADMIN paga três contas de uma vez pela gaveta da Loja 1", rPg.ok, j(rPg));
      const pgs = (await Promise.all(idsG.map((id) => pagamentosDe(id)))).flat();
      check("cada conta virou paid, com UM pagamento pelo valor dela", (await Promise.all(idsG.map(async (id) => (await entrada(id))?.status === "paid"))).every(Boolean) && pgs.length === 3, j(pgs.map((p) => p.amount)));
      const mvs = await db.cashMovement.findMany({ where: { origin: "pagamento_despesa", financial_payment_id: { in: pgs.map((p) => p.id) } } });
      check("UM CashMovement de saída por conta, origem pagamento_despesa, na gaveta escolhida", mvs.length === 3 && mvs.every((m) => m.direction === "saida" && m.establishment_id === L1.id), j(mvs));
      check("a gaveta caiu 10 + 10 + 12,50 = 32,50", perto(g0 - (await saldoGaveta(L1.id)), 32.5), `${g0} -> ${await saldoGaveta(L1.id)}`);
      check("pagar de novo a mesma conta: 422 entry_ids", recusa(await pagar(admin, [c3], daGaveta(L1.id)), "VALIDATION_ERROR", 422, "entry_ids"));
      check("corrigir conta já paga: 409 ENTRY_PAID", recusa(await dd("corrigirDespesaAction", admin, c3, { amount: 15 }), "ENTRY_PAID", 409));
      check("e o valor da conta paga não mudou", perto(n((await entrada(c3))?.amount), 12.5));
      await limparRegras();
    });

    // ---------------------------------------------------------------- 5
    await rodar("despesa fixa", async () => {
      console.log("\n5. Despesa fixa mensal com rateio (Q100)");
      const t0 = await db.fixedExpenseTemplate.count();
      const split2 = (a: number, b: number) => [{ establishment_id: L5.id, value: a }, { establishment_id: L6.id, value: b }];
      check("OPERADOR cria despesa fixa: 403", recusa(await criarFixa(op, { split_kind: "percentual", splits: split2(60, 40) }), "FORBIDDEN", 403));
      check("rateio que soma 90%: 422 splits", recusa(await criarFixa(admin, { split_kind: "percentual", splits: split2(50, 40) }), "VALIDATION_ERROR", 422, "splits"));
      check("rateio que passa de 100%: 422 splits", recusa(await criarFixa(admin, { split_kind: "percentual", splits: split2(60, 50) }), "VALIDATION_ERROR", 422, "splits"));
      check("rateio em valor que não soma o total: 422 splits", recusa(await criarFixa(admin, { amount: 300, split_kind: "valor", splits: split2(100, 150) }), "VALIDATION_ERROR", 422, "splits"));
      check("sem nenhuma loja no rateio: 422 splits", recusa(await criarFixa(admin, { split_kind: "percentual", splits: [] }), "VALIDATION_ERROR", 422, "splits"));
      check("dia de vencimento 32: 422 due_day", recusa(await criarFixa(admin, { due_day: 32, split_kind: "percentual", splits: split2(60, 40) }), "VALIDATION_ERROR", 422, "due_day"));
      check("valor zero: 422 amount", recusa(await criarFixa(admin, { amount: 0, split_kind: "percentual", splits: split2(60, 40) }), "VALIDATION_ERROR", 422, "amount"));
      check("as recusas não gravaram modelo", (await db.fixedExpenseTemplate.count()) === t0);

      // T1: 60/40 de R$ 1.000, vencimento dia 31
      const rT1 = await criarFixa(admin, { name: "M83 T1", amount: 1000, due_day: 31, split_kind: "percentual", splits: split2(60, 40) });
      check("ADMIN cria 60/40 de R$ 1.000 entre duas lojas", rT1.ok, j(rT1));
      const T1 = fixaId(rT1);
      const ocs = await ocorrenciasDe(T1);
      check("12 meses x 2 lojas = 24 contas", ocs.length === 24, String(ocs.length));
      let todasOk = true;
      let detalhe = "";
      const periodos = new Set<string>();
      for (const o of ocs) {
        const e = await entrada(o.financial_entry_id);
        const ym = diaDe(o.period).slice(0, 7);
        periodos.add(ym);
        const valor = o.establishment_id === L5.id ? 600 : 400;
        const ok = !!e && e.status === "pending" && e.entry_type === "expense" && e.category === "Aluguel" && e.related_module === "emporio" && e.related_id === T1 && e.establishment_id === o.establishment_id && perto(n(e.amount), valor) && !!e.due_date && diaDe(e.due_date) === vencEsperado(ym, 31);
        if (!ok) {
          todasOk = false;
          detalhe = `${ym} ${o.establishment_id}: ${j(e)}`;
        }
      }
      check("cada conta: pendente, categoria, emporio, loja, R$ 600/400 e vencimento no dia 31 ou no último dia do mês", todasOk, detalhe);
      check("os 12 meses vão do mês atual ao mês +11", periodos.size === 12 && periodos.has(mes) && periodos.has(somaMeses(mes, 11)), j([...periodos]));
      const curtos = [...periodos].filter((ym) => diasNoMes(ym) < 31);
      check("há mês curto no intervalo (30 ou fevereiro) e o 31 virou o último dia", curtos.length >= 5);
      const lf = await dd("listarDespesasFixasAction", admin);
      check("listarDespesasFixasAction traz o modelo", j(dados(lf) ?? []).includes(T1), j(lf).slice(0, 200));
      check("OPERADOR lista despesas fixas: 403", recusa(await dd("listarDespesasFixasAction", op), "FORBIDDEN", 403));

      // T2: centavo que sobra na primeira loja
      const rT2 = await criarFixa(admin, { name: "M83 T2", amount: 100.01, due_day: 10, split_kind: "percentual", splits: split2(50, 50) });
      check("cria R$ 100,01 em 50/50", rT2.ok, j(rT2));
      const T2 = fixaId(rT2);
      const e5 = await entradaFixa(T2, L5.id, mes);
      const e6 = await entradaFixa(T2, L6.id, mes);
      check("a soma das duas partes é exatamente R$ 100,01", perto(n(e5?.amount) + n(e6?.amount), 100.01), `${e5?.amount} + ${e6?.amount}`);
      check("o centavo que sobra vai na primeira loja (50,01 e 50,00)", perto(n(e5?.amount), 50.01) && perto(n(e6?.amount), 50), `${e5?.amount} e ${e6?.amount}`);

      // T3: 33,33 / 33,33 / 33,34
      const rT3 = await criarFixa(admin, { name: "M83 T3", amount: 100, due_day: 5, split_kind: "percentual", splits: [{ establishment_id: L5.id, value: 33.33 }, { establishment_id: L6.id, value: 33.33 }, { establishment_id: L7.id, value: 33.34 }] });
      check("cria R$ 100 em 3 lojas (33,33 / 33,33 / 33,34)", rT3.ok, j(rT3));
      const T3 = fixaId(rT3);
      let somaOk = true;
      for (let k = 0; k < 12; k++) {
        const ym = somaMeses(mes, k);
        const es = await Promise.all([L5.id, L6.id, L7.id].map((l) => entradaFixa(T3, l, ym)));
        if (!perto(es.reduce((s, e) => s + n(e?.amount), 0), 100)) somaOk = false;
      }
      check("em cada um dos 12 meses as três partes somam exatamente R$ 100", somaOk && (await ocorrenciasDe(T3)).length === 36);

      // T4: rateio em valor
      const rT4 = await criarFixa(admin, { name: "M83 T4", amount: 300, due_day: 15, split_kind: "valor", splits: split2(100, 200) });
      const T4 = fixaId(rT4);
      const v5 = await entradaFixa(T4, L5.id, mes);
      const v6 = await entradaFixa(T4, L6.id, mes);
      check("rateio em valor: R$ 100 e R$ 200", rT4.ok && perto(n(v5?.amount), 100) && perto(n(v6?.amount), 200), j(rT4));

      // editar T1: a paga do mês fica, as futuras não pagas mudam
      const e5atual = await entradaFixa(T1, L5.id, mes);
      const rPg = await pagar(admin, [e5atual?.id ?? "x"], daGaveta(L1.id));
      check("paga a conta do mês atual da Loja 5 (R$ 600)", rPg.ok, j(rPg));
      const prox = somaMeses(mes, 1);
      const corpoEdit = (o: Dado) => ({ name: "M83 T1", category: "Aluguel", amount: 1200, due_day: 31, split_kind: "percentual", splits: split2(60, 40), ...o });
      check("OPERADOR edita: 403", recusa(await dd("editarDespesaFixaAction", op, T1, corpoEdit({})), "FORBIDDEN", 403));
      const rEd = await dd("editarDespesaFixaAction", admin, T1, corpoEdit({}));
      check("ADMIN edita o valor para R$ 1.200", rEd.ok, j(rEd));
      const p5 = await entradaFixa(T1, L5.id, mes);
      const p6 = await entradaFixa(T1, L6.id, mes);
      const q5 = await entradaFixa(T1, L5.id, prox);
      const q6 = await entradaFixa(T1, L6.id, prox);
      check("a paga do mês atual fica em R$ 600", p5?.status === "paid" && perto(n(p5?.amount), 600), j(p5));
      check("a não paga do mês atual (Loja 6) vira R$ 480", p6?.status === "pending" && perto(n(p6?.amount), 480), j(p6));
      check("o mês seguinte refeito: R$ 720 e R$ 480", perto(n(q5?.amount), 720) && perto(n(q6?.amount), 480), `${q5?.amount} e ${q6?.amount}`);
      check("continuam 24 ocorrências (editar não duplica)", (await ocorrenciasDe(T1)).length === 24);

      // tirar a Loja 6 do rateio
      const rSai = await dd("editarDespesaFixaAction", admin, T1, corpoEdit({ splits: [{ establishment_id: L5.id, value: 100 }] }));
      check("tira a Loja 6 do rateio (Loja 5 com 100%)", rSai.ok, j(rSai));
      const oc6 = await ocorrenciasDe(T1, L6.id);
      const es6 = await Promise.all(oc6.map((o) => entrada(o.financial_entry_id)));
      check("as contas não pagas da Loja 6 ficam canceladas", es6.length > 0 && es6.every((e) => e?.status === "cancelled"), j(es6.map((e) => e?.status)));
      const r5atual = await entradaFixa(T1, L5.id, mes);
      const r5prox = await entradaFixa(T1, L5.id, prox);
      check("a paga da Loja 5 do mês atual segue em R$ 600 e a do mês seguinte vira R$ 1.200", r5atual?.status === "paid" && perto(n(r5atual?.amount), 600) && perto(n(r5prox?.amount), 1200), `${r5atual?.amount} e ${r5prox?.amount}`);

      // encerrar T2: paga a do mês seguinte antes
      const t2prox = await entradaFixa(T2, L5.id, prox);
      check("paga a conta do mês seguinte da T2 (Loja 5)", (await pagar(admin, [t2prox?.id ?? "x"], daGaveta(L1.id))).ok);
      check("OPERADOR encerra: 403", recusa(await dd("encerrarDespesaFixaAction", op, T2), "FORBIDDEN", 403));
      const rEnc = await dd("encerrarDespesaFixaAction", admin, T2);
      check("ADMIN encerra a despesa fixa", rEnc.ok && !!(await db.fixedExpenseTemplate.findUnique({ where: { id: T2 } }))?.ended_at, j(rEnc));
      const ocT2 = await ocorrenciasDe(T2);
      let encOk = true;
      let encDet = "";
      for (const o of ocT2) {
        const e = await entrada(o.financial_entry_id);
        const ym = diaDe(o.period).slice(0, 7);
        const esperado = ym <= mes ? "pending" : e?.id === t2prox?.id ? "paid" : "cancelled";
        if (e?.status !== esperado) {
          encOk = false;
          encDet = `${ym} ${o.establishment_id}: ${e?.status} esperado ${esperado}`;
        }
      }
      check("encerrar: o mês atual segue pendente, a paga fica e as demais depois do mês atual são canceladas", encOk, encDet);

      // renovar: modelo que começou há 10 meses gerou só até o mês +1
      const inicio = somaMeses(mes, -10);
      const rT5 = await criarFixa(admin, { name: "M83 T5", amount: 50, due_day: 20, split_kind: "valor", starts_on: primeiroDia(inicio), splits: [{ establishment_id: L5.id, value: 50 }] });
      check("cria modelo que começou há 10 meses (starts_on no passado)", rT5.ok, j(rT5));
      const T5 = fixaId(rT5);
      const antesRen = await ocorrenciasDe(T5);
      check("gerou 12 meses a partir de starts_on", antesRen.length === 12 && diaDe(antesRen[0].period).slice(0, 7) === inicio && diaDe(antesRen[11].period).slice(0, 7) === somaMeses(inicio, 11), `${antesRen.length}`);
      check("OPERADOR renova: 403", recusa(await dd("renovarDespesaFixaAction", op, T5), "FORBIDDEN", 403));
      const rRen = await dd("renovarDespesaFixaAction", admin, T5);
      check("ADMIN renova", rRen.ok, j(rRen));
      const depoisRen = await ocorrenciasDe(T5);
      const pers = depoisRen.map((o) => diaDe(o.period).slice(0, 7));
      check("renovar estende até pelo menos 11 meses à frente do mês atual", pers.includes(somaMeses(mes, 11)) && depoisRen.length > antesRen.length, `${depoisRen.length} até ${pers[pers.length - 1]}`);
      check("sem mês duplicado (único por modelo, loja e mês)", new Set(pers).size === pers.length);
      const rRen2 = await dd("renovarDespesaFixaAction", admin, T5);
      check("renovar de novo não duplica nada", rRen2.ok && (await ocorrenciasDe(T5)).length === depoisRen.length, j(rRen2));
    });

    // ---------------------------------------------------------------- 6
    await rodar("resultado: Loja 2", async () => {
      console.log("\n6. Resultado da Loja (Q101): o mês completo da Loja 2 contra uma conta independente");
      await limparRegras();
      await novaRegra(admin, L2.id, { name: "M83 L2 Comissão", kind: "percentual", value: 20 });
      await novaRegra(admin, L2.id, { name: "M83 L2 Entrega", kind: "fixo_por_venda", value: 10 });

      // 10 vendas de R$ 100 (custo 40, "Vendeu, Pagou" 30, margem 30)
      let todasBase = true;
      for (let k = 0; k < 10; k++) if (!(await venda(op, L2.id, [itP(10)], [dinheiro(100)])).ok) todasBase = false;
      check("10 vendas de R$ 100 em dinheiro", todasBase);
      const rS11 = await venda(op, L2.id, [itQ(10)], [credito(200)]);
      check("venda de R$ 200 no crédito à vista (taxa 3% = R$ 6)", rS11.ok, j(rS11));
      const S12 = saleId(await venda(op, L2.id, [itP(5)], [dinheiro(50)]));
      check("cancela a venda de R$ 50", (await vv("cancelarVendaAction", admin, S12, { reason: "teste" })).ok);
      const S13 = saleId(await venda(op, L2.id, [itP(10)], [dinheiro(100)]));
      const it13 = await db.emporioSaleItem.findFirst({ where: { sale_id: S13 } });
      check("devolve 2 kg (R$ 20) da venda de R$ 100", (await vv("devolverAction", op, S13, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: it13?.id, quantity: 2 }] })).ok);

      // perdas e quebras: perda 12, transferência com diferença 8, conferência com falta 5
      check("perda de 3 kg de P por avaria (custo 4 = R$ 12)", (await ee("registrarPerdaAction", op, { establishment_id: L2.id, emporio_product_id: P.id, quantity: 3, reason: "avaria" })).ok);
      const rEnv = await tt("enviarTransferenciaAction", op, { operation_key: chave("tr"), origin_establishment_id: L2.id, destination_establishment_id: L3.id, items: [{ emporio_product_id: P.id, quantity: 10 }] });
      const trId = dados(rEnv)?.id ?? dados(rEnv)?.transfer_id ?? "";
      const itT = await db.stockTransferItem.findMany({ where: { transfer_id: trId } });
      const rRec = await tt("receberTransferenciaAction", op, trId, { items: itT.map((i) => ({ item_id: i.id, received_qty: 8, loss_reason: "avaria" })) });
      check("transferência de 10 kg da Loja 2 que chega 8 (diferença 2 x 4 = R$ 8)", rEnv.ok && rRec.ok, j([rEnv, rRec]));
      const esperadoCx = await saldoGaveta(L2.id);
      const rCf = await xx("conferirGavetaAction", op, { establishment_id: L2.id, counted: esperadoCx - 5, justification: "troco errado" });
      check("conferência da gaveta com falta de R$ 5", rCf.ok, j(rCf));

      // despesa fixa da Loja 2: R$ 5.500
      const rFx = await criarFixa(admin, { name: "M83 L2 fixa", category: "Aluguel", amount: 5500, due_day: 28, split_kind: "valor", splits: [{ establishment_id: L2.id, value: 5500 }] });
      check("despesa fixa de R$ 5.500 só na Loja 2", rFx.ok, j(rFx));
      const fxEntry = await entradaFixa(fixaId(rFx), L2.id, mes);

      // a conta independente
      const sv = await db.saleVariableExpense.findMany({ where: { sale: { establishment_id: L2.id, status: "concluida" } } });
      const vpSv = sv.filter((x) => x.canceled_at === null).reduce((s, x) => s + n(x.amount), 0);
      const taxas = (await db.financialEntry.findMany({ where: { establishment_id: L2.id, category: "Taxas de cartão", status: { not: "cancelled" } } })).reduce((s, e) => s + n(e.amount), 0);
      check("o banco confirma o 'Vendeu, Pagou': R$ 380 de regras + R$ 6 de cartão = R$ 386", perto(vpSv, 380) && perto(taxas, 6), `${vpSv} e ${taxas}`);
      const vendas = 1280;
      const custo = 482;
      const vp = 386;
      const margem = vendas - custo - vp;
      const perdas = 12 + 8 + 5;
      const fixas = 5500;
      const r = await resultado(admin, L2.id);
      const d = dados(r);
      check("ADMIN lê o Resultado da Loja 2", r.ok, j(r));
      check("vendas = R$ 1.280 (10x100 + 200 + 100 - 20; a cancelada fora)", perto(pega(d, A_VENDAS), vendas), String(pega(d, A_VENDAS)));
      check("custo = R$ 482 (400 + 50 + 40 - 8 da devolução)", perto(pega(d, A_CUSTO), custo), String(pega(d, A_CUSTO)));
      check("'Vendeu, Pagou' = R$ 386 (regras + taxa de cartão; a cancelada fora)", perto(pega(d, A_VP), vp), String(pega(d, A_VP)));
      check("margem = R$ 412", perto(pega(d, A_MARGEM), margem), String(pega(d, A_MARGEM)));
      const pct = pega(d, A_MARGEM_PCT);
      check("margem % = 412 / 1280 (32,19%)", perto(pct, (margem / vendas) * 100, 0.02) || perto(pct, margem / vendas, 0.0002), String(pct));
      check("perdas e quebras = R$ 25 (perda 12 + transferência 8 + falta de caixa 5)", perto(pega(d, A_PERDAS), perdas), String(pega(d, A_PERDAS)));
      check("fixas = R$ 5.500", perto(pega(d, A_FIXAS), fixas), String(pega(d, A_FIXAS)));
      check("resultado = margem - perdas - fixas = R$ -5.113", perto(pega(d, A_RESULTADO), margem - perdas - fixas), String(pega(d, A_RESULTADO)));
      const ponto = (fixas * vendas) / margem;
      check("ponto de equilíbrio = 5.500 / 32,19% (cerca de R$ 17.087)", perto(pega(d, A_PONTO), ponto, 3), `${pega(d, A_PONTO)} contra ${ponto}`);
      check("quanto falta = ponto - vendas (cerca de R$ 15.807)", perto(pega(d, A_FALTA), ponto - vendas, 3), `${pega(d, A_FALTA)}`);
      check("a transferência recebida na Loja 3 não gera perda na Loja 3", perto(pega(dados(await resultado(admin, L3.id)), A_PERDAS) || 0, 0));

      // estimado
      check("estimado = verdadeiro enquanto a fixa do mês não está paga", estimadoDe(d) === true, j(d).slice(0, 300));
      const motivos = pegaLista(d, ["estimated_reasons", "reasons", "motivos", "estimate_reasons"]);
      check("e traz o motivo em lista (fixa não paga)", Array.isArray(motivos) && motivos.length >= 1 && /fix/i.test(j(motivos)), j(motivos));
      const rPg = await pagar(admin, [fxEntry?.id ?? "x"], daGaveta(L2.id));
      check("paga a fixa da Loja 2 pela gaveta dela", rPg.ok, j(rPg));
      const d2 = dados(await resultado(admin, L2.id));
      check("tudo pago e com custo real: sem estimado", estimadoDe(d2) === false, j(d2).slice(0, 300));
      check("pagar a fixa não muda o resultado (competência)", perto(pega(d2, A_RESULTADO), margem - perdas - fixas));
    });

    // ---------------------------------------------------------------- 7
    await rodar("resultado: ponto de equilíbrio", async () => {
      console.log("\n7. Ponto de equilíbrio (Q26)");
      await limparRegras();

      // L4: 10 vendas de R$ 100, margem exata de 30%, fixas de R$ 5.500
      await novaRegra(admin, L4.id, { name: "M83 L4 Comissão", kind: "percentual", value: 20 });
      await novaRegra(admin, L4.id, { name: "M83 L4 Entrega", kind: "fixo_por_venda", value: 10 });
      let ok10 = true;
      for (let k = 0; k < 10; k++) if (!(await venda(op, L4.id, [itP(10)], [dinheiro(100)])).ok) ok10 = false;
      check("10 vendas de R$ 100 na Loja 4", ok10);
      const rF4 = await criarFixa(admin, { name: "M83 L4 fixa", amount: 5500, due_day: 28, split_kind: "valor", splits: [{ establishment_id: L4.id, value: 5500 }] });
      check("fixas de R$ 5.500 na Loja 4", rF4.ok, j(rF4));
      const d4 = dados(await resultado(admin, L4.id));
      const pct4 = pega(d4, A_MARGEM_PCT);
      check("margem de 30% (100 - 40 - 30 por venda)", perto(pct4, 30, 0.02) || perto(pct4, 0.3, 0.0002), String(pct4));
      check("ponto de equilíbrio = 5.500 / 30% = R$ 18.333,33 (o aceite)", perto(pega(d4, A_PONTO), 18333.33, 0.011), String(pega(d4, A_PONTO)));
      check("quanto falta = 18.333,33 - 1.000 = R$ 17.333,33", perto(pega(d4, A_FALTA), 17333.33, 0.011), String(pega(d4, A_FALTA)));
      // uma venda grande passa do ponto: falta nunca negativa
      check("venda grande de R$ 19.000 em dinheiro", (await venda(op, L4.id, [itP(1900)], [dinheiro(19000)])).ok);
      const d4b = dados(await resultado(admin, L4.id));
      check("vendas acima do ponto: quanto falta é zero (nunca negativo)", perto(pega(d4b, A_FALTA), 0), String(pega(d4b, A_FALTA)));
      check("e as vendas são R$ 20.000", perto(pega(d4b, A_VENDAS), 20000), String(pega(d4b, A_VENDAS)));

      // L5: sem nenhuma venda
      const d5 = await resultado(admin, L5.id);
      check("loja sem venda no mês: 'sem dados ainda'", d5.ok && /sem dados/i.test(j(d5.data)) && Number.isNaN(pega(d5.data, A_PONTO)), j(d5).slice(0, 300));

      // L8: margem zero
      await criarFixa(admin, { name: "M83 L8 fixa", amount: 100, due_day: 28, split_kind: "valor", splits: [{ establishment_id: L8.id, value: 100 }] });
      check("10 vendas sem margem (preço = custo)", await (async () => { for (let k = 0; k < 10; k++) if (!(await venda(op, L8.id, [itP(10)], [dinheiro(40)])).ok) return false; return true; })());
      const d8 = await resultado(admin, L8.id);
      check("margem zero: diz que a loja não se paga com os preços atuais", d8.ok && /n[ãa]o se paga/i.test(j(d8.data)) && Number.isNaN(pega(d8.data, A_PONTO)), j(d8).slice(0, 300));

      // L3: menos de 10 vendas no mês usa a margem dos últimos 30 dias
      const dia = Number(brDate(new Date()).slice(8, 10));
      const rFx3 = await criarFixa(admin, { name: "M83 L3 fixa", amount: 300, due_day: 28, split_kind: "valor", splits: [{ establishment_id: L3.id, value: 300 }] });
      check("fixa de R$ 300 na Loja 3", rFx3.ok, j(rFx3));
      await limparRegras();
      if (dia <= 30) {
        // venda no último dia do mês anterior (a `dia` dias atrás), com regra de 50%: margem de 10%
        await novaRegra(admin, L3.id, { name: "M83 L3 Comissão antiga", kind: "percentual", value: 50 });
        const rOld = await venda(op, L3.id, [itP(10)], [dinheiro(100)], { sold_at: new Date(Date.now() - dia * DIA) });
        check("venda no último dia do mês anterior (fora do mês, dentro de 30 dias)", rOld.ok, j(rOld));
        await limparRegras();
      }
      check("duas vendas de R$ 100 hoje, sem regra (margem 60%)", (await venda(op, L3.id, [itP(10)], [dinheiro(100)])).ok && (await venda(op, L3.id, [itP(10)], [dinheiro(100)])).ok);
      const d3 = dados(await resultado(admin, L3.id));
      check("o mês tem R$ 200 de vendas (a antiga fica fora)", perto(pega(d3, A_VENDAS), 200), String(pega(d3, A_VENDAS)));
      if (dia <= 30) {
        // 30 dias: vendas 300, custo 120, regra 50 -> margem 130 (43,33%); ponto = 300 / 0,4333 = 692,31
        check("com menos de 10 vendas: ponto pela margem dos últimos 30 dias (R$ 692,31), não pela do mês (R$ 500)", perto(pega(d3, A_PONTO), 692.31, 1), String(pega(d3, A_PONTO)));
      } else {
        check("com menos de 10 vendas: ponto = 300 / 60% = R$ 500 (dia 31: a janela de 30 dias não alcança o mês anterior)", perto(pega(d3, A_PONTO), 500, 1), String(pega(d3, A_PONTO)));
      }
    });

    // ---------------------------------------------------------------- 8
    await rodar("papéis e vínculo", async () => {
      console.log("\n8. Papéis e vínculo (regra 10)");
      check("OPERADOR não vê o Resultado: 403", recusa(await resultado(op, L2.id), "FORBIDDEN", 403));
      check("VISUALIZADOR não vê o Resultado: 403", recusa(await resultado(visu, L2.id), "FORBIDDEN", 403));
      check("VISUALIZADOR não lista as contas a pagar: 403", recusa(await dd("listarContasAPagarAction", visu), "FORBIDDEN", 403));
      check("VISUALIZADOR não lista despesas fixas: 403", recusa(await dd("listarDespesasFixasAction", visu), "FORBIDDEN", 403));
      check("VISUALIZADOR não lista regras: 403", recusa(await dd("listarRegrasVariaveisAction", visu, L1.id), "FORBIDDEN", 403));
      check("OWNER vê o Resultado", (await resultado(owner, L2.id)).ok);
      check("ADMIN vinculado só à Loja 3 vê o resultado da Loja 3", (await resultado(admV, L3.id)).ok);
      check("ADMIN vinculado à Loja 3 NÃO vê o resultado da Loja 2: 403 ou 404", negada(await resultado(admV, L2.id)));
      check("ADMIN vinculado à Loja 3 não cria regra na Loja 2: 403 ou 404", negada(await novaRegra(admV, L2.id, { name: "M83 z", kind: "percentual", value: 1 })));
      check("mês inválido: 422 month", recusa(await resultado(admin, L2.id, "2026-13"), "VALIDATION_ERROR", 422, "month"));
    });

    // ---------------------------------------------------------------- 9
    await rodar("isolamento", async () => {
      console.log("\n9. Isolamento: B não vê nem age sobre A");
      await limparRegras();
      const regraA = regraId(await novaRegra(admin, L1.id, { name: "M83 A isolada", kind: "percentual", value: 5 }));
      const SA = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
      const contaA = (await sveDe(SA))[0]?.financial_entry_id ?? "";
      const tplA = (await db.fixedExpenseTemplate.findFirst({ where: { name: "M83 T5" } }))?.id ?? "";
      const bb = (nome: string, ...a: unknown[]) => ddB(nome, ...a);
      check("B não vê as regras de A", !j(dados(await bb("listarRegrasVariaveisAction", ownerB)) ?? []).includes(regraA));
      check("B cria regra na loja de A: 404", recusa(await bb("criarRegraVariavelAction", ownerB, { establishment_id: L1.id, name: "M83 invasor", kind: "percentual", value: 1 }), "NOT_FOUND", 404));
      check("B arquiva regra de A: 404", recusa(await bb("editarRegraVariavelAction", ownerB, regraA, { archived: true }), "NOT_FOUND", 404));
      check("B lê o resultado da loja de A: 404", recusa(await bb("resultadoDaLojaAction", ownerB, { establishment_id: L2.id, month: mes }), "NOT_FOUND", 404));
      check("B não vê as despesas fixas de A", !j(dados(await bb("listarDespesasFixasAction", ownerB)) ?? []).includes(tplA) && tplA !== "");
      check("B edita despesa fixa de A: 404", recusa(await bb("editarDespesaFixaAction", ownerB, tplA, { name: "invasor" }), "NOT_FOUND", 404));
      check("B encerra despesa fixa de A: 404", recusa(await bb("encerrarDespesaFixaAction", ownerB, tplA), "NOT_FOUND", 404));
      check("B renova despesa fixa de A: 404", recusa(await bb("renovarDespesaFixaAction", ownerB, tplA), "NOT_FOUND", 404));
      check("B não vê as contas a pagar de A", !j(dados(await bb("listarContasAPagarAction", ownerB)) ?? []).includes(contaA) && contaA !== "");
      const rCor = await bb("corrigirDespesaAction", ownerB, contaA, { amount: 99 });
      check("B corrige conta de A: recusado e o valor não muda", !rCor.ok && perto(n((await entrada(contaA))?.amount), 10), j(rCor));
      const rPg = await bb("pagarDespesasAction", ownerB, { entry_ids: [contaA], from: { establishment_id: L1.id } });
      check("B paga conta de A: recusado e a conta segue pendente", !rPg.ok && (await entrada(contaA))?.status === "pending" && (await pagamentosDe(contaA)).length === 0, j(rPg));
      check("no banco, B não tem regras, despesas, modelos nem ocorrências", (await dbB.variableExpenseRule.count()) === 0 && (await dbB.saleVariableExpense.count()) === 0 && (await dbB.fixedExpenseTemplate.count()) === 0 && (await dbB.fixedExpenseOccurrence.count()) === 0);
      check("e A tem os seus (o isolamento não é vazio)", (await db.variableExpenseRule.count()) > 0 && (await db.saleVariableExpense.count()) > 0 && (await db.fixedExpenseTemplate.count()) > 0 && (await db.fixedExpenseOccurrence.count()) > 0);
      await limparRegras();
    });

    // ---------------------------------------------------------------- 10
    await rodar("regressão", async () => {
      console.log("\n10. Regressão: venda sem regra segue como na F3");
      await limparRegras();
      const S = saleId(await venda(op, L1.id, [itP(5)], [dinheiro(50)]));
      check("sem regra: nenhuma despesa variável", (await sveDe(S)).length === 0);
      const todas = await db.financialEntry.findMany({ where: { related_module: "emporio", related_id: S } });
      check("UM lançamento só na venda (a receita), pago", todas.length === 1 && todas[0].entry_type === "income" && todas[0].status === "paid", j(todas));
      const rC = await venda(op, L1.id, [itP(10)], [credito(100)]);
      const SC = saleId(rC);
      const todasC = await db.financialEntry.findMany({ where: { related_module: "emporio", related_id: SC } });
      check("venda no cartão sem regra: receita + taxa de cartão da F3b, nada além", rC.ok && todasC.length === 2 && todasC.filter((e) => e.entry_type === "income").length === 1 && todasC.filter((e) => e.category === "Taxas de cartão").length === 1, j(todasC.map((e) => [e.entry_type, e.category])));
    });

    // ---------------------------------------------------------------- rotas
    await rodar("rotas", async () => {
      console.log("\n11. Rotas da F4a (route handler direto, sessão por Bearer): 401, 404 desligado, sucesso e 422 em português");
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
        ["variable-expense-rules", "GET", "variable-expense-rules", undefined],
        ["variable-expense-rules", "POST", "variable-expense-rules", {}],
        ["variable-expense-rules/[id]", "PATCH", "variable-expense-rules/x", {}],
        ["fixed-expenses", "GET", "fixed-expenses", undefined],
        ["fixed-expenses", "POST", "fixed-expenses", {}],
        ["fixed-expenses/[id]", "PATCH", "fixed-expenses/x", {}],
        ["fixed-expenses/[id]/end", "POST", "fixed-expenses/x/end", {}],
        ["fixed-expenses/[id]/renew", "POST", "fixed-expenses/x/renew", {}],
        ["payables", "GET", "payables", undefined],
        ["payables/[id]", "PATCH", "payables/x", {}],
        ["payables/pay", "POST", "payables/pay", {}],
        ["result", "GET", `result?establishment_id=${L2.id}&month=${mes}`, undefined],
      ];

      await prisma.tenantProfile.upsert({
        where: { tenant_id_profile_type: { tenant_id: TA.t.id, profile_type: "emporio" } },
        create: { tenant_id: TA.t.id, profile_type: "emporio", active: true },
        update: { active: true },
      });
      await prisma.tenantFeature.deleteMany({ where: { tenant_id: TA.t.id, feature_key: "emporio" } });

      for (const [cam, met, url, corpo] of ROTAS) {
        const r = await chamar(null, cam, met, url, corpo);
        check(`sem sessão: ${met} ${url.split("?")[0]} -> 401`, r.status === 401, `${r.status} ${j(r.json)}`);
      }
      for (const [cam, met, url, corpo] of ROTAS) {
        const r = await chamar(tokenOwner, cam, met, url, corpo);
        check(`recurso desligado: ${met} ${url.split("?")[0]} -> 404`, r.status === 404, `${r.status} ${j(r.json)}`);
      }

      await prisma.tenantFeature.create({ data: { tenant_id: TA.t.id, feature_key: "emporio", enabled: true } });

      const ok2xx = (s: number) => s === 200 || s === 201;
      const emIngles = (m: unknown) => typeof m === "string" && /Too small|Too big|Invalid input|expected|Required/i.test(m);
      const em422 = (nome: string, r: { status: number; json: Dado }, campos: string[]) => {
        const e = r.json?.error;
        check(`${nome}: 422 com error.field em ${campos.join(" ou ")}`, r.status === 422 && campos.includes(e?.field), `${r.status} ${j(r.json)}`);
        check(`  e a mensagem é em português`, typeof e?.message === "string" && e.message.length > 0 && !emIngles(e.message), j(e?.message));
      };

      // regras
      await limparRegras();
      const vPost = await chamar(tokenVisu, "variable-expense-rules", "POST", "variable-expense-rules", { establishment_id: L1.id, name: "M83 rota", kind: "percentual", value: 5 });
      check("ligado: VISUALIZADOR cria regra -> 403", vPost.status === 403, `${vPost.status} ${j(vPost.json)}`);
      const po = await chamar(tokenOwner, "variable-expense-rules", "POST", "variable-expense-rules", { establishment_id: L1.id, name: "M83 rota", kind: "percentual", value: 5 });
      check("POST variable-expense-rules: 200 ou 201", ok2xx(po.status), `${po.status} ${j(po.json)}`);
      const regraRota = await db.variableExpenseRule.findFirst({ where: { name: "M83 rota" } });
      check("a regra foi gravada (5%)", !!regraRota && perto(n(regraRota.value), 5));
      const gr = await chamar(tokenOwner, "variable-expense-rules", "GET", `variable-expense-rules?establishment_id=${L1.id}`);
      check("GET variable-expense-rules: 200 e traz a regra", gr.status === 200 && j(gr.json).includes(regraRota?.id ?? "?"), `${gr.status}`);
      const pa = await chamar(tokenOwner, "variable-expense-rules/[id]", "PATCH", `variable-expense-rules/${regraRota?.id}`, { name: "M83 rota renomeada" }, regraRota?.id);
      check("PATCH variable-expense-rules/[id]: 2xx e renomeou", ok2xx(pa.status) && (await db.variableExpenseRule.findUnique({ where: { id: regraRota?.id } }))?.name === "M83 rota renomeada", `${pa.status} ${j(pa.json)}`);
      em422("POST variable-expense-rules com 101%", await chamar(tokenOwner, "variable-expense-rules", "POST", "variable-expense-rules", { establishment_id: L1.id, name: "M83 ruim", kind: "percentual", value: 101 }), ["value"]);
      em422("POST variable-expense-rules de embalagem sem produto", await chamar(tokenOwner, "variable-expense-rules", "POST", "variable-expense-rules", { establishment_id: L1.id, name: "M83 ruim", kind: "embalagem", value: 1 }), ["packaging_emporio_product_id"]);

      // conta a pagar a partir de uma venda
      const SR = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
      const contaR = (await sveDe(SR))[0]?.financial_entry_id ?? "";
      const SR2 = saleId(await venda(op, L1.id, [itP(20)], [dinheiro(200)]));
      const contaR2 = (await sveDe(SR2))[0]?.financial_entry_id ?? "";
      check("a regra da rota gerou duas contas de R$ 10", contaR !== "" && contaR2 !== "");
      const gp = await chamar(tokenOwner, "payables", "GET", "payables");
      check("GET payables: 200 e traz a conta", gp.status === 200 && j(gp.json).includes(contaR), `${gp.status}`);
      const gpv = await chamar(tokenVisu, "payables", "GET", "payables");
      check("GET payables como VISUALIZADOR: 403", gpv.status === 403, `${gpv.status}`);
      const pc = await chamar(tokenOwner, "payables/[id]", "PATCH", `payables/${contaR}`, { amount: 11 }, contaR);
      check("PATCH payables/[id]: 2xx e corrigiu para R$ 11", ok2xx(pc.status) && perto(n((await entrada(contaR))?.amount), 11), `${pc.status} ${j(pc.json)}`);
      em422("PATCH payables/[id] com valor negativo", await chamar(tokenOwner, "payables/[id]", "PATCH", `payables/${contaR}`, { amount: -1 }, contaR), ["amount"]);
      em422("POST payables/pay sem contas", await chamar(tokenOwner, "payables/pay", "POST", "payables/pay", { entry_ids: [], from: { establishment_id: L1.id } }), ["entry_ids"]);
      const CTV = await mkConta("Vazia");
      const insuf = await chamar(tokenOwner, "payables/pay", "POST", "payables/pay", { entry_ids: [contaR], from: { bank_account_id: CTV } });
      check("POST payables/pay acima do saldo: 409 INSUFFICIENT_CASH em from", insuf.status === 409 && insuf.json?.error?.code === "INSUFFICIENT_CASH" && insuf.json?.error?.field === "from", `${insuf.status} ${j(insuf.json)}`);
      const pp = await chamar(tokenOwner, "payables/pay", "POST", "payables/pay", { entry_ids: [contaR, contaR2], from: { establishment_id: L1.id } });
      check("POST payables/pay: 2xx e as duas contas pagas", ok2xx(pp.status) && (await entrada(contaR))?.status === "paid" && (await entrada(contaR2))?.status === "paid", `${pp.status} ${j(pp.json)}`);
      const pp2 = await chamar(tokenOwner, "payables/pay", "POST", "payables/pay", { entry_ids: [contaR], from: { establishment_id: L1.id } });
      check("pagar de novo pela rota: 422 em entry_ids", pp2.status === 422 && pp2.json?.error?.field === "entry_ids", `${pp2.status} ${j(pp2.json)}`);

      // despesas fixas
      const corpoFx = { name: "M83 rota fixa", category: "Internet", amount: 40, due_day: 5, split_kind: "valor", starts_on: `${mes}-01`, splits: [{ establishment_id: L7.id, value: 40 }] };
      const pf = await chamar(tokenOwner, "fixed-expenses", "POST", "fixed-expenses", corpoFx);
      check("POST fixed-expenses: 200 ou 201", ok2xx(pf.status), `${pf.status} ${j(pf.json)}`);
      const tplRota = await db.fixedExpenseTemplate.findFirst({ where: { name: "M83 rota fixa" } });
      check("o modelo gerou 12 contas", !!tplRota && (await ocorrenciasDe(tplRota.id)).length === 12);
      const gf = await chamar(tokenOwner, "fixed-expenses", "GET", "fixed-expenses");
      check("GET fixed-expenses: 200 e traz o modelo", gf.status === 200 && j(gf.json).includes(tplRota?.id ?? "?"), `${gf.status}`);
      const paf = await chamar(tokenOwner, "fixed-expenses/[id]", "PATCH", `fixed-expenses/${tplRota?.id}`, { name: "M83 rota fixa renomeada" }, tplRota?.id);
      check("PATCH fixed-expenses/[id]: 2xx e renomeou", ok2xx(paf.status) && (await db.fixedExpenseTemplate.findUnique({ where: { id: tplRota?.id } }))?.name === "M83 rota fixa renomeada", `${paf.status} ${j(paf.json)}`);
      const ren = await chamar(tokenOwner, "fixed-expenses/[id]/renew", "POST", `fixed-expenses/${tplRota?.id}/renew`, {}, tplRota?.id);
      check("POST fixed-expenses/[id]/renew: 2xx", ok2xx(ren.status), `${ren.status} ${j(ren.json)}`);
      const fim = await chamar(tokenOwner, "fixed-expenses/[id]/end", "POST", `fixed-expenses/${tplRota?.id}/end`, {}, tplRota?.id);
      check("POST fixed-expenses/[id]/end: 2xx e ended_at preenchido", ok2xx(fim.status) && !!(await db.fixedExpenseTemplate.findUnique({ where: { id: tplRota?.id } }))?.ended_at, `${fim.status} ${j(fim.json)}`);
      em422("POST fixed-expenses com rateio que não fecha", await chamar(tokenOwner, "fixed-expenses", "POST", "fixed-expenses", { ...corpoFx, name: "M83 ruim", splits: [{ establishment_id: L7.id, value: 30 }] }), ["splits"]);
      em422("POST fixed-expenses com vencimento 40", await chamar(tokenOwner, "fixed-expenses", "POST", "fixed-expenses", { ...corpoFx, name: "M83 ruim", due_day: 40 }), ["due_day"]);

      // resultado
      const rr = await chamar(tokenOwner, "result", "GET", `result?establishment_id=${L2.id}&month=${mes}`);
      check("GET result: 200 com as vendas da Loja 2 (R$ 1.280)", rr.status === 200 && perto(pega(rr.json, A_VENDAS), 1280), `${rr.status} ${j(rr.json).slice(0, 200)}`);
      const rv = await chamar(tokenVisu, "result", "GET", `result?establishment_id=${L2.id}&month=${mes}`);
      check("GET result como VISUALIZADOR: 403", rv.status === 403, `${rv.status}`);
      em422("GET result com mês inválido", await chamar(tokenOwner, "result", "GET", `result?establishment_id=${L2.id}&month=2026-13`), ["month"]);
      em422("GET result sem a loja", await chamar(tokenOwner, "result", "GET", `result?month=${mes}`), ["establishment_id"]);
      await limparRegras();
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
    console.log(falhas === 0 ? `\n✅ M83 verde (${total} checagens)` : `\n❌ M83: ${falhas} falha(s) em ${total} checagens`);
    process.exit(falhas === 0 ? 0 : 1);
  });
