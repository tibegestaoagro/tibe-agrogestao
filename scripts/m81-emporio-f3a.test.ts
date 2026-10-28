import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F3a: venda em dinheiro, PIX e fiado, recebimento de
 * fiado, gaveta e contas, cancelamento, devolução e troca.
 * Roda: `npm run test:m81`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F3a: contrato", Q18,
 * Q27, Q31, Q32, Q36, Q37, Q54, Q64, Q81 a Q87 e o aceite da F3), sem ler a
 * implementação. Chama as actions direto (como a m80), sem rota. Os módulos
 * novos entram por `import()` com especificador em variável, para o arquivo
 * compilar antes de eles existirem.
 *
 * O que o contrato calava e esta suíte ASSUME:
 * - `venderAction`, `devolverAction` e `trocarAction` devolvem `data.id` (com
 *   plano B pela `operation_key` no banco); a troca devolve a venda nova em
 *   `data.sale` ou `data.venda` ou `data.new_sale` (plano B: o banco, pela
 *   `exchange_return_id`);
 * - na troca, `payments` da venda nova cobre só o RESTO (o pagamento `troca`
 *   o servidor acrescenta), e `payments: []` é aceito quando V cobre tudo;
 * - o lançamento da devolução (despesa) tem `related_id` = id da devolução;
 * - `lerCaixaAction` traz objetos com `establishment_id` ou `bank_account_id`
 *   e um número em `balance` ou `saldo`, em qualquer profundidade;
 * - `listarFiadoAction` traz, por cliente, `contact_id` e um número de dívida
 *   (`owed`, `due`, `devido`, `balance`, `open_amount` ou `amount_due`);
 * - recusas de saldo inicial repetido/negativo: só se exige `!ok`;
 * - o lojista com vínculo a outra loja recebe 404 NOT_FOUND (padrão da m80).
 * Fora do alcance de action: "recurso desligado dá 404" (é do guard da rota).
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
const DIA = 86_400_000;

console.log("🛒 M81: Módulo 39 (Meu Empório), F3a: venda, fiado, caixa, cancelamento, devolução e troca\n");

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
        data: { name: `M81 ${rotulo} ${stamp}`, document: `M81${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
      });
      tenantIds.push(t.id);
      const mkUser = async (suf: string, role: Role): Promise<Ator> => {
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M81 ${rotulo} ${suf}`, email: `m81-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role },
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
    const userO = await TA.mkUser("uo", "OPERADOR");
    const ownerB = await TB.mkUser("own", "OWNER");
    const db = prismaForTenant(TA.t.id);
    const dbB = prismaForTenant(TB.t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M81 categoria" }) });

    const dados = (r: R): Dado => (r.ok ? r.data : undefined);
    const lista = (d: Dado): Dado[] => (Array.isArray(d) ? d : (d?.items ?? []));
    const chamarEm = (mod: Record<string, Acao>, cliente: Dado, nome: string, ...args: unknown[]) => {
      const f = mod[nome];
      if (typeof f !== "function") return Promise.reject(new Error(`action ausente: ${nome}`));
      return f(cliente, ...args);
    };
    const cc = (nome: string, ...a: unknown[]) => chamarEm(C, db, nome, ...a);
    const ee = (nome: string, ...a: unknown[]) => chamarEm(E, db, nome, ...a);
    const vv = (nome: string, ...a: unknown[]) => chamarEm(V, db, nome, ...a);
    const xx = (nome: string, ...a: unknown[]) => chamarEm(X, db, nome, ...a);

    // ---- Lojas
    const rL1 = await cc("criarEstabelecimentoAction", owner, { name: "M81 Loja 1", kind: "ponto_venda" });
    const rL2 = await cc("criarEstabelecimentoAction", owner, { name: "M81 Loja 2", kind: "ponto_venda" });
    const rL3 = await cc("criarEstabelecimentoAction", owner, { name: "M81 Loja 3 negativa", kind: "ponto_venda" });
    const L1 = dados(rL1);
    const L2 = dados(rL2);
    const L3 = dados(rL3);
    if (!L1 || !L2 || !L3) throw new Error(`não criou as lojas: ${j([rL1, rL2, rL3])}`);
    await prisma.establishment.update({ where: { id: L1.id }, data: { max_discount_pct: 10 } });
    await prisma.establishment.update({ where: { id: L3.id }, data: { allow_negative_stock: true } });

    type Prod = { id: string; product_id: string; p: Record<string, string> };
    let seq = 0;
    const mkProduto = async (nome: string, pres: [string, number, boolean][]): Promise<Prod> => {
      seq += 1;
      const r = await cc("criarProdutoEmporioAction", op, { name: `M81 ${nome} ${seq}`, category_id: cat.id, base_unit: "quilograma" });
      const d = dados(r);
      if (!d) throw new Error(`produto ${nome}: ${j(r)}`);
      const p: Record<string, string> = {};
      for (const [pn, bq, sealed] of pres) {
        const rp = await cc("criarApresentacaoAction", op, d.id, { name: pn, base_qty: bq, is_sealed_package: sealed });
        if (!rp.ok) throw new Error(`apresentação ${pn}: ${j(rp)}`);
        p[pn] = rp.data.id;
      }
      return { id: d.id, product_id: d.product_id, p };
    };
    const QUILO: [string, number, boolean][] = [["Quilo", 1, false]];
    const SEP: [string, number, boolean][] = [["Saca 10 kg", 10, true], ["Quilo", 1, false]];
    const preco = async (est: string, prod: Prod, pres: string, price: number) => {
      const r = await cc("definirPrecoAction", admin, { establishment_id: est, presentation_id: prod.p[pres], price });
      if (!r.ok) throw new Error(`preço: ${j(r)}`);
    };
    const implantar = async (est: string, prod: Prod, loose: number, cost?: number, sealed: Dado[] = []) => {
      const r = await ee("implantarEstoqueAction", op, { establishment_id: est, emporio_product_id: prod.id, sealed, loose_qty: loose, ...(cost === undefined ? {} : { unit_cost: cost }) });
      if (!r.ok) throw new Error(`implantar: ${j(r)}`);
    };
    const linhaDaLoja = async (est: string, prod: Prod): Promise<Dado> =>
      lista(dados(await ee("saldoDaLojaAction", admin, est))).find((l) => l.emporio_product_id === prod.id);
    const total = async (est: string, prod: Prod) => n((await linhaDaLoja(est, prod))?.total_qty ?? 0);
    const pacotes = (l: Dado) => lista(l?.sealed).reduce((s: number, x: Dado) => s + n(x.packages), 0);
    const movs = (prod: Prod, extra: Dado = {}) =>
      db.stockMovement.findMany({ where: { product_id: prod.product_id, ...extra }, orderBy: { created_at: "asc" } });

    let chaveSeq = 0;
    const chave = (p: string) => `m81-${p}-${stamp}-${(chaveSeq += 1)}`;
    const item = (prod: Prod, pres: string, quantity: number, unit_price?: number) => ({
      emporio_product_id: prod.id,
      presentation_id: prod.p[pres],
      quantity,
      ...(unit_price === undefined ? {} : { unit_price }),
    });
    const vender = (ator: Ator, items: Dado[], payments: Dado[], over: Dado = {}) =>
      vv("venderAction", ator, { operation_key: chave("v"), establishment_id: L1.id, items, payments, ...over });
    const saleId = async (r: R): Promise<string> => {
      const d = dados(r);
      return d?.id ?? d?.sale_id ?? "";
    };
    const dinheiro = (amount: number) => ({ kind: "dinheiro", amount });
    const contato = async (nome: string, archived = false) =>
      (await db.contact.create({ data: scoped({ name: `M81 ${nome} ${stamp}`, archived_at: archived ? new Date() : null }) })).id;

    // consultas independentes ao banco
    const lancDaVenda = (id: string) => db.financialEntry.findMany({ where: { related_module: "emporio", related_id: id } });
    const pago = async (entryId: string) =>
      (await db.financialPayment.findMany({ where: { entry_id: entryId } })).reduce((s, p) => s + n(p.amount), 0);
    const caixaDa = async (where: Dado) => {
      const ms = await db.cashMovement.findMany({ where });
      return ms.reduce((s, m) => s + (m.direction === "entrada" ? n(m.amount) : -n(m.amount)), 0);
    };
    const saldoGaveta = (est: string) => caixaDa({ establishment_id: est });
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

    // ---------------------------------------------------------------- 1
    console.log("1. Aceite: vender 1 kg abre a saca (Q84)");
    const Ra = await mkProduto("Ração", SEP);
    await implantar(L1.id, Ra, 0, 10, [{ presentation_id: Ra.p["Saca 10 kg"], packages: 3 }]);
    await preco(L1.id, Ra, "Quilo", 12);
    await preco(L1.id, Ra, "Saca 10 kg", 100);
    const lRa0 = await linhaDaLoja(L1.id, Ra);
    check("antes: 3 sacas lacradas, nada avulso, total 30", n(lRa0?.total_qty) === 30 && pacotes(lRa0) === 3 && n(lRa0?.loose_qty) === 0, j(lRa0));
    const rS1 = await vender(op, [item(Ra, "Quilo", 1)], [dinheiro(12)]);
    check("OPERADOR vende 1 kg a granel", rS1.ok, j(rS1));
    const S1 = await saleId(rS1);
    const lRa1 = await linhaDaLoja(L1.id, Ra);
    check("depois: 2 lacradas, 9 kg avulsos, total 29", n(lRa1?.total_qty) === 29 && pacotes(lRa1) === 2 && n(lRa1?.loose_qty) === 9, j(lRa1));
    const abLac = await movs(Ra, { movement_type: "abertura_lacrado" });
    const abAvu = await movs(Ra, { movement_type: "abertura_avulso" });
    check("uma abertura_lacrado de 10 kg com a apresentação, ligada à venda", abLac.length === 1 && n(abLac[0].quantity) === 10 && abLac[0].presentation_id === Ra.p["Saca 10 kg"] && abLac[0].sale_id === S1 && abLac[0].package_state === "lacrado", j(abLac));
    check("uma abertura_avulso de 10 kg, ligada à venda, avulsa", abAvu.length === 1 && n(abAvu[0].quantity) === 10 && abAvu[0].sale_id === S1 && abAvu[0].package_state === "avulso", j(abAvu));
    const vendaMov = await movs(Ra, { movement_type: "venda" });
    check("uma venda avulsa de 1 kg, ligada à venda, com unit_cost 10 (custo médio da loja)", vendaMov.length === 1 && n(vendaMov[0].quantity) === 1 && vendaMov[0].sale_id === S1 && vendaMov[0].package_state === "avulso" && perto(n(vendaMov[0].unit_cost), 10), j(vendaMov));
    check("o custo médio não mudou com a abertura (10)", perto(n(lRa1?.average_cost), 10), j(lRa1?.average_cost));
    check("as pernas da abertura têm o custo médio do momento (10)", perto(n(abLac[0].unit_cost), 10) && perto(n(abAvu[0].unit_cost), 10));
    const itS1 = await db.emporioSaleItem.findMany({ where: { sale_id: S1 } });
    check("o item grava base_qty 1, preço sugerido 12, praticado 12, custo 10, sem provisório", itS1.length === 1 && n(itS1[0].base_qty) === 1 && perto(n(itS1[0].suggested_price), 12) && perto(n(itS1[0].unit_price), 12) && perto(n(itS1[0].unit_cost), 10) && itS1[0].cost_provisional === false, j(itS1));
    check("sacas de 10 kg a R$ 100 vendidas lacradas: baixa sem abertura (1 saca)", (await vender(op, [item(Ra, "Saca 10 kg", 1)], [dinheiro(100)])).ok && pacotes(await linhaDaLoja(L1.id, Ra)) === 1 && (await movs(Ra, { movement_type: "abertura_lacrado" })).length === 1);

    // ---------------------------------------------------------------- 2
    console.log("\n2. Abrir a MENOR embalagem primeiro; passar para a próxima maior");
    const Dp = await mkProduto("Duas sacas", [["Saca 25 kg", 25, true], ["Saca 10 kg", 10, true], ["Quilo", 1, false]]);
    await implantar(L1.id, Dp, 0, 4, [{ presentation_id: Dp.p["Saca 25 kg"], packages: 1 }, { presentation_id: Dp.p["Saca 10 kg"], packages: 1 }]);
    await preco(L1.id, Dp, "Quilo", 6);
    check("1 kg abre a saca de 10 (a menor), não a de 25", (await vender(op, [item(Dp, "Quilo", 1)], [dinheiro(6)])).ok);
    const abDp = await movs(Dp, { movement_type: "abertura_lacrado" });
    check("uma abertura, da apresentação de 10 kg", abDp.length === 1 && abDp[0].presentation_id === Dp.p["Saca 10 kg"] && n(abDp[0].quantity) === 10, j(abDp.map((m) => [m.presentation_id, m.quantity])));
    const lDp = await linhaDaLoja(L1.id, Dp);
    check("total 34, avulso 9, uma saca (a de 25) lacrada", n(lDp?.total_qty) === 34 && n(lDp?.loose_qty) === 9 && pacotes(lDp) === 1, j(lDp));
    check("12 kg: baixa os 9 avulsos e abre a de 25 (a próxima maior)", (await vender(op, [item(Dp, "Quilo", 12)], [dinheiro(72)])).ok);
    const abDp2 = await movs(Dp, { movement_type: "abertura_lacrado" });
    check("duas aberturas no total, a segunda de 25 kg", abDp2.length === 2 && abDp2.some((m) => m.presentation_id === Dp.p["Saca 25 kg"] && n(m.quantity) === 25), j(abDp2.map((m) => [m.presentation_id, m.quantity])));
    const lDp2 = await linhaDaLoja(L1.id, Dp);
    check("sobra: total 22, tudo avulso, nada lacrado", n(lDp2?.total_qty) === 22 && n(lDp2?.loose_qty) === 22 && pacotes(lDp2) === 0, j(lDp2));

    // ---------------------------------------------------------------- 3
    console.log("\n3. Recusas da venda");
    const Sal = await mkProduto("Sal", QUILO);
    await implantar(L1.id, Sal, 100, 5);
    await preco(L1.id, Sal, "Quilo", 20);
    const Fa = await mkProduto("Farinha", QUILO);
    await implantar(L1.id, Fa, 50, 8);
    await preco(L1.id, Fa, "Quilo", 30);
    const SemP = await mkProduto("Sem preço", QUILO);
    await implantar(L1.id, SemP, 20, 2);
    const Gr = await mkProduto("Granel curto", SEP);
    await implantar(L1.id, Gr, 2, 3);
    await preco(L1.id, Gr, "Quilo", 6);
    await preco(L1.id, Gr, "Saca 10 kg", 55);
    const nVendas = () => db.emporioSale.count();
    const nMov = () => db.stockMovement.count();
    const v0 = await nVendas();
    const m0 = await nMov();
    const c0 = await db.cashMovement.count();
    check("VISUALIZADOR vende: 403", recusa(await vender(visu, [item(Sal, "Quilo", 1)], [dinheiro(20)]), "FORBIDDEN", 403));
    check("venda sem item: 422 items", recusa(await vender(op, [], []), "VALIDATION_ERROR", 422, "items"));
    check("soma dos pagamentos diferente do total: 422 payments", recusa(await vender(op, [item(Sal, "Quilo", 2)], [dinheiro(39)]), "VALIDATION_ERROR", 422, "payments"));
    check("PIX sem conta (nem na venda nem na loja): 422 payments", recusa(await vender(op, [item(Sal, "Quilo", 1)], [{ kind: "pix", amount: 20 }]), "VALIDATION_ERROR", 422, "payments"));
    check("débito é da F3b: 422 payments", recusa(await vender(op, [item(Sal, "Quilo", 1)], [{ kind: "debito", amount: 20 }]), "VALIDATION_ERROR", 422, "payments"));
    check("cheque é da F3b: 422 payments", recusa(await vender(op, [item(Sal, "Quilo", 1)], [{ kind: "cheque", amount: 20 }]), "VALIDATION_ERROR", 422, "payments"));
    check("sem preço cadastrado e sem unit_price: 422 items", recusa(await vender(op, [item(SemP, "Quilo", 1)], [dinheiro(5)]), "VALIDATION_ERROR", 422, "items"));
    check("fiado sem contact_id: 422 contact_id", recusa(await vender(op, [item(Sal, "Quilo", 1)], [{ kind: "fiado", amount: 20 }]), "VALIDATION_ERROR", 422, "contact_id"));
    const cArq = await contato("Arquivado", true);
    check("fiado para contato arquivado: 422 contact_id", recusa(await vender(op, [item(Sal, "Quilo", 1)], [{ kind: "fiado", amount: 20 }], { contact_id: cArq }), "VALIDATION_ERROR", 422, "contact_id"));
    check("granel sem saldo (2 kg, pede 5) sem negativo liberado: 409 INSUFFICIENT_STOCK em items", recusa(await vender(op, [item(Gr, "Quilo", 5)], [dinheiro(30)]), "INSUFFICIENT_STOCK", 409, "items"));
    check("saca fechada sem lacrado (nenhuma): 409 INSUFFICIENT_STOCK em items", recusa(await vender(op, [item(Gr, "Saca 10 kg", 1)], [dinheiro(55)]), "INSUFFICIENT_STOCK", 409, "items"));
    check("as recusas não gravaram venda, movimento de estoque nem de caixa, e o avulso segue 2", (await nVendas()) === v0 && (await nMov()) === m0 && (await db.cashMovement.count()) === c0 && (await total(L1.id, Gr)) === 2);
    check("com unit_price informado, o item sem preço cadastrado vende", (await vender(op, [item(SemP, "Quilo", 1, 7)], [dinheiro(7)])).ok);

    const Gn = await mkProduto("Granel negativável", SEP);
    await implantar(L3.id, Gn, 2, 3);
    await preco(L3.id, Gn, "Quilo", 6);
    await preco(L3.id, Gn, "Saca 10 kg", 55);
    const Lac3 = await mkProduto("Lacrado negativável", SEP);
    await implantar(L3.id, Lac3, 0, 3, [{ presentation_id: Lac3.p["Saca 10 kg"], packages: 1 }]);
    await preco(L3.id, Lac3, "Saca 10 kg", 55);
    check("saca fechada acima do lacrado, mesmo com negativo liberado: 409 INSUFFICIENT_STOCK em items (Q31)", recusa(await vender(op, [item(Lac3, "Saca 10 kg", 2)], [dinheiro(110)], { establishment_id: L3.id }), "INSUFFICIENT_STOCK", 409, "items"));
    check("e nada saiu do lacrado da loja negativa", pacotes(await linhaDaLoja(L3.id, Lac3)) === 1);
    const rNeg = await vender(op, [item(Gn, "Quilo", 5)], [dinheiro(30)], { establishment_id: L3.id });
    check("granel com negativo liberado aceita", rNeg.ok, j(rNeg));
    check("o avulso fica negativo (-3)", (await total(L3.id, Gn)) === -3);
    const itNeg = await db.emporioSaleItem.findMany({ where: { sale_id: await saleId(rNeg) } });
    check("o item marca o custo provisório (Q32) e guarda o custo 3", itNeg.length === 1 && itNeg[0].cost_provisional === true && perto(n(itNeg[0].unit_cost), 3), j(itNeg));

    // ---------------------------------------------------------------- 4
    console.log("\n4. Contas bancárias e PIX (Q83)");
    check("OPERADOR cria conta: 403", recusa(await xx("criarContaAction", op, { name: "M81 Banco X", bank: "X" }), "FORBIDDEN", 403));
    const rConta = await xx("criarContaAction", admin, { name: "M81 Conta PIX", bank: "Sicredi" });
    check("ADMIN cria conta", rConta.ok, j(rConta));
    const conta = dados(rConta)?.id as string;
    const rConta2 = await xx("criarContaAction", owner, { name: "M81 Conta PIX", bank: "Outro" });
    check("nome repetido na conta do cliente: recusa", !rConta2.ok, j(rConta2));
    check("conta sem nome: 422 name", recusa(await xx("criarContaAction", admin, { name: "  " }), "VALIDATION_ERROR", 422, "name"));
    check("OPERADOR lista contas: 403", recusa(await xx("listarContasAction", op), "FORBIDDEN", 403));
    check("ADMIN lista a conta criada", lista(dados(await xx("listarContasAction", admin))).some((c) => c.id === conta));
    check("OPERADOR define a conta PIX da loja: 403", recusa(await xx("definirContaPixAction", op, L1.id, { bank_account_id: conta }), "FORBIDDEN", 403));
    const rPixV = await vender(op, [item(Sal, "Quilo", 1)], [{ kind: "pix", amount: 20, bank_account_id: conta }]);
    check("PIX com bank_account_id na venda é aceito mesmo sem conta da loja", rPixV.ok, j(rPixV));
    check("o PIX entra na conta, não na gaveta", perto(await caixaDa({ bank_account_id: conta }), 20));
    check("ADMIN define a conta PIX da loja", (await xx("definirContaPixAction", admin, L1.id, { bank_account_id: conta })).ok);
    const rPixL = await vender(op, [item(Sal, "Quilo", 1)], [{ kind: "pix", amount: 20 }]);
    check("PIX sem conta na venda cai na conta PIX da loja", rPixL.ok && perto(await caixaDa({ bank_account_id: conta }), 40), j(rPixL));

    // ---------------------------------------------------------------- 5
    console.log("\n5. Pagamento misto: R$ 200 = R$ 120 em dinheiro + R$ 80 fiado (aceite §25)");
    const C1 = await contato("Cliente 1");
    const vAntes = await nVendas();
    const eAntes = await db.financialEntry.count({ where: { related_module: "emporio" } });
    const gAntes = await saldoGaveta(L1.id);
    const rM = await vender(op, [item(Sal, "Quilo", 10)], [dinheiro(120), { kind: "fiado", amount: 80 }], { contact_id: C1, sold_at: new Date(Date.now() - 2 * DIA) });
    check("a venda mista é aceita", rM.ok, j(rM));
    const M = await saleId(rM);
    check("UMA venda nova", (await nVendas()) === vAntes + 1);
    const lM = await lancDaVenda(M);
    check("UM lançamento de receita de R$ 200, módulo emporio, categoria Vendas do Empório", lM.length === 1 && lM[0].entry_type === "income" && perto(n(lM[0].amount), 200) && lM[0].related_module === "emporio" && lM[0].category === "Vendas do Empório", j(lM));
    check("e só mais um lançamento do Empório no total", (await db.financialEntry.count({ where: { related_module: "emporio" } })) === eAntes + 1 + 0);
    check("R$ 120 pagos, R$ 80 em aberto, status pending", perto(await pago(lM[0].id), 120) && lM[0].status === "pending");
    const cmM = await db.cashMovement.findMany({ where: { sale_id: M } });
    check("um CashMovement de entrada de R$ 120 na gaveta da loja, origem venda", cmM.length === 1 && cmM[0].direction === "entrada" && perto(n(cmM[0].amount), 120) && cmM[0].establishment_id === L1.id && cmM[0].bank_account_id === null && cmM[0].origin === "venda", j(cmM));
    check("a gaveta cresceu 120", perto((await saldoGaveta(L1.id)) - gAntes, 120));
    const spM = await db.emporioSalePayment.findMany({ where: { sale_id: M } });
    check("dois pagamentos da venda: dinheiro com financial_payment, fiado sem", spM.length === 2 && spM.find((p) => p.kind === "dinheiro")?.financial_payment_id != null && spM.find((p) => p.kind === "fiado")?.financial_payment_id == null, j(spM));
    const sM = await db.emporioSale.findUnique({ where: { id: M } });
    check("a venda grava cliente, net_amount 200, quem vendeu, status concluida", sM?.contact_id === C1 && perto(n(sM?.net_amount), 200) && sM?.sold_by_user_id === op.id && sM?.status === "concluida", j(sM));

    const rMq = await vender(op, [item(Sal, "Quilo", 5)], [dinheiro(50), { kind: "pix", amount: 50, bank_account_id: conta }]);
    check("venda sem fiado (dinheiro + PIX)", rMq.ok, j(rMq));
    const lMq = await lancDaVenda(await saleId(rMq));
    check("sem fiado o lançamento fecha paid, com tudo pago", lMq.length === 1 && lMq[0].status === "paid" && perto(await pago(lMq[0].id), 100));
    const cmMq = await db.cashMovement.findMany({ where: { sale_id: await saleId(rMq) } });
    check("dinheiro na gaveta (50), PIX na conta (50)", cmMq.length === 2 && cmMq.some((m) => m.establishment_id === L1.id && perto(n(m.amount), 50)) && cmMq.some((m) => m.bank_account_id === conta && perto(n(m.amount), 50)), j(cmMq));

    // ---------------------------------------------------------------- 6
    console.log("\n6. Fiado: receber reduz a dívida sem venda nova nem lançamento novo");
    const entM = lM[0];
    const vF = await nVendas();
    const eF = await db.financialEntry.count();
    const kR1 = chave("rec");
    const rR1 = await xx("receberFiadoAction", op, { operation_key: kR1, contact_id: C1, establishment_id: L1.id, amount: 50, kind: "dinheiro" });
    check("recebimento de R$ 50", rR1.ok, j(rR1));
    check("a dívida do lançamento cai de 80 para 30", perto(n(entM.amount) - (await pago(entM.id)), 30));
    check("nenhuma venda nova e nenhum lançamento novo", (await nVendas()) === vF && (await db.financialEntry.count()) === eF);
    const cmR1 = await db.cashMovement.findMany({ where: { operation_key: kR1 } });
    check("um CashMovement de entrada de 50 na gaveta, origem recebimento_fiado", cmR1.length === 1 && cmR1[0].direction === "entrada" && perto(n(cmR1[0].amount), 50) && cmR1[0].origin === "recebimento_fiado" && cmR1[0].establishment_id === L1.id, j(cmR1));
    const rR1b = await xx("receberFiadoAction", op, { operation_key: kR1, contact_id: C1, establishment_id: L1.id, amount: 50, kind: "dinheiro" });
    check("mesma operation_key: devolve o gravado, sem duplicar", rR1b.ok && (await db.cashMovement.count({ where: { operation_key: kR1 } })) === 1 && perto(n(entM.amount) - (await pago(entM.id)), 30), j(rR1b));

    const rM2 = await vender(op, [item(Sal, "Quilo", 5)], [{ kind: "fiado", amount: 100 }], { contact_id: C1, sold_at: new Date(Date.now() - 1 * DIA) });
    const M2 = await saleId(rM2);
    const entM2 = (await lancDaVenda(M2))[0];
    check("segunda venda inteira no fiado do mesmo cliente (100): lançamento pending sem pagamento e sem caixa", rM2.ok && entM2?.status === "pending" && (await pago(entM2.id)) === 0 && (await db.cashMovement.count({ where: { sale_id: M2 } })) === 0, j(rM2));
    const lstFiado = lista(dados(await xx("listarFiadoAction", op)));
    const dividaLista = (() => {
      const l = lstFiado.find((x) => x.contact_id === C1);
      if (!l) return NaN;
      for (const k of ["owed", "due", "devido", "balance", "open_amount", "amount_due"]) if (typeof l[k] === "number") return l[k];
      return NaN;
    })();
    check("a lista de fiado mostra o cliente devendo 130", perto(dividaLista, 130), j(lstFiado));
    const rAcima = await xx("receberFiadoAction", op, { operation_key: chave("rec"), contact_id: C1, establishment_id: L1.id, amount: 130.01, kind: "dinheiro" });
    check("valor acima do devido: 422 amount", recusa(rAcima, "VALIDATION_ERROR", 422, "amount"), j(rAcima));
    const rR2 = await xx("receberFiadoAction", op, { operation_key: chave("rec"), contact_id: C1, establishment_id: L1.id, amount: 40, kind: "dinheiro" });
    check("recebe 40 sem entry_id", rR2.ok, j(rR2));
    const entMDepois = await db.financialEntry.findUnique({ where: { id: entM.id } });
    check("distribui do mais antigo: a venda antiga quita (30) e fica paid", perto(n(entM.amount) - (await pago(entM.id)), 0) && entMDepois?.status === "paid", `antiga deve ${n(entM.amount) - (await pago(entM.id))}, nova deve ${n(entM2.amount) - (await pago(entM2.id))}, partes ${j(dados(rR2)?.parts)}`);
    check("e o resto (10) abate a mais nova: devendo 90", perto(n(entM2.amount) - (await pago(entM2.id)), 90));
    check("dois movimentos de caixa (30 e 10) com origem recebimento_fiado", (await db.cashMovement.count({ where: { origin: "recebimento_fiado", financial_payment_id: { not: null } } })) >= 3);
    const rR3 = await xx("receberFiadoAction", op, { operation_key: chave("rec"), contact_id: C1, establishment_id: L1.id, amount: 10, kind: "dinheiro", entry_id: entM2.id });
    check("com entry_id paga aquele lançamento (10): devendo 80", rR3.ok && perto(n(entM2.amount) - (await pago(entM2.id)), 80), j(rR3));
    const rRPix = await xx("receberFiadoAction", op, { operation_key: chave("rec"), contact_id: C1, establishment_id: L1.id, amount: 5, kind: "pix" });
    check("recebimento em PIX (conta PIX da loja) entra na conta, não na gaveta", rRPix.ok && perto(await caixaDa({ bank_account_id: conta }), 40 + 50 + 5), j(rRPix));
    check("VISUALIZADOR recebe fiado: 403", recusa(await xx("receberFiadoAction", visu, { operation_key: chave("rec"), contact_id: C1, establishment_id: L1.id, amount: 1, kind: "dinheiro" }), "FORBIDDEN", 403));

    const C4 = await contato("Cliente 4");
    const rOld = await vender(op, [item(Sal, "Quilo", 2)], [{ kind: "fiado", amount: 40, due_date: new Date(Date.now() + 10 * DIA) }], { contact_id: C4, sold_at: new Date(Date.now() - 3 * DIA) });
    const rNew = await vender(op, [item(Sal, "Quilo", 2)], [{ kind: "fiado", amount: 40 }], { contact_id: C4, sold_at: new Date(Date.now() - 1 * DIA) });
    const eOld = (await lancDaVenda(await saleId(rOld)))[0];
    const eNew = (await lancDaVenda(await saleId(rNew)))[0];
    await xx("receberFiadoAction", op, { operation_key: chave("rec"), contact_id: C4, establishment_id: L1.id, amount: 10, kind: "dinheiro" });
    check("a ordem é pela VENDA mais antiga (sold_at), mesmo que a mais nova tenha vencimento mais cedo", perto(await pago(eOld.id), 10) && (await pago(eNew.id)) === 0, `antiga pagou ${await pago(eOld.id)}, nova pagou ${await pago(eNew.id)}`);

    // ---------------------------------------------------------------- 7
    console.log("\n7. Desconto (Q85)");
    check("OPERADOR com 15% de desconto (limite 10%): 403 DISCOUNT_ABOVE_LIMIT em items", recusa(await vender(op, [item(Sal, "Quilo", 1, 17)], [dinheiro(17)]), "DISCOUNT_ABOVE_LIMIT", 403, "items"));
    check("a recusa não gravou nada", (await db.emporioSale.count({ where: { net_amount: 17 } })) === 0);
    const rD5 = await vender(op, [item(Sal, "Quilo", 1, 19)], [dinheiro(19)]);
    check("OPERADOR com 5%: aceito", rD5.ok, j(rD5));
    const sD5 = await db.emporioSale.findUnique({ where: { id: await saleId(rD5) } });
    check("discount_amount 1 e ninguém autorizou", perto(n(sD5?.discount_amount), 1) && sD5?.discount_authorized_by_user_id === null, j(sD5));
    const rDo = await vender(owner, [item(Sal, "Quilo", 1, 17)], [dinheiro(17)]);
    check("OWNER com 15%: passa", rDo.ok, j(rDo));
    const sDo = await db.emporioSale.findUnique({ where: { id: await saleId(rDo) } });
    check("discount_amount 3 e discount_authorized_by_user_id = o OWNER", perto(n(sDo?.discount_amount), 3) && sDo?.discount_authorized_by_user_id === owner.id, j(sDo));
    const rDa = await vender(admin, [item(Sal, "Quilo", 1, 16)], [dinheiro(16)]);
    check("ADMIN com 20%: passa e se grava como autorizador", rDa.ok && (await db.emporioSale.findUnique({ where: { id: await saleId(rDa) } }))?.discount_authorized_by_user_id === admin.id, j(rDa));
    const rAcimaP = await vender(op, [item(Fa, "Quilo", 1, 36)], [dinheiro(36)]);
    check("preço acima do cadastrado é livre para OPERADOR, sem desconto", rAcimaP.ok && perto(n((await db.emporioSale.findUnique({ where: { id: await saleId(rAcimaP) } }))?.discount_amount), 0), j(rAcimaP));
    check("preço acima de um item não compensa outro abaixo (sal 20 a 14 = 6 de desconto sobre 50 sugeridos = 12%; farinha 30 a 60): 403", recusa(await vender(op, [item(Sal, "Quilo", 1, 14), item(Fa, "Quilo", 1, 60)], [dinheiro(74)]), "DISCOUNT_ABOVE_LIMIT", 403, "items"));
    check("o preço cadastrado não mudou depois das vendas", perto(n((await db.presentationPrice.findFirst({ where: { establishment_id: L1.id, presentation_id: Sal.p["Quilo"] } }))?.price), 20));
    const itPreco = await db.emporioSaleItem.findFirst({ where: { sale_id: await saleId(rAcimaP) } });
    check("o item grava sugerido 30 e praticado 36", perto(n(itPreco?.suggested_price), 30) && perto(n(itPreco?.unit_price), 36) && perto(n(itPreco?.total), 36));
    check("o custo do item é o custo médio da loja (8) e o médio não mudou", perto(n(itPreco?.unit_cost), 8) && perto(n((await linhaDaLoja(L1.id, Fa))?.average_cost), 8));

    // ---------------------------------------------------------------- 8
    console.log("\n8. Cancelamento total (Q86)");
    const lRa2 = await linhaDaLoja(L1.id, Ra);
    check("antes de cancelar a venda de 1 kg: 1 saca, 9 avulsos", pacotes(lRa2) === 1 && n(lRa2?.loose_qty) === 9, j(lRa2));
    const cxAntes = await db.cashMovement.count();
    check("OPERADOR cancela: 403", recusa(await vv("cancelarVendaAction", op, S1, { reason: "x" }), "FORBIDDEN", 403));
    check("cancelar sem motivo: 422 reason", recusa(await vv("cancelarVendaAction", admin, S1, { reason: "" }), "VALIDATION_ERROR", 422, "reason"));
    check("as recusas não mudaram a venda", (await db.emporioSale.findUnique({ where: { id: S1 } }))?.status === "concluida" && (await db.cashMovement.count()) === cxAntes);
    const rCx = await vv("cancelarVendaAction", admin, S1, { reason: "cliente desistiu" });
    check("ADMIN cancela", rCx.ok, j(rCx));
    const sCx = await db.emporioSale.findUnique({ where: { id: S1 } });
    check("venda cancelada com motivo, quando e quem", sCx?.status === "cancelada" && !!sCx.canceled_at && sCx.canceled_reason === "cliente desistiu" && sCx.canceled_by_user_id === admin.id, j(sCx));
    const lRa3 = await linhaDaLoja(L1.id, Ra);
    check("o granel volta AVULSO (10 kg), a abertura fica: 1 saca e total 20 + ... (loose 10)", n(lRa3?.loose_qty) === 10 && pacotes(lRa3) === 1 && n(lRa3?.total_qty) === 20, j(lRa3));
    check("as aberturas seguem sem cancelar e a venda fica com canceled_at", (await movs(Ra, { movement_type: "abertura_lacrado" })).every((m) => m.canceled_at === null) && (await movs(Ra, { movement_type: "venda", sale_id: S1 })).every((m) => m.canceled_at !== null));
    const lS1 = await lancDaVenda(S1);
    check("lançamento cancelled", lS1.length === 1 && lS1[0].status === "cancelled");
    const cmS1 = await db.cashMovement.findMany({ where: { sale_id: S1 }, orderBy: { created_at: "asc" } });
    check("saída de 12 na gaveta (origem cancelamento_venda), igual ao que entrou; nada apagado", cmS1.length === 2 && cmS1[0].direction === "entrada" && cmS1[1].direction === "saida" && perto(n(cmS1[1].amount), 12) && cmS1[1].origin === "cancelamento_venda" && cmS1[1].establishment_id === L1.id, j(cmS1));
    check("cancelar de novo: 409 SALE_CANCELED", recusa(await vv("cancelarVendaAction", admin, S1, { reason: "x" }), "SALE_CANCELED", 409));

    const rLac = await vender(op, [item(Ra, "Saca 10 kg", 1)], [dinheiro(100)]);
    check("saca lacrada vendida (lacradas vão a 0)", rLac.ok && pacotes(await linhaDaLoja(L1.id, Ra)) === 0);
    check("cancelar a lacrada: volta LACRADA", (await vv("cancelarVendaAction", owner, await saleId(rLac), { reason: "troquei" })).ok && pacotes(await linhaDaLoja(L1.id, Ra)) === 1);

    const C2 = await contato("Cliente 2");
    const rMix = await vender(op, [item(Sal, "Quilo", 5)], [dinheiro(40), { kind: "fiado", amount: 60 }], { contact_id: C2 });
    const Mx = await saleId(rMix);
    check("venda 40 dinheiro + 60 fiado; recebe 20 do fiado", rMix.ok && (await xx("receberFiadoAction", op, { operation_key: chave("rec"), contact_id: C2, establishment_id: L1.id, amount: 20, kind: "dinheiro" })).ok);
    check("cancelar com fiado parcialmente recebido", (await vv("cancelarVendaAction", admin, Mx, { reason: "erro" })).ok);
    const cmMx = await db.cashMovement.findMany({ where: { sale_id: Mx } });
    const saidasMx = cmMx.filter((m) => m.direction === "saida");
    check("o estorno é uma saída por pagamento, no mesmo lugar: total 60 (= o recebido)", saidasMx.reduce((s, m) => s + n(m.amount), 0) === 60 && saidasMx.every((m) => m.origin === "cancelamento_venda" && m.establishment_id === L1.id), j(cmMx.map((m) => [m.direction, m.amount, m.origin])));
    const pgsMx = (await db.financialPayment.findMany({ where: { entry_id: (await lancDaVenda(Mx))[0].id } })).map((p) => p.id);
    const entradasMx = await db.cashMovement.findMany({ where: { direction: "entrada", financial_payment_id: { in: pgsMx } } });
    check("tudo o que entrou por essa venda (40 + 20) saiu no estorno (60)", entradasMx.reduce((s, m) => s + n(m.amount), 0) === 60 && pgsMx.length === 2, j(entradasMx.map((m) => m.amount)));
    check("o fiado desse cliente zerou (lançamento cancelled)", (await lancDaVenda(Mx))[0].status === "cancelled");

    // ---------------------------------------------------------------- 9
    console.log("\n9. Devolução parcial (Q86)");
    const rSd = await vender(op, [item(Sal, "Quilo", 4), item(Fa, "Quilo", 2)], [dinheiro(140)]);
    const Sd = await saleId(rSd);
    const itSd = await db.emporioSaleItem.findMany({ where: { sale_id: Sd } });
    const iSal = itSd.find((i) => i.emporio_product_id === Sal.id)!;
    const iFa = itSd.find((i) => i.emporio_product_id === Fa.id)!;
    const salAntes = await total(L1.id, Sal);
    const gavAntes = await saldoGaveta(L1.id);
    const kDev = chave("dev");
    const rDev = await vv("devolverAction", op, Sd, { operation_key: kDev, refund_kind: "dinheiro", items: [{ sale_item_id: iSal.id, quantity: 1 }] });
    check("OPERADOR devolve 1 kg de sal em dinheiro", rDev.ok, j(rDev));
    const dev1 = await db.emporioSaleReturn.findFirst({ where: { operation_key: kDev } });
    check("devolução grava valor 20, forma dinheiro e quem devolveu", perto(n(dev1?.amount), 20) && dev1?.refund_kind === "dinheiro" && dev1?.returned_by_user_id === op.id && dev1?.sale_id === Sd, j(dev1));
    check("o estoque volta (+1)", (await total(L1.id, Sal)) === salAntes + 1);
    const mDev = await movs(Sal, { movement_type: "devolucao" });
    check("um movimento devolucao de 1 kg não lacrado, custo da venda (5), ligado à devolução", mDev.length === 1 && n(mDev[0].quantity) === 1 && mDev[0].package_state !== "lacrado" && perto(n(mDev[0].unit_cost), 5) && mDev[0].sale_return_id === dev1?.id, j(mDev));
    const eDev = await db.financialEntry.findMany({ where: { related_id: dev1?.id } });
    check("despesa 'Devoluções de vendas do Empório' de 20, paga, ligada à devolução", eDev.length === 1 && eDev[0].entry_type === "expense" && eDev[0].category === "Devoluções de vendas do Empório" && perto(n(eDev[0].amount), 20) && eDev[0].status === "paid" && eDev[0].related_module === "emporio", j(eDev));
    const cDev = await db.cashMovement.findMany({ where: { sale_return_id: dev1?.id } });
    check("saída de 20 da gaveta da loja, origem devolucao", cDev.length === 1 && cDev[0].direction === "saida" && perto(n(cDev[0].amount), 20) && cDev[0].origin === "devolucao" && cDev[0].establishment_id === L1.id && perto((await saldoGaveta(L1.id)) - gavAntes, -20), j(cDev));
    const rDevB = await vv("devolverAction", op, Sd, { operation_key: kDev, refund_kind: "dinheiro", items: [{ sale_item_id: iSal.id, quantity: 1 }] });
    check("mesma operation_key: devolve o gravado, sem duplicar", rDevB.ok && (await db.emporioSaleReturn.count({ where: { operation_key: kDev } })) === 1 && (await movs(Sal, { movement_type: "devolucao" })).length === 1 && perto((await saldoGaveta(L1.id)) - gavAntes, -20), j(rDevB));
    check("quantidade acima do vendido menos devolvido (4 de 3 restantes): 422 items", recusa(await vv("devolverAction", op, Sd, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: iSal.id, quantity: 4 }] }), "VALIDATION_ERROR", 422, "items"));
    const fa0 = await total(L1.id, Fa);
    const rAv = await vv("devolverAction", op, Sd, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: iFa.id, quantity: 1, loss_reason: "avaria" }] });
    check("devolução de item avariado", rAv.ok, j(rAv));
    const mAvD = await movs(Fa, { movement_type: "devolucao" });
    const mAvP = await movs(Fa, { movement_type: "perda", sale_return_id: mAvD[0]?.sale_return_id ?? "x" });
    check("gera devolucao de 1 kg e perda de 1 kg pelo mesmo custo (8)", mAvD.length === 1 && mAvP.length === 1 && n(mAvP[0].quantity) === 1 && perto(n(mAvP[0].unit_cost), 8) && perto(n(mAvD[0].unit_cost), 8), j([mAvD, mAvP].map((x) => x.map((m) => [m.movement_type, m.quantity, m.unit_cost]))));
    check("saldo líquido do estoque não muda com o avariado (a mercadoria volta e sai)", (await total(L1.id, Fa)) === fa0);
    check("cancelar a venda que tem devolução: 409 SALE_HAS_RETURNS", recusa(await vv("cancelarVendaAction", admin, Sd, { reason: "x" }), "SALE_HAS_RETURNS", 409));
    check("VISUALIZADOR devolve: 403", recusa(await vv("devolverAction", visu, Sd, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: iSal.id, quantity: 1 }] }), "FORBIDDEN", 403));

    console.log("\n10. Devolução que abate o fiado (sem caixa)");
    const C3 = await contato("Cliente 3");
    const rFd = await vender(op, [item(Sal, "Quilo", 5)], [{ kind: "fiado", amount: 100 }], { contact_id: C3 });
    const Fd = await saleId(rFd);
    const iFd = (await db.emporioSaleItem.findMany({ where: { sale_id: Fd } }))[0];
    const entFd = (await lancDaVenda(Fd))[0];
    const cx0 = await db.cashMovement.count();
    const rAb = await vv("devolverAction", op, Fd, { operation_key: chave("dev"), refund_kind: "abater_fiado", items: [{ sale_item_id: iFd.id, quantity: 2 }] });
    check("devolve 2 kg abatendo o fiado", rAb.ok, j(rAb));
    const entFd2 = await db.financialEntry.findUnique({ where: { id: entFd.id } });
    check("o amount do lançamento cai de 100 para 60 e a dívida em aberto é 60", perto(n(entFd2?.amount), 60) && perto(n(entFd2?.amount) - (await pago(entFd.id)), 60), j(entFd2));
    check("nenhum movimento de caixa", (await db.cashMovement.count()) === cx0);
    check("o histórico fica na devolução (valor 40, abater_fiado)", (await db.emporioSaleReturn.findMany({ where: { sale_id: Fd } })).some((d) => d.refund_kind === "abater_fiado" && perto(n(d.amount), 40)));
    check("recebe 50 do fiado (sobra 10)", (await xx("receberFiadoAction", op, { operation_key: chave("rec"), contact_id: C3, establishment_id: L1.id, amount: 50, kind: "dinheiro" })).ok);
    check("abater mais do que o saldo em aberto (1 kg = 20 > 10): 422 amount", recusa(await vv("devolverAction", op, Fd, { operation_key: chave("dev"), refund_kind: "abater_fiado", items: [{ sale_item_id: iFd.id, quantity: 1 }] }), "VALIDATION_ERROR", 422, "amount"));
    // Achado na revisão da sessão principal: dinheiro devolvido acima do que o
    // cliente pagou saía da gaveta sem nunca ter entrado.
    const devAntes = await db.emporioSaleReturn.count({ where: { sale_id: Fd } });
    check("devolver em dinheiro mais do que o cliente pagou (3 kg = 60 > 50 pagos): 422 amount", recusa(await vv("devolverAction", op, Fd, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: iFd.id, quantity: 3 }] }), "VALIDATION_ERROR", 422, "amount"));
    const C9 = await contato("Cliente 9");
    const rNp = await vender(op, [item(Sal, "Quilo", 1)], [{ kind: "fiado", amount: 20 }], { contact_id: C9 });
    const Np = await saleId(rNp);
    const iNp = (await db.emporioSaleItem.findMany({ where: { sale_id: Np } }))[0];
    const cxNp = await db.cashMovement.count();
    check("fiado não pago devolvido em dinheiro: 422 amount, e nada gravado", recusa(await vv("devolverAction", op, Np, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: iNp.id, quantity: 1 }] }), "VALIDATION_ERROR", 422, "amount") && (await db.emporioSaleReturn.count({ where: { sale_id: { in: [Fd, Np] } } })) === devAntes && (await db.cashMovement.count()) === cxNp);

    // ---------------------------------------------------------------- 11
    console.log("\n11. Troca: devolução mais venda nova, ligadas");
    const rT = await vender(op, [item(Sal, "Quilo", 3)], [dinheiro(60)]);
    const T = await saleId(rT);
    const iT = (await db.emporioSaleItem.findMany({ where: { sale_id: T } }))[0];
    const gT0 = await saldoGaveta(L1.id);
    const kTr = chave("troca");
    const kTv = chave("v");
    const rTr = await vv("trocarAction", op, T, {
      operation_key: kTr,
      items_devolvidos: [{ sale_item_id: iT.id, quantity: 1 }],
      venda: { operation_key: kTv, establishment_id: L1.id, items: [item(Fa, "Quilo", 1)], payments: [dinheiro(10)] },
    });
    check("troca de 1 kg de sal (V = 20) por 1 kg de farinha (30), com 10 em dinheiro", rTr.ok, j(rTr));
    const devT = await db.emporioSaleReturn.findFirst({ where: { sale_id: T, refund_kind: "troca" } });
    const vNova = await db.emporioSale.findFirst({ where: { operation_key: kTv } });
    check("existe a devolução (troca, 20) e a venda nova com exchange_return_id apontando para ela", !!devT && perto(n(devT.amount), 20) && !!vNova && vNova.exchange_return_id === devT.id, j([devT, vNova]));
    check("o caixa só recebe a diferença (+10)", perto((await saldoGaveta(L1.id)) - gT0, 10));
    check("nenhum CashMovement de devolução na troca", (await db.cashMovement.count({ where: { sale_return_id: devT?.id } })) === 0);
    const eT = await db.financialEntry.findMany({ where: { related_id: devT?.id } });
    check("despesa 'Devoluções de vendas do Empório' de 20, paga", eT.length === 1 && eT[0].entry_type === "expense" && eT[0].category === "Devoluções de vendas do Empório" && perto(n(eT[0].amount), 20) && eT[0].status === "paid", j(eT));
    const pgT = await db.emporioSalePayment.findMany({ where: { sale_id: vNova?.id } });
    check("a venda nova tem um pagamento 'troca' de 20 e um de dinheiro de 10", pgT.some((p) => p.kind === "troca" && perto(n(p.amount), 20)) && pgT.some((p) => p.kind === "dinheiro" && perto(n(p.amount), 10)), j(pgT));
    const lvN = await lancDaVenda(vNova?.id ?? "");
    check("a venda nova tem um lançamento de receita de 30, pago por inteiro", lvN.length === 1 && perto(n(lvN[0].amount), 30) && lvN[0].status === "paid" && perto(await pago(lvN[0].id), 30), j(lvN));
    check("cancelar a venda nova da troca: 409 SALE_IS_EXCHANGE", recusa(await vv("cancelarVendaAction", admin, vNova?.id ?? "", { reason: "x" }), "SALE_IS_EXCHANGE", 409));
    const rTr2 = await vv("trocarAction", op, T, { operation_key: kTr, items_devolvidos: [{ sale_item_id: iT.id, quantity: 1 }], venda: { operation_key: kTv, establishment_id: L1.id, items: [item(Fa, "Quilo", 1)], payments: [dinheiro(10)] } });
    check("repetir a troca com a mesma chave não duplica", rTr2.ok && (await db.emporioSaleReturn.count({ where: { sale_id: T, refund_kind: "troca" } })) === 1 && (await db.emporioSale.count({ where: { operation_key: kTv } })) === 1);
    const gT1 = await saldoGaveta(L1.id);
    const rTr3 = await vv("trocarAction", op, T, {
      operation_key: chave("troca"),
      items_devolvidos: [{ sale_item_id: iT.id, quantity: 2 }],
      venda: { operation_key: chave("v"), establishment_id: L1.id, items: [item(Fa, "Quilo", 1)], payments: [] },
    });
    check("V (40) maior que a venda nova (30): a diferença de 10 sai da gaveta", rTr3.ok && perto((await saldoGaveta(L1.id)) - gT1, -10), j(rTr3));

    // ---------------------------------------------------------------- 12
    console.log("\n12. Caixa: o saldo é a soma dos movimentos");
    const gavBase = await saldoGaveta(L1.id);
    check("saldo inicial da gaveta (VISUALIZADOR): 403", recusa(await xx("saldoInicialCaixaAction", visu, { establishment_id: L2.id, amount: 100 }), "FORBIDDEN", 403));
    const rOp = await xx("saldoInicialCaixaAction", op, { establishment_id: L2.id, amount: 300 });
    check("OPERADOR lança o saldo inicial da Loja 2 (300), como no estoque inicial", rOp.ok, j(rOp));
    const opMov = await db.cashMovement.findMany({ where: { establishment_id: L2.id, origin: "implantacao" } });
    check("um movimento de entrada, origem implantacao", opMov.length === 1 && opMov[0].direction === "entrada" && perto(n(opMov[0].amount), 300), j(opMov));
    check("saldo inicial de novo na mesma loja: recusado", !(await xx("saldoInicialCaixaAction", admin, { establishment_id: L2.id, amount: 50 })).ok && (await db.cashMovement.count({ where: { establishment_id: L2.id, origin: "implantacao" } })) === 1);
    check("saldo inicial na conta (1000), e só uma vez", (await xx("saldoInicialCaixaAction", admin, { bank_account_id: conta, amount: 1000 })).ok && !(await xx("saldoInicialCaixaAction", admin, { bank_account_id: conta, amount: 1 })).ok);
    check("saldo inicial negativo ou zero: recusado", !(await xx("saldoInicialCaixaAction", admin, { establishment_id: L3.id, amount: 0 })).ok && !(await xx("saldoInicialCaixaAction", admin, { establishment_id: L3.id, amount: -5 })).ok);
    check("saldo inicial sem loja nem conta: recusado", !(await xx("saldoInicialCaixaAction", admin, { amount: 5 })).ok);
    const caixa = dados(await xx("lerCaixaAction", admin));
    const somaL1 = await saldoGaveta(L1.id);
    const somaConta = await caixaDa({ bank_account_id: conta });
    check("a gaveta da Loja 1 no GET = soma independente no banco", perto(achar(caixa, "establishment_id", L1.id), somaL1), `${achar(caixa, "establishment_id", L1.id)} contra ${somaL1}`);
    check("a Loja 2 aparece com 300", perto(achar(caixa, "establishment_id", L2.id), 300));
    check("a conta no GET = soma independente (inclui o saldo inicial)", perto(achar(caixa, "bank_account_id", conta), somaConta) && somaConta > 1000, `${achar(caixa, "bank_account_id", conta)} contra ${somaConta}`);
    check("a soma da gaveta usa entradas menos saídas (há saídas na conta de testes)", (await db.cashMovement.count({ where: { establishment_id: L1.id, direction: "saida" } })) > 0 && gavBase === somaL1);
    check("movimento de caixa tem exatamente um lugar (loja ou conta)", (await db.cashMovement.findMany({ where: { tenant_id: TA.t.id } })).every((m) => (m.establishment_id === null) !== (m.bank_account_id === null)));
    check("nenhum valor de caixa zero ou negativo (o sinal vem da direção)", (await db.cashMovement.count({ where: { amount: { lte: 0 } } })) === 0);
    check("OPERADOR lê o caixa e vê a gaveta da loja (Q87)", perto(achar(dados(await xx("lerCaixaAction", op)), "establishment_id", L1.id), somaL1));
    check("e não vê a conta bancária (só OWNER e ADMIN)", Number.isNaN(achar(dados(await xx("lerCaixaAction", op)), "bank_account_id", conta)));

    // ---------------------------------------------------------------- 13
    console.log("\n13. Idempotência da venda");
    const kI = chave("v-idem");
    const corpoI = { operation_key: kI, establishment_id: L1.id, items: [item(Fa, "Quilo", 2)], payments: [dinheiro(60)] };
    const faAntes = await total(L1.id, Fa);
    const gI = await saldoGaveta(L1.id);
    const i1 = await vv("venderAction", op, corpoI);
    const i2 = await vv("venderAction", op, corpoI);
    check("as duas chamadas ok, mesma venda", i1.ok && i2.ok && (await saleId(i1)) === (await saleId(i2)) && (await saleId(i1)) !== "", j([i1, i2]));
    check("uma venda só, um lançamento, estoque -2, gaveta +60", (await db.emporioSale.count({ where: { operation_key: kI } })) === 1 && (await lancDaVenda(await saleId(i1))).length === 1 && (await total(L1.id, Fa)) === faAntes - 2 && perto((await saldoGaveta(L1.id)) - gI, 60));

    // ---------------------------------------------------------------- 14
    console.log("\n14. Vínculo (Q56) e papéis");
    await implantar(L2.id, Sal, 10, 5);
    await preco(L2.id, Sal, "Quilo", 20);
    check("vincular userO só à Loja 2", (await cc("definirVinculosAction", owner, L2.id, [userO.id])).ok);
    check("userO vende na Loja 2", (await vender(userO, [item(Sal, "Quilo", 1)], [dinheiro(20)], { establishment_id: L2.id })).ok);
    check("userO vende na Loja 1 (sem vínculo): 404", recusa(await vender(userO, [item(Sal, "Quilo", 1)], [dinheiro(20)]), "NOT_FOUND", 404));
    check("userO devolve venda da Loja 1: 404", recusa(await vv("devolverAction", userO, Sd, { operation_key: chave("dev"), refund_kind: "dinheiro", items: [{ sale_item_id: iSal.id, quantity: 1 }] }), "NOT_FOUND", 404));
    check("userO lê venda da Loja 1: 404", recusa(await vv("lerVendaAction", userO, Sd), "NOT_FOUND", 404));
    check("userO só lista vendas da Loja 2", lista(dados(await vv("listarVendasAction", userO))).every((s) => s.establishment_id === L2.id));
    check("VISUALIZADOR lê vendas", (await vv("listarVendasAction", visu)).ok && (await vv("lerVendaAction", visu, Sd)).ok);

    // ---------------------------------------------------------------- 15
    console.log("\n15. Isolamento: B não vê nem age sobre A");
    const vb = (nome: string, ...a: unknown[]) => chamarEm(V, dbB, nome, ...a);
    const xb = (nome: string, ...a: unknown[]) => chamarEm(X, dbB, nome, ...a);
    const lojaB = await chamarEm(C, dbB, "criarEstabelecimentoAction", ownerB, { name: "M81 B1", kind: "ponto_venda" });
    check("B lê venda de A: 404", recusa(await vb("lerVendaAction", ownerB, Sd), "NOT_FOUND", 404));
    check("B cancela venda de A: 404", recusa(await vb("cancelarVendaAction", ownerB, M2, { reason: "x" }), "NOT_FOUND", 404));
    check("B devolve venda de A: 404", recusa(await vb("devolverAction", ownerB, Sd, { operation_key: chave("devb"), refund_kind: "dinheiro", items: [{ sale_item_id: iSal.id, quantity: 1 }] }), "NOT_FOUND", 404));
    check("B vende na loja de A: 404", recusa(await vb("venderAction", ownerB, { operation_key: chave("vb"), establishment_id: L1.id, items: [item(Sal, "Quilo", 1)], payments: [dinheiro(20)] }), "NOT_FOUND", 404));
    check("B não lista vendas de A", lista(dados(await vb("listarVendasAction", ownerB))).length === 0);
    check("B não vê fiado de A", lista(dados(await xb("listarFiadoAction", ownerB))).every((x) => x.contact_id !== C1 && x.contact_id !== C3));
    check("B recebe fiado de contato de A: recusado", !(await xb("receberFiadoAction", ownerB, { operation_key: chave("rb"), contact_id: C1, establishment_id: dados(lojaB)?.id, amount: 1, kind: "dinheiro" })).ok);
    check("B não vê contas de A", !lista(dados(await xb("listarContasAction", ownerB))).some((c) => c.id === conta));
    check("B define a conta PIX de A na loja de A: 404", recusa(await xb("definirContaPixAction", ownerB, L1.id, { bank_account_id: conta }), "NOT_FOUND", 404));
    const caixaB = dados(await xb("lerCaixaAction", ownerB));
    check("o caixa de B não traz a gaveta nem a conta de A", Number.isNaN(achar(caixaB, "establishment_id", L1.id)) && Number.isNaN(achar(caixaB, "bank_account_id", conta)), j(caixaB));
    check("B vende em B com a chave de A (operation_key é por conta): não devolve a venda de A", !(await (async () => {
      const r = await vb("venderAction", ownerB, { operation_key: kI, establishment_id: dados(lojaB)?.id, items: [], payments: [] });
      return r.ok && (await saleId(r)) === (await saleId(i1));
    })()));
    check("nada de A mudou por ação de B", (await db.emporioSale.findUnique({ where: { id: M2 } }))?.status === "concluida");
  } finally {
    for (const id of tenantIds) {
      try {
        await prisma.cashMovement.deleteMany({ where: { tenant_id: id } });
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
    console.log(falhas === 0 ? "\n✅ M81 verde" : `\n❌ M81: ${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  });
