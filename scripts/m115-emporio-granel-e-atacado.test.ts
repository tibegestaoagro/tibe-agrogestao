import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M115: Módulo 39 (Meu Empório), granel em qualquer peso e atacado na mesma saca (Q319 a Q324).
 * Roda: `npm run test:m115`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-13-emporio-granel-e-atacado-design.md, do plano e do
 * contrato do briefing, sem ler a implementação nova. Conversão por `emporio-conversao.ts` e pela rota
 * `/api/v1/emporio/products/[id]/convert-unit`; vendas, compra, transferência e estoque pelas actions já existentes
 * ou pelas rotas (Request construído).
 *
 * Seção 1: a recusa da fração que não fecha aponta a conversão (Q322).
 * Seção 2: a prévia (Q321): valores por loja, apresentações e o "confira"; não muda nada.
 * Seção 3: fator diferente do da prévia, produto que não é saca e papel sem cadastro: recusa e nada muda.
 * Seção 4: a conversão com histórico em duas lojas (Q320): cada coluna conferida, histórico de auditoria.
 * Seção 5: depois de converter, "300 g" vende e a saca abre.
 * Seção 6: atacado (Q323): implantar numa fechada, vender na outra; abertura sem contar em dobro; SealedLine por tamanho.
 * Seção 7: Q324 e contagem, perda e transferência por tamanho.
 * Seção 8: isolamento entre tenants na rota nova.
 *
 * Suposições (ver o relato): unidades são os ids `saca` e `quilograma`; o "confira" é `check` na linha da
 * apresentação da prévia; recusa por papel é `ok:false` na action e 4xx na rota; a perda recebe uma apresentação só
 * (não há lista), então a Q324 é testada em implantação e contagem; a estoque dispensa venda negativa por padrão.
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
const perto = (a: unknown, b: number, tol = 0.002) => typeof a === "number" && Number.isFinite(a) && Math.abs(a - b) < tol;
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;

console.log("🌾 M115: Módulo 39 (Meu Empório), granel em qualquer peso e atacado na mesma saca (Q319 a Q324)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];

type Ator = { id: string; role: "OWNER" | "OPERADOR" | "VISUALIZADOR" };
type Mundo = {
  tenantId: string;
  db: Dado;
  owner: Ator;
  vendedor: Ator;
  tok: { owner: string; vendedor: string };
  L1: string;
  L2: string;
  reg1: string;
  reg2: string;
  catId: string;
  clienteId: string;
};

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M115 ${rotulo} ${stamp}`, document: `M115${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR" | "VISUALIZADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M115 ${suf}`, email: `m115-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id as string, role, email: u.email as string };
  };
  const owner = await mk("own", "OWNER");
  const vendedor = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: [] });

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M115 ${rotulo} Loja 1` });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M115 ${rotulo} Loja 2` });
  if (!l1.ok || !l2.ok) throw new Error(`loja: ${j(l1)} ${j(l2)}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma as Dado, t.id, [vendedor.id], [L1]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M115 categoria ${rotulo}` }) });
  await abrirTurnoDeTeste(db, owner, L1);
  await abrirTurnoDeTeste(db, owner, L2);
  const reg1 = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;
  const reg2 = (await db.cashRegister.findFirst({ where: { establishment_id: L2, number: 1 } }))?.id as string;
  const cli = (await prisma.emporioCustomer.create({ data: { tenant_id: t.id, name: `M115 Cliente ${rotulo}` } as Dado })) as Dado;

  const token = async (u: { email: string }) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  const tok = { owner: await token(owner), vendedor: await token(vendedor) };
  return { tenantId: t.id, db, owner, vendedor, tok, L1, L2, reg1, reg2, catId: cat.id as string, clienteId: cli.id as string };
}

const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  convert: () => import("@/app/api/v1/emporio/products/[id]/convert-unit/route"),
  produtoEstoque: () => import("@/app/api/v1/emporio/products/[id]/stock/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST", url: string, corpo?: unknown, id?: string): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  let m: Dado;
  try {
    m = await rota();
  } catch (e) {
    return { status: 0, corpo: { import_error: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
  if (typeof m[metodo] !== "function") return { status: 0, corpo: { sem_metodo: metodo } };
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}
const recusada = (r: Resp) => r.status >= 400 && r.status < 500;
const sucesso = (r: Resp) => r.status >= 200 && r.status < 300;
const erroA = (r: Dado, field: string, code = "VALIDATION_ERROR") => r?.ok === false && r.code === code && r.field === field;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m115-${p}-${stamp}-${(seq += 1)}`;

async function main() {
  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    const A = await montar("A");
    const B = await montar("B");
    const Cat = (await import("@/lib/actions/emporio-catalogo")) as Dado;
    const Est = (await import("@/lib/actions/emporio-estoque")) as Dado;
    const Cp = (await import("@/lib/actions/emporio-compras")) as Dado;
    const Tr = (await import("@/lib/actions/emporio-transferencias")) as Dado;
    const Pr = (await import("@/lib/actions/emporio-producao")) as Dado;
    // O módulo novo ainda pode não existir: o import quebra aqui, dentro de `rodar`, e não esconde as outras seções.
    const Conv = async (): Promise<Dado> => (await import("@/lib/actions/emporio-conversao")) as Dado;

    // ------------------------------------------------------------------ montagem
    const mkProduto = async (w: Mundo, nome: string, input: Dado): Promise<{ id: string; product_id: string }> => {
      const r = await Cat.criarProdutoEmporioAction(w.db, w.owner, { name: `M115 ${nome} ${stamp}`, category_id: w.catId, ...input });
      if (!r.ok) throw new Error(`produto ${nome}: ${j(r)}`);
      return { id: r.data.id as string, product_id: r.data.product_id as string };
    };
    const mkPres = async (w: Mundo, prodId: string, name: string, base_qty: number, sealed: boolean): Promise<string> => {
      // O produto em saca já nasce com a apresentação da saca (Q123): reaproveita se for a mesma.
      const existente = await w.db.productPresentation.findFirst({ where: { emporio_product_id: prodId, name } });
      if (existente && Number(existente.base_qty) === base_qty && existente.is_sealed_package === sealed) return existente.id as string;
      const r = await Cat.criarApresentacaoAction(w.db, w.owner, prodId, { name, base_qty, is_sealed_package: sealed });
      if (!r.ok) throw new Error(`apresentação ${name}: ${j(r)}`);
      return r.data.id as string;
    };
    const preco = async (w: Mundo, loja: string, presId: string, price: number) => {
      const r = await Cat.definirPrecoAction(w.db, w.owner, { establishment_id: loja, presentation_id: presId, price });
      if (!r.ok) throw new Error(`preço: ${j(r)}`);
    };
    const implantar = async (w: Mundo, loja: string, prodId: string, sealed: Dado[], loose: number, cost: number) => {
      const r = await Est.implantarEstoqueAction(w.db, w.owner, { establishment_id: loja, emporio_product_id: prodId, sealed, loose_qty: loose, unit_cost: cost });
      if (!r.ok) throw new Error(`implantar: ${j(r)}`);
    };
    const linha = async (w: Mundo, loja: string, prodId: string): Promise<Dado> => {
      const r = await Est.saldoDaLojaAction(w.db, w.owner, loja);
      return (r.data ?? []).find((l: Dado) => l.emporio_product_id === prodId) ?? null;
    };
    const pacotes = (l: Dado): number => (l?.sealed ?? []).reduce((s: number, x: Dado) => s + Number(x.packages), 0);
    const vender = (w: Mundo, loja: "L1" | "L2", items: Dado[], total: number) =>
      chamar(w.tok.owner, R.sales, "POST", "emporio/sales", {
        operation_key: chave("venda"),
        establishment_id: w[loja],
        cash_register_id: loja === "L1" ? w.reg1 : w.reg2,
        customer_id: w.clienteId,
        items,
        payments: [{ kind: "dinheiro", amount: cents(total) }],
      });
    const item = (prodId: string, presId: string, quantity: number) => ({ emporio_product_id: prodId, presentation_id: presId, quantity });

    // Produto A: saca de 15 kg, o do histórico completo.
    const P15 = await mkProduto(A, "Saca15", { base_unit: "saca", content_qty: 15, content_unit: "quilograma" });
    const pSaca = await mkPres(A, P15.id, "Saca 15 kg", 1, true);
    const pGranel = await mkPres(A, P15.id, "GRANEL", 0.068, false);
    const pTres = await mkPres(A, P15.id, "3 kg", 0.2, false);
    const pSacola = await mkPres(A, P15.id, "Sacola lacrada", 0.068, true);
    const pArq = await mkPres(A, P15.id, "Arquivada", 0.5, false);
    const arq = await Cat.arquivarApresentacaoAction(A.db, A.owner, pArq, true);
    if (!arq.ok) throw new Error(`arquivar: ${j(arq)}`);
    for (const loja of [A.L1, A.L2]) {
      await preco(A, loja, pSaca, 150);
      await preco(A, loja, pGranel, 2.4);
    }
    await P.emporioProduct.update({ where: { id: P15.id }, data: { reference_cost: 90 } });

    // Componente (em quilo) e produto final (em quilo) que usa a saca.
    const Comp = await mkProduto(A, "Componente", { base_unit: "quilograma" });
    const Final = await mkProduto(A, "RacaoFinal", { base_unit: "quilograma" });
    const defC = await Pr.definirComposicaoAction(A.db, A.owner, P15.id, { reference_qty: 3, items: [{ component_emporio_product_id: Comp.id, quantity: 2 }] });
    const defF = await Pr.definirComposicaoAction(A.db, A.owner, Final.id, { reference_qty: 100, items: [{ component_emporio_product_id: P15.id, quantity: 0.5 }] });
    if (!defC.ok || !defF.ok) throw new Error(`composição: ${j(defC)} ${j(defF)}`);

    // Histórico: L1 (implantação, compra, venda, contagem, transferência para L2, limites, regra), L2 (implantação).
    await implantar(A, A.L1, P15.id, [{ presentation_id: pSaca, packages: 10 }], 0.5, 90);
    await implantar(A, A.L2, P15.id, [{ presentation_id: pSaca, packages: 6 }], 0, 100);
    const compra = await Cp.criarCompraAction(A.db, A.owner, {
      operation_key: chave("cp"), establishment_id: A.L1, purchased_at: new Date(), received: true, freight: 0,
      payment: { kind: "a_prazo", due_date: new Date(Date.now() + 30 * DIA) }, items: [{ emporio_product_id: P15.id, presentation_id: pSaca, quantity: 4, item_total: 480 }],
    });
    if (!compra.ok) throw new Error(`compra: ${j(compra)}`);
    const venda = await vender(A, "L1", [item(P15.id, pSaca, 2)], 300);
    if (venda.status !== 201) throw new Error(`venda: ${venda.status} ${j(venda.corpo)}`);
    const cont = await Est.registrarContagemAction(A.db, A.owner, { establishment_id: A.L1, emporio_product_id: P15.id, sealed: [{ presentation_id: pSaca, packages: 11 }], loose_qty: 0.5, reason: "conferência" });
    if (!cont.ok) throw new Error(`contagem: ${j(cont)}`);
    const env = await Tr.enviarTransferenciaAction(A.db, A.owner, {
      operation_key: chave("tr"), origin_establishment_id: A.L1, destination_establishment_id: A.L2,
      items: [{ emporio_product_id: P15.id, presentation_id: pSaca, packages: 1 }],
    });
    if (!env.ok) throw new Error(`transferência: ${j(env)}`);
    const itensTr = await P.stockTransferItem.findMany({ where: { transfer_id: env.data.id ?? env.data.transfer_id } });
    const rec = await Tr.receberTransferenciaAction(A.db, A.owner, env.data.id ?? env.data.transfer_id, { items: itensTr.map((i: Dado) => ({ item_id: i.id, received_qty: Number(i.sent_qty) })) });
    if (!rec.ok) throw new Error(`recebimento: ${j(rec)}`);
    const lim = await Est.definirLimitesAction(A.db, A.owner, { establishment_id: A.L1, emporio_product_id: P15.id, min_qty: 2, max_qty: 20 });
    if (!lim.ok) throw new Error(`limites: ${j(lim)}`);
    await P.variableExpenseRule.create({
      data: { tenant_id: A.tenantId, establishment_id: A.L1, name: `M115 embalagem ${stamp}`, kind: "embalagem", value: 0.1, packaging_emporio_product_id: P15.id },
    });

    // Produto para o isolamento (sem histórico) e um de 5 kg para o 1 kg exato.
    const PIso = await mkProduto(A, "Iso", { base_unit: "saca", content_qty: 15, content_unit: "quilograma" });
    await mkPres(A, PIso.id, "Saca 15 kg", 1, true);
    const P5 = await mkProduto(A, "Saca5", { base_unit: "saca", content_qty: 5, content_unit: "quilograma" });
    await mkPres(A, P5.id, "Saca 5 kg", 1, true);
    const p5Quilo = await mkPres(A, P5.id, "Quilo", 0.2, false);

    // Coleta do que a conversão toca, para comparar antes e depois.
    async function coletar(prod: { id: string; product_id: string }): Promise<Dado> {
      const ep = await P.emporioProduct.findUnique({ where: { id: prod.id } });
      const pres = await P.productPresentation.findMany({ where: { emporio_product_id: prod.id } });
      const movs = await P.stockMovement.findMany({ where: { product_id: prod.product_id } });
      const comp = await P.composition.findUnique({ where: { emporio_product_id: prod.id }, include: { items: true } });
      return {
        ep,
        pres: Object.fromEntries(pres.map((x: Dado) => [x.name, x])),
        movs: Object.fromEntries(movs.map((x: Dado) => [x.id, x])),
        compraItens: await P.emporioPurchaseItem.findMany({ where: { emporio_product_id: prod.id } }),
        vendaItens: await P.emporioSaleItem.findMany({ where: { emporio_product_id: prod.id } }),
        transfItens: await P.stockTransferItem.findMany({ where: { emporio_product_id: prod.id } }),
        limites: await P.stockLimit.findMany({ where: { emporio_product_id: prod.id } }),
        comp,
        usoEmFinal: await P.compositionItem.findMany({ where: { component_emporio_product_id: prod.id } }),
        regra: await P.variableExpenseRule.findMany({ where: { packaging_emporio_product_id: prod.id } }),
      };
    }
    const foto = async (prod: { id: string; product_id: string }) => j(await coletar(prod));

    // ------------------------------------------------------------------ 1
    await rodar("Q322", async () => {
      console.log("1. A recusa da fração que não fecha aponta a conversão (Q322)");
      const r = await Cat.criarApresentacaoAction(A.db, A.owner, P15.id, { name: "1 kg", content_qty: 1, is_sealed_package: false });
      check("1 kg numa saca de 15 kg: VALIDATION_ERROR no campo content_qty", erroA(r, "content_qty"), j(r));
      check('a mensagem manda "converta o produto"', typeof r.message === "string" && r.message.toLowerCase().includes("converta o produto"), j(r));
      check("a recusa não criou a apresentação", (await P.productPresentation.count({ where: { emporio_product_id: P15.id, name: "1 kg" } })) === 0);
    });

    // ------------------------------------------------------------------ 2
    await rodar("prévia", async () => {
      console.log("\n2. A prévia por loja e por apresentação (Q321)");
      const antes = await foto(P15);
      const movsAntes = await P.stockMovement.count({ where: { product_id: P15.product_id } });
      const { previaConversaoAction } = await Conv();
      const r = await previaConversaoAction(A.db, A.owner, P15.id);
      check("a prévia responde ok", r.ok === true, j(r));
      const d = r.data ?? {};
      check("from_unit saca, to_unit quilograma, content_qty 15", d.from_unit === "saca" && d.to_unit === "quilograma" && Number(d.content_qty) === 15, j({ f: d.from_unit, t: d.to_unit, c: d.content_qty }));
      for (const [rot, loja] of [["Loja 1", A.L1], ["Loja 2", A.L2]] as const) {
        const real = await linha(A, loja, P15.id);
        const s = (d.stores ?? []).find((x: Dado) => x.establishment_id === loja);
        check(`${rot}: balance_before é o saldo real (${real?.total_qty})`, !!s && perto(s.balance_before, Number(real?.total_qty)), j(s));
        check(`${rot}: balance_after é o saldo × 15`, !!s && perto(s.balance_after, Number(real?.total_qty) * 15), j(s));
        check(`${rot}: average_cost_before é o custo médio real`, !!s && perto(s.average_cost_before, Number(real?.average_cost), 0.001), j({ s, real: real?.average_cost }));
        check(`${rot}: average_cost_after é o custo médio ÷ 15`, !!s && perto(s.average_cost_after, Number(real?.average_cost) / 15, 0.001), j(s));
      }
      const ap = (nome: string) => (d.presentations ?? []).find((x: Dado) => x.name === nome);
      const g = ap("GRANEL");
      check("GRANEL 0,068 saca vira 1,02 kg", !!g && perto(g.base_qty_before, 0.068, 0.0005) && perto(g.base_qty_after, 1.02, 0.0005), j(g));
      check('GRANEL: 1,02 não é múltiplo de 50 g, então check true ("confira")', g?.check === true, j(g));
      check("GRANEL não é fechada (sealed false)", g?.sealed === false, j(g));
      const t = ap("3 kg");
      check("3 kg: 0,2 saca vira 3 kg e check false", !!t && perto(t.base_qty_after, 3) && t.check === false, j(t));
      const s = ap("Saca 15 kg");
      check("Saca 15 kg: fechada, 1 vira 15, check false", !!s && s.sealed === true && perto(s.base_qty_before, 1) && perto(s.base_qty_after, 15) && s.check === false, j(s));
      const sa = ap("Sacola lacrada");
      check("fechada que vira 1,02 kg não recebe o confira (check só vale para não fechada)", !!sa && perto(sa.base_qty_after, 1.02, 0.0005) && sa.check === false, j(sa));
      check("cada apresentação da prévia traz id", (d.presentations ?? []).every((x: Dado) => typeof x.id === "string" && x.id.length > 0), j(d.presentations));

      const r5 = await previaConversaoAction(A.db, A.owner, P5.id);
      const q = (r5.data?.presentations ?? []).find((x: Dado) => x.name === "Quilo");
      check("saca de 5 kg: 0,2 saca vira 1 kg exato e check false", r5.ok === true && !!q && perto(q.base_qty_after, 1) && q.check === false, j(r5));
      check("a prévia não mudou nada (produto, apresentações, movimentações)", (await foto(P15)) === antes && (await P.stockMovement.count({ where: { product_id: P15.product_id } })) === movsAntes);

      const rota = await chamar(A.tok.owner, R.convert, "GET", `emporio/products/${P15.id}/convert-unit`, undefined, P15.id);
      check("GET da rota: 200 com os mesmos campos", rota.status === 200 && rota.corpo?.data?.to_unit === "quilograma" && Array.isArray(rota.corpo?.data?.stores), `${rota.status} ${j(rota.corpo)}`);
      check("e ela também não mudou nada", (await foto(P15)) === antes);
    });

    // ------------------------------------------------------------------ 3
    await rodar("recusas", async () => {
      console.log("\n3. Fator diferente, produto fora da regra e papel sem cadastro: recusa e nada muda");
      const antes = await foto(P15);
      const { converterUnidadeAction } = await Conv();
      const dez = await converterUnidadeAction(A.db, A.owner, P15.id, { content_qty: 10 });
      check("fator 10 (a prévia mostrou 15): VALIDATION_ERROR no campo content_qty", erroA(dez, "content_qty"), j(dez));
      const deze = await converterUnidadeAction(A.db, A.owner, P15.id, { content_qty: 16 });
      check("fator 16: recusa em content_qty", erroA(deze, "content_qty"), j(deze));
      const rota = await chamar(A.tok.owner, R.convert, "POST", `emporio/products/${P15.id}/convert-unit`, { content_qty: 10 }, P15.id);
      check("POST com fator 10: 422 no campo content_qty", rota.status === 422 && rota.corpo?.error?.field === "content_qty" && rota.corpo?.error?.code === "VALIDATION_ERROR", `${rota.status} ${j(rota.corpo)}`);
      const sem = await chamar(A.tok.owner, R.convert, "POST", `emporio/products/${P15.id}/convert-unit`, {}, P15.id);
      check("POST sem content_qty: recusa 4xx", recusada(sem), `${sem.status} ${j(sem.corpo)}`);
      check("nada mudou depois das quatro recusas", (await foto(P15)) === antes);

      const kg = await mkProduto(A, "JaKg", { base_unit: "quilograma" });
      const rkg = await converterUnidadeAction(A.db, A.owner, kg.id, { content_qty: 15 });
      check("produto em quilo: VALIDATION_ERROR", rkg.ok === false && rkg.code === "VALIDATION_ERROR", j(rkg));
      const pkg = await (await Conv()).previaConversaoAction(A.db, A.owner, kg.id);
      check("a prévia de produto em quilo também recusa (VALIDATION_ERROR)", pkg.ok === false && pkg.code === "VALIDATION_ERROR", j(pkg));

      const papel = await converterUnidadeAction(A.db, A.vendedor, P15.id, { content_qty: 15 });
      check("Vendedor (sem cadastro de produto) não converte: recusa", papel.ok === false, j(papel));
      const papelRota = await chamar(A.tok.vendedor, R.convert, "POST", `emporio/products/${P15.id}/convert-unit`, { content_qty: 15 }, P15.id);
      check("pela rota, o Vendedor leva 4xx", recusada(papelRota), `${papelRota.status} ${j(papelRota.corpo)}`);
      check("nada mudou depois da recusa por papel", (await foto(P15)) === antes);
      check("nenhum histórico de conversão nasceu das recusas", (await P.emporioAuditLog.count({ where: { tenant_id: A.tenantId, action: "produto.converter_unidade" } })) === 0);
    });

    // ------------------------------------------------------------------ 4
    await rodar("conversão", async () => {
      console.log("\n4. A conversão com histórico em duas lojas (Q320)");
      const F = 15;
      const antes = await coletar(P15);
      const saldo = async (loja: string) => {
        const l = await linha(A, loja, P15.id);
        return { total: Number(l?.total_qty), solto: Number(l?.loose_qty), pacotes: pacotes(l), custo: num(l?.average_cost) };
      };
      const s1 = await saldo(A.L1);
      const s2 = await saldo(A.L2);
      const finalAntes = await P.emporioProduct.findUnique({ where: { id: Final.id } });

      const r = await chamar(A.tok.owner, R.convert, "POST", `emporio/products/${P15.id}/convert-unit`, { content_qty: 15 }, P15.id);
      check("POST convert-unit com o fator da prévia: sucesso", sucesso(r), `${r.status} ${j(r.corpo)}`);
      const depois = await coletar(P15);

      check("base_unit vira quilograma", depois.ep.base_unit === "quilograma", `${depois.ep.base_unit}`);
      check("content_qty e content_unit viram nulos", depois.ep.content_qty === null && depois.ep.content_unit === null, j([depois.ep.content_qty, depois.ep.content_unit]));
      check("reference_cost 90 vira 6", perto(num(depois.ep.reference_cost), 6, 0.001), `${depois.ep.reference_cost}`);

      const mal: string[] = [];
      for (const [nome, a] of Object.entries(antes.pres) as [string, Dado][]) {
        const d = depois.pres[nome];
        if (!d || !perto(Number(d.base_qty), Number(a.base_qty) * F, 0.002)) mal.push(`${nome}: ${a.base_qty} -> ${d?.base_qty}`);
      }
      check("toda apresentação (inclusive a arquivada) tem base_qty × 15", mal.length === 0 && Object.keys(antes.pres).length >= 5, mal.join("; "));
      check("a arquivada ficou arquivada e vale 7,5", depois.pres["Arquivada"]?.archived_at !== null && perto(Number(depois.pres["Arquivada"]?.base_qty), 7.5));

      const movsMal: string[] = [];
      let nMovs = 0;
      for (const [id, a] of Object.entries(antes.movs) as [string, Dado][]) {
        nMovs += 1;
        const d = depois.movs[id];
        const par = (campo: string, f: number, tol: number) => {
          const x = num(a[campo]);
          const y = num(d?.[campo]);
          if (x === null || y === null) {
            if (x !== y) movsMal.push(`${id}.${campo}: ${x} -> ${y}`);
          } else if (!perto(y, x * f, tol)) movsMal.push(`${id}.${campo}: ${x} -> ${y}`);
        };
        if (!d) { movsMal.push(`${id} sumiu`); continue; }
        par("quantity", F, 0.002);
        par("previous_balance", F, 0.002);
        par("corrected_balance", F, 0.002);
        par("unit_cost", 1 / F, 0.001);
      }
      check(`as ${nMovs} movimentações: quantity, previous_balance e corrected_balance × 15, unit_cost ÷ 15`, nMovs >= 6 && movsMal.length === 0, movsMal.slice(0, 3).join("; "));

      const ci = depois.compraItens[0];
      const ca = antes.compraItens[0];
      check("item de compra: base_quantity × 15 e unit_cost ÷ 15", !!ci && perto(Number(ci.base_quantity), Number(ca.base_quantity) * F) && perto(Number(ci.unit_cost), Number(ca.unit_cost) / F, 0.001), j([ca, ci]));
      check("item de compra: quantity (na apresentação) e item_total não mudam", !!ci && Number(ci.quantity) === Number(ca.quantity) && Number(ci.item_total) === Number(ca.item_total), j([ca, ci]));

      const vi = depois.vendaItens[0];
      const va = antes.vendaItens[0];
      check("item de venda: base_qty × 15 e unit_cost ÷ 15", !!vi && perto(Number(vi.base_qty), Number(va.base_qty) * F) && perto(num(vi.unit_cost) ?? -1, (num(va.unit_cost) ?? 0) / F, 0.001), j([va, vi]));
      check("item de venda: quantity, unit_price e total não mudam", !!vi && Number(vi.quantity) === Number(va.quantity) && Number(vi.unit_price) === Number(va.unit_price) && Number(vi.total) === Number(va.total), j([va, vi]));

      const ta = antes.transfItens[0];
      const td = depois.transfItens.find((x: Dado) => x.id === ta.id);
      check("item de transferência: sent_qty, received_qty × 15 e unit_cost ÷ 15", !!td && perto(Number(td.sent_qty), Number(ta.sent_qty) * F) && perto(Number(td.received_qty), Number(ta.received_qty) * F) && perto(num(td.unit_cost) ?? -1, (num(ta.unit_cost) ?? 0) / F, 0.001), j([ta, td]));

      const la = antes.limites[0];
      const ld = depois.limites.find((x: Dado) => x.id === la.id);
      check("limites de estoque: min 2 e max 20 viram 30 e 300", !!ld && perto(Number(ld.min_qty), 30) && perto(Number(ld.max_qty), 300), j([la, ld]));

      check("composição do produto (como composto): reference_qty 3 vira 45", perto(Number(depois.comp?.reference_qty), 45), j(depois.comp));
      check("e o componente dele (em quilo, outro produto) não muda: 2", depois.comp?.items?.length === 1 && Number(depois.comp.items[0].quantity) === 2, j(depois.comp?.items));
      const uso = depois.usoEmFinal.find((x: Dado) => x.id === antes.usoEmFinal[0].id);
      check("composição de outro produto que usa a saca (como componente): 0,5 vira 7,5", !!uso && perto(Number(uso.quantity), 7.5), j([antes.usoEmFinal, depois.usoEmFinal]));
      const finalDepois = await P.emporioProduct.findUnique({ where: { id: Final.id } });
      check("o produto que usa a saca não é alterado (unidade e custo)", finalDepois.base_unit === finalAntes.base_unit && j(finalDepois.reference_cost) === j(finalAntes.reference_cost));
      const compFinal = await P.composition.findUnique({ where: { emporio_product_id: Final.id } });
      check("a reference_qty do produto final (100) segue 100", Number(compFinal.reference_qty) === 100);

      const rg = depois.regra[0];
      check("regra de despesa por embalagem: 0,1 vira 1,5", !!rg && perto(Number(rg.value), 1.5, 0.001), j(depois.regra));

      for (const [rot, loja, antesS] of [["Loja 1", A.L1, s1], ["Loja 2", A.L2, s2]] as const) {
        const d = await saldo(loja);
        check(`${rot}: saldo ${antesS.total} sacas vira ${antesS.total * F} kg`, perto(d.total, antesS.total * F, 0.01), `${d.total}`);
        check(`${rot}: avulso × 15 e as mesmas embalagens fechadas`, perto(d.solto, antesS.solto * F, 0.01) && d.pacotes === antesS.pacotes, j([antesS, d]));
        check(`${rot}: custo médio ÷ 15`, antesS.custo !== null && d.custo !== null && perto(d.custo, antesS.custo / F, 0.001), j([antesS.custo, d.custo]));
      }
      const l1 = await linha(A, A.L1, P15.id);
      check("a unidade do estoque agora é quilograma", l1?.base_unit === "quilograma", `${l1?.base_unit}`);

      const logs = await P.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "produto.converter_unidade" } });
      check("o histórico registra produto.converter_unidade (uma vez)", logs.length === 1, `${logs.length}`);
      check("e não vai com resumo vazio", logs.length === 1 && typeof logs[0].summary === "string" && logs[0].summary.length > 0);

      const de_novo = await chamar(A.tok.owner, R.convert, "POST", `emporio/products/${P15.id}/convert-unit`, { content_qty: 15 }, P15.id);
      check("converter de novo (já em quilo): recusa 4xx", recusada(de_novo), `${de_novo.status} ${j(de_novo.corpo)}`);
      check("e o saldo segue o mesmo", perto(Number((await linha(A, A.L1, P15.id))?.total_qty), s1.total * F, 0.01));
    });

    // ------------------------------------------------------------------ 5
    await rodar("depois de converter", async () => {
      console.log("\n5. Depois de converter, 300 g vende e a saca abre");
      const g300 = await mkPres(A, P15.id, "300 g", 0.3, false);
      await preco(A, A.L2, g300, 4.5);
      const antes = await linha(A, A.L2, P15.id);
      check("pré-condição: a Loja 2 tem 7 sacas fechadas e nada avulso", pacotes(antes) === 7 && Number(antes?.loose_qty) === 0, j([pacotes(antes), antes?.loose_qty]));
      const v = await vender(A, "L2", [item(P15.id, g300, 1)], 4.5);
      check("vender 1 × 300 g: 201", v.status === 201, `${v.status} ${j(v.corpo)}`);
      const depois = await linha(A, A.L2, P15.id);
      check("o saldo cai 0,3 kg", perto(Number(depois?.total_qty), Number(antes?.total_qty) - 0.3), `${antes?.total_qty} -> ${depois?.total_qty}`);
      check("a saca abriu: 7 fechadas viram 6", pacotes(depois) === 6, `${pacotes(depois)}`);
      check("e o avulso é 14,7 kg (15 menos os 300 g)", perto(Number(depois?.loose_qty), 14.7), `${depois?.loose_qty}`);
      const movs = await P.stockMovement.count({ where: { product_id: P15.product_id, sale_id: v.corpo?.data?.id, canceled_at: null } });
      check("a venda gravou a baixa e a abertura (2 movimentações ou mais)", movs >= 2, `${movs}`);
      const v2 = await vender(A, "L2", [item(P15.id, g300, 10)], 45);
      check("mais 10 × 300 g (3 kg) saem do avulso sem abrir outra", v2.status === 201 && pacotes(await linha(A, A.L2, P15.id)) === 6, `${v2.status} ${j(v2.corpo)}`);
    });

    // ------------------------------------------------------------------ 6
    const Q40 = await mkProduto(A, "Farelo40", { base_unit: "quilograma" });
    const q40Saca = await mkPres(A, Q40.id, "Saca 40 kg", 40, true);
    const q40Atac = await mkPres(A, Q40.id, "ATACADO", 40, true);
    const q40Quilo = await mkPres(A, Q40.id, "Quilo", 1, false);
    for (const loja of [A.L1, A.L2]) {
      await preco(A, loja, q40Saca, 124.8);
      await preco(A, loja, q40Atac, 118);
      await preco(A, loja, q40Quilo, 3.4);
    }
    await rodar("atacado", async () => {
      console.log("\n6. Atacado: o saldo fechado é por tamanho (Q323)");
      await implantar(A, A.L1, Q40.id, [{ presentation_id: q40Saca, packages: 10 }], 0, 3);
      const l0 = await linha(A, A.L1, Q40.id);
      check("SealedLine por tamanho: uma linha só para as duas de 40 kg", (l0?.sealed ?? []).length === 1, j(l0?.sealed));
      const sl = l0?.sealed?.[0] ?? {};
      check("a linha traz presentation_ids com as duas", Array.isArray(sl.presentation_ids) && sl.presentation_ids.includes(q40Saca) && sl.presentation_ids.includes(q40Atac) && sl.presentation_ids.length === 2, j(sl));
      check('e name com os dois nomes juntos por " / "', typeof sl.name === "string" && sl.name.includes(" / ") && sl.name.includes("Saca 40 kg") && sl.name.includes("ATACADO"), j(sl));
      check("10 embalagens e 400 kg", Number(sl.packages) === 10 && perto(Number(sl.base_qty), 400), j(sl));
      check("presentation_id é uma das duas (a mais antiga ativa)", sl.presentation_id === q40Saca, j(sl));
      const rota = await chamar(A.tok.owner, R.produtoEstoque, "GET", `emporio/products/${Q40.id}/stock`, undefined, Q40.id);
      const lojaR = (rota.corpo?.data?.stores ?? []).find((x: Dado) => x.establishment_id === A.L1);
      check("a rota do estoque do produto devolve a mesma linha única", rota.status === 200 && (lojaR?.sealed ?? []).length === 1 && (lojaR?.sealed?.[0]?.presentation_ids ?? []).length === 2, `${rota.status} ${j(lojaR?.sealed)}`);

      const v1 = await vender(A, "L1", [item(Q40.id, q40Atac, 1)], 118);
      check("implantado em Saca 40 kg, vender 1 ATACADO: 201", v1.status === 201, `${v1.status} ${j(v1.corpo)}`);
      check("o saldo fechado do tamanho cai 1 (9)", pacotes(await linha(A, A.L1, Q40.id)) === 9);
      const v2 = await vender(A, "L1", [item(Q40.id, q40Saca, 1)], 124.8);
      check("e vender 1 Saca 40 kg tira da mesma conta (8)", v2.status === 201 && pacotes(await linha(A, A.L1, Q40.id)) === 8, `${v2.status} ${j(v2.corpo)}`);

      const v3 = await vender(A, "L1", [item(Q40.id, q40Quilo, 3)], 10.2);
      const l3 = await linha(A, A.L1, Q40.id);
      check("vender 3 kg sem avulso abre uma embalagem só: 7 fechadas, 37 avulsos, 317 no total", v3.status === 201 && pacotes(l3) === 7 && perto(Number(l3?.loose_qty), 37) && perto(Number(l3?.total_qty), 317), `${v3.status} ${pacotes(l3)} ${l3?.loose_qty} ${l3?.total_qty}`);
      const v4 = await vender(A, "L1", [item(Q40.id, q40Quilo, 38)], 129.2);
      const l4 = await linha(A, A.L1, Q40.id);
      check("vender 38 kg com 37 avulsos abre mais uma (uma por vez): 6 fechadas, 39 avulsos, 279 no total", v4.status === 201 && pacotes(l4) === 6 && perto(Number(l4?.loose_qty), 39) && perto(Number(l4?.total_qty), 279), `${v4.status} ${pacotes(l4)} ${l4?.loose_qty} ${l4?.total_qty}`);
      const vendasAntes = await P.emporioSale.count({ where: { tenant_id: A.tenantId } });
      const v5 = await vender(A, "L1", [item(Q40.id, q40Quilo, 280)], 952);
      check("280 kg com 279 no estoque: recusa (o fechado não conta em dobro)", recusada(v5), `${v5.status} ${j(v5.corpo)}`);
      check("e não criou venda", (await P.emporioSale.count({ where: { tenant_id: A.tenantId } })) === vendasAntes);

      const v6 = await vender(A, "L1", [item(Q40.id, q40Atac, 6)], 708);
      check("vender as 6 restantes em ATACADO: 201 e zera o fechado do tamanho", v6.status === 201 && pacotes(await linha(A, A.L1, Q40.id)) === 0, `${v6.status} ${j(v6.corpo)}`);
      const v7 = await vender(A, "L1", [item(Q40.id, q40Saca, 1)], 124.8);
      check("com o fechado zerado, 1 Saca 40 kg é recusada (não sobra fechado em nenhuma das duas)", recusada(v7), `${v7.status} ${j(v7.corpo)}`);
      check("o avulso segue em 39", perto(Number((await linha(A, A.L1, Q40.id))?.loose_qty), 39));
    });

    // ------------------------------------------------------------------ 7
    await rodar("Q324", async () => {
      console.log("\n7. Q324: uma quantidade por tamanho; contagem, perda e transferência pelo tamanho");
      const Q = await mkProduto(A, "Farelo40b", { base_unit: "quilograma" });
      const sacaB = await mkPres(A, Q.id, "Saca 40 kg", 40, true);
      const atacB = await mkPres(A, Q.id, "ATACADO", 40, true);
      await mkPres(A, Q.id, "Quilo", 1, false);

      const dup = await Est.implantarEstoqueAction(A.db, A.owner, { establishment_id: A.L1, emporio_product_id: Q.id, sealed: [{ presentation_id: sacaB, packages: 3 }, { presentation_id: atacB, packages: 2 }], loose_qty: 0, unit_cost: 3 });
      check("implantação com as duas do mesmo tamanho: VALIDATION_ERROR", dup.ok === false && dup.code === "VALIDATION_ERROR" && dup.status === 422, j(dup));
      check('a mensagem fala "mesma embalagem"', typeof dup.message === "string" && dup.message.toLowerCase().includes("mesma embalagem"), j(dup));
      check("o campo é sealed", dup.field === "sealed", j(dup));
      check("a recusa não gravou movimentação", (await P.stockMovement.count({ where: { product_id: Q.product_id } })) === 0);
      await implantar(A, A.L1, Q.id, [{ presentation_id: sacaB, packages: 5 }], 0, 3);
      check("implantar com UMA apresentação do tamanho passa: 5 fechadas", pacotes(await linha(A, A.L1, Q.id)) === 5);

      const cdup = await Est.registrarContagemAction(A.db, A.owner, { establishment_id: A.L1, emporio_product_id: Q.id, sealed: [{ presentation_id: sacaB, packages: 3 }, { presentation_id: atacB, packages: 2 }], loose_qty: 0, reason: "conferência" });
      check("contagem com as duas do mesmo tamanho: VALIDATION_ERROR, campo sealed, 'mesma embalagem'", cdup.ok === false && cdup.code === "VALIDATION_ERROR" && cdup.field === "sealed" && String(cdup.message).toLowerCase().includes("mesma embalagem"), j(cdup));
      check("e o saldo não mudou (5)", pacotes(await linha(A, A.L1, Q.id)) === 5);
      const c1 = await Est.registrarContagemAction(A.db, A.owner, { establishment_id: A.L1, emporio_product_id: Q.id, sealed: [{ presentation_id: atacB, packages: 4 }], loose_qty: 0, reason: "conferência" });
      check("contagem do tamanho por UMA apresentação (ATACADO, 4) passa", c1.ok === true, j(c1));
      check("e acerta o saldo do tamanho: 4 (não 9, como seria por apresentação)", pacotes(await linha(A, A.L1, Q.id)) === 4, `${pacotes(await linha(A, A.L1, Q.id))}`);
      const c2 = await Est.registrarContagemAction(A.db, A.owner, { establishment_id: A.L1, emporio_product_id: Q.id, sealed: [{ presentation_id: sacaB, packages: 2 }], loose_qty: 0, reason: "conferência" });
      check("contar 2 pela outra apresentação do mesmo tamanho leva o saldo a 2", c2.ok === true && pacotes(await linha(A, A.L1, Q.id)) === 2, `${j(c2)} ${pacotes(await linha(A, A.L1, Q.id))}`);
      const movsAntesC3 = await P.stockMovement.count({ where: { product_id: Q.product_id } });
      const c3 = await Est.registrarContagemAction(A.db, A.owner, { establishment_id: A.L1, emporio_product_id: Q.id, sealed: [{ presentation_id: atacB, packages: 2 }], loose_qty: 0, reason: "conferência" });
      const movsDepoisC3 = await P.stockMovement.count({ where: { product_id: Q.product_id } });
      check("contar o mesmo valor (2) pela outra: nada mudou e nenhuma movimentação nova", c3.ok === true && pacotes(await linha(A, A.L1, Q.id)) === 2 && movsDepoisC3 === movsAntesC3, `${j(c3)} ${movsAntesC3} -> ${movsDepoisC3}`);
      await Est.registrarContagemAction(A.db, A.owner, { establishment_id: A.L1, emporio_product_id: Q.id, sealed: [{ presentation_id: sacaB, packages: 5 }], loose_qty: 0, reason: "conferência" });

      const perda = await Est.registrarPerdaAction(A.db, A.owner, { establishment_id: A.L1, emporio_product_id: Q.id, package_state: "lacrado", presentation_id: atacB, quantity: 1, reason: "avaria" });
      check("perda de 1 em ATACADO, com o estoque implantado em Saca 40 kg: passa", perda.ok === true, j(perda));
      check("e o saldo fechado do tamanho cai a 4", pacotes(await linha(A, A.L1, Q.id)) === 4, `${pacotes(await linha(A, A.L1, Q.id))}`);

      const env = await Tr.enviarTransferenciaAction(A.db, A.owner, {
        operation_key: chave("tr"), origin_establishment_id: A.L1, destination_establishment_id: A.L2,
        items: [{ emporio_product_id: Q.id, presentation_id: atacB, packages: 1 }],
      });
      check("transferir 1 ATACADO da loja cujo estoque está em Saca 40 kg: passa", env.ok === true, j(env));
      check("e a origem fica com 3 do tamanho", pacotes(await linha(A, A.L1, Q.id)) === 3, `${pacotes(await linha(A, A.L1, Q.id))}`);
      const enviarTudo = await Tr.enviarTransferenciaAction(A.db, A.owner, {
        operation_key: chave("tr"), origin_establishment_id: A.L1, destination_establishment_id: A.L2,
        items: [{ emporio_product_id: Q.id, presentation_id: sacaB, packages: 4 }],
      });
      check("transferir 4 quando só há 3 do tamanho: recusa", enviarTudo.ok === false, j(enviarTudo));
    });

    // ------------------------------------------------------------------ 8
    await rodar("isolamento", async () => {
      console.log("\n8. Isolamento: o tenant B não lê nem converte o produto do A");
      const antes = await foto(PIso);
      const previa = await chamar(B.tok.owner, R.convert, "GET", `emporio/products/${PIso.id}/convert-unit`, undefined, PIso.id);
      check("B lê a prévia do produto do A: 404", previa.status === 404, `${previa.status} ${j(previa.corpo)}`);
      check("e não vaza o nome nem os dados", !j(previa.corpo).includes("M115 Iso") && previa.corpo?.data === undefined, j(previa.corpo));
      const conv = await chamar(B.tok.owner, R.convert, "POST", `emporio/products/${PIso.id}/convert-unit`, { content_qty: 15 }, PIso.id);
      check("B converte o produto do A: 404", conv.status === 404, `${conv.status} ${j(conv.corpo)}`);
      const { converterUnidadeAction, previaConversaoAction } = await Conv();
      const aPrev = await previaConversaoAction(B.db, B.owner, PIso.id);
      const aConv = await converterUnidadeAction(B.db, B.owner, PIso.id, { content_qty: 15 });
      check("pelas actions do B: NOT_FOUND 404 nas duas", aPrev.ok === false && aPrev.status === 404 && aConv.ok === false && aConv.status === 404, j([aPrev, aConv]));
      check("o produto do A segue em saca, intacto", (await foto(PIso)) === antes && (await P.emporioProduct.findUnique({ where: { id: PIso.id } })).base_unit === "saca");
    });
  } finally {
    for (const id of tenantIds.reverse()) {
      await limpar(id);
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M115 (Módulo 39, Empório): granel em qualquer peso e atacado na mesma saca passaram." : `\n❌ M115 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

async function limpar(id: string) {
  const { prisma } = await import("@/lib/prisma");
  const P = prisma as Dado;
  await P.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
  await P.emporioQuote.updateMany({ where: { tenant_id: id }, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
  await prisma.tenant.delete({ where: { id } }).catch((e: unknown) => console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
