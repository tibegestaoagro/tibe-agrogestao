import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F2a: compra, estoque por loja e custo médio.
 * Roda: `npm run test:m79`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F2a: contrato", Q60 a
 * Q71), sem ler a implementação. Chama as actions direto, sem rota. Os módulos
 * das actions e o do custo médio são carregados por `import()` com
 * especificador em variável, para o arquivo compilar antes de eles existirem.
 *
 * O que o contrato calava e esta suíte ASSUME (ver o relato da entrega):
 * - `custoMedio(movimentos)` recebe linhas no formato do `StockMovement`
 *   (`movement_type`, `quantity` positiva, `unit_cost`, `occurred_at`,
 *   `created_at`, `canceled_at`) e decide o sinal pelo tipo (`compra` entra,
 *   `perda` sai), e ordena por `occurred_at` ele mesmo.
 * - datas de entrada (`purchased_at`, `due_date`) como `Date`.
 * - o resultado de listas é um array ou `{ items }`; o da compra traz `id`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
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
const recusa = (r: R, code: string, status: number, field?: string) =>
  !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);
const j = (x: unknown) => JSON.stringify(x);
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));

console.log("🛍️  M79: Módulo 39 (Meu Empório), F2a: compra, estoque e custo médio\n");

async function puras() {
  const caminho = "@/lib/emporio/custo-medio";
  const { custoMedio } = (await import(caminho)) as {
    custoMedio: (m: Dado[]) => { saldo: number; custo_medio: number | null; estimado: boolean };
  };
  const t0 = Date.UTC(2026, 0, 1);
  const mov = (i: number, tipo: string, quantity: number, unit_cost: number | null, extra: Dado = {}) => ({
    movement_type: tipo,
    quantity,
    unit_cost,
    occurred_at: new Date(t0 + i * 3_600_000),
    created_at: new Date(t0 + i * 3_600_000),
    canceled_at: null,
    ...extra,
  });
  console.log("1. custoMedio (função pura, média móvel)");
  const e1 = mov(1, "compra", 10, 9);
  const e2 = mov(2, "compra", 10, 11);
  let r = custoMedio([e1, e2]);
  check("10 kg a 9 e 10 kg a 11: saldo 20, média 10", r.saldo === 20 && perto(r.custo_medio, 10), j(r));
  const s1 = mov(3, "perda", 5, null);
  r = custoMedio([e1, e2, s1]);
  check("saída de 5 mantém a média em 10 (saldo 15)", r.saldo === 15 && perto(r.custo_medio, 10), j(r));
  const e3 = mov(4, "compra", 5, 16);
  r = custoMedio([e1, e2, s1, e3]);
  check("entrada de 5 a 16 depois da saída: (15x10 + 5x16)/20 = 11,5, não a simples (12)", r.saldo === 20 && perto(r.custo_medio, 11.5), j(r));
  check("tudo com custo: não é estimado", r.estimado === false, j(r));
  const e4 = mov(5, "compra", 10, null);
  r = custoMedio([e1, e2, s1, e3, e4]);
  check("entrada sem custo soma pela média vigente (30, 11,5) e marca estimado", r.saldo === 30 && perto(r.custo_medio, 11.5) && r.estimado === true, j(r));
  r = custoMedio([e1, e2, mov(6, "compra", 100, 1, { canceled_at: new Date(t0 + 7 * 3_600_000) })]);
  check("movimentação cancelada não conta (saldo 20, média 10)", r.saldo === 20 && perto(r.custo_medio, 10), j(r));
  r = custoMedio([e3, s1, e2, e1]);
  check("fora de ordem no array: ordena por occurred_at (mesmo resultado, 11,5)", r.saldo === 20 && perto(r.custo_medio, 11.5), j(r));
  r = custoMedio([]);
  check("sem movimentação: saldo 0", r.saldo === 0, j(r));
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const caminhoCatalogo = "@/lib/actions/emporio-catalogo";
  const caminhoEstoque = "@/lib/actions/emporio-estoque";
  const caminhoCompras = "@/lib/actions/emporio-compras";
  const C = (await import(caminhoCatalogo)) as Record<string, Acao>;
  const E = (await import(caminhoEstoque)) as Record<string, Acao>;
  const P = (await import(caminhoCompras)) as Record<string, Acao>;
  const { listProductsWithBalance } = await import("@/lib/actions/products");
  const { getStockBalance } = await import("@/lib/actions/stock-ledger");
  const { registrarCompraDoItemAction } = await import("@/lib/actions/shopping-items");

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M79 ${rotulo} ${stamp}`, document: `M79${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
      });
      tenantIds.push(t.id);
      const mkUser = async (suf: string, role: Role): Promise<Ator> => {
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M79 ${rotulo} ${suf}`, email: `m79-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role },
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
    const vinc = await TA.mkUser("vin", "ADMIN");
    const ownerB = await TB.mkUser("own", "OWNER");
    const db = prismaForTenant(TA.t.id);
    const dbB = prismaForTenant(TB.t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M79 categoria" }) });
    const catB = await dbB.productCategory.create({ data: scoped({ name: "M79 categoria B" }) });

    const dados = (r: R): Dado => (r.ok ? r.data : undefined);
    const lista = (d: Dado): Dado[] => (Array.isArray(d) ? d : (d?.items ?? []));
    const chamarEm = (mod: Record<string, Acao>, cliente: Dado, nome: string, ...args: unknown[]) => {
      const f = mod[nome];
      if (typeof f !== "function") return Promise.reject(new Error(`action ausente: ${nome}`));
      return f(cliente, ...args);
    };
    const cc = (nome: string, ...a: unknown[]) => chamarEm(C, db, nome, ...a);
    const ee = (nome: string, ...a: unknown[]) => chamarEm(E, db, nome, ...a);
    const pp = (nome: string, ...a: unknown[]) => chamarEm(P, db, nome, ...a);
    const minutos = (m: number) => new Date(Date.now() - m * 60_000);
    const diasAdiante = (d: number) => new Date(Date.now() + d * 86_400_000);

    // ---- Lojas e produtos
    const rL1 = await cc("criarEstabelecimentoAction", owner, { name: "M79 Loja 1", kind: "ponto_venda" });
    const rL2 = await cc("criarEstabelecimentoAction", owner, { name: "M79 Loja 2", kind: "central" });
    const rL3 = await cc("criarEstabelecimentoAction", owner, { name: "M79 Loja 3", kind: "ponto_venda" });
    const L1 = dados(rL1);
    const L2 = dados(rL2);
    const L3 = dados(rL3);
    if (!L1 || !L2 || !L3) throw new Error(`não criou as lojas: ${j([rL1, rL2, rL3])}`);
    await prisma.establishment.update({ where: { id: L3.id }, data: { allow_negative_stock: true } });

    type Prod = { id: string; product_id: string; p: Record<string, string> };
    const emporioProdIds: string[] = [];
    let seq = 0;
    const mkProduto = async (nome: string, unit: string, pres: [string, number, boolean][] = []): Promise<Prod> => {
      seq += 1;
      const r = await cc("criarProdutoEmporioAction", op, { name: `M79 ${nome} ${seq}`, category_id: cat.id, base_unit: unit });
      const d = dados(r);
      if (!d) throw new Error(`produto ${nome}: ${j(r)}`);
      const p: Record<string, string> = {};
      for (const [pn, bq, sealed] of pres) {
        const rp = await cc("criarApresentacaoAction", op, d.id, { name: pn, base_qty: bq, is_sealed_package: sealed });
        if (!rp.ok) throw new Error(`apresentação ${pn}: ${j(rp)}`);
        p[pn] = rp.data.id;
      }
      emporioProdIds.push(d.product_id);
      return { id: d.id, product_id: d.product_id, p };
    };

    let chaveSeq = 0;
    const comprar = (ator: Ator, over: Dado = {}) => {
      chaveSeq += 1;
      return pp("criarCompraAction", ator, {
        operation_key: `m79-${stamp}-${chaveSeq}`,
        establishment_id: L1.id,
        purchased_at: new Date(),
        received: true,
        freight: 0,
        payment: { kind: "a_vista" },
        items: [],
        ...over,
      });
    };
    const compraId = (r: R): string => dados(r)?.id ?? dados(r)?.purchase_id;
    const entradasDe = async (id: string) =>
      (await db.financialEntry.findMany({ where: { related_module: "emporio", related_id: id } })).sort(
        (a, b) => (a.due_date?.getTime() ?? 0) - (b.due_date?.getTime() ?? 0),
      );
    const linhaDaLoja = async (ator: Ator, est: string, prod: Prod): Promise<Dado> =>
      lista(dados(await ee("saldoDaLojaAction", ator, est))).find((l) => l.emporio_product_id === prod.id);
    const total = async (est: string, prod: Prod, ator: Ator = admin) => {
      const l = await linhaDaLoja(ator, est, prod);
      return l ? n(l.total_qty) : 0;
    };
    const movimentosDe = (prod: Prod, extra: Dado = {}) =>
      db.stockMovement.findMany({ where: { product_id: prod.product_id, ...extra }, orderBy: { created_at: "asc" } });

    console.log("2. Compra recebida: rateio do frete, custo por kg e saldo lacrado/avulso");
    const R1 = await mkProduto("Ração", "quilograma", [["Saca 10 kg", 10, true], ["Quilo", 1, false]]);
    const rc = await comprar(op, {
      freight: 44,
      items: [
        { emporio_product_id: R1.id, presentation_id: R1.p["Saca 10 kg"], quantity: 2, item_total: 380 },
        { emporio_product_id: R1.id, presentation_id: R1.p["Quilo"], quantity: 5, item_total: 60 },
      ],
    });
    check("OPERADOR registra a compra", rc.ok, j(rc));
    const idR = compraId(rc);
    const itens = await db.emporioPurchaseItem.findMany({ where: { purchase_id: idR } });
    const iSaca = itens.find((i) => i.presentation_id === R1.p["Saca 10 kg"]);
    const iQuilo = itens.find((i) => i.presentation_id === R1.p["Quilo"]);
    check("frete rateado pelo valor: 380/440 de 44 = 38 na saca", perto(n(iSaca?.freight_share), 38), String(iSaca?.freight_share));
    check("frete rateado pelo valor: 60/440 de 44 = 6 no quilo", perto(n(iQuilo?.freight_share), 6), String(iQuilo?.freight_share));
    check("base_quantity: 20 kg na saca, 5 no quilo", n(iSaca?.base_quantity) === 20 && n(iQuilo?.base_quantity) === 5);
    check("unit_cost da saca por kg, frete incluído: (380+38)/20 = 20,90", perto(n(iSaca?.unit_cost), 20.9), String(iSaca?.unit_cost));
    check("unit_cost do quilo: (60+6)/5 = 13,20", perto(n(iQuilo?.unit_cost), 13.2), String(iQuilo?.unit_cost));
    const lR = await linhaDaLoja(op, L1.id, R1);
    check("saldo da loja: 25 kg", n(lR?.total_qty) === 25, j(lR));
    check("avulso 5 kg", n(lR?.loose_qty) === 5, j(lR?.loose_qty));
    const sealedR = lista(lR?.sealed);
    check("lacrado: 2 sacas = 20 kg", sealedR.length === 1 && n(sealedR[0].packages) === 2 && n(sealedR[0].base_qty) === 20 && sealedR[0].presentation_id === R1.p["Saca 10 kg"], j(lR?.sealed));
    check("custo médio da loja = (418 + 66)/25 = 19,36", perto(n(lR?.average_cost), 19.36), String(lR?.average_cost));
    check("linha de saldo traz nome da loja e do produto, unidade-base", lR?.establishment_name === "M79 Loja 1" && lR?.base_unit === "quilograma" && typeof lR?.product_name === "string", j(lR));
    const movR = await movimentosDe(R1);
    const mSaca = movR.find((m) => m.package_state === "lacrado");
    const mAvul = movR.find((m) => m.package_state === "avulso");
    check("duas movimentações de compra, ligadas à compra e à loja, sem fazenda", movR.length === 2 && movR.every((m) => m.movement_type === "compra" && m.purchase_id === idR && m.establishment_id === L1.id && m.property_id === null), j(movR.map((m) => [m.movement_type, m.purchase_id, m.property_id])));
    check("lacrado grava a apresentação e a quantidade em unidade-base (20)", mSaca?.presentation_id === R1.p["Saca 10 kg"] && n(mSaca?.quantity) === 20, j([mSaca?.presentation_id, mSaca?.quantity]));
    check("avulso não grava apresentação (5)", !!mAvul && mAvul.presentation_id === null && n(mAvul.quantity) === 5);
    check("a movimentação grava o unit_cost pago por kg", perto(n(mSaca?.unit_cost), 20.9) && perto(n(mAvul?.unit_cost), 13.2));
    const eR = await entradasDe(idR);
    check("à vista: um lançamento pago de 484 (440 + 44 de frete)", eR.length === 1 && eR[0].status === "paid" && perto(n(eR[0].amount), 484) && eR[0].entry_type === "expense", j(eR.map((e) => [e.status, e.amount])));
    check("lançamento com related_module emporio, a loja e a categoria de revenda (Q62)", eR[0]?.related_module === "emporio" && eR[0]?.establishment_id === L1.id && eR[0]?.category === "Mercadorias para revenda", j([eR[0]?.related_module, eR[0]?.establishment_id, eR[0]?.category]));

    console.log("\n   Rateio com sobra de centavos (Q61)");
    const [A1, A2, A3] = [await mkProduto("Rateio a", "unidade"), await mkProduto("Rateio b", "unidade"), await mkProduto("Rateio c", "unidade")];
    const rr = await comprar(op, {
      freight: 10,
      items: [A1, A2, A3].map((x) => ({ emporio_product_id: x.id, quantity: 1, item_total: 100 })),
    });
    check("compra de 3 itens iguais com frete 10 aceita", rr.ok, j(rr));
    const shares = await db.emporioPurchaseItem.findMany({ where: { purchase_id: compraId(rr) } });
    const sh = (x: Prod) => n(shares.find((i) => i.emporio_product_id === x.id)?.freight_share);
    check("3,33, 3,33 e a sobra no último item (3,34)", perto(sh(A1), 3.33) && perto(sh(A2), 3.33) && perto(sh(A3), 3.34), j([sh(A1), sh(A2), sh(A3)]));
    check("o rateio fecha exatamente o frete", perto(sh(A1) + sh(A2) + sh(A3), 10));

    console.log("\n3. Formas de pagamento (Q62)");
    const F = await mkProduto("Forma", "quilograma");
    const itemF = [{ emporio_product_id: F.id, quantity: 10, item_total: 100 }];
    const venc = diasAdiante(30);
    const rPrazo = await comprar(op, { items: itemF, payment: { kind: "a_prazo", due_date: venc } });
    const ePrazo = await entradasDe(compraId(rPrazo));
    check("a prazo: um lançamento pendente de 100 com o vencimento", rPrazo.ok && ePrazo.length === 1 && ePrazo[0].status === "pending" && perto(n(ePrazo[0].amount), 100) && ePrazo[0].due_date?.toISOString().slice(0, 10) === venc.toISOString().slice(0, 10), j(ePrazo.map((e) => [e.status, e.amount, e.due_date])));
    const d1 = diasAdiante(30);
    const d2 = diasAdiante(60);
    const rParc = await comprar(op, {
      items: itemF,
      payment: { kind: "parcelada", down_payment: 20, installments: [{ amount: 40, due_date: d1 }, { amount: 40, due_date: d2 }] },
    });
    const eParc = await entradasDe(compraId(rParc));
    const pagas = eParc.filter((e) => e.status === "paid");
    const pend = eParc.filter((e) => e.status === "pending");
    check("parcelada com entrada: uma entrada paga (20) e duas pendentes (40)", rParc.ok && eParc.length === 3 && pagas.length === 1 && perto(n(pagas[0].amount), 20) && pend.length === 2 && pend.every((e) => perto(n(e.amount), 40)), j(eParc.map((e) => [e.status, e.amount])));
    check("todos com módulo emporio, id da compra e a loja", eParc.every((e) => e.related_module === "emporio" && e.related_id === compraId(rParc) && e.establishment_id === L1.id) && ePrazo.every((e) => e.establishment_id === L1.id && e.related_id === compraId(rPrazo)));
    const rSemEntrada = await comprar(op, { items: itemF, payment: { kind: "parcelada", installments: [{ amount: 50, due_date: d1 }, { amount: 50, due_date: d2 }] } });
    const eSE = await entradasDe(compraId(rSemEntrada));
    check("parcelada sem entrada: duas pendentes de 50", rSemEntrada.ok && eSE.length === 2 && eSE.every((e) => e.status === "pending" && perto(n(e.amount), 50)));

    const kBad = `m79-ruim-${stamp}`;
    const rBad = await comprar(op, { operation_key: kBad, items: itemF, payment: { kind: "parcelada", down_payment: 20, installments: [{ amount: 30, due_date: d1 }, { amount: 40, due_date: d2 }] } });
    check("parcelas que não fecham (20 + 70 contra 100): 422 em installments", recusa(rBad, "VALIDATION_ERROR", 422, "installments"), j(rBad));
    check("a recusa não deixou compra nem lançamento", (await db.emporioPurchase.count({ where: { operation_key: kBad } })) === 0);
    const rBadFrete = await comprar(op, { freight: 10, items: itemF, payment: { kind: "parcelada", installments: [{ amount: 50, due_date: d1 }, { amount: 50, due_date: d2 }] } });
    check("parcelas que esquecem o frete (100 contra 110): 422 em installments", recusa(rBadFrete, "VALIDATION_ERROR", 422, "installments"), j(rBadFrete));
    const rOkFrete = await comprar(op, { freight: 10, items: itemF, payment: { kind: "parcelada", installments: [{ amount: 55, due_date: d1 }, { amount: 55, due_date: d2 }] } });
    check("parcelas que fecham com o frete (110): aceitas", rOkFrete.ok, j(rOkFrete));

    console.log("\n4. Compra não recebida (Q38)");
    const N = await mkProduto("Chegando", "quilograma");
    const rLim = await ee("definirLimitesAction", admin, { establishment_id: L1.id, emporio_product_id: N.id, min_qty: 25, max_qty: 50 });
    check("ADMIN define limites 25 e 50", rLim.ok, j(rLim));
    const rN = await comprar(op, { received: false, items: [{ emporio_product_id: N.id, quantity: 20, item_total: 200 }], payment: { kind: "a_prazo", due_date: venc } });
    const idN = compraId(rN);
    check("compra registrada antes de chegar", rN.ok && dados(rN)?.received_at == null, j(rN));
    check("a conta a pagar nasce na hora (pendente, 200)", (await entradasDe(idN)).length === 1);
    check("o saldo não muda", (await total(L1.id, N)) === 0);
    check("não gerou movimentação de estoque", (await movimentosDe(N)).length === 0);
    const repor = async (ator: Ator, opts?: Dado) => lista(dados(await ee("precisaReporAction", ator, opts)));
    const acha = (ls: Dado[], est: string, prod: Prod) => ls.find((l) => l.establishment_id === est && l.emporio_product_id === prod.id);
    let lr = acha(await repor(op), L1.id, N);
    check("a não recebida conta na sugestão: 50 - (0 + 20) = 30", !!lr && perto(n(lr.suggested_qty), 30), j(lr));
    const rRec = await pp("receberCompraAction", op, idN, {});
    check("receber põe no estoque", rRec.ok && (await total(L1.id, N)) === 20, j(rRec));
    check("receber gerou a movimentação de compra ligada à compra", (await movimentosDe(N, { purchase_id: idN })).length === 1);
    check("receber de novo: 409 ALREADY_RECEIVED", recusa(await pp("receberCompraAction", op, idN, {}), "ALREADY_RECEIVED", 409));
    check("e o saldo segue 20", (await total(L1.id, N)) === 20);
    lr = acha(await repor(op), L1.id, N);
    check("recebida deixa de contar como pendente: sugestão 30 (não 10)", !!lr && perto(n(lr.suggested_qty), 30), j(lr));

    console.log("\n5. Chave de operação (Q70)");
    const K = await mkProduto("Chave", "quilograma");
    const chave = `m79-dup-${stamp}`;
    const corpo = { operation_key: chave, items: [{ emporio_product_id: K.id, quantity: 7, item_total: 70 }], payment: { kind: "a_vista" } };
    const k1 = await comprar(op, corpo);
    const k2 = await comprar(op, corpo);
    check("as duas chamadas ok, com a mesma compra", k1.ok && k2.ok && compraId(k1) === compraId(k2), j([k1, k2]));
    check("uma compra só", (await db.emporioPurchase.count({ where: { operation_key: chave } })) === 1);
    check("um lançamento só", (await entradasDe(compraId(k1))).length === 1);
    check("uma movimentação só, saldo 7", (await movimentosDe(K)).length === 1 && (await total(L1.id, K)) === 7);

    console.log("\n6. Cancelar (Q63)");
    const X = await mkProduto("Cancela", "quilograma");
    const rX = await comprar(op, { items: [{ emporio_product_id: X.id, quantity: 8, item_total: 80 }], payment: { kind: "a_prazo", due_date: venc } });
    const idX = compraId(rX);
    check("antes: saldo 8", (await total(L1.id, X)) === 8);
    check("OPERADOR cancela: 403", recusa(await pp("cancelarCompraAction", op, idX, { reason: "erro" }), "FORBIDDEN", 403));
    check("e nada mudou (saldo 8)", (await total(L1.id, X)) === 8);
    const rCx = await pp("cancelarCompraAction", admin, idX, { reason: "lançada errada" });
    check("ADMIN cancela compra sem pagamento", rCx.ok, j(rCx));
    check("saldo volta a 0", (await total(L1.id, X)) === 0);
    const eX = await entradasDe(idX);
    check("a conta a pagar é cancelada, e continua existindo", eX.length === 1 && eX[0].status === "cancelled", j(eX.map((e) => e.status)));
    const mX = await movimentosDe(X);
    check("nada é apagado: a movimentação continua, marcada cancelada", mX.length === 1 && mX[0].canceled_at !== null);
    const pX = await db.emporioPurchase.findUnique({ where: { id: idX } });
    check("a compra guarda canceled_at e o motivo", !!pX?.canceled_at && pX?.canceled_reason === "lançada errada", j([pX?.canceled_at, pX?.canceled_reason]));
    const Y = await mkProduto("Cancela paga", "quilograma");
    const rY = await comprar(op, { items: [{ emporio_product_id: Y.id, quantity: 4, item_total: 40 }], payment: { kind: "a_vista" } });
    check("compra à vista (paga): cancelar é 409 PURCHASE_HAS_PAYMENT", recusa(await pp("cancelarCompraAction", admin, compraId(rY), { reason: "x" }), "PURCHASE_HAS_PAYMENT", 409));
    check("e o saldo segue 4, o lançamento segue pago", (await total(L1.id, Y)) === 4 && (await entradasDe(compraId(rY)))[0].status === "paid");
    const Z = await mkProduto("Cancela antes de chegar", "quilograma");
    const rZ = await comprar(op, { received: false, items: [{ emporio_product_id: Z.id, quantity: 4, item_total: 40 }], payment: { kind: "a_prazo", due_date: venc } });
    check("cancelar a que não chegou: ok, sem mexer no saldo", (await pp("cancelarCompraAction", admin, compraId(rZ), { reason: "desistiu" })).ok && (await total(L1.id, Z)) === 0);
    check("VISUALIZADOR registra compra: 403", recusa(await comprar(visu, { items: itemF }), "FORBIDDEN", 403));

    console.log("\n7. Lacrado e avulso (Q65)");
    const M = await mkProduto("Milho", "quilograma", [["Saca 10 kg", 10, true], ["Saca 40 kg", 40, true], ["Quilo", 1, false]]);
    const rM = await comprar(op, {
      items: [
        { emporio_product_id: M.id, presentation_id: M.p["Saca 10 kg"], quantity: 3, item_total: 300 },
        { emporio_product_id: M.id, presentation_id: M.p["Saca 40 kg"], quantity: 1, item_total: 400 },
        { emporio_product_id: M.id, presentation_id: M.p["Quilo"], quantity: 4, item_total: 40 },
      ],
    });
    check("compra com duas apresentações fechadas e uma aberta", rM.ok, j(rM));
    const lM = await linhaDaLoja(op, L1.id, M);
    const sM = lista(lM?.sealed);
    const s10 = sM.find((s) => s.presentation_id === M.p["Saca 10 kg"]);
    const s40 = sM.find((s) => s.presentation_id === M.p["Saca 40 kg"]);
    check("duas linhas lacradas, uma por apresentação", sM.length === 2, j(lM?.sealed));
    check("Saca 10 kg: 3 embalagens, 30 kg", n(s10?.packages) === 3 && n(s10?.base_qty) === 30, j(s10));
    check("Saca 40 kg: 1 embalagem, 40 kg", n(s40?.packages) === 1 && n(s40?.base_qty) === 40, j(s40));
    check("avulso 4 e total 74 (soma das duas partes)", n(lM?.loose_qty) === 4 && n(lM?.total_qty) === 74, j([lM?.loose_qty, lM?.total_qty]));

    const S = await mkProduto("Sem separação", "quilograma", [["Caixa 12 kg", 12, true]]);
    const rS = await comprar(op, { items: [{ emporio_product_id: S.id, presentation_id: S.p["Caixa 12 kg"], quantity: 2, item_total: 120 }] });
    check("produto sem avulso e lacrado: a compra é aceita", rS.ok, j(rS));
    const mS = await movimentosDe(S);
    check("grava sem estado (package_state e presentation_id nulos) e em unidade-base (24)", mS.length === 1 && mS[0].package_state === null && mS[0].presentation_id === null && n(mS[0].quantity) === 24, j(mS.map((m) => [m.package_state, m.presentation_id, m.quantity])));
    check("o saldo é só total (24), sem linhas lacradas", (await total(L1.id, S)) === 24 && lista((await linhaDaLoja(op, L1.id, S))?.sealed).length === 0);
    const rSl = await ee("implantarEstoqueAction", op, { establishment_id: L2.id, emporio_product_id: S.id, sealed: [{ presentation_id: S.p["Caixa 12 kg"], packages: 1 }], loose_qty: 0 });
    check("quantidade lacrada em produto sem separação: 422 em sealed", recusa(rSl, "VALIDATION_ERROR", 422, "sealed"), j(rSl));
    check("e nada foi gravado", (await total(L2.id, S)) === 0);
    const U = await mkProduto("Unitário", "unidade");
    const rU = await comprar(op, { items: [{ emporio_product_id: U.id, quantity: 1.5, item_total: 15 }] });
    check("quantidade fracionada em unidade-base unidade: 422", recusa(rU, "VALIDATION_ERROR", 422), j(rU));
    const rZero = await comprar(op, { items: [{ emporio_product_id: F.id, quantity: 0, item_total: 10 }] });
    check("quantidade zero na compra: 422", recusa(rZero, "VALIDATION_ERROR", 422), j(rZero));
    const rNeg = await comprar(op, { items: [{ emporio_product_id: F.id, quantity: -2, item_total: 10 }] });
    check("quantidade negativa na compra: 422", recusa(rNeg, "VALIDATION_ERROR", 422), j(rNeg));

    console.log("\n8. Implantação (Q69)");
    const I = await mkProduto("Implantado", "quilograma", [["Saca 10 kg", 10, true], ["Quilo", 1, false]]);
    const rI = await ee("implantarEstoqueAction", op, { establishment_id: L1.id, emporio_product_id: I.id, sealed: [{ presentation_id: I.p["Saca 10 kg"], packages: 2 }], loose_qty: 3, unit_cost: 10 });
    check("OPERADOR implanta (2 sacas + 3 kg avulsos, custo 10)", rI.ok, j(rI));
    const lI = await linhaDaLoja(op, L1.id, I);
    check("saldo 23: 20 lacrado e 3 avulso", n(lI?.total_qty) === 23 && n(lI?.loose_qty) === 3 && n(lista(lI?.sealed)[0]?.packages) === 2, j(lI));
    const mI = await movimentosDe(I);
    check("movimentações do tipo implantacao com o custo 10", mI.length === 2 && mI.every((m) => m.movement_type === "implantacao" && perto(n(m.unit_cost), 10)), j(mI.map((m) => [m.movement_type, m.unit_cost])));
    check("com custo informado: não é estimado e a média é 10", lI?.estimated === false && perto(n(lI?.average_cost), 10), j([lI?.estimated, lI?.average_cost]));
    const rI2 = await ee("implantarEstoqueAction", op, { establishment_id: L1.id, emporio_product_id: I.id, sealed: [], loose_qty: 5, unit_cost: 10 });
    check("segunda implantação (mesma loja e produto): 409 ALREADY_IMPLANTED", recusa(rI2, "ALREADY_IMPLANTED", 409), j(rI2));
    check("e o saldo segue 23", (await total(L1.id, I)) === 23);
    const rI3 = await ee("implantarEstoqueAction", op, { establishment_id: L2.id, emporio_product_id: I.id, sealed: [], loose_qty: 6 });
    check("outra loja pode implantar o mesmo produto, sem custo", rI3.ok, j(rI3));
    const lI3 = await linhaDaLoja(op, L2.id, I);
    check("sem custo: a linha vem marcada estimated", lI3?.estimated === true && n(lI3?.total_qty) === 6, j(lI3));
    check("a implantação de uma loja não mexe na outra", (await total(L1.id, I)) === 23);

    console.log("\n9. Contagem");
    const rCt = await ee("registrarContagemAction", op, { establishment_id: L1.id, emporio_product_id: I.id, sealed: [{ presentation_id: I.p["Saca 10 kg"], packages: 1 }], loose_qty: 3, reason: "conferência de balcão" });
    check("OPERADOR conta 1 saca + 3 kg (físico 13 contra 23)", rCt.ok, j(rCt));
    const lCt = await linhaDaLoja(op, L1.id, I);
    check("o saldo vira o físico: 13, com 1 saca e 3 avulsos", n(lCt?.total_qty) === 13 && n(lCt?.loose_qty) === 3 && n(lista(lCt?.sealed)[0]?.packages) === 1, j(lCt));
    const aj = await movimentosDe(I, { movement_type: "ajuste" });
    check("grava ajuste com o saldo anterior e o corrigido", aj.length >= 1 && aj.every((m) => m.previous_balance !== null && m.corrected_balance !== null), j(aj.map((m) => [m.previous_balance, m.corrected_balance, m.quantity])));
    check("o ajuste move para menos: anterior maior que o corrigido", aj.some((m) => n(m.previous_balance) > n(m.corrected_balance)), j(aj.map((m) => [m.previous_balance, m.corrected_balance])));
    const rCtSem = await ee("registrarContagemAction", op, { establishment_id: L1.id, emporio_product_id: I.id, sealed: [], loose_qty: 0, reason: "" });
    check("motivo vazio: 422 em reason", recusa(rCtSem, "VALIDATION_ERROR", 422, "reason"), j(rCtSem));
    check("e o saldo não mudou (13)", (await total(L1.id, I)) === 13);
    const rCtNeg = await ee("registrarContagemAction", op, { establishment_id: L1.id, emporio_product_id: I.id, sealed: [], loose_qty: -1, reason: "x" });
    check("físico negativo: 422", recusa(rCtNeg, "VALIDATION_ERROR", 422), j(rCtNeg));
    check("VISUALIZADOR conta: 403", recusa(await ee("registrarContagemAction", visu, { establishment_id: L1.id, emporio_product_id: I.id, sealed: [], loose_qty: 0, reason: "x" }), "FORBIDDEN", 403));

    console.log("\n10. Perda (Q66)");
    const L = await mkProduto("Perdível", "quilograma");
    await comprar(op, { purchased_at: minutos(30), items: [{ emporio_product_id: L.id, quantity: 10, item_total: 40 }] });
    await comprar(op, { purchased_at: minutos(20), items: [{ emporio_product_id: L.id, quantity: 10, item_total: 60 }] });
    check("duas compras (4 e 6 por kg): média 5, saldo 20", perto(n((await linhaDaLoja(op, L1.id, L))?.average_cost), 5) && (await total(L1.id, L)) === 20);
    const rPerda = await ee("registrarPerdaAction", op, { establishment_id: L1.id, emporio_product_id: L.id, quantity: 4, reason: "vencido", notes: "lote velho" });
    check("OPERADOR registra perda de 4 kg", rPerda.ok, j(rPerda));
    const mPerda = (await movimentosDe(L, { movement_type: "perda" }))[0];
    check("a perda sai pelo custo médio: unit_cost 5", !!mPerda && perto(n(mPerda.unit_cost), 5) && mPerda.loss_reason === "vencido", j([mPerda?.unit_cost, mPerda?.loss_reason]));
    check("saldo 16 e a média segue 5", (await total(L1.id, L)) === 16 && perto(n((await linhaDaLoja(op, L1.id, L))?.average_cost), 5));
    const rAcima = await ee("registrarPerdaAction", op, { establishment_id: L1.id, emporio_product_id: L.id, quantity: 17, reason: "furto" });
    check("perda acima do saldo (17 contra 16): 409 INSUFFICIENT_STOCK em quantity", recusa(rAcima, "INSUFFICIENT_STOCK", 409, "quantity"), j(rAcima));
    check("e o saldo segue 16", (await total(L1.id, L)) === 16);
    check("perda exatamente do saldo (16) é aceita", (await ee("registrarPerdaAction", op, { establishment_id: L1.id, emporio_product_id: L.id, quantity: 16, reason: "avaria" })).ok && (await total(L1.id, L)) === 0);
    check("perda de zero: 422", recusa(await ee("registrarPerdaAction", op, { establishment_id: L1.id, emporio_product_id: L.id, quantity: 0, reason: "avaria" }), "VALIDATION_ERROR", 422));
    await comprar(op, { establishment_id: L3.id, items: [{ emporio_product_id: L.id, quantity: 2, item_total: 20 }] });
    const rNeg3 = await ee("registrarPerdaAction", op, { establishment_id: L3.id, emporio_product_id: L.id, quantity: 5, reason: "outro" });
    check("loja com allow_negative_stock aceita a perda acima do saldo", rNeg3.ok, j(rNeg3));
    check("e o saldo vira -3", (await total(L3.id, L)) === -3);
    check("VISUALIZADOR registra perda: 403", recusa(await ee("registrarPerdaAction", visu, { establishment_id: L1.id, emporio_product_id: L.id, quantity: 1, reason: "outro" }), "FORBIDDEN", 403));

    console.log("\n11. Limites e reposição (Q67)");
    const Q = await mkProduto("Com limites", "quilograma");
    const QsoMin = await mkProduto("Só mínimo", "quilograma");
    const QsoMax = await mkProduto("Só máximo", "quilograma");
    const rInv = await ee("definirLimitesAction", admin, { establishment_id: L1.id, emporio_product_id: Q.id, min_qty: 10, max_qty: 5 });
    check("min_qty maior que max_qty: 422 em max_qty", recusa(rInv, "VALIDATION_ERROR", 422, "max_qty"), j(rInv));
    check("OPERADOR define limites: 403", recusa(await ee("definirLimitesAction", op, { establishment_id: L1.id, emporio_product_id: Q.id, min_qty: 1, max_qty: 5 }), "FORBIDDEN", 403));
    check("a recusa não gravou limite", (await db.stockLimit.count({ where: { emporio_product_id: Q.id } })) === 0);
    check("min = max é aceito", (await ee("definirLimitesAction", owner, { establishment_id: L1.id, emporio_product_id: Q.id, min_qty: 5, max_qty: 5 })).ok);
    check("OWNER/ADMIN definem (10 a 50 na Loja 1)", (await ee("definirLimitesAction", admin, { establishment_id: L1.id, emporio_product_id: Q.id, min_qty: 10, max_qty: 50 })).ok && (await db.stockLimit.count({ where: { emporio_product_id: Q.id } })) === 1);
    check("limite é por loja (2 a 20 na Loja 2)", (await ee("definirLimitesAction", admin, { establishment_id: L2.id, emporio_product_id: Q.id, min_qty: 2, max_qty: 20 })).ok && (await db.stockLimit.count({ where: { emporio_product_id: Q.id } })) === 2);
    await ee("definirLimitesAction", admin, { establishment_id: L1.id, emporio_product_id: QsoMin.id, min_qty: 10, max_qty: null });
    await ee("definirLimitesAction", admin, { establishment_id: L1.id, emporio_product_id: QsoMax.id, min_qty: null, max_qty: 50 });
    let rep = await repor(op, { establishment_id: L1.id });
    let lq = acha(rep, L1.id, Q);
    check("saldo 0 (<= mínimo 10): entra, sugestão = 50", !!lq && perto(n(lq.suggested_qty), 50) && lq.needs_restock === true, j(lq));
    check("sem máximo: entra e a sugestão é nula", acha(rep, L1.id, QsoMin)?.suggested_qty === null, j(acha(rep, L1.id, QsoMin)));
    check("sem mínimo: não entra", !acha(rep, L1.id, QsoMax));
    await comprar(op, { items: [{ emporio_product_id: Q.id, quantity: 6, item_total: 60 }] });
    await comprar(op, { received: false, items: [{ emporio_product_id: Q.id, quantity: 5, item_total: 50 }], payment: { kind: "a_prazo", due_date: venc } });
    rep = await repor(op, { establishment_id: L1.id });
    lq = acha(rep, L1.id, Q);
    check("saldo 6 e 5 a caminho: sugestão = 50 - (6 + 5) = 39", !!lq && perto(n(lq.suggested_qty), 39), j(lq));
    await comprar(op, { items: [{ emporio_product_id: Q.id, quantity: 100, item_total: 500 }] });
    check("saldo acima do mínimo: sai da lista", !acha(await repor(op, { establishment_id: L1.id }), L1.id, Q));
    await comprar(op, { establishment_id: L2.id, items: [{ emporio_product_id: Q.id, quantity: 1, item_total: 5 }] });
    const repL2 = await repor(op, { establishment_id: L2.id });
    lq = acha(repL2, L2.id, Q);
    check("Loja 2 (mín. 2, saldo 1): entra com o limite dela, sugestão 19", !!lq && perto(n(lq.suggested_qty), 19), j(lq));
    check("a lista da Loja 2 não traz linha da Loja 1", repL2.every((l) => l.establishment_id === L2.id));
    const R3 = await mkProduto("Só na loja 1", "quilograma");
    await ee("definirLimitesAction", admin, { establishment_id: L1.id, emporio_product_id: R3.id, min_qty: 10, max_qty: 20 });
    check("produto com limite só na Loja 1 não entra na lista da Loja 2", !acha(await repor(op, { establishment_id: L2.id }), L2.id, R3) && !!acha(await repor(op, { establishment_id: L1.id }), L1.id, R3));
    check("sem filtro de loja, traz as lojas visíveis (L1 e L2 para Q? L1 saiu, L2 fica)", !!acha(await repor(op), L2.id, Q));

    console.log("\n12. Lista de compra (Q68)");
    const rEnc = await ee("encaminharParaListaAction", op, { establishment_id: L1.id, emporio_product_id: R3.id, quantity: 30 });
    check("OPERADOR encaminha à Lista", rEnc.ok, j(rEnc));
    const itensLista = await db.shoppingItem.findMany({ where: { product_id: R3.product_id } });
    check("cria o ShoppingItem com a loja e a quantidade", itensLista.length >= 1 && itensLista[0].establishment_id === L1.id && n(itensLista[0].quantity) === 30 && itensLista[0].status === "pendente", j(itensLista.map((i) => [i.establishment_id, i.quantity, i.status])));
    check("VISUALIZADOR encaminha: 403", recusa(await ee("encaminharParaListaAction", visu, { establishment_id: L1.id, emporio_product_id: R3.id, quantity: 1 }), "FORBIDDEN", 403));
    const item = itensLista[0];
    const antes = await total(L1.id, R3);
    const rComp = await registrarCompraDoItemAction(db, item.id, { amount: 90, quantity: 30, pago: true, recorded_by_user_id: op.id, establishment_id: L1.id } as never) as R;
    check("\"comprei\" do item com loja funciona", rComp.ok, j(rComp));
    const mComp = await movimentosDe(R3, { movement_type: "compra" });
    check("cria compra recebida NA LOJA (movimentação com purchase_id e a loja, sem fazenda)", mComp.length === 1 && mComp[0].establishment_id === L1.id && mComp[0].property_id === null && mComp[0].purchase_id !== null, j(mComp.map((m) => [m.establishment_id, m.property_id, m.purchase_id])));
    check("o saldo da loja subiu 30", (await total(L1.id, R3)) === antes + 30, String(await total(L1.id, R3)));
    const idLista = mComp[0]?.purchase_id ?? "";
    const eLista = await entradasDe(idLista);
    check("com lançamento emporio pago de 90 na loja", eLista.length === 1 && eLista[0].status === "paid" && perto(n(eLista[0].amount), 90) && eLista[0].establishment_id === L1.id, j(eLista.map((e) => [e.status, e.amount, e.establishment_id])));
    check("o item sai da Lista (comprado)", (await db.shoppingItem.findUnique({ where: { id: item.id } }))?.status === "comprado");
    const rRep = await registrarCompraDoItemAction(db, item.id, { amount: 90, quantity: 30, pago: true, recorded_by_user_id: op.id, establishment_id: L1.id } as never) as R;
    check("repetir o \"comprei\": recusado", !rRep.ok, j(rRep));
    check("e não duplica compra, movimentação, lançamento nem saldo", (await movimentosDe(R3, { movement_type: "compra" })).length === 1 && (await total(L1.id, R3)) === antes + 30 && (await entradasDe(idLista)).length === 1);

    console.log("\n13. A fazenda não enxerga o Empório");
    const vistos = new Set((await listProductsWithBalance(db)).map((p) => p.id));
    check("listProductsWithBalance não traz produto algum só de loja", emporioProdIds.every((id) => !vistos.has(id)), j(emporioProdIds.filter((id) => vistos.has(id))));
    const posicoes = (await getStockBalance(db, {})) as Dado[];
    check("getStockBalance da fazenda não traz produto de loja", posicoes.every((p) => !emporioProdIds.includes(p.product_id ?? p.id)), j(posicoes.filter((p) => emporioProdIds.includes(p.product_id ?? p.id)).length));
    const posUm = (await getStockBalance(db, { product_id: M.product_id })) as Dado[];
    check("nem filtrando pelo produto (Milho tem 74 em loja): saldo da fazenda zero", posUm.every((p) => n(p.saldo ?? p.balance ?? p.quantity ?? 0) === 0), j(posUm));

    console.log("\n14. Vínculo (Q56) e isolamento");
    const rC2 = await comprar(op, { establishment_id: L2.id, items: [{ emporio_product_id: M.id, quantity: 2, item_total: 20 }] });
    const idL2 = compraId(rC2);
    const rC1 = await comprar(op, { establishment_id: L1.id, items: [{ emporio_product_id: M.id, quantity: 2, item_total: 20 }] });
    const idL1 = compraId(rC1);
    check("compras de teste nas duas lojas", rC1.ok && rC2.ok, j([rC1, rC2]));
    check("vincular o usuário à Loja 1", (await cc("definirVinculosAction", owner, L1.id, [vinc.id])).ok);
    check("vinculado lê o saldo da Loja 1", (await ee("saldoDaLojaAction", vinc, L1.id)).ok);
    check("vinculado: saldo da Loja 2 = 404", recusa(await ee("saldoDaLojaAction", vinc, L2.id), "NOT_FOUND", 404));
    check("vinculado: lê a compra da Loja 1", (await pp("lerCompraAction", vinc, idL1)).ok);
    check("vinculado: compra da Loja 2 = 404", recusa(await pp("lerCompraAction", vinc, idL2), "NOT_FOUND", 404));
    check("vinculado: criar compra na Loja 2 = 404", recusa(await comprar(vinc, { establishment_id: L2.id, items: itemF }), "NOT_FOUND", 404));
    check("vinculado: perda na Loja 2 = 404", recusa(await ee("registrarPerdaAction", vinc, { establishment_id: L2.id, emporio_product_id: I.id, quantity: 1, reason: "outro" }), "NOT_FOUND", 404));
    check("vinculado: receber/cancelar compra da Loja 2 = 404", recusa(await pp("cancelarCompraAction", vinc, idL2, { reason: "x" }), "NOT_FOUND", 404));
    const listaVinc = lista(dados(await pp("listarComprasAction", vinc)));
    check("vinculado: a lista de compras só traz a Loja 1", listaVinc.length > 0 && listaVinc.every((c) => c.establishment_id === L1.id), j(listaVinc.map((c) => c.establishment_id)));
    const porProduto = dados(await ee("saldoDoProdutoAction", vinc, M.id));
    const linhasProd = lista(porProduto?.stores ?? porProduto?.lojas ?? porProduto?.items ?? porProduto);
    const lojasVistas = new Set(linhasProd.map((l) => l.establishment_id).filter(Boolean));
    check("vinculado: saldo do produto em todas as lojas só mostra a Loja 1", lojasVistas.size === 1 && lojasVistas.has(L1.id), j([...lojasVistas]));
    const consVinc = lista(dados(await ee("estoqueConsolidadoAction", vinc)));
    const cm = consVinc.find((l) => (l.emporio_product_id ?? l.id) === M.id);
    check("vinculado: o consolidado soma só o que ele vê (Milho 74 + 2 da Loja 1 = 76, sem os 2 da Loja 2)", !cm || n(cm.total_qty) === 76, j(cm));
    const consAdmin = lista(dados(await ee("estoqueConsolidadoAction", admin)));
    const cma = consAdmin.find((l) => (l.emporio_product_id ?? l.id) === M.id);
    check("sem vínculo, o consolidado soma tudo (Milho 78)", !!cma && n(cma.total_qty) === 78, j(cma));
    const vL2 = await repor(vinc);
    check("vinculado: a reposição não traz a Loja 2", vL2.every((l) => l.establishment_id === L1.id));

    const pb = (nome: string, ...a: unknown[]) => chamarEm(P, dbB, nome, ...a);
    const eb = (nome: string, ...a: unknown[]) => chamarEm(E, dbB, nome, ...a);
    check("B lê saldo da loja de A: 404", recusa(await eb("saldoDaLojaAction", ownerB, L1.id), "NOT_FOUND", 404));
    check("B lê compra de A: 404", recusa(await pb("lerCompraAction", ownerB, idL1), "NOT_FOUND", 404));
    check("B cancela compra de A: 404", recusa(await pb("cancelarCompraAction", ownerB, idL1, { reason: "x" }), "NOT_FOUND", 404));
    check("B recebe compra de A: 404", recusa(await pb("receberCompraAction", ownerB, idN, {}), "NOT_FOUND", 404));
    check("B compra na loja de A: 404", recusa(await pb("criarCompraAction", ownerB, { operation_key: `m79-b-${stamp}`, establishment_id: L1.id, purchased_at: new Date(), received: true, freight: 0, payment: { kind: "a_vista" }, items: [{ emporio_product_id: F.id, quantity: 1, item_total: 1 }] }), "NOT_FOUND", 404));
    check("B implanta produto de A: 404", recusa(await eb("implantarEstoqueAction", ownerB, { establishment_id: L1.id, emporio_product_id: F.id, sealed: [], loose_qty: 1 }), "NOT_FOUND", 404));
    check("B define limite com ids de A: 404", recusa(await eb("definirLimitesAction", ownerB, { establishment_id: L1.id, emporio_product_id: F.id, min_qty: 1, max_qty: 2 }), "NOT_FOUND", 404));
    check("B não vê compras de A", lista(dados(await pb("listarComprasAction", ownerB))).length === 0);
    check("B não vê estoque consolidado de A", lista(dados(await eb("estoqueConsolidadoAction", ownerB))).length === 0);
    check("B não vê reposição de A", lista(dados(await eb("precisaReporAction", ownerB))).length === 0);
    const rLojaB = await chamarEm(C, dbB, "criarEstabelecimentoAction", ownerB, { name: "M79 Loja B", kind: "ponto_venda" });
    const rProdB = await chamarEm(C, dbB, "criarProdutoEmporioAction", ownerB, { name: "M79 Produto B", category_id: catB.id, base_unit: "quilograma" });
    check("B monta o próprio Empório", rLojaB.ok && rProdB.ok, j([rLojaB, rProdB]));
    const mesmaChave = await pb("criarCompraAction", ownerB, { operation_key: chave, establishment_id: dados(rLojaB)?.id, purchased_at: new Date(), received: true, freight: 0, payment: { kind: "a_vista" }, items: [{ emporio_product_id: dados(rProdB)?.id, quantity: 1, item_total: 5 }] });
    check("a chave de operação é por conta: B grava a mesma chave de A como compra própria", mesmaChave.ok && compraId(mesmaChave) !== compraId(k1), j(mesmaChave));
    check("e a compra de A (mesma chave) segue com 7 kg", (await total(L1.id, K)) === 7);
    check("nada de A foi alterado por B (saldo da Ração)", (await total(L1.id, R1)) === 25);
  } finally {
    for (const id of tenantIds) {
      try {
        await prisma.stockMovement.deleteMany({ where: { tenant_id: id } });
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

puras()
  .catch((e) => {
    falhas += 1;
    console.log(`  ❌ as puras quebraram: ${e instanceof Error ? e.message : String(e)}`);
  })
  .then(() => comBanco())
  .catch((e) => {
    falhas += 1;
    console.log(`  ❌ a suíte quebrou: ${e instanceof Error ? e.message : String(e)}`);
  })
  .finally(() => {
    console.log(falhas === 0 ? "\n✅ M79 verde" : `\n❌ M79: ${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  });
