import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F5: o Empório no Meu Dia, a área do Financeiro para
 * quem não vê o Empório, a composição a partir da Calculadora e os Primeiros
 * passos. Roda: `npm run test:m85`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F5: contrato", Q108 a
 * Q117), sem ler a implementação nova. Cada seção roda isolada: se uma quebrar,
 * as outras seguem.
 *
 * O que o contrato calava e esta suíte ASSUME:
 * - o 2º argumento de `areaPermitida` é `{ id, tenant_id, role }` (o SessionUser)
 *   e o retorno é a string da área (ou um objeto com `area`), com `await`;
 * - `primeirosPassosAction` devolve `{ complete, <lista de lojas> }`: a lista de
 *   lojas pode vir em qualquer chave (ou ser o próprio `data`), e cada loja traz
 *   `establishment_id` e `steps`;
 * - o `ItemDoDia` do Empório usa `titulo`, `href`, `valor`, `dias` e `origem`
 *   (`emporio_pagar`, `emporio_fiado`, `emporio_caixa`);
 * - datas passadas (fiado vencido, movimento de ontem) são ajustadas direto no
 *   banco depois de criadas pela action, porque nenhuma action grava no passado.
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

const j = (x: unknown) => JSON.stringify(x);
const DIA = 86_400_000;
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && Math.abs(a - b) < tol;
const recusa = (r: R, code: string, status: number, field?: string) =>
  !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);
const brDate = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
/** Dia de calendário de Brasília, `k` dias antes (ou depois, se negativo) de hoje. */
const diaBR = (k: number): string => brDate(new Date(Date.now() - k * DIA));
const meioDia = (k: number): Date => new Date(`${diaBR(k)}T12:00:00Z`);
const tardeBR = (k: number): Date => new Date(`${diaBR(k)}T15:00:00-03:00`);

console.log("📅 M85: Módulo 39 (Meu Empório), F5: Meu Dia, área do Financeiro, composição da receita e primeiros passos\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const carregar = async (caminho: string): Promise<Record<string, Acao>> => {
    try {
      return (await import(caminho)) as Record<string, Acao>;
    } catch (e) {
      console.log(`  (módulo ainda não carrega: ${caminho}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)})`);
      return {};
    }
  };
  const C = await carregar("@/lib/actions/emporio-catalogo");
  const E = await carregar("@/lib/actions/emporio-estoque");
  const V = await carregar("@/lib/actions/emporio-vendas");
  const X = await carregar("@/lib/actions/emporio-caixa");
  const CP = await carregar("@/lib/actions/emporio-compras");
  const D = await carregar("@/lib/actions/emporio-despesas");
  const PR = await carregar("@/lib/actions/emporio-producao");
  const MD = await carregar("@/lib/actions/meu-dia");
  const EMD = await carregar("@/lib/actions/emporio-meu-dia");
  const PP = await carregar("@/lib/actions/emporio-primeiros-passos");
  const FA = await carregar("@/lib/financial-area");

  const stamp = Date.now();
  const tenantIds: string[] = [];
  let chaveSeq = 0;
  const chave = (p: string) => `m85-${p}-${stamp}-${(chaveSeq += 1)}`;
  const ausente = (nome: string): R => ({ ok: false, code: "ACTION_AUSENTE", message: `ausente: ${nome}`, status: 0 });
  const chamar = async (mod: Record<string, Acao>, nome: string, ...args: unknown[]): Promise<R> => {
    const f = mod[nome];
    return typeof f === "function" ? f(...args) : ausente(nome);
  };
  const rodar = async (nome: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      check(`a seção "${nome}" quebrou`, false, e instanceof Error ? e.message : String(e));
    }
  };

  const montar = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: { name: `M85 ${rotulo} ${stamp}`, document: `M85${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
    });
    tenantIds.push(t.id);
    const mkUser = async (suf: string, role: Role): Promise<Ator & { tenant_id: string }> => {
      const u = await prisma.user.create({
        data: { tenant_id: t.id, name: `M85 ${rotulo} ${suf}`, email: `m85-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role },
      });
      return { id: u.id, role, tenant_id: t.id };
    };
    const owner = await mkUser("own", "OWNER");
    const admin = await mkUser("adm", "ADMIN");
    const op = await mkUser("op", "OPERADOR");
    const visu = await mkUser("vis", "VISUALIZADOR");
    const db = prismaForTenant(t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: `M85 categoria ${rotulo}` }) });
    const mkLoja = async (nome: string): Promise<{ id: string; name: string }> => {
      const r = await chamar(C, "criarEstabelecimentoAction", db, owner, { name: nome, kind: "ponto_venda" });
      if (!r.ok) throw new Error(`loja ${nome}: ${j(r)}`);
      return { id: r.data.id, name: nome };
    };
    const mkProduto = async (nome: string, unit = "quilograma") => {
      const r = await chamar(C, "criarProdutoEmporioAction", db, op, { name: `M85 ${nome}`, category_id: cat.id, base_unit: unit });
      if (!r.ok) throw new Error(`produto ${nome}: ${j(r)}`);
      const rp = await chamar(C, "criarApresentacaoAction", db, op, r.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
      if (!rp.ok) throw new Error(`apresentação ${nome}: ${j(rp)}`);
      return { id: r.data.id as string, nome: `M85 ${nome}`, pres: rp.data.id as string };
    };
    type Prod = Awaited<ReturnType<typeof mkProduto>>;
    const preco = async (loja: string, p: Prod, valor: number) => {
      const r = await chamar(C, "definirPrecoAction", db, admin, { establishment_id: loja, presentation_id: p.pres, price: valor });
      if (!r.ok) throw new Error(`preço: ${j(r)}`);
    };
    const implantar = async (loja: string, p: Prod, qtd: number, custo: number | null) => {
      const r = await chamar(E, "implantarEstoqueAction", db, op, { establishment_id: loja, emporio_product_id: p.id, sealed: [], loose_qty: qtd, unit_cost: custo });
      if (!r.ok) throw new Error(`implantar: ${j(r)}`);
    };
    const preparar = async (loja: string, p: Prod, valor: number, qtd: number, custo: number) => {
      await preco(loja, p, valor);
      await implantar(loja, p, qtd, custo);
    };
    const contato = async (nome: string) => (await db.contact.create({ data: scoped({ name: nome }) })).id;
    const vender = async (loja: string, p: Prod, qty: number, payments: Dado[], contact_id?: string) => {
      const r = await chamar(V, "venderAction", db, op, {
        operation_key: chave("v"),
        establishment_id: loja,
        ...(contact_id ? { contact_id } : {}),
        items: [{ emporio_product_id: p.id, presentation_id: p.pres, quantity: qty }],
        payments,
      });
      if (!r.ok) throw new Error(`venda: ${j(r)}`);
      return (r.data.id ?? r.data.sale_id) as string;
    };
    return { t, owner, admin, op, visu, db, mkUser, mkLoja, mkProduto, preco, implantar, preparar, contato, vender };
  };

  try {
    // ================================================================ S: Meu Dia
    const S = await montar("S");
    const admA = await S.mkUser("admA", "ADMIN");
    const opA = await S.mkUser("opA", "OPERADOR");
    const agora = new Date();
    let temCenario = false;
    let itensOwner: Dado[] = [];
    const titulosDe = (itens: Dado[]) => itens.map((i) => String(i.titulo));
    const doTipo = (itens: Dado[], origem: string) => itens.filter((i) => i.origem === origem);

    await rodar("S: montagem", async () => {
      const A = await S.mkLoja("Loja A");
      const B = await S.mkLoja("Loja B");
      const FI = await S.mkLoja("Loja FI");
      const CX = [await S.mkLoja("Loja CX1"), await S.mkLoja("Loja CX2"), await S.mkLoja("Loja CX3"), await S.mkLoja("Loja CX4")];
      const P = await S.mkProduto("Produto P");
      for (const l of [A, B, FI, ...CX]) await S.preparar(l.id, P, 10, 1000, 4);

      // compras a prazo: A e B têm contas a pagar com vencimento em 3 dias
      const compra = async (loja: string, nomeContato: string, total: number) => {
        const r = await chamar(CP, "criarCompraAction", S.db, S.owner, {
          operation_key: chave("c"),
          establishment_id: loja,
          contact_id: await S.contato(nomeContato),
          purchased_at: new Date(),
          received: true,
          items: [{ emporio_product_id: P.id, presentation_id: P.pres, quantity: 10, item_total: total }],
          payment: { kind: "a_prazo", due_date: meioDia(-3) },
        });
        if (!r.ok) throw new Error(`compra ${nomeContato}: ${j(r)}`);
      };
      await compra(A.id, "Fornecedor A", 50);
      await compra(B.id, "Fornecedor B", 70);

      // despesa fixa na Loja A. A action grava a conta do mês; a data é forçada para daqui a 2 dias (o dia do mês de hoje é arbitrário).
      const antes = new Set((await S.db.financialEntry.findMany({ where: { establishment_id: A.id }, select: { id: true } })).map((e) => e.id));
      const rf = await chamar(D, "criarDespesaFixaAction", S.db, S.admin, {
        name: "M85 Aluguel", category: "Aluguel", amount: 900, due_day: 15, split_kind: "percentual",
        starts_on: new Date(`${diaBR(0).slice(0, 7)}-01T12:00:00Z`), splits: [{ establishment_id: A.id, value: 100 }],
      });
      if (!rf.ok) throw new Error(`fixa: ${j(rf)}`);
      const novas = (await S.db.financialEntry.findMany({ where: { establishment_id: A.id }, select: { id: true } })).filter((e) => !antes.has(e.id));
      check("a despesa fixa gerou a conta do mês na Loja A (precondição do cenário)", novas.length >= 1, `${novas.length} lançamentos novos`);
      await S.db.financialEntry.updateMany({ where: { id: { in: novas.map((e) => e.id) } }, data: { due_date: meioDia(-2), status: "pending" } });

      // fiado: Cliente Fiado deve 30 (vencido há 5 dias) + 20 (vencido há 2 dias); Cliente Futuro 40 em 3 dias; Cliente Sem Data 10 sem vencimento
      const cFiado = await S.contato("Cliente Fiado");
      const cFuturo = await S.contato("Cliente Futuro");
      const cSem = await S.contato("Cliente Sem Data");
      const f1 = await S.vender(FI.id, P, 3, [{ kind: "fiado", amount: 30, due_date: meioDia(1) }], cFiado);
      const f2 = await S.vender(FI.id, P, 2, [{ kind: "fiado", amount: 20, due_date: meioDia(1) }], cFiado);
      const f3 = await S.vender(FI.id, P, 4, [{ kind: "fiado", amount: 40, due_date: meioDia(-3) }], cFuturo);
      const f4 = await S.vender(FI.id, P, 1, [{ kind: "fiado", amount: 10 }], cSem);
      // a venda não aceita vencimento no passado: o passado é ajustado no banco (pagamento e lançamento)
      const fixa = async (sale: string, amount: number, due: Date | null) => {
        await S.db.emporioSalePayment.updateMany({ where: { sale_id: sale, kind: "fiado" }, data: { due_date: due } });
        await S.db.financialEntry.updateMany({ where: { establishment_id: FI.id, amount }, data: { due_date: due } });
      };
      await fixa(f1, 30, meioDia(5));
      await fixa(f2, 20, meioDia(2));
      await fixa(f3, 40, meioDia(-3));
      await fixa(f4, 10, null);

      // caixa: o movimento da gaveta nasce da venda em dinheiro; a data dele é ajustada no banco
      const dinheiro = (l: { id: string }) => S.vender(l.id, P, 10, [{ kind: "dinheiro", amount: 100 }]);
      const movs = (l: { id: string }) => S.db.cashMovement.findMany({ where: { establishment_id: l.id }, orderBy: { created_at: "asc" } });
      await dinheiro(CX[0]);
      await dinheiro(CX[1]);
      await dinheiro(CX[2]);
      await dinheiro(CX[3]);
      await dinheiro(CX[3]);
      const m0 = await movs(CX[0]);
      const m1 = await movs(CX[1]);
      const m3 = await movs(CX[3]);
      check("as vendas em dinheiro geraram movimento de gaveta (precondição)", m0.length >= 1 && m1.length >= 1 && m3.length >= 2, `${m0.length}, ${m1.length}, ${m3.length}`);
      await S.db.cashMovement.updateMany({ where: { id: { in: m0.map((m) => m.id) } }, data: { occurred_at: tardeBR(1) } });
      await S.db.cashMovement.updateMany({ where: { id: { in: m1.map((m) => m.id) } }, data: { occurred_at: tardeBR(1) } });
      await S.db.cashMovement.update({ where: { id: m3[0].id }, data: { occurred_at: tardeBR(3) } });
      await S.db.cashMovement.update({ where: { id: m3[1].id }, data: { occurred_at: tardeBR(2) } });
      // conferência de ontem na CX2 (gravada direto: a action conferirGavetaAction carimba hoje)
      await S.db.cashCount.create({ data: scoped({ establishment_id: CX[1].id, expected: 100, counted: 100, difference: 0, counted_at: tardeBR(1) }) });

      // fazenda: uma conta a pagar e uma a receber sem loja
      await S.db.financialEntry.create({ data: scoped({ entry_type: "expense" as const, amount: 77.7, category: "M85 diesel", status: "pending" as const, due_date: meioDia(-2), related_module: "geral" as const }) });
      await S.db.financialEntry.create({ data: scoped({ entry_type: "income" as const, amount: 33.3, category: "M85 bezerro", status: "pending" as const, due_date: meioDia(1), related_module: "geral" as const }) });

      const rv = await chamar(C, "definirVinculosAction", S.db, S.owner, A.id, [opA.id, admA.id]);
      if (!rv.ok) throw new Error(`vínculo: ${j(rv)}`);
      temCenario = true;
    });

    await rodar("S: a fazenda não lê o Empório", async () => {
      console.log("1. A fonte da fazenda deixa de ler o Empório (Q108, Q113)");
      if (!temCenario) return check("cenário montado", false);
      const itens: Dado[] = await (MD.lerItensDoDia as unknown as (db: unknown) => Promise<Dado[]>)(S.db);
      const pagar = doTipo(itens, "pagar");
      const receber = doTipo(itens, "receber");
      check("lerItensDoDia: a conta a pagar da fazenda (77,70) continua", pagar.some((i) => perto(i.valor, 77.7)), j(titulosDe(pagar)));
      check("lerItensDoDia: a conta a receber da fazenda (33,30) continua", receber.some((i) => perto(i.valor, 33.3)), j(titulosDe(receber)));
      check("lerItensDoDia: nenhuma conta a pagar do Empório (compra e despesa fixa ficam fora)", pagar.length === 1, `${pagar.length}: ${j(titulosDe(pagar))}`);
      check("lerItensDoDia: nenhum fiado a receber (só a conta da fazenda)", receber.length === 1, `${receber.length}: ${j(titulosDe(receber))}`);
      check("lerItensDoDia: nenhum item aponta para /emporio", !itens.some((i) => String(i.href).startsWith("/emporio")), j(itens.filter((i) => String(i.href).startsWith("/emporio")).map((i) => i.titulo)));
      check("lerItensDoDia: nenhum título cita fornecedor ou cliente do Empório", !titulosDe(itens).some((t) => /Fornecedor|Cliente (Fiado|Futuro)|Loja/.test(t)), j(titulosDe(itens)));
      const resumo = await (MD.resumoDaFazenda as unknown as (db: unknown, o: unknown) => Promise<Dado>)(S.db, { temFazenda: true });
      check("resumoDaFazenda: 'A pagar' = 77,70, sem a compra, a despesa fixa e o PIX do Empório", perto(resumo?.aPagar, 77.7), String(resumo?.aPagar));
      check("resumoDaFazenda: 'A receber' = 33,30, sem o fiado", perto(resumo?.aReceber, 33.3), String(resumo?.aReceber));
    });

    await rodar("S: contas a pagar do Empório", async () => {
      console.log("\n2. Contas a pagar do Empório no dia (Q108)");
      if (!temCenario) return check("cenário montado", false);
      const dia = async (ator: Ator) => {
        const r = await chamar(EMD, "itensDoEmporioNoDia", S.db, ator, { agora });
        return r as unknown as Dado[]; // a função devolve ItemDoDia[] direto
      };
      itensOwner = await dia(S.owner);
      check("itensDoEmporioNoDia devolve uma lista", Array.isArray(itensOwner), j(itensOwner).slice(0, 200));
      if (!Array.isArray(itensOwner)) return;
      const pagarOwner = doTipo(itensOwner, "emporio_pagar");
      const compraA = pagarOwner.find((i) => String(i.titulo) === "Pagar Fornecedor A (Loja A)");
      check("compra a prazo: 'Pagar Fornecedor A (Loja A)' com valor 50 e link /emporio/compras", !!compraA && perto(compraA.valor, 50) && compraA.href === "/emporio/compras", j(titulosDe(pagarOwner)));
      check("compra da Loja B aparece para o OWNER (sem vínculo vê todas)", pagarOwner.some((i) => i.titulo === "Pagar Fornecedor B (Loja B)"));
      const fixaItem = pagarOwner.find((i) => String(i.titulo).includes("M85 Aluguel"));
      check("despesa fixa: título com o nome da despesa e a loja, link /emporio/despesas", !!fixaItem && String(fixaItem.titulo).includes("(Loja A)") && fixaItem.href === "/emporio/despesas", j(titulosDe(pagarOwner)));
      check("a conta da fazenda (diesel) NÃO vem dos itens do Empório", !pagarOwner.some((i) => perto(i.valor, 77.7)));

      const opItens = await dia(opA);
      const opPagar = Array.isArray(opItens) ? doTipo(opItens, "emporio_pagar") : [];
      check("OPERADOR com vínculo só à Loja A vê a compra da Loja A", opPagar.some((i) => i.titulo === "Pagar Fornecedor A (Loja A)"), j(titulosDe(opPagar)));
      check("OPERADOR com vínculo só à Loja A NÃO vê a conta da Loja B", !opPagar.some((i) => String(i.titulo).includes("Loja B")), j(titulosDe(opPagar)));
      check("OPERADOR NÃO vê a despesa fixa (a tela de Despesas é de ADMIN)", !opPagar.some((i) => String(i.titulo).includes("M85 Aluguel")), j(titulosDe(opPagar)));

      const admItens = await dia(S.admin);
      const admPagar = Array.isArray(admItens) ? doTipo(admItens, "emporio_pagar") : [];
      check("ADMIN sem vínculo vê a despesa fixa e as duas compras", admPagar.some((i) => String(i.titulo).includes("M85 Aluguel")) && admPagar.some((i) => String(i.titulo).includes("Loja B")), j(titulosDe(admPagar)));
      const admAItens = await dia(admA);
      const admAPagar = Array.isArray(admAItens) ? doTipo(admAItens, "emporio_pagar") : [];
      check("ADMIN vinculado à Loja A vê a despesa fixa dela e não vê a Loja B", admAPagar.some((i) => String(i.titulo).includes("M85 Aluguel")) && !admAPagar.some((i) => String(i.titulo).includes("Loja B")), j(titulosDe(admAPagar)));
    });

    await rodar("S: fiado", async () => {
      console.log("\n3. Fiado em aberto, uma linha por cliente (Q109)");
      if (!Array.isArray(itensOwner) || itensOwner.length === 0) return check("itens do dia carregados", false);
      const fiado = doTipo(itensOwner, "emporio_fiado");
      const doCliente = fiado.filter((i) => String(i.titulo).includes("Cliente Fiado"));
      check("duas vendas vencidas do mesmo cliente e loja dão UMA linha", doCliente.length === 1, `${doCliente.length}: ${j(titulosDe(fiado))}`);
      const l = doCliente[0];
      check("título 'Receber de Cliente Fiado (fiado, Loja FI)'", l?.titulo === "Receber de Cliente Fiado (fiado, Loja FI)", String(l?.titulo));
      check("a linha traz a soma (50) e o link /emporio/fiado", !!l && perto(l.valor, 50) && l.href === "/emporio/fiado", j(l));
      check("a data é o vencimento mais antigo (5 dias atrás), não o mais recente (2)", !!l && l.dias === -5, String(l?.dias));
      const { classificar } = (await import("@/lib/actions/meu-dia")) as unknown as { classificar: (i: Dado[]) => Dado };
      const secoes = classificar(itensOwner);
      check("cai em Atenção", secoes.atencao.some((i: Dado) => i.chave === l?.chave));
      const futuro = fiado.filter((i) => String(i.titulo).includes("Cliente Futuro"));
      check("fiado que vence em 3 dias: uma linha de 40 em Próximos", futuro.length === 1 && perto(futuro[0].valor, 40) && futuro[0].dias === 3 && secoes.proximos.some((i: Dado) => i.chave === futuro[0].chave), j(futuro));
      check("fiado SEM vencimento não entra", !fiado.some((i) => String(i.titulo).includes("Cliente Sem Data")), j(titulosDe(fiado)));
    });

    await rodar("S: caixa", async () => {
      console.log("\n4. Caixa não conferido (Q110)");
      if (!Array.isArray(itensOwner) || itensOwner.length === 0) return check("itens do dia carregados", false);
      const caixa = doTipo(itensOwner, "emporio_caixa");
      const da = (nome: string) => caixa.filter((i) => String(i.titulo).includes(nome));
      const c1 = da("Loja CX1");
      check("movimento ontem e sem conferência: 'Caixa de ontem da Loja CX1 não foi conferido'", c1.length === 1 && c1[0].titulo === "Caixa de ontem da Loja CX1 não foi conferido", j(titulosDe(caixa)));
      check("a linha leva a /emporio/caixa e cai em Atenção (dia passado)", c1.length === 1 && c1[0].href === "/emporio/caixa" && typeof c1[0].dias === "number" && c1[0].dias < 0, j(c1[0]));
      check("com conferência ontem, a Loja CX2 some", da("Loja CX2").length === 0, j(titulosDe(da("Loja CX2"))));
      check("movimento só de HOJE (Loja CX3) não gera linha", da("Loja CX3").length === 0, j(titulosDe(da("Loja CX3"))));
      const c4 = da("Loja CX4");
      check("dois dias sem conferência: 'Caixa da Loja CX4 sem conferência em 2 dias', uma linha só", c4.length === 1 && c4[0].titulo === "Caixa da Loja CX4 sem conferência em 2 dias", j(titulosDe(c4)));
      check("a data da linha é a do dia mais recente (2 dias atrás)", c4.length === 1 && c4[0].dias === -2, String(c4[0]?.dias));
      check("a Loja A e a Loja B (sem movimento de gaveta) não geram linha de caixa", da("Loja A").length === 0 && da("Loja B").length === 0);
      const rVisu = await chamar(EMD, "itensDoEmporioNoDia", S.db, S.visu, { agora });
      const visuItens = Array.isArray(rVisu) ? (rVisu as Dado[]) : [];
      check("VISUALIZADOR não recebe linha de caixa (só quem pode conferir)", Array.isArray(rVisu) && doTipo(visuItens, "emporio_caixa").length === 0, j(rVisu).slice(0, 200));
    });

    // ================================================================ O: outro tenant
    await rodar("O: isolamento do Meu Dia", async () => {
      console.log("\n5. Isolamento: outro tenant não recebe nada do Empório de S");
      const O = await montar("O");
      const r = await chamar(EMD, "itensDoEmporioNoDia", O.db, O.owner, { agora });
      check("tenant sem Empório: lista vazia", Array.isArray(r) && (r as unknown as Dado[]).length === 0, j(r).slice(0, 200));
    });

    // ================================================================ área do Financeiro
    await rodar("A: areaPermitida", async () => {
      console.log("\n6. Fora da lista, o Financeiro é só da fazenda (Q117)");
      const Vv = await montar("AV");
      const Xx = await montar("AX");
      // AV vê o Empório: perfil ativo e recurso ligado para a conta inteira. AX não tem nenhum dos dois.
      await prisma.tenantProfile.upsert({
        where: { tenant_id_profile_type: { tenant_id: Vv.t.id, profile_type: "emporio" } },
        create: { tenant_id: Vv.t.id, profile_type: "emporio", active: true },
        update: { active: true },
      });
      await prisma.tenantFeature.create({ data: { tenant_id: Vv.t.id, feature_key: "emporio", enabled: true } });
      const area = async (u: unknown, a: string) => {
        const f = FA.areaPermitida as unknown as ((u: unknown, a: string) => Promise<unknown>) | undefined;
        if (typeof f !== "function") return "AUSENTE";
        const v = await f(u, a);
        return typeof v === "object" && v !== null && "area" in v ? (v as { area: string }).area : v;
      };
      for (const a of ["tudo", "emporio"]) {
        const x = await area(Xx.owner, a);
        check(`quem não vê o Empório: '${a}' vira 'fazenda'`, x === "fazenda", String(x));
      }
      check("quem não vê o Empório: 'fazenda' continua 'fazenda'", (await area(Xx.owner, "fazenda")) === "fazenda");
      for (const a of ["tudo", "emporio", "fazenda"]) {
        const x = await area(Vv.owner, a);
        check(`quem vê o Empório: '${a}' se mantém`, x === a, String(x));
      }
    });

    // ================================================================ composição da receita
    await rodar("P: composição da receita", async () => {
      console.log("\n7. Criar composição da receita (Q114)");
      const Pt = await montar("P");
      const final = await Pt.mkProduto("Ração Final");
      const liquido = await Pt.mkProduto("Líquido", "litro");
      const milho = await Pt.mkProduto("Milho");
      const soja = await Pt.mkProduto("Soja");
      const saco = await Pt.mkProduto("Saco", "unidade");
      const movs = () => Pt.db.stockMovement.count();
      const antes = await movs();
      const criar = (ator: Ator, id: string, itens: Dado[], replace: boolean, ref = 10) =>
        chamar(PR, "criarComposicaoDaReceitaAction", Pt.db, ator, id, { reference_qty: ref, items: itens, replace });

      check("produto final em litro: 422 emporio_product_id", recusa(await criar(Pt.admin, liquido.id, [{ component_emporio_product_id: milho.id, quantity: 5 }], false), "VALIDATION_ERROR", 422, "emporio_product_id"));
      const rUn = await criar(Pt.admin, final.id, [{ component_emporio_product_id: milho.id, quantity: 5 }, { component_emporio_product_id: saco.id, quantity: 1 }], false);
      check("componente em unidade: 422 items", !rUn.ok && rUn.status === 422 && rUn.field === "items", j(rUn));
      check("a mensagem cita o produto e a unidade", !rUn.ok && rUn.message.includes("Saco") && /unidade/.test(rUn.message), !rUn.ok ? rUn.message : "");
      const rLit = await criar(Pt.admin, final.id, [{ component_emporio_product_id: liquido.id, quantity: 1 }], false);
      check("componente em litro: 422 items", !rLit.ok && rLit.status === 422 && rLit.field === "items", j(rLit));
      check("as recusas não gravaram composição", ((await chamar(PR, "lerComposicaoAction", Pt.db, Pt.admin, final.id)) as Dado).data === null);

      const r1 = await criar(Pt.admin, final.id, [{ component_emporio_product_id: milho.id, quantity: 5 }, { component_emporio_product_id: soja.id, quantity: 2 }], false);
      check("sem composição prévia e replace falso: cria", r1.ok, j(r1));
      const c1 = ((await chamar(PR, "lerComposicaoAction", Pt.db, Pt.admin, final.id)) as Dado).data;
      check("a composição gravada tem os 2 componentes e reference_qty 10", c1?.items?.length === 2 && perto(c1.reference_qty, 10), j(c1));
      check("o rendimento fica vazio", c1?.yield_pct === null, j(c1?.yield_pct));

      const r2 = await criar(Pt.admin, final.id, [{ component_emporio_product_id: milho.id, quantity: 9 }], false, 20);
      check("já existe e replace falso: 409 COMPOSITION_EXISTS no campo replace", recusa(r2, "COMPOSITION_EXISTS", 409, "replace"), j(r2));
      const c2 = ((await chamar(PR, "lerComposicaoAction", Pt.db, Pt.admin, final.id)) as Dado).data;
      check("a recusa não mexeu na composição existente", c2?.items?.length === 2 && perto(c2.reference_qty, 10), j(c2));

      const r3 = await criar(Pt.admin, final.id, [{ component_emporio_product_id: milho.id, quantity: 9 }], true, 20);
      check("replace verdadeiro substitui", r3.ok, j(r3));
      const c3 = ((await chamar(PR, "lerComposicaoAction", Pt.db, Pt.admin, final.id)) as Dado).data;
      check("depois de substituir: 1 componente (milho, 9) e reference_qty 20", c3?.items?.length === 1 && perto(c3.items[0].quantity, 9) && perto(c3.reference_qty, 20), j(c3));

      const rRep = await criar(Pt.admin, soja.id, [{ component_emporio_product_id: milho.id, quantity: 1 }, { component_emporio_product_id: milho.id, quantity: 2 }], false);
      check("componente repetido é recusado (regra da definirComposicaoAction)", !rRep.ok, j(rRep));
      const rCiclo = await criar(Pt.admin, milho.id, [{ component_emporio_product_id: final.id, quantity: 1 }], false);
      check("ciclo (milho levaria a ração, que leva o milho) é recusado", !rCiclo.ok, j(rCiclo));
      const rOp = await criar(Pt.op, soja.id, [{ component_emporio_product_id: milho.id, quantity: 1 }], false);
      check("OPERADOR: 403", !rOp.ok && rOp.status === 403, j(rOp));
      check("nenhuma das chamadas criou StockMovement", (await movs()) === antes, `${antes} -> ${await movs()}`);
    });

    // ================================================================ primeiros passos
    const passosDe = (data: Dado, lojaId: string): Dado[] | null => {
      const lojas: Dado[] = Array.isArray(data) ? data : (Object.values(data ?? {}).find((v) => Array.isArray(v) && v.every((x) => x && typeof x === "object" && "steps" in x)) as Dado[] | undefined) ?? [];
      return lojas.find((l) => l.establishment_id === lojaId)?.steps ?? null;
    };
    const feito = (passos: Dado[] | null, key: string): boolean | undefined => passos?.find((p) => p.key === key)?.done;
    const tem = (passos: Dado[] | null, key: string): boolean => !!passos?.some((p) => p.key === key);

    await rodar("PP: primeiros passos", async () => {
      console.log("\n8. Primeiros passos (Q116)");
      const Q = await montar("Q");
      const N = await Q.mkLoja("Loja Nova");
      const P = await Q.mkProduto("Produto Q");
      const P2 = await Q.mkProduto("Produto Q2");
      const ler = (ator: Ator) => chamar(PP, "primeirosPassosAction", Q.db, ator);

      check("OPERADOR: 403", (await ler(Q.op)).ok === false && ((await ler(Q.op)) as Dado).status === 403, j(await ler(Q.op)));
      check("VISUALIZADOR: 403", ((await ler(Q.visu)) as Dado).status === 403);

      const r0 = await ler(Q.admin);
      check("ADMIN lê", r0.ok, j(r0));
      const p0 = r0.ok ? passosDe(r0.data, N.id) : null;
      check("loja nova: complete falso", r0.ok && r0.data.complete === false, j(r0).slice(0, 300));
      check("loja nova: preco, estoque_inicial, saldo_caixa e despesa_fixa existem, são essenciais e não estão feitos", ["preco", "estoque_inicial", "saldo_caixa", "despesa_fixa"].every((k) => tem(p0, k) && feito(p0, k) === false && p0?.find((p) => p.key === k)?.essential === true), j(p0));
      check("loja nova: taxa_cartao ausente (nunca vendeu no cartão)", !tem(p0, "taxa_cartao"), j(p0));
      check("loja nova: minimo_maximo e conta_pix existem como recomendados", ["minimo_maximo", "conta_pix"].every((k) => tem(p0, k) && p0?.find((p) => p.key === k)?.essential === false), j(p0));
      check("cada passo traz href", (p0 ?? []).length > 0 && (p0 ?? []).every((p) => typeof p.href === "string" && p.href.length > 0), j(p0));

      // implantação SEM custo: o estoque inicial continua não feito
      await Q.preco(N.id, P, 10);
      await Q.implantar(N.id, P, 100, null);
      const p1 = passosDe(((await ler(Q.admin)) as Dado).data, N.id);
      check("com preço definido: preco feito", feito(p1, "preco") === true, j(p1));
      check("implantação sem custo: estoque_inicial NÃO feito, com detail", feito(p1, "estoque_inicial") === false && !!p1?.find((p) => p.key === "estoque_inicial")?.detail, j(p1?.find((p) => p.key === "estoque_inicial")));
      // outro produto, com custo: continua não feito, porque ainda existe um sem custo
      await Q.preco(N.id, P2, 10);
      await Q.implantar(N.id, P2, 100, 4);
      const p1b = passosDe(((await ler(Q.admin)) as Dado).data, N.id);
      check("um produto com custo ao lado de outro sem custo: segue não feito", feito(p1b, "estoque_inicial") === false, j(p1b?.find((p) => p.key === "estoque_inicial")));

      // loja completa em outro tenant (complete verdadeiro)
      const Z = await montar("Z");
      const L = await Z.mkLoja("Loja Completa");
      const PZ = await Z.mkProduto("Produto Z");
      await Z.preparar(L.id, PZ, 10, 100, 4);
      const rs = await chamar(X, "saldoInicialCaixaAction", Z.db, Z.owner, { establishment_id: L.id, amount: 100 });
      check("saldo inicial da gaveta lançado (precondição)", rs.ok, j(rs));
      const rf = await chamar(D, "criarDespesaFixaAction", Z.db, Z.admin, {
        name: "M85 Aluguel Z", category: "Aluguel", amount: 500, due_day: 10, split_kind: "percentual",
        starts_on: new Date(`${diaBR(0).slice(0, 7)}-01T12:00:00Z`), splits: [{ establishment_id: L.id, value: 100 }],
      });
      check("despesa fixa criada (precondição)", rf.ok, j(rf));
      const rz = await chamar(PP, "primeirosPassosAction", Z.db, Z.admin);
      const pz = rz.ok ? passosDe(rz.data, L.id) : null;
      check("loja com preço, estoque com custo, saldo e despesa fixa: os quatro essenciais feitos", ["preco", "estoque_inicial", "saldo_caixa", "despesa_fixa"].every((k) => feito(pz, k) === true), j(pz));
      check("sem venda no cartão, taxa_cartao segue ausente e complete é verdadeiro", !tem(pz, "taxa_cartao") && rz.ok && rz.data.complete === true, j(rz).slice(0, 300));

      // venda no cartão com regra, depois sem regra, depois com regra de novo
      const conta = await chamar(X, "criarContaAction", Z.db, Z.admin, { name: `M85 Conta Z ${stamp}`, bank: "Banco" });
      if (!conta.ok) throw new Error(`conta: ${j(conta)}`);
      const regra = () => chamar(X, "definirRegraCartaoAction", Z.db, Z.admin, { establishment_id: L.id, kind: "credito_vista", fee_pct: 3, days: 30, bank_account_id: conta.data.id });
      check("regra de crédito à vista criada", (await regra()).ok);
      await Z.vender(L.id, PZ, 5, [{ kind: "credito_vista", amount: 50 }]);
      const pc1 = passosDe(((await chamar(PP, "primeirosPassosAction", Z.db, Z.admin)) as Dado).data, L.id);
      check("vendeu no cartão e a regra existe: taxa_cartao presente e feito", tem(pc1, "taxa_cartao") && feito(pc1, "taxa_cartao") === true, j(pc1?.find((p) => p.key === "taxa_cartao")));
      await Z.db.cardFeeRule.deleteMany({ where: { establishment_id: L.id } });
      const rc2 = (await chamar(PP, "primeirosPassosAction", Z.db, Z.admin)) as Dado;
      const pc2 = passosDe(rc2.data, L.id);
      check("vendeu no cartão e a regra sumiu: taxa_cartao presente e NÃO feito", tem(pc2, "taxa_cartao") && feito(pc2, "taxa_cartao") === false, j(pc2?.find((p) => p.key === "taxa_cartao")));
      check("com um essencial pendente, complete volta a ser falso", rc2.ok && rc2.data.complete === false, j(rc2.data?.complete));
      await regra();
      const rc3 = (await chamar(PP, "primeirosPassosAction", Z.db, Z.admin)) as Dado;
      check("regra de volta: tudo feito e complete verdadeiro", rc3.ok && rc3.data.complete === true && feito(passosDe(rc3.data, L.id), "taxa_cartao") === true, j(rc3.data?.complete));

      // complete exige TODAS as lojas: uma loja nova no tenant Z derruba
      const L2 = await Z.mkLoja("Loja Zero");
      const rc4 = (await chamar(PP, "primeirosPassosAction", Z.db, Z.admin)) as Dado;
      check("uma segunda loja sem nada derruba complete (vale todas as lojas)", rc4.ok && rc4.data.complete === false && feito(passosDe(rc4.data, L2.id), "preco") === false, j(rc4.data?.complete));
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
    console.log(falhas === 0 ? `\n✅ M85 verde (${total} checagens)` : `\n❌ M85: ${falhas} falha(s) em ${total} checagens`);
    process.exit(falhas === 0 ? 0 : 1);
  });
