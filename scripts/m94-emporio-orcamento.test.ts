import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M94: Módulo 39 (Meu Empório), entrega 4: o orçamento.
 * Roda: `npm run test:m94`
 *
 * Seção 1: o orçamento salvo (a regra do preço-base, gravar, repetir a chave, numeração,
 * cliente, vendedor, desconto, preço, Histórico, leitura e alcance, rotas).
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

console.log("🧾 M94: Módulo 39 (Meu Empório), entrega 4: orçamento\n");

const tenantIds: string[] = [];

async function secao1() {
  console.log("Seção 1: o orçamento salvo (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { prisma, prismaForTenant } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const Ven = await import("@/lib/actions/emporio-vendas");
  const Cli = await import("@/lib/actions/emporio-clientes");
  const Orc = await import("@/lib/actions/emporio-orcamentos");
  const { precoQueVale } = await import("@/lib/emporio/precificar");
  const { hojeEmBrasilia, somarDias } = await import("@/lib/emporio/cartao");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const stamp = Date.now();
  const rec = (r: Dado, code: string, status: number, field?: string, message?: string) =>
    !!r && !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field) && (message === undefined || r.message === message);
  const MSG_CLIENTE = "O orçamento precisa de um cliente com nome, documento e telefone.";
  const MSG_INCOMPLETO = "Complete o cadastro do cliente (nome, documento e telefone) antes de salvar o orçamento.";
  const MSG_SEM_VENDEDOR = "Escolha o vendedor que atendeu.";
  const MSG_VENDEDOR_INVALIDO = "Escolha um vendedor desta loja.";

  // --- a regra do preço-base ao faturar (função pura, em centavos)
  check("dentro da validade, o de hoje mais barato: vale o de hoje", precoQueVale(2000, 1800, false) === 1800);
  check("dentro da validade, o de hoje mais caro: vale o orçado", precoQueVale(2000, 2500, false) === 2000);
  check("dentro da validade, sem preço hoje: vale o orçado", precoQueVale(2000, null, false) === 2000);
  check("vencido: vale o de hoje, mesmo mais caro", precoQueVale(2000, 2500, true) === 2500);
  check("vencido e sem preço hoje: nulo", precoQueVale(2000, null, true) === null);

  type Role = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";
  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: {
        name: `M94 ${rotulo} ${stamp}`,
        document: `M94${rotulo}${stamp}`.slice(0, 14),
        plan: "grupo",
        status: "trial",
        trial_ends_at: new Date(Date.now() + 86_400_000),
      },
    });
    tenantIds.push(t.id);
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    const mkUser = async (suf: string, role: Role, extra: Dado = {}) => {
      const u = await prisma.user.create({
        data: { tenant_id: t.id, name: `M94 ${suf}`, email: `m94-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role, ...papelDeFixture(role), ...extra },
      });
      return { id: u.id, role };
    };
    return { t, db: prismaForTenant(t.id), mkUser };
  };

  const A = await mkTenant("A");
  const B = await mkTenant("B");
  const db = A.db;
  const owner = await A.mkUser("dono", "OWNER");
  const gestor = await A.mkUser("gestor", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend1 = await A.mkUser("vend1", "OPERADOR");
  const vend2 = await A.mkUser("vend2", "OPERADOR");
  const caixa = await A.mkUser("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const ownerB = await B.mkUser("dono", "OWNER");

  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M94 Loja 1" });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M94 Loja 2" });
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j([l1, l2])}`);
  const L1 = l1.data.id;
  const L2 = l2.data.id;
  await vincularTodas(prisma, A.t.id, [gestor.id, vend1.id, caixa.id], [L1]);
  await vincularTodas(prisma, A.t.id, [vend2.id], [L2]);
  await prisma.establishment.update({ where: { id: L1 }, data: { max_discount_pct: 5 } });

  const cat = await db.productCategory.create({ data: { name: "M94 categoria" } as never });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M94 Sal ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(j(prod));
  const ap = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!ap.ok) throw new Error(j(ap));
  for (const est of [L1, L2]) {
    const p = await Cat.definirPrecoAction(db, owner, { establishment_id: est, presentation_id: ap.data.id, price: 20 });
    if (!p.ok) throw new Error(j(p));
  }
  const e1 = await Est.implantarEstoqueAction(db, owner, { establishment_id: L1, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100, unit_cost: 5 });
  if (!e1.ok) throw new Error(j(e1));
  const nomeSemPreco = `M94 Sem preco ${stamp}`;
  const semPreco = await Cat.criarProdutoEmporioAction(db, owner, { name: nomeSemPreco, category_id: cat.id, base_unit: "quilograma" });
  if (!semPreco.ok) throw new Error(j(semPreco));
  const apSem = await Cat.criarApresentacaoAction(db, owner, semPreco.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!apSem.ok) throw new Error(j(apSem));

  const cf = (await Cli.garantirConsumidorFinal(db)).id;
  const completo = await db.contact.create({
    data: { name: "M94 Cliente Completo", person_kind: "pf", document: "39053344705", phone: "11999990000" } as never,
  });
  const semDocumento = await db.contact.create({
    data: { name: "M94 Cliente Sem Documento", person_kind: "pf", phone: "11999990001" } as never,
  });

  const item = (extra: Dado = {}) => ({ emporio_product_id: prod.data.id, presentation_id: ap.data.id, quantity: 2, ...extra });
  let seq = 0;
  const orcar = (ator: { id: string; role: Role }, extra: Dado = {}) =>
    Orc.salvarOrcamentoAction(db, ator as never, {
      operation_key: `m94-${stamp}-${(seq += 1)}`,
      establishment_id: L1,
      contact_id: completo.id,
      items: [item()],
      ...extra,
    });

  // --- o Vendedor salva com cliente completo
  const contar = async () => [await db.stockMovement.count(), await db.cashMovement.count(), await db.financialEntry.count()];
  const antes = await contar();
  const hoje = hojeEmBrasilia();
  const chave1 = `m94-${stamp}-primeiro`;
  const o1 = await orcar(vend1, { operation_key: chave1, notes: "  entregar na sexta  " });
  check("o Vendedor salva com cliente completo: ok", o1.ok, j(o1));
  if (!o1.ok) throw new Error("sem o primeiro orçamento");
  check("numero 000001 na conta nova (number 1)", o1.data.numero === "000001" && o1.data.number === 1, j([o1.data.numero, o1.data.number]));
  const val7 = somarDias(hoje, 7).toISOString().slice(0, 10);
  check("valid_until = hoje de Brasília + 7 (sem configuração)", o1.data.valid_until === val7, `${o1.data.valid_until} != ${val7}`);
  check("situacao aberto, sem venda", o1.data.situacao === "aberto" && o1.data.sale === null && o1.data.vendas.length === 0, j(o1.data));
  check("seller_user_id = o Vendedor, com seller_name e created_by_name", o1.data.seller_user_id === vend1.id && o1.data.seller_name === "M94 vend1" && o1.data.created_by_name === "M94 vend1", j(o1.data));
  check("replayed false na primeira gravação", o1.data.replayed === false);
  check("net_amount 40, discount_amount 0, notes aparadas", o1.data.net_amount === 40 && o1.data.discount_amount === 0 && o1.data.notes === "entregar na sexta", j(o1.data));
  check(
    "o cliente vem com id, nome, telefone e documento",
    j(o1.data.contact) === j({ id: completo.id, name: "M94 Cliente Completo", phone: "11999990000", document: "39053344705" }),
    j(o1.data.contact),
  );
  check("loja e establishment_id", o1.data.establishment_id === L1 && o1.data.loja === "M94 Loja 1", j(o1.data));
  const it1 = o1.data.items[0];
  check(
    "o item: quantidade 2, orçado 20, hoje 20, vale 20, não mudou, total 40",
    !!it1 && it1.quantity === 2 && it1.preco_orcado === 20 && it1.preco_hoje === 20 && it1.preco_que_vale === 20 && it1.mudou === false && it1.total === 40,
    j(it1),
  );
  check("o item traz produto, apresentação e ids", it1?.produto === `M94 Sal ${stamp}` && it1?.apresentacao === "Quilo" && it1?.presentation_id === ap.data.id && it1?.emporio_product_id === prod.data.id, j(it1));
  check("saldo_base 100 e sem falta", it1?.saldo_base === 100 && it1?.falta === false, j(it1));
  check("nenhum StockMovement, CashMovement ou FinancialEntry novo", j(await contar()) === j(antes), `${j(antes)} -> ${j(await contar())}`);
  const row1 = await db.emporioQuote.findFirst({ where: { id: o1.data.id }, include: { items: true } });
  check(
    "a linha: created_by = seller = Vendedor, sale_id nulo, 1 item com suggested 20 e unit 20",
    row1?.created_by_user_id === vend1.id && row1?.seller_user_id === vend1.id && row1?.sale_id === null && row1?.items.length === 1 && Number(row1?.items[0].suggested_price) === 20 && Number(row1?.items[0].unit_price) === 20,
    j(row1),
  );

  // --- repetir a chave
  const o1b = await orcar(vend1, { operation_key: chave1, items: [item({ quantity: 9 })] });
  check("mesma operation_key: o mesmo orçamento, replayed true, sem regravar", o1b.ok && o1b.data.id === o1.data.id && o1b.data.replayed === true && o1b.data.net_amount === 40, j(o1b));
  check("e continua um orçamento só", (await db.emporioQuote.count()) === 1);

  // --- numeração: a venda tem a dela
  await abrirTurnoDeTeste(db, owner, L1);
  const venda = await Ven.venderAction(db, vend1 as never, {
    operation_key: `m94-${stamp}-venda`,
    establishment_id: L1,
    contact_id: cf,
    items: [{ emporio_product_id: prod.data.id, presentation_id: ap.data.id, quantity: 1 }],
    payments: [{ kind: "dinheiro", amount: 20 }],
  });
  check("a venda no meio: ok, número 1 (o contador dela)", venda.ok && venda.data.number === 1, j(venda));
  await db.emporioSettings.create({ data: { quote_validity_days: 10 } as never });
  const o2 = await orcar(vend1);
  check("o segundo orçamento: 000002", o2.ok && o2.data.numero === "000002", j(o2));
  const val10 = somarDias(hoje, 10).toISOString().slice(0, 10);
  check("valid_until segue quote_validity_days (10)", o2.ok && o2.data.valid_until === val10, j(o2.ok ? o2.data.valid_until : o2));

  // --- cliente
  const nOrc = async () => db.emporioQuote.count();
  const recusaSemGravar = async (nome: string, r: Promise<Dado>, code: string, status: number, field: string, msg?: string) => {
    const n0 = await nOrc();
    const x = await r;
    check(`${nome}: ${status} ${code} em ${field}, sem gravar`, rec(x, code, status, field, msg) && (await nOrc()) === n0, j(x));
  };
  await recusaSemGravar("Consumidor final", orcar(vend1, { contact_id: cf }), "QUOTE_CUSTOMER_REQUIRED", 422, "contact_id", MSG_CLIENTE);
  await recusaSemGravar("sem contact_id", orcar(vend1, { contact_id: undefined }), "QUOTE_CUSTOMER_REQUIRED", 422, "contact_id", MSG_CLIENTE);
  await recusaSemGravar("contact_id vazio", orcar(vend1, { contact_id: "" }), "QUOTE_CUSTOMER_REQUIRED", 422, "contact_id", MSG_CLIENTE);
  await recusaSemGravar("cliente sem documento", orcar(vend1, { contact_id: semDocumento.id }), "QUOTE_CUSTOMER_INCOMPLETE", 422, "contact_id", MSG_INCOMPLETO);

  // --- vendedor
  await recusaSemGravar("Caixa sem seller_user_id", orcar(caixa), "SELLER_REQUIRED", 422, "seller_user_id", MSG_SEM_VENDEDOR);
  await recusaSemGravar("Caixa com vendedor de outra loja", orcar(caixa, { seller_user_id: vend2.id }), "INVALID_SELLER", 422, "seller_user_id", MSG_VENDEDOR_INVALIDO);
  const doCaixa = await orcar(caixa, { seller_user_id: vend1.id });
  check("Caixa com vendedor válido: ok, seller = Vendedor", doCaixa.ok && doCaixa.data.seller_user_id === vend1.id && doCaixa.data.created_by_name === "M94 caixa", j(doCaixa));
  const rowCaixa = doCaixa.ok ? await db.emporioQuote.findFirst({ where: { id: doCaixa.data.id } }) : null;
  check("e created_by_user_id = o Caixa", rowCaixa?.created_by_user_id === caixa.id && rowCaixa?.seller_user_id === vend1.id, j(rowCaixa));

  // --- desconto (limite de 5% na Loja 1; 18 sobre 20 é 10%)
  const MSG_DESCONTO = `O desconto de 10% passa do limite de 5% desta loja. Peça ao gestor da loja.`;
  await recusaSemGravar("desconto acima do limite pelo Vendedor", orcar(vend1, { items: [item({ unit_price: 18 })] }), "DISCOUNT_ABOVE_LIMIT", 403, "items", MSG_DESCONTO);
  const doGestor = await orcar(gestor, { items: [item({ unit_price: 18 })] });
  check("o mesmo desconto pelo Gestor: ok, net 36 e desconto 4", doGestor.ok && doGestor.data.net_amount === 36 && doGestor.data.discount_amount === 4, j(doGestor));
  const rowGestor = doGestor.ok ? await db.emporioQuote.findFirst({ where: { id: doGestor.data.id } }) : null;
  check("e grava discount_authorized_by_user_id = o Gestor", rowGestor?.discount_authorized_by_user_id === gestor.id, j(rowGestor));
  check(
    "o item com desconto: orçado 18, hoje 20, vale 18 (o menor), mudou false",
    doGestor.ok && doGestor.data.items[0].preco_orcado === 18 && doGestor.data.items[0].preco_hoje === 20 && doGestor.data.items[0].preco_que_vale === 18 && doGestor.data.items[0].mudou === false,
    j(doGestor.ok ? doGestor.data.items : doGestor),
  );

  // --- preço
  await recusaSemGravar(
    "item sem preço na loja",
    orcar(vend1, { items: [{ emporio_product_id: semPreco.data.id, presentation_id: apSem.data.id, quantity: 1 }] }),
    "VALIDATION_ERROR",
    422,
    "items",
    `"${nomeSemPreco}" (Quilo) não tem preço cadastrado nesta loja. Informe o preço.`,
  );
  await recusaSemGravar("sem itens", orcar(vend1, { items: [] }), "VALIDATION_ERROR", 422, "items", "Inclua ao menos um item no orçamento.");
  const comFalta = await orcar(vend1, { items: [item({ quantity: 150 })] });
  check("quantidade maior que o saldo: salva (orçamento não baixa), com falta true", comFalta.ok && comFalta.data.items[0].falta === true && comFalta.data.items[0].saldo_base === 99, j(comFalta.ok ? comFalta.data.items : comFalta));

  // --- Histórico
  const log = await db.emporioAuditLog.findFirst({ where: { action: "orcamento.criar", target_id: o1.data.id } });
  check("Histórico: orcamento.criar, alvo orcamento, na Loja 1, por quem salvou", log?.target_type === "orcamento" && log?.establishment_id === L1 && log?.user_id === vend1.id, j(log));
  check("o resumo traz o número do orçamento", !!log?.summary.includes("000001"), log?.summary);
  const logs = await db.emporioAuditLog.count({ where: { action: "orcamento.criar" } });
  check("uma linha de Histórico por orçamento salvo (a repetição não grava)", logs === (await db.emporioQuote.count()), `${logs} != ${await db.emporioQuote.count()}`);

  // --- leitura
  const lido = await Orc.lerOrcamentoAction(db, vend1 as never, o1.data.id);
  check("lerOrcamentoAction pelo Vendedor da loja: ok, a mesma visão", lido.ok && lido.data.id === o1.data.id && lido.data.numero === "000001" && lido.data.items.length === 1 && !("replayed" in lido.data), j(lido));
  const lidoCaixa = await Orc.lerOrcamentoAction(db, caixa as never, o1.data.id);
  check("o Caixa da loja também lê", lidoCaixa.ok, j(lidoCaixa));
  const outraConta = await Orc.lerOrcamentoAction(B.db, ownerB as never, o1.data.id);
  check("por outro tenant: 404", !outraConta.ok && outraConta.status === 404, j(outraConta));
  const outraLoja = await Orc.lerOrcamentoAction(db, vend2 as never, o1.data.id);
  check("pelo Vendedor de outra loja: 404", !outraLoja.ok && outraLoja.status === 404, j(outraLoja));
  const inexistente = await Orc.lerOrcamentoAction(db, owner as never, "nao-existe");
  check("id que não existe: 404", !inexistente.ok && inexistente.status === 404, j(inexistente));

  // --- rotas
  type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const chamar = async (token: string | null, caminho: string, metodo: string, url: string, corpo?: Dado, id = "x") => {
    const mod = (await import(`@/app/api/v1/emporio/${caminho}/route`)) as Record<string, Handler>;
    const init: RequestInit = { method: metodo };
    if (corpo !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(corpo);
    }
    const res = await withBearer(token, () => mod[metodo](new Request(`http://localhost/api/v1/emporio/${url}`, init), { params: Promise.resolve({ id }) }));
    let json: Dado = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  };
  const tVend = signAccessToken(vend1.id);
  const corpo = (extra: Dado = {}) => ({
    operation_key: `m94-${stamp}-rota-${(seq += 1)}`,
    establishment_id: L1,
    contact_id: completo.id,
    items: [item()],
    ...extra,
  });
  const pSem = await chamar(null, "quotes", "POST", "quotes", corpo());
  check("POST quotes sem sessão: 401", pSem.status === 401, `${pSem.status} ${j(pSem.json)}`);
  const c1 = corpo();
  const p1 = await chamar(tVend, "quotes", "POST", "quotes", c1);
  check("POST quotes do Vendedor: 201 com numero e situacao", p1.status === 201 && /^\d{6}$/.test(p1.json?.data?.numero ?? "") && p1.json?.data?.situacao === "aberto", `${p1.status} ${j(p1.json)}`);
  check("e a resposta não expõe replayed", p1.json?.data && !("replayed" in p1.json.data), j(p1.json));
  const p2 = await chamar(tVend, "quotes", "POST", "quotes", c1);
  check("POST com a mesma chave: 200, o mesmo id", p2.status === 200 && p2.json?.data?.id === p1.json?.data?.id, `${p2.status} ${j(p2.json)}`);
  const pZod = await chamar(tVend, "quotes", "POST", "quotes", { ...corpo(), items: "x" });
  check("POST com items fora do formato: 422 em items, em português", pZod.status === 422 && pZod.json?.error?.field === "items" && !/expected/i.test(pZod.json?.error?.message ?? ""), `${pZod.status} ${j(pZod.json)}`);
  const pCf = await chamar(tVend, "quotes", "POST", "quotes", corpo({ contact_id: cf }));
  check("POST com Consumidor final: 422 QUOTE_CUSTOMER_REQUIRED no campo", pCf.status === 422 && pCf.json?.error?.code === "QUOTE_CUSTOMER_REQUIRED" && pCf.json?.error?.field === "contact_id" && pCf.json?.error?.message === MSG_CLIENTE, `${pCf.status} ${j(pCf.json)}`);
  const g1 = await chamar(tVend, "quotes/[id]", "GET", `quotes/${o1.data.id}`, undefined, o1.data.id);
  check("GET quotes/:id do Vendedor: 200", g1.status === 200 && g1.json?.data?.id === o1.data.id && g1.json?.data?.valid_until === val7, `${g1.status} ${j(g1.json)}`);
  const gB = await chamar(signAccessToken(ownerB.id), "quotes/[id]", "GET", `quotes/${o1.data.id}`, undefined, o1.data.id);
  check("GET quotes/:id pelo Dono de outra conta: 404", gB.status === 404, `${gB.status} ${j(gB.json)}`);
  const gL2 = await chamar(signAccessToken(vend2.id), "quotes/[id]", "GET", `quotes/${o1.data.id}`, undefined, o1.data.id);
  check("GET quotes/:id pelo Vendedor de outra loja: 404", gL2.status === 404, `${gL2.status} ${j(gL2.json)}`);
}

async function limpar() {
  const { prisma } = await import("@/lib/prisma");
  const modelos = [
    "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "emporioSalePayment", "emporioSaleReturnItem", "stockMovement", "emporioSaleItem",
    "emporioSaleReturn", "emporioSale", "emporioQuoteItem", "emporioQuote", "cashHandover", "cashSession", "cashRegister", "fixedExpenseOccurrence",
    "fixedExpenseSplit", "fixedExpenseTemplate", "emporioCounter", "emporioSettings", "financialPayment", "financialEntry", "userEstablishment",
    "establishment", "bankAccount", "contact", "user", "tenantProfile", "tenantFeature",
  ];
  for (const id of tenantIds) {
    for (const m of modelos) {
      try {
        await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: id } });
      } catch {
        // modelo ausente nesta versão do schema: segue
      }
    }
    await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
  }
  const sobrou = await prisma.tenant.count({ where: { id: { in: tenantIds } } });
  check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
}

async function main() {
  try {
    await secao1();
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M94 verde" : `\n❌ M94: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
