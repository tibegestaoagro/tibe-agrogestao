import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F2b: transferência entre lojas, composição e
 * produção. Roda: `npm run test:m80`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F2b: contrato", Q19,
 * Q21, Q31, Q33, Q43, Q72 a Q80), sem ler a implementação. Chama as actions
 * direto, sem rota. Os módulos novos são carregados por `import()` com
 * especificador em variável, para o arquivo compilar antes de eles existirem.
 *
 * O que o contrato calava e esta suíte ASSUME:
 * - a resposta de `enviarTransferenciaAction` e de `produzirAction` traz `id`
 *   (com plano B pela `operation_key` no banco);
 * - `transferenciasParadasAction` devolve a contagem (número, `{ count }`,
 *   `{ total }`) ou uma lista/`{ items }`: lê-se o tamanho;
 * - `lerComposicaoAction` traz `items` com `component_emporio_product_id` e
 *   `quantity`;
 * - `receber` aceita todos os itens da transferência em `items`;
 * - `composition_snapshot` guarda `reference_qty` e uma lista de itens, e o
 *   JSON contém as quantidades usadas.
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
const perto3 = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 0.0006;
const recusa = (r: R, code: string, status: number, field?: string) =>
  !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);
const j = (x: unknown) => JSON.stringify(x);
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));

console.log("🚚 M80: Módulo 39 (Meu Empório), F2b: transferência, composição e produção\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const caminhoCatalogo = "@/lib/actions/emporio-catalogo";
  const caminhoEstoque = "@/lib/actions/emporio-estoque";
  const caminhoCompras = "@/lib/actions/emporio-compras";
  const caminhoTransf = "@/lib/actions/emporio-transferencias";
  const caminhoProd = "@/lib/actions/emporio-producao";
  const C = (await import(caminhoCatalogo)) as Record<string, Acao>;
  const E = (await import(caminhoEstoque)) as Record<string, Acao>;
  const P = (await import(caminhoCompras)) as Record<string, Acao>;
  const T = (await import(caminhoTransf)) as Record<string, Acao>;
  const D = (await import(caminhoProd)) as Record<string, Acao>;

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M80 ${rotulo} ${stamp}`, document: `M80${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
      });
      tenantIds.push(t.id);
      const mkUser = async (suf: string, role: Role): Promise<Ator> => {
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M80 ${rotulo} ${suf}`, email: `m80-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role },
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
    const op2 = await TA.mkUser("op2", "OPERADOR");
    const visu = await TA.mkUser("vis", "VISUALIZADOR");
    const userO = await TA.mkUser("uo", "OPERADOR");
    const userD = await TA.mkUser("ud", "OPERADOR");
    const ownerB = await TB.mkUser("own", "OWNER");
    const db = prismaForTenant(TA.t.id);
    const dbB = prismaForTenant(TB.t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M80 categoria" }) });
    const catB = await dbB.productCategory.create({ data: scoped({ name: "M80 categoria B" }) });

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
    const tt = (nome: string, ...a: unknown[]) => chamarEm(T, db, nome, ...a);
    const dd = (nome: string, ...a: unknown[]) => chamarEm(D, db, nome, ...a);

    // ---- Lojas
    const rL1 = await cc("criarEstabelecimentoAction", owner, { name: "M80 Central", kind: "central" });
    const rL2 = await cc("criarEstabelecimentoAction", owner, { name: "M80 Loja 2", kind: "ponto_venda" });
    const rL3 = await cc("criarEstabelecimentoAction", owner, { name: "M80 Loja 3", kind: "ponto_venda" });
    const L1 = dados(rL1);
    const L2 = dados(rL2);
    const L3 = dados(rL3);
    if (!L1 || !L2 || !L3) throw new Error(`não criou as lojas: ${j([rL1, rL2, rL3])}`);
    await prisma.establishment.update({ where: { id: L3.id }, data: { allow_negative_stock: true } });

    type Prod = { id: string; product_id: string; p: Record<string, string> };
    let seq = 0;
    const mkProduto = async (nome: string, unit = "quilograma", pres: [string, number, boolean][] = []): Promise<Prod> => {
      seq += 1;
      const r = await cc("criarProdutoEmporioAction", op, { name: `M80 ${nome} ${seq}`, category_id: cat.id, base_unit: unit });
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
    const SEP: [string, number, boolean][] = [["Saca 10 kg", 10, true], ["Quilo", 1, false]];

    const linhaDaLoja = async (ator: Ator, est: string, prod: Prod): Promise<Dado> =>
      lista(dados(await ee("saldoDaLojaAction", ator, est))).find((l) => l.emporio_product_id === prod.id);
    const total = async (est: string, prod: Prod, ator: Ator = admin) => {
      const l = await linhaDaLoja(ator, est, prod);
      return l ? n(l.total_qty) : 0;
    };
    const movimentosDe = (prod: Prod, extra: Dado = {}) =>
      db.stockMovement.findMany({ where: { product_id: prod.product_id, ...extra }, orderBy: { created_at: "asc" } });
    const implantar = async (est: string, prod: Prod, loose: number, cost?: number, sealed: Dado[] = []) => {
      const r = await ee("implantarEstoqueAction", op, { establishment_id: est, emporio_product_id: prod.id, sealed, loose_qty: loose, ...(cost === undefined ? {} : { unit_cost: cost }) });
      if (!r.ok) throw new Error(`implantar: ${j(r)}`);
    };

    let chaveSeq = 0;
    const chave = (p: string) => `m80-${p}-${stamp}-${(chaveSeq += 1)}`;
    const enviar = (ator: Ator, origem: string, destino: string, items: Dado[], over: Dado = {}) =>
      tt("enviarTransferenciaAction", ator, { operation_key: chave("tr"), origin_establishment_id: origem, destination_establishment_id: destino, items, ...over });
    const trId = (r: R): string => dados(r)?.id ?? dados(r)?.transfer_id;
    const itensDe = (id: string) => db.stockTransferItem.findMany({ where: { transfer_id: id }, orderBy: { created_at: "asc" } });
    const receberTudo = async (ator: Ator, id: string) => {
      const its = await itensDe(id);
      return tt("receberTransferenciaAction", ator, id, { items: its.map((i) => ({ item_id: i.id, received_qty: n(i.sent_qty) })) });
    };
    const comprar = (ator: Ator, over: Dado = {}) =>
      pp("criarCompraAction", ator, {
        operation_key: chave("cp"),
        establishment_id: L1.id,
        purchased_at: new Date(),
        received: true,
        freight: 0,
        payment: { kind: "a_vista" },
        items: [],
        ...over,
      });
    const financeiros = () => db.financialEntry.count();
    const finAntes = await financeiros();

    // ---------------------------------------------------------------- 1
    console.log("1. Transferência enviada: sai da origem na hora, não entra no destino");
    const A = await mkProduto("Farelo");
    await implantar(L1.id, A, 100, 10);
    await ee("definirLimitesAction", admin, { establishment_id: L2.id, emporio_product_id: A.id, min_qty: 20, max_qty: 50 });
    const antesSug = await linhaDaLoja(op, L2.id, A);
    check("antes de enviar, o destino (saldo 0, máx. 50) sugere 50", perto(n(antesSug?.suggested_qty), 50), j(antesSug));
    const rA = await enviar(op, L1.id, L2.id, [{ emporio_product_id: A.id, quantity: 10 }]);
    check("OPERADOR envia 10 kg da Central para a Loja 2", rA.ok, j(rA));
    const idA = trId(rA);
    check("a origem cai na hora (100 para 90)", (await total(L1.id, A)) === 90);
    check("o destino não muda até o recebimento (0)", (await total(L2.id, A)) === 0);
    const trA = await db.stockTransfer.findUnique({ where: { id: idA } });
    check("status em_transito, origem e destino gravados, quem enviou", trA?.status === "em_transito" && trA.origin_establishment_id === L1.id && trA.destination_establishment_id === L2.id && trA.sent_by_user_id === op.id, j(trA));
    const saidasA = await movimentosDe(A, { movement_type: "transferencia_saida" });
    check("uma transferencia_saida na origem, ligada à transferência, com o custo médio (10)", saidasA.length === 1 && saidasA[0].transfer_id === idA && saidasA[0].establishment_id === L1.id && n(saidasA[0].quantity) === 10 && perto(n(saidasA[0].unit_cost), 10), j(saidasA.map((m) => [m.establishment_id, m.quantity, m.unit_cost])));
    check("nenhuma transferencia_entrada ainda", (await movimentosDe(A, { movement_type: "transferencia_entrada" })).length === 0);
    const itA = await itensDe(idA);
    check("item guarda sent_qty 10, unit_cost 10 e received_qty vazio", itA.length === 1 && n(itA[0].sent_qty) === 10 && perto(n(itA[0].unit_cost), 10) && itA[0].received_qty === null, j(itA));
    const sugA = await linhaDaLoja(op, L2.id, A);
    check("saldoDaLoja do destino desconta o em trânsito: 50 - (0 + 10) = 40", perto(n(sugA?.suggested_qty), 40), j(sugA));
    const reporA = lista(dados(await ee("precisaReporAction", op, { establishment_id: L2.id }))).find((l) => l.emporio_product_id === A.id);
    check("precisaRepor do destino também sugere 40", perto(n(reporA?.suggested_qty), 40), j(reporA));
    check("VISUALIZADOR envia: 403", recusa(await enviar(visu, L1.id, L2.id, [{ emporio_product_id: A.id, quantity: 1 }]), "FORBIDDEN", 403));

    // ---------------------------------------------------------------- 2
    console.log("\n2. Recebimento total e custo médio do destino");
    const rRecA = await receberTudo(op, idA);
    check("receber o total", rRecA.ok, j(rRecA));
    check("destino ganha 10", (await total(L2.id, A)) === 10);
    check("origem segue 90", (await total(L1.id, A)) === 90);
    const lA2 = await linhaDaLoja(op, L2.id, A);
    check("destino vazio fica com o custo da origem (10)", perto(n(lA2?.average_cost), 10), j(lA2?.average_cost));
    const entA = await movimentosDe(A, { movement_type: "transferencia_entrada" });
    check("uma transferencia_entrada no destino com received_qty e o mesmo unit_cost", entA.length === 1 && entA[0].establishment_id === L2.id && n(entA[0].quantity) === 10 && perto(n(entA[0].unit_cost), 10) && entA[0].transfer_id === idA, j(entA.map((m) => [m.establishment_id, m.quantity, m.unit_cost])));
    const trA2 = await db.stockTransfer.findUnique({ where: { id: idA } });
    check("status recebida, com quem recebeu e quando", trA2?.status === "recebida" && !!trA2.received_at && trA2.received_by_user_id === op.id, j(trA2));
    check("sem sugestão de trânsito depois de recebida: saldo 10, sugestão 40 (não 30)", perto(n((await linhaDaLoja(op, L2.id, A))?.suggested_qty), 40));

    const B = await mkProduto("Sal");
    await implantar(L1.id, B, 50, 10);
    await implantar(L2.id, B, 50, 20);
    const rB = await enviar(op, L1.id, L2.id, [{ emporio_product_id: B.id, quantity: 50 }]);
    check("destino com estoque a outro custo: envia 50 a 10", rB.ok, j(rB));
    check("recebe 50", (await receberTudo(op, trId(rB))).ok);
    const lB2 = await linhaDaLoja(op, L2.id, B);
    check("destino 100 kg com média ponderada (50x20 + 50x10)/100 = 15", n(lB2?.total_qty) === 100 && perto(n(lB2?.average_cost), 15), j([lB2?.total_qty, lB2?.average_cost]));
    check("a origem zerou (0) e a média da origem não foi afetada", (await total(L1.id, B)) === 0);
    const finTransf = await db.financialEntry.count({ where: { related_id: { in: [idA, trId(rB)] } } });
    check("nenhum FinancialEntry criado pela transferência (aceite §25)", finTransf === 0 && (await financeiros()) === finAntes, `${finTransf} / ${await financeiros()} contra ${finAntes}`);

    // ---------------------------------------------------------------- 3
    console.log("\n3. Chegou menos ou mais (Q74)");
    const Cn = await mkProduto("Aveia");
    await implantar(L1.id, Cn, 100, 10);
    const rC = await enviar(op, L1.id, L2.id, [{ emporio_product_id: Cn.id, quantity: 10 }]);
    const idC = trId(rC);
    const [iC] = await itensDe(idC);
    const movAntes = await db.stockMovement.count({ where: { product_id: Cn.product_id } });
    const semMotivo = await tt("receberTransferenciaAction", op, idC, { items: [{ item_id: iC.id, received_qty: 8 }] });
    check("chegou menos sem motivo: 422 em items", recusa(semMotivo, "VALIDATION_ERROR", 422, "items"), j(semMotivo));
    const maisQue = await tt("receberTransferenciaAction", op, idC, { items: [{ item_id: iC.id, received_qty: 12, loss_reason: "avaria" }] });
    check("chegou mais (12 de 10): 422 em items", recusa(maisQue, "VALIDATION_ERROR", 422, "items"), j(maisQue));
    check("as recusas não gravaram nada e a transferência segue em trânsito", (await db.stockMovement.count({ where: { product_id: Cn.product_id } })) === movAntes && (await db.stockTransfer.findUnique({ where: { id: idC } }))?.status === "em_transito" && (await total(L2.id, Cn)) === 0);
    const rMenos = await tt("receberTransferenciaAction", op, idC, { items: [{ item_id: iC.id, received_qty: 8, loss_reason: "avaria" }] });
    check("receber 8 de 10 com motivo: aceito", rMenos.ok, j(rMenos));
    check("destino +8", (await total(L2.id, Cn)) === 8);
    check("origem segue em -10 (90), sem movimentação de volta", (await total(L1.id, Cn)) === 90);
    check("sem movimentação nova pela diferença: só 1 saída e 1 entrada", (await movimentosDe(Cn, { movement_type: "transferencia_saida" })).length === 1 && (await movimentosDe(Cn, { movement_type: "transferencia_entrada" })).length === 1 && (await db.stockMovement.count({ where: { product_id: Cn.product_id } })) === movAntes + 1);
    const iC2 = (await itensDe(idC))[0];
    check("o item guarda received_qty 8 e o motivo", n(iC2.received_qty) === 8 && iC2.loss_reason === "avaria", j(iC2));
    check("a entrada no destino é de 8", n((await movimentosDe(Cn, { movement_type: "transferencia_entrada" }))[0]?.quantity) === 8);

    // ---------------------------------------------------------------- 4
    console.log("\n4. Cancelar (Q73)");
    const Dd = await mkProduto("Trigo");
    await implantar(L1.id, Dd, 100, 10);
    const rD1 = await enviar(op, L1.id, L2.id, [{ emporio_product_id: Dd.id, quantity: 10 }]);
    const idD1 = trId(rD1);
    check("antes de cancelar: origem 90", (await total(L1.id, Dd)) === 90);
    check("outro OPERADOR cancela: 403", recusa(await tt("cancelarTransferenciaAction", op2, idD1, { reason: "x" }), "FORBIDDEN", 403));
    check("e a origem segue 90", (await total(L1.id, Dd)) === 90 && (await db.stockTransfer.findUnique({ where: { id: idD1 } }))?.status === "em_transito");
    const rCx = await tt("cancelarTransferenciaAction", op, idD1, { reason: "enviei errado" });
    check("quem enviou cancela", rCx.ok, j(rCx));
    check("a origem recupera o saldo (100)", (await total(L1.id, Dd)) === 100);
    const trD1 = await db.stockTransfer.findUnique({ where: { id: idD1 } });
    check("status cancelada com motivo e quem cancelou", trD1?.status === "cancelada" && !!trD1.canceled_at && trD1.canceled_reason === "enviei errado" && trD1.canceled_by_user_id === op.id, j(trD1));
    const sD = await movimentosDe(Dd, { movement_type: "transferencia_saida" });
    check("a saída continua existindo, marcada cancelada (nada apagado)", sD.length === 1 && sD[0].canceled_at !== null);
    check("receber depois de cancelada: 409 TRANSFER_NOT_IN_TRANSIT", recusa(await receberTudo(op, idD1), "TRANSFER_NOT_IN_TRANSIT", 409));
    check("cancelar de novo: 409 TRANSFER_NOT_IN_TRANSIT", recusa(await tt("cancelarTransferenciaAction", op, idD1, { reason: "x" }), "TRANSFER_NOT_IN_TRANSIT", 409));
    check("e o destino segue 0 e a origem 100", (await total(L2.id, Dd)) === 0 && (await total(L1.id, Dd)) === 100);
    const rD2 = await enviar(op, L1.id, L2.id, [{ emporio_product_id: Dd.id, quantity: 5 }]);
    check("ADMIN cancela transferência enviada por outro", (await tt("cancelarTransferenciaAction", admin, trId(rD2), { reason: "gestão" })).ok && (await total(L1.id, Dd)) === 100);
    const rD3 = await enviar(op, L1.id, L2.id, [{ emporio_product_id: Dd.id, quantity: 5 }]);
    check("receber e depois cancelar: 409 TRANSFER_NOT_IN_TRANSIT", (await receberTudo(op, trId(rD3))).ok && recusa(await tt("cancelarTransferenciaAction", admin, trId(rD3), { reason: "tarde" }), "TRANSFER_NOT_IN_TRANSIT", 409));
    check("receber de novo: 409 TRANSFER_NOT_IN_TRANSIT e o destino segue 5", recusa(await receberTudo(op, trId(rD3)), "TRANSFER_NOT_IN_TRANSIT", 409) && (await total(L2.id, Dd)) === 5);

    // ---------------------------------------------------------------- 5
    console.log("\n5. Recusas no envio");
    check("origem igual ao destino: 422 em destination_establishment_id", recusa(await enviar(op, L1.id, L1.id, [{ emporio_product_id: Dd.id, quantity: 1 }]), "VALIDATION_ERROR", 422, "destination_establishment_id"));
    const antesRec = await total(L1.id, Dd);
    const rAcima = await enviar(op, L1.id, L2.id, [{ emporio_product_id: Dd.id, quantity: antesRec + 1 }]);
    check("acima do saldo: 409 INSUFFICIENT_STOCK em items", recusa(rAcima, "INSUFFICIENT_STOCK", 409, "items"), j(rAcima));
    check("e a origem não mudou", (await total(L1.id, Dd)) === antesRec);
    const exato = await enviar(op, L1.id, L2.id, [{ emporio_product_id: Dd.id, quantity: antesRec }]);
    check("enviar exatamente o saldo é aceito (origem 0)", exato.ok && (await total(L1.id, Dd)) === 0, j(exato));
    const Neg = await mkProduto("Negativável");
    const rNeg = await enviar(op, L3.id, L2.id, [{ emporio_product_id: Neg.id, quantity: 5 }]);
    check("origem com negativo liberado envia sem saldo", rNeg.ok, j(rNeg));
    check("e o saldo da origem vira -5", (await total(L3.id, Neg)) === -5);
    const kDup = chave("dup");
    const Du = await mkProduto("Duplicável");
    await implantar(L1.id, Du, 30, 5);
    const corpoDup = [{ emporio_product_id: Du.id, quantity: 7 }];
    const d1 = await enviar(op, L1.id, L2.id, corpoDup, { operation_key: kDup });
    const d2 = await enviar(op, L1.id, L2.id, corpoDup, { operation_key: kDup });
    check("mesma operation_key: as duas ok, mesma transferência", d1.ok && d2.ok && trId(d1) === trId(d2), j([d1, d2]));
    check("uma transferência só, uma saída só, origem 23", (await db.stockTransfer.count({ where: { operation_key: kDup } })) === 1 && (await movimentosDe(Du, { movement_type: "transferencia_saida" })).length === 1 && (await total(L1.id, Du)) === 23);
    check("item sem quantidade positiva: 422", recusa(await enviar(op, L1.id, L2.id, [{ emporio_product_id: Du.id, quantity: 0 }]), "VALIDATION_ERROR", 422));

    // ---------------------------------------------------------------- 6
    console.log("\n6. Lacrado e avulso na mesma transferência (Q31, Q75)");
    const Em = await mkProduto("Ração", "quilograma", SEP);
    await implantar(L1.id, Em, 4, 10, [{ presentation_id: Em.p["Saca 10 kg"], packages: 3 }]);
    const rE = await enviar(op, L1.id, L2.id, [
      { emporio_product_id: Em.id, presentation_id: Em.p["Saca 10 kg"], packages: 2 },
      { emporio_product_id: Em.id, quantity: 3 },
    ]);
    check("transferência com um item lacrado e um avulso", rE.ok, j(rE));
    const idE = trId(rE);
    const lE1 = await linhaDaLoja(op, L1.id, Em);
    check("a origem fica com 1 saca (10 kg) e 1 kg avulso (total 11)", n(lE1?.total_qty) === 11 && n(lE1?.loose_qty) === 1 && n(lista(lE1?.sealed)[0]?.packages) === 1, j(lE1));
    const itE = await itensDe(idE);
    const iLac = itE.find((i) => i.package_state === "lacrado");
    const iAvu = itE.find((i) => i.package_state === "avulso");
    check("itens: lacrado com a apresentação e 20 kg, avulso sem apresentação e 3 kg", !!iLac && iLac.presentation_id === Em.p["Saca 10 kg"] && n(iLac.sent_qty) === 20 && !!iAvu && iAvu.presentation_id === null && n(iAvu.sent_qty) === 3, j(itE.map((i) => [i.package_state, i.presentation_id, i.sent_qty])));
    const sE = await movimentosDe(Em, { movement_type: "transferencia_saida" });
    check("saídas: uma lacrada (20, com apresentação) e uma avulsa (3)", sE.length === 2 && sE.some((m) => m.package_state === "lacrado" && n(m.quantity) === 20 && m.presentation_id === Em.p["Saca 10 kg"]) && sE.some((m) => m.package_state === "avulso" && n(m.quantity) === 3 && m.presentation_id === null), j(sE.map((m) => [m.package_state, m.quantity])));
    check("destino ainda sem nada", (await total(L2.id, Em)) === 0);
    check("recebe tudo", (await receberTudo(op, idE)).ok);
    const lE2 = await linhaDaLoja(op, L2.id, Em);
    check("destino: 2 sacas lacradas (20 kg) e 3 kg avulsos, total 23", n(lE2?.total_qty) === 23 && n(lE2?.loose_qty) === 3 && n(lista(lE2?.sealed)[0]?.packages) === 2 && n(lista(lE2?.sealed)[0]?.base_qty) === 20, j(lE2));
    const enE = await movimentosDe(Em, { movement_type: "transferencia_entrada" });
    check("entradas no estado certo: lacrada com apresentação, avulsa sem", enE.length === 2 && enE.some((m) => m.package_state === "lacrado" && m.presentation_id === Em.p["Saca 10 kg"] && n(m.quantity) === 20) && enE.some((m) => m.package_state === "avulso" && m.presentation_id === null && n(m.quantity) === 3), j(enE.map((m) => [m.package_state, m.presentation_id, m.quantity])));

    const Mix = await mkProduto("Vários");
    const Mix2 = await mkProduto("Vários 2");
    await implantar(L1.id, Mix, 10, 3);
    await implantar(L1.id, Mix2, 10, 4);
    const rMix = await enviar(op, L1.id, L2.id, [{ emporio_product_id: Mix.id, quantity: 4 }, { emporio_product_id: Mix2.id, quantity: 6 }]);
    check("vários produtos numa transferência: uma saída por item", rMix.ok && (await itensDe(trId(rMix))).length === 2 && (await total(L1.id, Mix)) === 6 && (await total(L1.id, Mix2)) === 4, j(rMix));
    const rMixCurta = await enviar(op, L1.id, L2.id, [{ emporio_product_id: Mix.id, quantity: 1 }, { emporio_product_id: Mix2.id, quantity: 99 }]);
    check("um item acima do saldo recusa a transferência inteira (nada sai)", recusa(rMixCurta, "INSUFFICIENT_STOCK", 409, "items") && (await total(L1.id, Mix)) === 6);

    // ---------------------------------------------------------------- 9
    console.log("\n7. Composição (Q77)");
    const Milho = await mkProduto("Milho moído");
    const Soja = await mkProduto("Farelo de soja");
    const Premix = await mkProduto("Premix");
    const Final = await mkProduto("Ração final");
    const itensF = [
      { component_emporio_product_id: Milho.id, quantity: 65 },
      { component_emporio_product_id: Soja.id, quantity: 29 },
      { component_emporio_product_id: Premix.id, quantity: 6 },
    ];
    const movCont = () => db.stockMovement.count();
    const m0 = await movCont();
    const rDef = await dd("definirComposicaoAction", admin, Final.id, { reference_qty: 100, items: itensF });
    check("ADMIN define 65/29/6 para 100 kg", rDef.ok, j(rDef));
    check("definir a composição não movimenta estoque", (await movCont()) === m0);
    const rLer = await dd("lerComposicaoAction", op, Final.id);
    const itLer = lista(dados(rLer)?.items ?? dados(rLer));
    check("lerComposicaoAction devolve os 3 itens com as quantidades", rLer.ok && itLer.length === 3 && [65, 29, 6].every((q) => itLer.some((i) => n(i.quantity) === q)), j(dados(rLer)));
    check("OPERADOR define composição: 403", recusa(await dd("definirComposicaoAction", op, Final.id, { reference_qty: 100, items: itensF }), "FORBIDDEN", 403));
    check("a recusa não mudou a composição", (await db.compositionItem.count({ where: { composition: { emporio_product_id: Final.id } } })) === 3);
    const rSubst = await dd("definirComposicaoAction", owner, Final.id, { reference_qty: 100, items: itensF.slice(0, 2) });
    check("PUT substitui a composição inteira (2 itens)", rSubst.ok && (await db.compositionItem.count({ where: { composition: { emporio_product_id: Final.id } } })) === 2);
    await dd("definirComposicaoAction", admin, Final.id, { reference_qty: 100, items: itensF });
    const X = await mkProduto("Ciclo X");
    const Y = await mkProduto("Ciclo Y");
    const Zc = await mkProduto("Ciclo Z");
    check("ciclo direto (produto como componente de si): 422 em items", recusa(await dd("definirComposicaoAction", admin, X.id, { reference_qty: 1, items: [{ component_emporio_product_id: X.id, quantity: 1 }] }), "VALIDATION_ERROR", 422, "items"));
    check("X = Y e Y = Z são aceitas", (await dd("definirComposicaoAction", admin, X.id, { reference_qty: 1, items: [{ component_emporio_product_id: Y.id, quantity: 1 }] })).ok && (await dd("definirComposicaoAction", admin, Y.id, { reference_qty: 1, items: [{ component_emporio_product_id: Zc.id, quantity: 1 }] })).ok);
    const rCic = await dd("definirComposicaoAction", admin, Zc.id, { reference_qty: 1, items: [{ component_emporio_product_id: X.id, quantity: 1 }] });
    check("ciclo indireto (Z = X, X = Y, Y = Z): 422 em items", recusa(rCic, "VALIDATION_ERROR", 422, "items"), j(rCic));
    check("ciclo de dois (Y = X): 422 em items", recusa(await dd("definirComposicaoAction", admin, Y.id, { reference_qty: 1, items: [{ component_emporio_product_id: X.id, quantity: 1 }] }), "VALIDATION_ERROR", 422, "items"));
    check("o ciclo recusado não gravou composição para Z", (await db.composition.count({ where: { emporio_product_id: Zc.id } })) === 0);

    // ---------------------------------------------------------------- 10
    console.log("\n8. Produção do aceite: 400 kg baixam 260, 116 e 24 kg");
    await implantar(L1.id, Milho, 300, 2);
    await implantar(L1.id, Soja, 150, 4);
    await implantar(L1.id, Premix, 30, 10);
    const kP1 = chave("prod");
    const rP1 = await dd("produzirAction", op, { operation_key: kP1, establishment_id: L1.id, emporio_product_id: Final.id, produced_qty: 400 });
    check("OPERADOR produz 400 kg", rP1.ok, j(rP1));
    const pe1 = await db.productionEntry.findFirst({ where: { operation_key: kP1 } });
    const idP1 = dados(rP1)?.id ?? pe1?.id ?? "";
    check("Milho 300 para 40 (baixa exata de 260)", (await total(L1.id, Milho)) === 40, String(await total(L1.id, Milho)));
    check("Soja 150 para 34 (baixa exata de 116)", (await total(L1.id, Soja)) === 34, String(await total(L1.id, Soja)));
    check("Premix 30 para 6 (baixa exata de 24)", (await total(L1.id, Premix)) === 6, String(await total(L1.id, Premix)));
    check("o produto ganha 400", (await total(L1.id, Final)) === 400);
    const consumos = await db.stockMovement.findMany({ where: { production_id: idP1, movement_type: "producao_consumo" } });
    check("três producao_consumo ligadas à produção, nas quantidades 260, 116 e 24", consumos.length === 3 && [260, 116, 24].every((q) => consumos.some((m) => n(m.quantity) === q)), j(consumos.map((m) => m.quantity)));
    check("e uma producao_entrada de 400 ligada à produção, na loja", (await db.stockMovement.count({ where: { production_id: idP1, movement_type: "producao_entrada", establishment_id: L1.id } })) === 1 && n((await movimentosDe(Final, { movement_type: "producao_entrada" }))[0]?.quantity) === 400);
    check("ProductionEntry guarda quantidade e quem produziu", n(pe1?.produced_qty) === 400 && pe1?.created_by_user_id === op.id && pe1?.establishment_id === L1.id, j(pe1));
    const snap = j(pe1?.composition_snapshot);
    check("a cópia da composição guarda reference_qty e os três itens", !!pe1 && (pe1.composition_snapshot as Dado)?.reference_qty !== undefined && lista((pe1.composition_snapshot as Dado)?.items).length === 3 && snap.includes("65") && snap.includes("29"), snap);
    await dd("definirComposicaoAction", admin, Final.id, { reference_qty: 100, items: [{ component_emporio_product_id: Milho.id, quantity: 50 }, { component_emporio_product_id: Soja.id, quantity: 50 }] });
    const pe1b = await db.productionEntry.findUnique({ where: { id: idP1 } });
    check("editar a composição depois não muda a cópia da produção (Q43)", j(pe1b?.composition_snapshot) === snap && lista((pe1b?.composition_snapshot as Dado)?.items).length === 3, j(pe1b?.composition_snapshot));
    await dd("definirComposicaoAction", admin, Final.id, { reference_qty: 100, items: itensF });

    // ---------------------------------------------------------------- 12 custo
    console.log("\n9. Custo da produção (Q78)");
    const custoEsperado = (260 * 2 + 116 * 4 + 24 * 10) / 400;
    check("ProductionEntry.unit_cost = soma(baixa x custo médio) / produzido = 3,06", perto(n(pe1?.unit_cost), custoEsperado) && pe1?.estimated === false, j([pe1?.unit_cost, pe1?.estimated]));
    const entFinal = (await movimentosDe(Final, { movement_type: "producao_entrada" }))[0];
    check("a producao_entrada grava esse unit_cost", perto(n(entFinal?.unit_cost), custoEsperado), String(entFinal?.unit_cost));
    check("os consumos saem pelo custo médio do componente (2, 4 e 10)", [[260, 2], [116, 4], [24, 10]].every(([q, c]) => consumos.some((m) => n(m.quantity) === q && perto(n(m.unit_cost), c))), j(consumos.map((m) => [m.quantity, m.unit_cost])));
    const lFinal = await linhaDaLoja(op, L1.id, Final);
    check("a linha de saldo do produto tem a média 3,06 e não é estimada", perto(n(lFinal?.average_cost), custoEsperado) && lFinal?.estimated === false, j([lFinal?.average_cost, lFinal?.estimated]));
    const Hc = await mkProduto("Componente sem custo");
    const Gp = await mkProduto("Produto estimado");
    await dd("definirComposicaoAction", admin, Gp.id, { reference_qty: 10, items: [{ component_emporio_product_id: Hc.id, quantity: 10 }] });
    await implantar(L1.id, Hc, 50);
    const kG = chave("prod");
    const rG = await dd("produzirAction", op, { operation_key: kG, establishment_id: L1.id, emporio_product_id: Gp.id, produced_qty: 5 });
    check("produz com componente implantado sem custo", rG.ok && (await total(L1.id, Hc)) === 45, j(rG));
    const peG = await db.productionEntry.findFirst({ where: { operation_key: kG } });
    check("a produção sai estimated", peG?.estimated === true, j(peG));
    check("e a linha de saldo do produto também", (await linhaDaLoja(op, L1.id, Gp))?.estimated === true);

    // ---------------------------------------------------------------- 11 rendimento
    console.log("\n10. Rendimento (Q72)");
    const Comp1 = await mkProduto("Base do rendimento");
    const Rend = await mkProduto("Com rendimento");
    await dd("definirComposicaoAction", admin, Rend.id, { reference_qty: 100, yield_pct: 95, items: [{ component_emporio_product_id: Comp1.id, quantity: 65 }] });
    await implantar(L1.id, Comp1, 200, 1);
    const rRend = await dd("produzirAction", op, { operation_key: chave("prod"), establishment_id: L1.id, emporio_product_id: Rend.id, produced_qty: 100 });
    check("produz 100 kg com rendimento de 95%", rRend.ok, j(rRend));
    const idRend = dados(rRend)?.id;
    const cRend = await db.stockMovement.findMany({ where: { product_id: Comp1.product_id, movement_type: "producao_consumo" } });
    check("baixa 65 / 0,95 = 68,421 (3 casas)", cRend.length === 1 && perto3(n(cRend[0].quantity), 68.421), j(cRend.map((m) => m.quantity)));
    check("saldo do componente 131,579", perto3(await total(L1.id, Comp1), 131.579), String(await total(L1.id, Comp1)));
    check("o produto ganha os 100 kg produzidos (não os 95)", (await total(L1.id, Rend)) === 100);

    // ---------------------------------------------------------------- 13
    console.log("\n11. Falta de componente e produto sem composição");
    const mAntes = await movCont();
    const peAntes = await db.productionEntry.count();
    const rFalta = await dd("produzirAction", op, { operation_key: chave("prod"), establishment_id: L1.id, emporio_product_id: Final.id, produced_qty: 1000 });
    check("falta componente: 409 INSUFFICIENT_STOCK em components", recusa(rFalta, "INSUFFICIENT_STOCK", 409, "components"), j(rFalta));
    check("nada gravado: nenhuma movimentação nem ProductionEntry nova", (await movCont()) === mAntes && (await db.productionEntry.count()) === peAntes);
    check("e os saldos seguem 40, 34 e 6", (await total(L1.id, Milho)) === 40 && (await total(L1.id, Soja)) === 34 && (await total(L1.id, Premix)) === 6);
    const Sem = await mkProduto("Sem composição");
    check("produto sem composição: 422 COMPOSITION_REQUIRED", recusa(await dd("produzirAction", op, { operation_key: chave("prod"), establishment_id: L1.id, emporio_product_id: Sem.id, produced_qty: 5 }), "COMPOSITION_REQUIRED", 422));
    check("VISUALIZADOR produz: 403", recusa(await dd("produzirAction", visu, { operation_key: chave("prod"), establishment_id: L1.id, emporio_product_id: Final.id, produced_qty: 1 }), "FORBIDDEN", 403));
    const rNegP = await dd("produzirAction", op, { operation_key: chave("prod"), establishment_id: L3.id, emporio_product_id: Final.id, produced_qty: 100 });
    check("loja com negativo liberado produz sem os componentes", rNegP.ok, j(rNegP));
    check("e o componente vira -65 nessa loja", (await total(L3.id, Milho)) === -65);

    // ---------------------------------------------------------------- 14
    console.log("\n12. Comprar produto com composição não baixa componente (aceite §25)");
    const milhoAntes = await total(L1.id, Milho);
    const sojaAntes = await total(L1.id, Soja);
    const consumosAntes = await db.stockMovement.count({ where: { movement_type: "producao_consumo" } });
    const rCompra = await comprar(op, { items: [{ emporio_product_id: Final.id, quantity: 50, item_total: 500 }] });
    check("compra recebida de produto que tem composição", rCompra.ok, j(rCompra));
    check("o produto ganha 50 (450)", (await total(L1.id, Final)) === 450);
    check("nenhum componente baixa", (await total(L1.id, Milho)) === milhoAntes && (await total(L1.id, Soja)) === sojaAntes);
    check("nenhuma producao_consumo nova", (await db.stockMovement.count({ where: { movement_type: "producao_consumo" } })) === consumosAntes);

    // ---------------------------------------------------------------- 15
    console.log("\n13. Cancelar produção (Q79) e chave de operação");
    check("OPERADOR cancela produção: 403", recusa(await dd("cancelarProducaoAction", op, idRend, { reason: "x" }), "FORBIDDEN", 403));
    check("e a produção segue de pé", (await total(L1.id, Rend)) === 100);
    const rCxP = await dd("cancelarProducaoAction", admin, idRend, { reason: "lançada errada" });
    check("ADMIN cancela a produção", rCxP.ok, j(rCxP));
    check("os componentes voltam (200)", (await total(L1.id, Comp1)) === 200);
    check("o produto sai (0)", (await total(L1.id, Rend)) === 0);
    const peRend = await db.productionEntry.findUnique({ where: { id: idRend } });
    check("a produção guarda canceled_at e o motivo", !!peRend?.canceled_at && peRend.canceled_reason === "lançada errada", j(peRend));
    const movRend = await db.stockMovement.findMany({ where: { production_id: idRend } });
    check("nada é apagado: as 2 movimentações seguem, marcadas canceladas", movRend.length === 2 && movRend.every((m) => m.canceled_at !== null), j(movRend.map((m) => [m.movement_type, m.canceled_at])));
    const rP2 = await dd("produzirAction", op, { operation_key: chave("prod"), establishment_id: L1.id, emporio_product_id: Final.id, produced_qty: 20 });
    // 450 + 20 = 470 antes do descarte
    await ee("registrarPerdaAction", op, { establishment_id: L1.id, emporio_product_id: Final.id, quantity: 460, reason: "avaria" });
    check("produto vendido/perdido além do que sobra (10 de 20): saldo 10", (await total(L1.id, Final)) === 10);
    const milhoMid = await total(L1.id, Milho);
    const rCxLimite = await dd("cancelarProducaoAction", admin, dados(rP2)?.id, { reason: "tarde demais" });
    check("cancelar com o produto já consumido: 409 INSUFFICIENT_STOCK", recusa(rCxLimite, "INSUFFICIENT_STOCK", 409), j(rCxLimite));
    check("e nada mudou (componentes e produto)", (await total(L1.id, Milho)) === milhoMid && (await total(L1.id, Final)) === 10 && (await db.productionEntry.findUnique({ where: { id: dados(rP2)?.id } }))?.canceled_at === null);

    const Q = await mkProduto("Produzido uma vez");
    const Hq = await mkProduto("Insumo de Q");
    await dd("definirComposicaoAction", admin, Q.id, { reference_qty: 1, items: [{ component_emporio_product_id: Hq.id, quantity: 1 }] });
    await implantar(L1.id, Hq, 100, 1);
    const kQ = chave("prod");
    const corpoQ = { operation_key: kQ, establishment_id: L1.id, emporio_product_id: Q.id, produced_qty: 5 };
    const q1 = await dd("produzirAction", op, corpoQ);
    const q2 = await dd("produzirAction", op, corpoQ);
    check("mesma operation_key: as duas ok, mesma produção", q1.ok && q2.ok && dados(q1)?.id === dados(q2)?.id, j([q1, q2]));
    check("uma produção só, componente 95 e produto 5", (await db.productionEntry.count({ where: { operation_key: kQ } })) === 1 && (await total(L1.id, Hq)) === 95 && (await total(L1.id, Q)) === 5);

    const Q2 = await mkProduto("Produzido lacrado", "quilograma", SEP);
    const Hq3 = await mkProduto("Insumo de Q2");
    await dd("definirComposicaoAction", admin, Q2.id, { reference_qty: 1, items: [{ component_emporio_product_id: Hq3.id, quantity: 1 }] });
    await implantar(L1.id, Hq3, 100, 1);
    const rQ2 = await dd("produzirAction", op, { operation_key: chave("prod"), establishment_id: L1.id, emporio_product_id: Q2.id, produced_qty: 25, sealed: [{ presentation_id: Q2.p["Saca 10 kg"], packages: 2 }] });
    const lQ2 = await linhaDaLoja(op, L1.id, Q2);
    check("produto que separa: entra lacrado nas embalagens informadas e o resto avulso", rQ2.ok && n(lQ2?.total_qty) === 25 && n(lQ2?.loose_qty) === 5 && n(lista(lQ2?.sealed)[0]?.packages) === 2, j([rQ2.ok ? "ok" : rQ2, lQ2]));

    // ---------------------------------------------------------------- 7 e 8
    console.log("\n14. Vínculo (Q56) e transferências paradas (Q33)");
    const F = await mkProduto("Fubá");
    await implantar(L1.id, F, 100, 2);
    await implantar(L2.id, F, 20, 2);
    check("vincular userO à Central e userD à Loja 2", (await cc("definirVinculosAction", owner, L1.id, [userO.id])).ok && (await cc("definirVinculosAction", owner, L2.id, [userD.id])).ok);
    const rV = await enviar(userO, L1.id, L2.id, [{ emporio_product_id: F.id, quantity: 10 }]);
    check("usuário só da origem envia", rV.ok, j(rV));
    check("usuário só da origem recebe 404 ao receber", recusa(await receberTudo(userO, trId(rV)), "NOT_FOUND", 404));
    check("e a transferência segue em trânsito", (await db.stockTransfer.findUnique({ where: { id: trId(rV) } }))?.status === "em_transito" && (await total(L2.id, F)) === 20);
    check("usuário só do destino envia da origem: 404", recusa(await enviar(userD, L1.id, L2.id, [{ emporio_product_id: F.id, quantity: 1 }]), "NOT_FOUND", 404));
    check("e a origem seguiu em 90", (await total(L1.id, F)) === 90);
    check("usuário só do destino recebe", (await receberTudo(userD, trId(rV))).ok && (await total(L2.id, F)) === 30);

    const contagem = (r: R): number => {
      const d = dados(r);
      if (typeof d === "number") return d;
      if (d && typeof d.count === "number") return d.count;
      if (d && typeof d.total === "number") return d.total;
      return lista(d).length;
    };
    const r1d = await enviar(op, L1.id, L2.id, [{ emporio_product_id: F.id, quantity: 1 }]);
    await db.stockTransfer.update({ where: { id: trId(r1d) }, data: { sent_at: new Date(Date.now() - 1 * 86_400_000) } });
    check("a de 1 dia não é parada", contagem(await tt("transferenciasParadasAction", admin)) === 0);
    const r3d = await enviar(op, L1.id, L2.id, [{ emporio_product_id: F.id, quantity: 1 }]);
    await db.stockTransfer.update({ where: { id: trId(r3d) }, data: { sent_at: new Date(Date.now() - 3 * 86_400_000) } });
    check("a de 3 dias aparece para quem vê as duas lojas (conta 1)", contagem(await tt("transferenciasParadasAction", admin)) === 1);
    check("e para OPERADOR sem vínculo (vê as duas)", contagem(await tt("transferenciasParadasAction", op)) === 1);
    check("não aparece para quem só vê a origem", contagem(await tt("transferenciasParadasAction", userO)) === 0);
    check("nem para quem só vê o destino", contagem(await tt("transferenciasParadasAction", userD)) === 0);
    const lstUo = lista(dados(await tt("listarTransferenciasAction", userO)));
    check("userO só lista transferências que tocam a Central", lstUo.length > 0 && lstUo.every((t) => t.origin_establishment_id === L1.id || t.destination_establishment_id === L1.id), j(lstUo.length));
    check("lerTransferenciaAction devolve a transferência com os itens", (await tt("lerTransferenciaAction", admin, idE)).ok && lista(dados(await tt("lerTransferenciaAction", admin, idE))?.items).length === 2);

    // ---------------------------------------------------------------- 16
    console.log("\n15. Isolamento: B não vê nem age sobre A");
    const tb = (nome: string, ...a: unknown[]) => chamarEm(T, dbB, nome, ...a);
    const db_ = (nome: string, ...a: unknown[]) => chamarEm(D, dbB, nome, ...a);
    const eb = (nome: string, ...a: unknown[]) => chamarEm(C, dbB, nome, ...a);
    check("B lê transferência de A: 404", recusa(await tb("lerTransferenciaAction", ownerB, idE), "NOT_FOUND", 404));
    check("B recebe transferência de A: 404", recusa(await tb("receberTransferenciaAction", ownerB, trId(r3d), { items: [] }), "NOT_FOUND", 404));
    check("B cancela transferência de A: 404", recusa(await tb("cancelarTransferenciaAction", ownerB, trId(r3d), { reason: "x" }), "NOT_FOUND", 404));
    check("a de A segue em trânsito", (await db.stockTransfer.findUnique({ where: { id: trId(r3d) } }))?.status === "em_transito");
    check("B envia entre lojas de A: 404", recusa(await tb("enviarTransferenciaAction", ownerB, { operation_key: chave("trb"), origin_establishment_id: L1.id, destination_establishment_id: L2.id, items: [{ emporio_product_id: F.id, quantity: 1 }] }), "NOT_FOUND", 404));
    check("B lê composição de A: 404", recusa(await db_("lerComposicaoAction", ownerB, Final.id), "NOT_FOUND", 404));
    check("B define composição em produto de A: 404", recusa(await db_("definirComposicaoAction", ownerB, Final.id, { reference_qty: 1, items: [{ component_emporio_product_id: Milho.id, quantity: 1 }] }), "NOT_FOUND", 404));
    check("B produz na loja de A: 404", recusa(await db_("produzirAction", ownerB, { operation_key: chave("prodb"), establishment_id: L1.id, emporio_product_id: Final.id, produced_qty: 1 }), "NOT_FOUND", 404));
    check("B cancela produção de A: 404", recusa(await db_("cancelarProducaoAction", ownerB, dados(rP2)?.id, { reason: "x" }), "NOT_FOUND", 404));
    check("B não lista transferências nem produções de A", lista(dados(await tb("listarTransferenciasAction", ownerB))).length === 0 && lista(dados(await db_("listarProducoesAction", ownerB))).length === 0);
    check("B não tem transferência parada", contagem(await tb("transferenciasParadasAction", ownerB)) === 0);
    const lojaB1 = await eb("criarEstabelecimentoAction", ownerB, { name: "M80 B1", kind: "central" });
    const lojaB2 = await eb("criarEstabelecimentoAction", ownerB, { name: "M80 B2", kind: "ponto_venda" });
    const rKeyB = await tb("enviarTransferenciaAction", ownerB, { operation_key: kDup, origin_establishment_id: dados(lojaB1)?.id, destination_establishment_id: dados(lojaB2)?.id, items: [{ emporio_product_id: F.id, quantity: 1 }] });
    check("a operation_key é por conta: a chave de A não devolve a transferência de A para B", !(rKeyB.ok && trId(rKeyB) === trId(d1)), j(rKeyB));
    check("nada de A mudou por ação de B (Milho, Final, Fubá)", (await total(L1.id, Milho)) === milhoMid && (await total(L1.id, Final)) === 10 && (await total(L1.id, F)) === 88);
    void catB;
  } finally {
    for (const id of tenantIds) {
      try {
        await prisma.stockMovement.deleteMany({ where: { tenant_id: id } });
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
    console.log(falhas === 0 ? "\n✅ M80 verde" : `\n❌ M80: ${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  });
