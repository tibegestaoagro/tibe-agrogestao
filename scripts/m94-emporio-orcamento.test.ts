import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M94: Módulo 39 (Meu Empório), entrega 4: o orçamento.
 * Roda: `npm run test:m94`
 *
 * Seção 1: o orçamento salvo (o preço que vale e a referência ao faturar, gravar, repetir a chave, numeração,
 * cliente, vendedor, desconto, preço, Histórico, leitura e alcance, rotas).
 * Seção 2: a lista com busca (número, telefone, CPF, nome), a situação, o alcance, o Caixa
 * e a busca pelo número.
 * Seção 3: faturar (referência e preço, o desconto que não se soma, a autorização herdada, validade no dia da venda em Brasília, o Caixa, outra loja,
 * outro tenant, de novo, dois balcões ao mesmo tempo), cancelar e faturar de novo, replay,
 * item fora do orçamento e a troca.
 * Seção 4: o papel do orçamento (tipo, validade, sem pagamento, rodapé, alcance) e o orçamento
 * de origem no papel da venda; o orçamento faturado reimpresso diz FATURADO.
 * Seção 5: o relógio interno do orçamento (`opts.agora`), e a rota que ignora data no corpo.
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
  const { precoQueVale, precoDeReferencia } = await import("@/lib/emporio/precificar");
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
  // a referência do desconto ao faturar (orçado, sugerido no orçamento, hoje, vencido)
  check("referência: hoje mais caro, vale a sugerida do orçamento", precoDeReferencia(1900, 2000, 2500, false) === 2000);
  check("referência: hoje mais barato que a sugerida, vale a de hoje", precoDeReferencia(1900, 2000, 1700, false) === 1700);
  check("referência: sem preço hoje, vale a sugerida do orçamento", precoDeReferencia(1900, 2000, null, false) === 2000);
  check("referência: sem preço hoje nem sugerida, vale o orçado", precoDeReferencia(1900, null, null, false) === 1900);
  check("referência: sem sugerida, vale a de hoje", precoDeReferencia(1900, null, 2100, false) === 2100);
  check("referência: vencido, a de hoje", precoDeReferencia(1900, 2000, 2500, true) === 2500 && precoDeReferencia(1900, 2000, null, true) === null);

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

  return { prisma, Orc, db, B, owner, ownerB, gestor, vend1, vend2, caixa, L1, L2, item, orcar, chamar, signAccessToken, rec, stamp, hoje, somarDias, vendaId: venda.ok ? venda.data.id : "", corpo };
}

async function secao2(c: Dado) {
  console.log("\nSeção 2: a lista, a busca e a busca pelo número (com banco)");
  const { prisma, Orc, db, B, owner, ownerB, gestor, vend1, vend2, caixa, L1, L2, orcar, chamar, signAccessToken, rec, stamp, hoje, somarDias, vendaId } = c;
  const mk = async (nome: string, document: string, phone: string) =>
    db.contact.create({ data: { name: nome, person_kind: "pf", document, phone } as never });
  const joao = await mk(`João Mendes ${stamp}`, "529.982.247-25", "(34) 99999-0000");
  const maria = await mk(`Maria Souza ${stamp}`, "11144477735", "(11) 98888-7777");

  const qJ = await orcar(vend1, { contact_id: joao.id });
  const qM = await orcar(vend1, { contact_id: maria.id });
  const qV = await orcar(vend1, { contact_id: maria.id });
  const qF = await orcar(vend1, { contact_id: maria.id });
  const qL2 = await orcar(vend2, { contact_id: joao.id, establishment_id: L2 });
  if (!qJ.ok || !qM.ok || !qV.ok || !qF.ok || !qL2.ok) throw new Error(`orçamentos da seção 2: ${JSON.stringify([qJ, qM, qV, qF, qL2])}`);
  const ontem = somarDias(hoje, -1);
  await db.emporioQuote.update({ where: { id: qV.data.id }, data: { valid_until: ontem } });
  await db.emporioQuote.update({ where: { id: qF.data.id }, data: { sale_id: vendaId } });

  const lista = (ator: Dado, f: Dado = {}) => Orc.listarOrcamentosAction(db, ator, f);
  const ids = (r: Dado): string[] => (r.ok ? r.data.map((x: Dado) => x.id) : []);
  const soEste = (r: Dado, id: string) => r.ok && r.data.length === 1 && r.data[0].id === id;

  // --- a busca
  const porNumero = await lista(gestor, { q: String(qJ.data.number) });
  check("q com o número sem zeros acha o orçamento", ids(porNumero).includes(qJ.data.id) && !ids(porNumero).includes(qM.data.id), j(ids(porNumero)));
  const porNumeroCheio = await lista(gestor, { q: qJ.data.numero });
  check("q com o número de 6 dígitos (000NNN) acha o mesmo", ids(porNumeroCheio).includes(qJ.data.id) && !ids(porNumeroCheio).includes(qM.data.id), j(ids(porNumeroCheio)));
  check("q com telefone com máscara acha pelos dígitos", soEste(await lista(gestor, { q: "(34) 99999-0000" }), qJ.data.id));
  check("q com os dígitos do telefone, sem máscara: acha igual", soEste(await lista(gestor, { q: "34999990000" }), qJ.data.id));
  check("q com pedaço do telefone (34) 99999: acha", soEste(await lista(gestor, { q: "(34) 99999" }), qJ.data.id));
  check("q com CPF com pontos acha pelos dígitos (o cadastro tem pontos)", soEste(await lista(gestor, { q: "529.982.247-25" }), qJ.data.id));
  const maria3 = await lista(gestor, { q: "11144477735" });
  check("q com CPF sem pontos acha o cadastro sem pontos (dois orçamentos abertos/vencidos)", ids(maria3).includes(qM.data.id) && ids(maria3).includes(qV.data.id) && !ids(maria3).includes(qJ.data.id), j(ids(maria3)));
  check("q por nome sem acento (joao) acha João", soEste(await lista(gestor, { q: "joao" }), qJ.data.id));
  check("q por nome com acento e caixa alta (JOÃO mendes) acha", soEste(await lista(gestor, { q: "JOÃO mendes" }), qJ.data.id));
  const nada = await lista(gestor, { q: "zzzqqq" });
  check("q sem ninguém: lista vazia, ok", nada.ok && nada.data.length === 0, j(nada));

  // --- a linha
  const linhaJ = (porNumero.ok ? porNumero.data : []).find((x: Dado) => x.id === qJ.data.id);
  check(
    "a linha: numero, loja, cliente, telefone como cadastrado, valor, situação aberto, sem venda, vendedor",
    !!linhaJ && linhaJ.numero === qJ.data.numero && linhaJ.loja === "M94 Loja 1" && linhaJ.cliente === joao.name && linhaJ.telefone === "(34) 99999-0000" &&
      linhaJ.valor === 40 && linhaJ.situacao === "aberto" && linhaJ.venda_numero === null && linhaJ.vendedor === "M94 vend1" && typeof linhaJ.criado_em === "string" && linhaJ.valid_until === qJ.data.valid_until,
    j(linhaJ),
  );

  // --- a situação
  const padrao = await lista(gestor);
  check("padrão (acompanhamento): traz aberto e vencido", ids(padrao).includes(qJ.data.id) && ids(padrao).includes(qV.data.id), j(ids(padrao)));
  check("padrão: não traz faturado", !ids(padrao).includes(qF.data.id));
  const venc = await lista(gestor, { situacao: "vencido" });
  check("vencido: só o vencido (valid_until ontem)", soEste(venc, qV.data.id) && venc.data[0].situacao === "vencido", j(venc));
  const fat = await lista(gestor, { situacao: "faturado" });
  check("faturado: só o faturado, com o número da venda", soEste(fat, qF.data.id) && fat.data[0].situacao === "faturado" && fat.data[0].venda_numero === "000001", j(fat));
  const abertos = await lista(gestor, { situacao: "aberto" });
  check("aberto: não traz vencido nem faturado", !ids(abertos).includes(qV.data.id) && !ids(abertos).includes(qF.data.id) && ids(abertos).includes(qJ.data.id), j(ids(abertos)));
  const todos = await lista(gestor, { situacao: "todos" });
  check("todos: traz os três", [qJ, qV, qF].every((q) => ids(todos).includes(q.data.id)), j(ids(todos)));
  check("a ordem é do mais novo para o mais antigo", todos.ok && todos.data.every((x: Dado, i: number, a: Dado[]) => i === 0 || a[i - 1].criado_em >= x.criado_em), j(todos.ok ? todos.data.map((x: Dado) => x.criado_em) : todos));
  const lim = await lista(gestor, { situacao: "todos", limit: 2 });
  check("limit 2: duas linhas", lim.ok && lim.data.length === 2, j(lim));
  const limBusca = await lista(gestor, { q: "11144477735", limit: 1 });
  check("limit vale também na busca por dígitos", limBusca.ok && limBusca.data.length === 1, j(limBusca));
  const sitInvalida = await lista(gestor, { situacao: "qualquer" as never });
  check("situacao desconhecida: 422 em situacao", rec(sitInvalida, "VALIDATION_ERROR", 422, "situacao"), j(sitInvalida));

  // --- o alcance
  check("o Gestor da Loja 1 não vê o orçamento da Loja 2", !ids(todos).includes(qL2.data.id));
  const l2Gestor = await lista(gestor, { establishment_id: L2 });
  check("com establishment_id da Loja 2: 404 no establishment_id", rec(l2Gestor, "NOT_FOUND", 404, "establishment_id"), j(l2Gestor));
  const doDono = await lista(owner, { situacao: "todos" });
  check("o Dono, sem loja, vê as duas lojas", ids(doDono).includes(qJ.data.id) && ids(doDono).includes(qL2.data.id), j(ids(doDono)));
  const donoL2 = await lista(owner, { establishment_id: L2, situacao: "todos" });
  check("o Dono, com a Loja 2: só os da Loja 2", donoL2.ok && donoL2.data.length > 0 && donoL2.data.every((x: Dado) => x.loja === "M94 Loja 2"), j(donoL2));
  const outraConta = await Orc.listarOrcamentosAction(B.db, ownerB, { situacao: "todos" });
  check("outro tenant: lista vazia", outraConta.ok && outraConta.data.length === 0, j(outraConta));
  const buscaTenant = await Orc.listarOrcamentosAction(B.db, ownerB, { q: "34999990000" });
  check("outro tenant buscando o telefone do João: vazio", buscaTenant.ok && buscaTenant.data.length === 0, j(buscaTenant));

  // --- o Caixa
  const caixaLista = await lista(caixa);
  check("o Caixa na lista: 403", !caixaLista.ok && caixaLista.status === 403, j(caixaLista));

  // --- a busca pelo número
  const busca = (ator: Dado, loja: string, n: number) => Orc.buscarOrcamentoPorNumeroAction(db, ator, loja, n);
  const bCaixa = await busca(caixa, L1, qJ.data.number);
  check("o Caixa na loja dele: ok, a visão completa", bCaixa.ok && bCaixa.data.id === qJ.data.id && bCaixa.data.items.length === 1, j(bCaixa));
  const bGestor = await busca(gestor, L1, qV.data.number);
  check("o orçamento vencido também sai, com a situação", bGestor.ok && bGestor.data.situacao === "vencido", j(bGestor));
  const bFat = await busca(gestor, L1, qF.data.number);
  check("o faturado sai, dizendo a venda", bFat.ok && bFat.data.situacao === "faturado" && bFat.data.sale?.numero === "000001", j(bFat));
  const bOutra = await busca(caixa, L1, qL2.data.number);
  check("número de outra loja: 404 QUOTE_NOT_FOUND em number", rec(bOutra, "QUOTE_NOT_FOUND", 404, "number", "Orçamento não encontrado nesta loja."), j(bOutra));
  const bNao = await busca(gestor, L1, 999999);
  check("número que não existe: QUOTE_NOT_FOUND em number", rec(bNao, "QUOTE_NOT_FOUND", 404, "number"), j(bNao));
  const bLojaFora = await busca(gestor, L2, qL2.data.number);
  check("loja fora do alcance do ator: 404 em establishment_id", rec(bLojaFora, "NOT_FOUND", 404, "establishment_id"), j(bLojaFora));
  const bTenant = await Orc.buscarOrcamentoPorNumeroAction(B.db, ownerB, L1, qJ.data.number);
  check("outro tenant: não acha", !bTenant.ok && bTenant.status === 404, j(bTenant));
  for (const ruim of [0, -1, 1.5, Number.NaN]) {
    const r = await busca(gestor, L1, ruim);
    check(`número inválido (${ruim}): 422 em number`, rec(r, "VALIDATION_ERROR", 422, "number"), j(r));
  }

  // --- as rotas
  const tGestor = signAccessToken(gestor.id);
  const tCaixa = signAccessToken(caixa.id);
  const rSem = await chamar(null, "quotes", "GET", "quotes");
  check("GET quotes sem sessão: 401", rSem.status === 401, `${rSem.status}`);
  const rLista = await chamar(tGestor, "quotes", "GET", `quotes?q=${encodeURIComponent("(34) 99999-0000")}`);
  check("GET quotes?q= com telefone mascarado: 200 com a linha", rLista.status === 200 && rLista.json?.data?.length === 1 && rLista.json.data[0].id === qJ.data.id && rLista.json.data[0].situacao === "aberto", `${rLista.status} ${j(rLista.json)}`);
  const rFat = await chamar(tGestor, "quotes", "GET", "quotes?situacao=faturado");
  check("GET quotes?situacao=faturado: o faturado", rFat.status === 200 && rFat.json?.data?.length === 1 && rFat.json.data[0].id === qF.data.id, `${rFat.status} ${j(rFat.json)}`);
  const rSit = await chamar(tGestor, "quotes", "GET", "quotes?situacao=qualquer");
  check("GET quotes?situacao=qualquer: 422 em situacao, em português", rSit.status === 422 && rSit.json?.error?.field === "situacao" && !/expected|invalid/i.test(rSit.json?.error?.message ?? ""), `${rSit.status} ${j(rSit.json)}`);
  const rL2 = await chamar(tGestor, "quotes", "GET", `quotes?establishment_id=${L2}`);
  check("GET quotes da Loja 2 pelo Gestor da Loja 1: 404", rL2.status === 404, `${rL2.status} ${j(rL2.json)}`);
  const rCaixa = await chamar(tCaixa, "quotes", "GET", "quotes");
  check("GET quotes pelo Caixa: 403", rCaixa.status === 403, `${rCaixa.status} ${j(rCaixa.json)}`);
  const rLim = await chamar(tGestor, "quotes", "GET", "quotes?situacao=todos&limit=1");
  check("GET quotes?limit=1: uma linha", rLim.status === 200 && rLim.json?.data?.length === 1, `${rLim.status} ${j(rLim.json)}`);

  const look = (token: string | null, loja: string, n: string) => chamar(token, "quotes/lookup", "GET", `quotes/lookup?establishment_id=${loja}&number=${n}`);
  const lSem = await look(null, L1, String(qJ.data.number));
  check("GET lookup sem sessão: 401", lSem.status === 401, `${lSem.status}`);
  const lCaixa = await look(tCaixa, L1, String(qJ.data.number));
  check("GET lookup pelo Caixa da loja dele: 200 com a visão", lCaixa.status === 200 && lCaixa.json?.data?.id === qJ.data.id && lCaixa.json.data.items?.length === 1, `${lCaixa.status} ${j(lCaixa.json)}`);
  const lCaixaZeros = await look(tCaixa, L1, qJ.data.numero);
  check("GET lookup com o número de 6 dígitos (000NNN): 200", lCaixaZeros.status === 200 && lCaixaZeros.json?.data?.id === qJ.data.id, `${lCaixaZeros.status} ${j(lCaixaZeros.json)}`);
  const lOutra = await look(tCaixa, L1, String(qL2.data.number));
  check("GET lookup de número de outra loja: 404 QUOTE_NOT_FOUND em number", lOutra.status === 404 && lOutra.json?.error?.code === "QUOTE_NOT_FOUND" && lOutra.json?.error?.field === "number", `${lOutra.status} ${j(lOutra.json)}`);
  const lRuim = await look(tCaixa, L1, "abc");
  check("GET lookup com number=abc: 422 em number", lRuim.status === 422 && lRuim.json?.error?.field === "number", `${lRuim.status} ${j(lRuim.json)}`);
  const lSemNumero = await chamar(tCaixa, "quotes/lookup", "GET", `quotes/lookup?establishment_id=${L1}`);
  check("GET lookup sem number: 422 em number", lSemNumero.status === 422 && lSemNumero.json?.error?.field === "number", `${lSemNumero.status} ${j(lSemNumero.json)}`);
  const lSemLoja = await chamar(tCaixa, "quotes/lookup", "GET", `quotes/lookup?number=${qJ.data.number}`);
  check("GET lookup sem establishment_id: 422 em establishment_id", lSemLoja.status === 422 && lSemLoja.json?.error?.field === "establishment_id", `${lSemLoja.status} ${j(lSemLoja.json)}`);
  const lV2 = await look(signAccessToken(vend2.id), L1, String(qJ.data.number));
  check("GET lookup do Vendedor da Loja 2 na Loja 1: 404", lV2.status === 404, `${lV2.status} ${j(lV2.json)}`);
  void prisma;
}

async function secao3(c: Dado) {
  console.log("\nSeção 3: faturar o orçamento e cancelar a venda (com banco)");
  const { Orc, db, B, owner, ownerB, gestor, vend1, vend2, caixa, L1, L2, chamar, signAccessToken, rec, stamp, hoje, somarDias } = c;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const Ven = await import("@/lib/actions/emporio-vendas");
  const { formatarNumero } = await import("@/lib/emporio/numeracao");
  const MSG_NAO_ACHADO = "Orçamento não encontrado nesta loja.";
  const MSG_OUTRA_LOJA = "Este orçamento é de outra loja. Fature na loja dele.";
  const MSG_FATURADO = (n: number) => `Este orçamento já foi faturado na venda nº ${formatarNumero(n)}.`;

  // Produtos próprios da seção: P (o do orçamento) e P2 (o item a mais, fora dele).
  const cat = await db.productCategory.create({ data: { name: "M94 categoria faturar" } as never });
  const mkProduto = async (nome: string, preco: number, estoque: number) => {
    const p = await Cat.criarProdutoEmporioAction(db, owner, { name: `${nome} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    if (!p.ok) throw new Error(j(p));
    const a = await Cat.criarApresentacaoAction(db, owner, p.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!a.ok) throw new Error(j(a));
    for (const est of [L1, L2]) {
      const r = await Cat.definirPrecoAction(db, owner, { establishment_id: est, presentation_id: a.data.id, price: preco });
      if (!r.ok) throw new Error(j(r));
    }
    const e = await Est.implantarEstoqueAction(db, owner, { establishment_id: L1, emporio_product_id: p.data.id, sealed: [], loose_qty: estoque, unit_cost: 5 });
    if (!e.ok) throw new Error(j(e));
    return { id: p.data.id, ap: a.data.id, product_id: p.data.product_id as string };
  };
  const P = await mkProduto("M94 Racao", 20, 500);
  const P2 = await mkProduto("M94 Milho", 10, 50);
  const precoHoje = async (v: number, prod = P) => {
    const r = await Cat.definirPrecoAction(db, owner, { establishment_id: L1, presentation_id: prod.ap, price: v });
    if (!r.ok) throw new Error(j(r));
  };
  const cliente = await db.contact.create({
    data: { name: `M94 Cliente Faturar ${stamp}`, person_kind: "pf", document: "15350946056", phone: "11977776666" } as never,
  });

  let k = 0;
  const chave = (s: string) => `m94-${stamp}-f-${s}-${(k += 1)}`;
  const itemP = (q = 2, extra: Dado = {}) => ({ emporio_product_id: P.id, presentation_id: P.ap, quantity: q, ...extra });
  const orcarP = async (ator: Dado = vend1, extra: Dado = {}) => {
    const r = await Orc.salvarOrcamentoAction(db, ator, { operation_key: chave("orc"), establishment_id: L1, contact_id: cliente.id, items: [itemP()], ...extra });
    if (!r.ok) throw new Error(`orçamento da seção 3: ${j(r)}`);
    return r.data;
  };
  const faturar = (ator: Dado, quote_id: unknown, total: number, extra: Dado = {}, banco: Dado = db) =>
    Ven.venderAction(banco, ator, {
      operation_key: chave("venda"),
      establishment_id: L1,
      contact_id: cliente.id,
      quote_id,
      items: [itemP()],
      payments: [{ kind: "dinheiro", amount: total }],
      ...extra,
    } as never);
  const situacao = async (id: string) => {
    const r = await Orc.lerOrcamentoAction(db, owner, id);
    if (!r.ok) throw new Error(j(r));
    return r.data;
  };
  const contar = async () => ({
    vendas: await db.emporioSale.count(),
    estoque: await db.stockMovement.count(),
    caixa: await db.cashMovement.count(),
    lancamentos: await db.financialEntry.count(),
  });

  // --- dentro da validade, o preço de hoje subiu: vale o orçado
  const qA = await orcarP();
  await precoHoje(25);
  const vA = await faturar(vend1, qA.id, 40);
  check("hoje mais caro (25), orçado 20: a venda sai", vA.ok, j(vA));
  if (!vA.ok) throw new Error("sem a primeira venda faturada");
  check(
    "orçado 20 sobre 20, hoje 25: a referência é a sugerida do orçamento (suggested 20), unit 20, desconto 0, total 40",
    vA.data.items[0].suggested_price === 20 && vA.data.items[0].unit_price === 20 && vA.data.discount_amount === 0 && vA.data.net_amount === 40,
    j(vA.data.items),
  );
  check("a venda diz de qual orçamento veio (quote id e numero)", j(vA.data.quote) === j({ id: qA.id, numero: qA.numero }), j(vA.data.quote));
  const rowA = await db.emporioSale.findFirst({ where: { id: vA.data.id } });
  check("a linha da venda grava quote_id", rowA?.quote_id === qA.id, j(rowA));
  const sA = await situacao(qA.id);
  check("o orçamento fica faturado, com sale.numero da venda", sA.situacao === "faturado" && sA.sale?.id === vA.data.id && sA.sale?.numero === formatarNumero(vA.data.number), j([sA.situacao, sA.sale]));
  check("o vendedor da venda é o do orçamento", vA.data.seller_user_id === vend1.id, j(vA.data.seller_user_id));
  const logA = await db.emporioAuditLog.findFirst({ where: { action: "venda.criar", target_id: vA.data.id } });
  check("Histórico: venda.criar, com \"do orçamento nº\" no resumo", !!logA?.summary.includes(`do orçamento nº ${qA.numero}`), logA?.summary);

  // --- dentro da validade, o preço de hoje baixou: vale o de hoje
  const qB = await orcarP(); // orçado a 25
  await precoHoje(18);
  const vB = await faturar(vend1, qB.id, 36);
  check(
    "hoje mais barato (18), orçado 25: referência e preço são os de hoje (suggested 18, unit 18, desconto 0)",
    vB.ok && vB.data.items[0].suggested_price === 18 && vB.data.items[0].unit_price === 18 && vB.data.discount_amount === 0,
    j(vB.ok ? vB.data.items : vB),
  );

  // --- vencido: vale o preço de hoje
  const qC = await orcarP(); // orçado a 18
  await db.emporioQuote.update({ where: { id: qC.id }, data: { valid_until: somarDias(hoje, -1) } });
  await precoHoje(22);
  const vC = await faturar(vend1, qC.id, 44);
  check(
    "vencido, orçado 18 e hoje 22: vale o de hoje (suggested 22, unit 22)",
    vC.ok && vC.data.items[0].suggested_price === 22 && vC.data.items[0].unit_price === 22 && vC.data.discount_amount === 0,
    j(vC.ok ? vC.data.items : vC),
  );
  check("e o vencido também fica faturado", (await situacao(qC.id)).situacao === "faturado");

  // --- a fronteira do dia em Brasília (preço de hoje 30 a partir daqui)
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const qD = await orcarP(); // orçado a 22
  await db.emporioQuote.update({ where: { id: qD.id }, data: { valid_until: hoje } });
  await precoHoje(30);
  const vD = await faturar(vend1, qD.id, 44, { sold_at: new Date(`${ymd(hoje)}T23:50:00-03:00`) });
  check(
    "valid_until = hoje e a venda às 23h50 de Brasília (já amanhã em UTC): ainda vale o orçado 22",
    vD.ok && vD.data.items[0].suggested_price === 22 && vD.data.items[0].unit_price === 22,
    j(vD.ok ? vD.data.items : vD),
  );
  const ontem = somarDias(hoje, -1);
  const qD2 = await orcarP(); // orçado a 30
  await db.emporioQuote.update({ where: { id: qD2.id }, data: { valid_until: ontem } });
  await precoHoje(33);
  const vD2 = await faturar(vend1, qD2.id, 60, { sold_at: new Date(`${ymd(ontem)}T23:50:00-03:00`) });
  check(
    "válido até ontem, venda lançada ontem às 23h50: vale o orçado 30 (a validade é contra o dia da venda)",
    vD2.ok && vD2.data.items[0].suggested_price === 30,
    j(vD2.ok ? vD2.data.items : vD2),
  );
  const qD3 = await orcarP(); // orçado a 33
  await db.emporioQuote.update({ where: { id: qD3.id }, data: { valid_until: ontem } });
  await precoHoje(35);
  const vD3 = await faturar(vend1, qD3.id, 70, { sold_at: new Date(`${ymd(hoje)}T00:10:00-03:00`) });
  check(
    "válido até ontem, venda hoje às 00h10 de Brasília: vencido, vale o de hoje 35",
    vD3.ok && vD3.data.items[0].suggested_price === 35,
    j(vD3.ok ? vD3.data.items : vD3),
  );
  await precoHoje(30);

  // --- o Caixa fatura sem escolher vendedor (pela rota)
  const qE = await orcarP(); // orçado a 30, vendedor vend1
  const tCaixa = signAccessToken(caixa.id);
  const rE = await chamar(tCaixa, "sales", "POST", "sales", {
    operation_key: chave("rota"),
    establishment_id: L1,
    contact_id: cliente.id,
    quote_id: qE.id,
    items: [itemP()],
    payments: [{ kind: "dinheiro", amount: 60 }],
  });
  check(
    "o Caixa fatura sem seller_user_id: 201, vendedor = o do orçamento, registrado pelo Caixa",
    rE.status === 201 && rE.json?.data?.seller_user_id === vend1.id && rE.json?.data?.sold_by_user_id === caixa.id && rE.json?.data?.quote?.id === qE.id,
    `${rE.status} ${j(rE.json)}`,
  );
  const qE2 = await orcarP(gestor); // vendedor = o Gestor
  const vE2 = await faturar(caixa, qE2.id, 60, { seller_user_id: vend1.id });
  check("o vendedor mandado no corpo não troca o do orçamento", vE2.ok && vE2.data.seller_user_id === gestor.id, j(vE2.ok ? vE2.data.seller_user_id : vE2));
  const rZod = await chamar(tCaixa, "sales", "POST", "sales", {
    operation_key: chave("rota"),
    establishment_id: L1,
    contact_id: cliente.id,
    quote_id: 5,
    items: [itemP()],
    payments: [{ kind: "dinheiro", amount: 60 }],
  });
  check("POST sales com quote_id fora do formato: 422 em quote_id, em português", rZod.status === 422 && rZod.json?.error?.field === "quote_id" && !/expected/i.test(rZod.json?.error?.message ?? ""), `${rZod.status} ${j(rZod.json)}`);

  // --- outra loja, outro tenant, id que não existe: nada gravado
  const recusaSemGravar = async (nome: string, r: Promise<Dado>, code: string, status: number, field: string, msg: string) => {
    const n0 = await contar();
    const x = await r;
    check(`${nome}: ${status} ${code} em ${field}, sem gravar`, rec(x, code, status, field, msg) && j(await contar()) === j(n0), j(x));
  };
  const qL2 = await Orc.salvarOrcamentoAction(db, vend2, { operation_key: chave("orc"), establishment_id: L2, contact_id: cliente.id, items: [itemP()] });
  if (!qL2.ok) throw new Error(j(qL2));
  await recusaSemGravar("orçamento de outra loja", faturar(owner, qL2.data.id, 60), "QUOTE_OTHER_STORE", 422, "quote_id", MSG_OUTRA_LOJA);
  await recusaSemGravar("id que não existe", faturar(vend1, "nao-existe", 60), "QUOTE_NOT_FOUND", 404, "quote_id", MSG_NAO_ACHADO);
  const lB = await Cat.criarEstabelecimentoAction(B.db, ownerB, { name: "M94 Loja B" });
  if (!lB.ok) throw new Error(j(lB));
  const deOutroTenant = await Ven.venderAction(B.db, ownerB, {
    operation_key: chave("venda"),
    establishment_id: lB.data.id,
    contact_id: "qualquer",
    quote_id: qE2.id,
    items: [itemP()],
    payments: [{ kind: "dinheiro", amount: 60 }],
  } as never);
  check("orçamento de outro tenant: 404 QUOTE_NOT_FOUND em quote_id", rec(deOutroTenant, "QUOTE_NOT_FOUND", 404, "quote_id", MSG_NAO_ACHADO), j(deOutroTenant));
  check("e o orçamento do outro tenant não muda", (await situacao(qE2.id)).sale?.id === (vE2.ok ? vE2.data.id : "?"));

  // --- faturar de novo
  await recusaSemGravar("faturar de novo", faturar(vend1, qA.id, 40), "QUOTE_ALREADY_INVOICED", 409, "quote_id", MSG_FATURADO(vA.data.number));

  // --- dois balcões ao mesmo tempo
  const qF = await orcarP(); // orçado a 30
  const antesF = await contar();
  const [x1, x2] = await Promise.all([faturar(vend1, qF.id, 60), faturar(gestor, qF.id, 60)]);
  const okF = [x1, x2].filter((x) => x.ok);
  const recusaF = [x1, x2].find((x) => !x.ok) as Dado;
  check("duas vendas ao mesmo tempo: uma sai", okF.length === 1, j([x1, x2]));
  check(
    "e a outra recebe 409 QUOTE_ALREADY_INVOICED com o número da venda que saiu",
    !!recusaF && okF.length === 1 && rec(recusaF, "QUOTE_ALREADY_INVOICED", 409, "quote_id", MSG_FATURADO((okF[0] as Dado).data.number)),
    j(recusaF),
  );
  const depoisF = await contar();
  check(
    "nada da recusada ficou: uma venda, um movimento de estoque, um de caixa, um lançamento",
    depoisF.vendas - antesF.vendas === 1 && depoisF.estoque - antesF.estoque === 1 && depoisF.caixa - antesF.caixa === 1 && depoisF.lancamentos - antesF.lancamentos === 1,
    `${j(antesF)} -> ${j(depoisF)}`,
  );
  check("e só uma venda aponta para o orçamento", (await db.emporioSale.count({ where: { quote_id: qF.id } })) === 1);

  // --- cancelar a venda reabre o orçamento
  const cancel = await Ven.cancelarVendaAction(db, owner, vA.data.id, { reason: "cliente desistiu" });
  check("cancelar a venda faturada: ok", cancel.ok, j(cancel));
  const sA2 = await situacao(qA.id);
  check("o orçamento volta a aberto, sem venda ativa", sA2.situacao === "aberto" && sA2.sale === null, j([sA2.situacao, sA2.sale]));
  check("a venda cancelada continua dizendo de qual orçamento veio", cancel.ok && cancel.data.quote?.id === qA.id, j(cancel.ok ? cancel.data.quote : cancel));
  const chaveA2 = chave("venda");
  const vA2 = await faturar(vend1, qA.id, 40, { operation_key: chaveA2 });
  check("faturar de novo depois do cancelamento: ok, ainda no orçado 20 (hoje 30)", vA2.ok && vA2.data.items[0].suggested_price === 20, j(vA2.ok ? vA2.data.items : vA2));
  const rE2 = await chamar(signAccessToken(vend1.id), "sales", "POST", "sales", {
    operation_key: chave("rota"),
    establishment_id: L1,
    contact_id: cliente.id,
    quote_id: qB.id,
    items: [itemP()],
    payments: [{ kind: "dinheiro", amount: 36 }],
  });
  check("pela rota, faturar um já faturado: 409 em quote_id", rE2.status === 409 && rE2.json?.error?.code === "QUOTE_ALREADY_INVOICED" && rE2.json?.error?.field === "quote_id", `${rE2.status} ${j(rE2.json)}`);
  const duas: { id: string; status: string }[] = await db.emporioSale.findMany({ where: { quote_id: qA.id }, select: { id: true, status: true } });
  check("as duas vendas guardam o quote_id (a cancelada e a nova)", duas.length === 2 && duas.some((d) => d.status === "cancelada") && duas.some((d) => d.status === "concluida"), j(duas));
  const sA3 = await situacao(qA.id);
  check(
    "o orçamento: faturado pela nova, e vendas lista as duas",
    vA2.ok && sA3.situacao === "faturado" && sA3.sale?.id === vA2.data.id && sA3.vendas.length === 2 && sA3.vendas.some((v: Dado) => v.id === vA.data.id && v.status === "cancelada"),
    j([sA3.situacao, sA3.sale, sA3.vendas]),
  );

  // --- repetir a chave: replay, sem mexer no orçamento
  const rep = await faturar(vend1, qA.id, 40, { operation_key: chaveA2 });
  check("a mesma operation_key da venda faturada: replayed, a mesma venda", rep.ok && rep.data.replayed === true && vA2.ok && rep.data.id === vA2.data.id, j(rep));
  const repCancelada = await faturar(vend1, qA.id, 40, { operation_key: vA.data.operation_key });
  check("a chave da venda cancelada: replay dela, sem reabrir nem trocar o orçamento", repCancelada.ok && repCancelada.data.replayed === true && repCancelada.data.id === vA.data.id, j(repCancelada));
  const sA4 = await situacao(qA.id);
  check("o orçamento segue apontando para a venda nova", vA2.ok && sA4.sale?.id === vA2.data.id, j(sA4.sale));

  // --- item a mais, fora do orçamento: regra normal
  const qG = await orcarP(); // orçado a 30
  await precoHoje(35);
  const vG = await faturar(vend1, qG.id, 70, { items: [itemP(), { emporio_product_id: P2.id, presentation_id: P2.ap, quantity: 1 }] });
  const linhaP = vG.ok ? vG.data.items.find((i: Dado) => i.presentation_id === P.ap) : null;
  const linhaP2 = vG.ok ? vG.data.items.find((i: Dado) => i.presentation_id === P2.ap) : null;
  check(
    "na mesma venda: o item do orçamento no orçado (30) e o de fora no preço da loja (10)",
    vG.ok && linhaP?.suggested_price === 30 && linhaP2?.suggested_price === 10 && linhaP2?.unit_price === 10 && vG.data.net_amount === 70,
    j(vG.ok ? vG.data.items : vG),
  );
  const vG2 = await faturar(vend1, null, 10, { items: [{ emporio_product_id: P2.id, presentation_id: P2.ap, quantity: 1 }] });
  check("venda comum (sem quote_id): quote null", vG2.ok && vG2.data.quote === null, j(vG2.ok ? vG2.data.quote : vG2));

  // --- a troca não fatura orçamento
  const qH = await orcarP();
  if (vG2.ok) {
    const tr = await Ven.trocarAction(db, owner, vG2.data.id, {
      operation_key: chave("troca"),
      items_devolvidos: [{ sale_item_id: vG2.data.items[0].id, quantity: 1 }],
      venda: { contact_id: cliente.id, quote_id: qH.id, items: [{ emporio_product_id: P2.id, presentation_id: P2.ap, quantity: 1 }], payments: [] },
    } as never);
    check("a troca com quote_id no corpo: sai, sem orçamento na venda nova", tr.ok && tr.data.venda.quote === null, j(tr.ok ? tr.data.venda.quote : tr));
    check("e o orçamento continua aberto", (await situacao(qH.id)).situacao === "aberto");
  }

  // --- o preço baixou depois do orçamento: vale o menor, e o desconto sobre ele segue o limite da loja (5%)
  await precoHoje(25);
  const qI = await orcarP(); // orçado a 25
  await precoHoje(18);
  // 16 sobre a base 18 é 11,11% de desconto (sobre o orçado 25 seria ainda mais).
  const comDesconto = { items: [itemP(2, { unit_price: 16 })] };
  await recusaSemGravar(
    "base 18 (o menor), Vendedor a 16: desconto acima do limite",
    faturar(vend1, qI.id, 32, comDesconto),
    "DISCOUNT_ABOVE_LIMIT",
    403,
    "items",
    "O desconto de 11,11% passa do limite de 5% desta loja. Peça ao gestor da loja.",
  );
  const sI = await situacao(qI.id);
  check("e o orçamento continua aberto, sem venda", sI.situacao === "aberto" && sI.sale === null && sI.vendas.length === 0, j([sI.situacao, sI.sale, sI.vendas]));
  const vI = await faturar(gestor, qI.id, 32, comDesconto);
  check(
    "o mesmo pelo Gestor: sai com base 18, desconto 4 e autorizado pelo Gestor",
    vI.ok && vI.data.items[0].suggested_price === 18 && vI.data.items[0].unit_price === 16 && vI.data.discount_amount === 4 && vI.data.discount_authorized_by_user_id === gestor.id,
    j(vI.ok ? [vI.data.items, vI.data.discount_amount, vI.data.discount_authorized_by_user_id] : vI),
  );
  const sI2 = await situacao(qI.id);
  check("e o orçamento fica faturado por essa venda", vI.ok && sI2.situacao === "faturado" && sI2.sale?.id === vI.data.id, j([sI2.situacao, sI2.sale]));

  // --- o desconto do orçamento não se soma ao do faturamento: a referência é o preço
  // sugerido quando se orçou (ou o de hoje, se menor), e o limite (5%) vale sobre o total
  const vendaDe = (r: Dado) => (r.ok ? [r.data.items.map((i: Dado) => [i.suggested_price, i.unit_price]), r.data.discount_amount, r.data.discount_authorized_by_user_id] : r);
  await precoHoje(20);
  const qJ = await orcarP(vend1, { items: [itemP(2, { unit_price: 19 })] });
  check("(i) o Vendedor orça a 19 sobre 20 (5%, no limite): salva, desconto 2, sem autorização", qJ.discount_amount === 2 && qJ.net_amount === 38, j(qJ));
  await recusaSemGravar(
    // 18,05 é 5% sobre o orçado 19: dentro do limite se o orçado fosse a referência (o desconto somado).
    "(i) o Vendedor fatura com mais 5% sobre o orçado (18,05): 9,75% sobre 20",
    faturar(vend1, qJ.id, 36.1, { items: [itemP(2, { unit_price: 18.05 })] }),
    "DISCOUNT_ABOVE_LIMIT",
    403,
    "items",
    "O desconto de 9,75% passa do limite de 5% desta loja. Peça ao gestor da loja.",
  );
  check("(i) e o orçamento continua aberto", (await situacao(qJ.id)).situacao === "aberto");
  const vJ = await faturar(vend1, qJ.id, 38, { items: [itemP(2, { unit_price: 19 })] });
  check(
    "(i) faturado no preço orçado (19): sai com referência 20 e o desconto do orçamento (2), sem autorização",
    vJ.ok && vJ.data.items[0].suggested_price === 20 && vJ.data.items[0].unit_price === 19 && vJ.data.discount_amount === 2 && vJ.data.discount_authorized_by_user_id === null,
    j(vendaDe(vJ)),
  );
  const qJ2 = await orcarP(vend1, { items: [itemP(2, { unit_price: 19 })] });
  const vJ3 = await faturar(vend1, qJ2.id, 38, { items: [itemP(2)] });
  check(
    "(i) sem unit_price, a linha do orçamento cobra o orçado (19), não a referência (20): desconto 2",
    vJ3.ok && vJ3.data.items[0].unit_price === 19 && vJ3.data.items[0].suggested_price === 20 && vJ3.data.discount_amount === 2,
    j(vendaDe(vJ3)),
  );

  // --- (ii) o orçamento autorizado pelo Gestor acima do limite: quem fatura herda a autorização no preço orçado
  const qK = await orcarP(gestor, { items: [itemP(2, { unit_price: 16 })] });
  const rowK = await db.emporioQuote.findFirst({ where: { id: qK.id } });
  check("(ii) o Gestor orça a 16 sobre 20 (20%): autorizado por ele", qK.discount_amount === 8 && rowK?.discount_authorized_by_user_id === gestor.id, j([qK.discount_amount, rowK?.discount_authorized_by_user_id]));
  await recusaSemGravar(
    "(ii) o Vendedor fatura um centavo abaixo do orçado (15,99): sem autorização herdada",
    faturar(vend1, qK.id, 31.98, { items: [itemP(2, { unit_price: 15.99 })] }),
    "DISCOUNT_ABOVE_LIMIT",
    403,
    "items",
    "O desconto de 20,05% passa do limite de 5% desta loja. Peça ao gestor da loja.",
  );
  await recusaSemGravar(
    "(ii) no orçado, mas com um item de fora abaixo do preço da loja (milho a 9,99)",
    faturar(vend1, qK.id, 41.99, { items: [itemP(2, { unit_price: 16 }), { emporio_product_id: P2.id, presentation_id: P2.ap, quantity: 1, unit_price: 9.99 }] }),
    "DISCOUNT_ABOVE_LIMIT",
    403,
    "items",
    "O desconto de 16,02% passa do limite de 5% desta loja. Peça ao gestor da loja.",
  );
  const vK = await faturar(vend1, qK.id, 32, { items: [itemP(2, { unit_price: 16 })] });
  check(
    "(ii) o Vendedor fatura no orçado (16): sai, desconto 8, autorizado pelo Gestor do orçamento",
    vK.ok && vK.data.items[0].suggested_price === 20 && vK.data.items[0].unit_price === 16 && vK.data.discount_amount === 8 && vK.data.discount_authorized_by_user_id === gestor.id,
    j(vendaDe(vK)),
  );
  const qK2 = await orcarP(gestor, { items: [itemP(2, { unit_price: 16 })] });
  const vK2 = await faturar(caixa, qK2.id, 42, { items: [itemP(2, { unit_price: 16 }), { emporio_product_id: P2.id, presentation_id: P2.ap, quantity: 1 }] });
  check(
    "(ii) o Caixa fatura no orçado, com um item de fora no preço da loja: sai, autorizado pelo Gestor",
    vK2.ok && vK2.data.discount_amount === 8 && vK2.data.discount_authorized_by_user_id === gestor.id && vK2.data.seller_user_id === gestor.id,
    j(vendaDe(vK2)),
  );

  // --- (iii) o preço de hoje subiu depois do orçamento: a referência continua a de quando se orçou
  await precoHoje(20);
  const qL = await orcarP(vend1, { items: [itemP(2, { unit_price: 19 })] });
  await precoHoje(25);
  const vL = await faturar(vend1, qL.id, 38, { items: [itemP(2, { unit_price: 19 })] });
  check(
    "(iii) orçado 19 sobre 20, hoje 25: sai no orçado, referência 20, desconto 2 (5%, no limite)",
    vL.ok && vL.data.items[0].suggested_price === 20 && vL.data.items[0].unit_price === 19 && vL.data.discount_amount === 2,
    j(vendaDe(vL)),
  );

  // --- (iv) o preço de hoje caiu abaixo do orçado: a referência é a de hoje, sem desconto
  await precoHoje(20);
  const qM = await orcarP(vend1, { items: [itemP(2, { unit_price: 19 })] });
  await precoHoje(17);
  const sM = await situacao(qM.id);
  check("(iv) a leitura do orçamento: preco_que_vale 17 e preco_de_referencia 17", sM.items[0].preco_que_vale === 17 && sM.items[0].preco_de_referencia === 17, j(sM.items[0]));
  const vM = await faturar(vend1, qM.id, 34, { items: [itemP(2, { unit_price: 17 })] });
  check(
    "(iv) orçado 19, hoje 17: sai a 17, referência 17, sem desconto",
    vM.ok && vM.data.items[0].suggested_price === 17 && vM.data.items[0].unit_price === 17 && vM.data.discount_amount === 0 && vM.data.discount_authorized_by_user_id === null,
    j(vendaDe(vM)),
  );
  await precoHoje(25);
  const qN = await orcarP(gestor, { items: [itemP(2, { unit_price: 19 })] });
  const sN = await situacao(qN.id);
  check("a leitura do orçamento traz a referência de quem fatura hoje (o Gestor orçou 19 sobre 25: referência 25)", sN.items[0].preco_que_vale === 19 && sN.items[0].preco_de_referencia === 25, j(sN.items[0]));
}

async function secao4(c: Dado) {
  console.log("\nSeção 4: o papel do orçamento e o orçamento de origem no papel da venda (com banco)");
  const { Orc, db, B, owner, ownerB, vend1, vend2, L1, stamp } = c;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const Ven = await import("@/lib/actions/emporio-vendas");
  const Cfg = await import("@/lib/actions/emporio-configuracoes");
  const Imp = await import("@/lib/actions/emporio-impressao");

  const cat = await db.productCategory.create({ data: { name: "M94 categoria papel" } as never });
  const p = await Cat.criarProdutoEmporioAction(db, owner, { name: `M94 Papel ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!p.ok) throw new Error(j(p));
  const a = await Cat.criarApresentacaoAction(db, owner, p.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!a.ok) throw new Error(j(a));
  const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L1, presentation_id: a.data.id, price: 20 });
  if (!pr.ok) throw new Error(j(pr));
  const e = await Est.implantarEstoqueAction(db, owner, { establishment_id: L1, emporio_product_id: p.data.id, sealed: [], loose_qty: 100, unit_cost: 5 });
  if (!e.ok) throw new Error(j(e));
  const cliente = await db.contact.create({
    data: { name: `M94 Cliente Papel ${stamp}`, person_kind: "pf", document: "12345678909", phone: "11977776666" } as never,
  });
  const rodape = "Orçamento sujeito à disponibilidade";
  const cfg = await Cfg.salvarConfiguracoesAction(db, owner, { quote_footer: rodape, sale_footer: "Volte sempre", receipt_width: 58 });
  if (!cfg.ok) throw new Error(j(cfg));

  let k = 0;
  const chave = (s: string) => `m94-${stamp}-p-${s}-${(k += 1)}`;
  const orc = await Orc.salvarOrcamentoAction(db, vend1, {
    operation_key: chave("orc"),
    establishment_id: L1,
    contact_id: cliente.id,
    items: [{ emporio_product_id: p.data.id, presentation_id: a.data.id, quantity: 2, unit_price: 19 }],
  });
  if (!orc.ok) throw new Error(j(orc));
  const q = orc.data;

  // --- o impresso do orçamento
  const ym = q.valid_until.split("-");
  const validadeBr = `${ym[2]}/${ym[1]}/${ym[0]}`;
  const iq = await Imp.lerImpressoDoOrcamentoAction(db, vend1, q.id);
  check("o impresso do orçamento lê", iq.ok, j(iq));
  if (iq.ok) {
    const d = iq.data;
    check("tipo orcamento, número do orçamento, validade dd/mm/aaaa", d.tipo === "orcamento" && d.numero === q.numero && d.validade === validadeBr, j([d.tipo, d.numero, d.validade]));
    check("sem pagamentos, sem troco, sem caixa, sem orçamento de origem", d.pagamentos.length === 0 && d.troco === null && d.caixa === null && d.orcamento_origem === null, j([d.pagamentos, d.troco, d.caixa, d.orcamento_origem]));
    check("rodapé = quote_footer, vendedor do orçamento, largura da bobina", d.rodape === rodape && d.vendedor === "M94 vend1" && d.largura_bobina === 58, j([d.rodape, d.vendedor, d.largura_bobina]));
    check("subtotal no preço sugerido (40), desconto 2, total 38", d.subtotal === 40 && d.desconto === 2 && d.total === 38, j([d.subtotal, d.desconto, d.total]));
    check("o item sai no preço sugerido (20) e linha 40", d.itens.length === 1 && d.itens[0].preco === 20 && d.itens[0].total === 40, j(d.itens));
    check("cliente do orçamento", d.cliente?.nome === cliente.name, j(d.cliente));
    check("emitida_em é a criação do orçamento", d.emitida_em === q.created_at, d.emitida_em);
  }
  const iqCaixa = await Imp.lerImpressoDoOrcamentoAction(db, c.caixa, q.id);
  check("o Caixa da loja lê o impresso", iqCaixa.ok, j(iqCaixa));
  const iqOutra = await Imp.lerImpressoDoOrcamentoAction(db, vend2, q.id);
  check("o Vendedor de outra loja: 404", !iqOutra.ok && iqOutra.status === 404, j(iqOutra));
  const iqB = await Imp.lerImpressoDoOrcamentoAction(B.db, ownerB, q.id);
  check("outro tenant: 404", !iqB.ok && iqB.status === 404, j(iqB));

  // --- o papel da venda: de qual orçamento veio
  const v = await Ven.venderAction(db, vend1, {
    operation_key: chave("venda"),
    establishment_id: L1,
    contact_id: cliente.id,
    quote_id: q.id,
    items: [{ emporio_product_id: p.data.id, presentation_id: a.data.id, quantity: 2, unit_price: 19 }],
    payments: [{ kind: "dinheiro", amount: 38 }],
  } as never);
  if (!v.ok) throw new Error(j(v));
  const iv = await Imp.lerImpressoDaVendaAction(db, vend1, v.data.id);
  check("a venda faturada: tipo venda, orcamento_origem = número do orçamento, sem validade", iv.ok && iv.data.tipo === "venda" && iv.data.orcamento_origem === q.numero && iv.data.validade === null, j(iv.ok ? [iv.data.tipo, iv.data.orcamento_origem, iv.data.validade] : iv));
  check("o rodapé da venda segue o da venda", iv.ok && iv.data.rodape === "Volte sempre", j(iv.ok ? iv.data.rodape : iv));

  // --- reimprimir o orçamento faturado: FATURADO (venda nº X), no A4 e na bobina
  const { formatarNumero } = await import("@/lib/emporio/numeracao");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { PapelA4 } = await import("@/components/emporio/impresso/papel-a4");
  const { PapelCupom } = await import("@/components/emporio/impresso/papel-cupom");
  const numeroDaVenda = formatarNumero(v.data.number);
  const faturadoNoPapel = `FATURADO (venda nº ${numeroDaVenda})`;
  check("antes de faturar, o impresso do orçamento não diz faturado", iq.ok && iq.data.faturado_na_venda === null, j(iq.ok ? iq.data.faturado_na_venda : iq));
  const iqF = await Imp.lerImpressoDoOrcamentoAction(db, vend1, q.id);
  check("faturado: o impresso traz o número da venda", iqF.ok && iqF.data.faturado_na_venda === numeroDaVenda, j(iqF.ok ? iqF.data.faturado_na_venda : iqF));
  const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  if (iqF.ok) {
    const a4 = texto(renderToStaticMarkup(createElement(PapelA4, { d: iqF.data })));
    const bobina = texto(renderToStaticMarkup(createElement(PapelCupom, { d: iqF.data })));
    check(`o A4 do orçamento faturado diz "${faturadoNoPapel}"`, a4.includes(faturadoNoPapel), a4.slice(0, 400));
    check(`a bobina do orçamento faturado diz "${faturadoNoPapel}"`, bobina.includes(faturadoNoPapel), bobina.slice(0, 400));
  }
  if (iv.ok) {
    const a4Venda = texto(renderToStaticMarkup(createElement(PapelA4, { d: iv.data })));
    check("o papel da venda não diz FATURADO", iv.data.faturado_na_venda === null && !a4Venda.includes("FATURADO"), a4Venda.slice(0, 300));
  }
  const v2 = await Ven.venderAction(db, vend1, {
    operation_key: chave("venda2"),
    establishment_id: L1,
    contact_id: cliente.id,
    items: [{ emporio_product_id: p.data.id, presentation_id: a.data.id, quantity: 1 }],
    payments: [{ kind: "dinheiro", amount: 20 }],
  } as never);
  if (!v2.ok) throw new Error(j(v2));
  const iv2 = await Imp.lerImpressoDaVendaAction(db, vend1, v2.data.id);
  check("a venda sem orçamento: orcamento_origem null", iv2.ok && iv2.data.orcamento_origem === null && iv2.data.tipo === "venda", j(iv2.ok ? [iv2.data.tipo, iv2.data.orcamento_origem] : iv2));
}

/**
 * O relógio interno do orçamento (`opts.agora`): o cenário de demonstração
 * grava um orçamento antigo, já vencido. Só código interno o passa; a rota
 * ignora data no corpo.
 */
async function secao5(c: Dado) {
  console.log("\nSeção 5: o relógio interno do orçamento, e a rota que não aceita data (com banco)");
  const { db, Orc, vend1, L1, item, chamar, signAccessToken, somarDias, stamp, hoje } = c;
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const contato = await db.contact.findFirst({ where: { name: "M94 Cliente Completo" } });
  const validade = (await db.emporioSettings.findFirst({ select: { quote_validity_days: true } }))?.quote_validity_days ?? 7;
  const dia = (d: Date) => d.toISOString().slice(0, 10);

  const antigo = new Date(Date.now() - 20 * 86_400_000);
  const o = await Orc.salvarOrcamentoAction(
    db,
    vend1,
    { operation_key: `m94-s5-${stamp}-antigo`, establishment_id: L1, contact_id: contato.id, items: [item()] },
    { agora: antigo },
  );
  check("salvar com o relógio interno: ok", o.ok, j(o));
  const linha = await db.emporioQuote.findFirst({ where: { id: o.data?.id ?? "x" } });
  check("o orçamento grava created_at na hora dada", !!linha && linha.created_at.getTime() === antigo.getTime(), j(linha?.created_at));
  const esperado = dia(somarDias(hojeEmBrasilia(antigo), validade));
  check(`a validade conta do dia dado (${validade} dias)`, !!linha && dia(linha.valid_until) === esperado, `${j(linha?.valid_until)} esperado ${esperado}`);
  const lido = await Orc.lerOrcamentoAction(db, vend1, o.data?.id ?? "x");
  check("e o orçamento antigo aparece vencido", lido.ok && lido.data.situacao === "vencido", j(lido.ok ? lido.data.situacao : lido));

  const antes = Date.now();
  const velha = "2020-01-01T12:00:00.000Z";
  const r = await chamar(signAccessToken(vend1.id), "quotes", "POST", "quotes", {
    operation_key: `m94-s5-${stamp}-rota`,
    establishment_id: L1,
    contact_id: contato.id,
    items: [item()],
    agora: velha,
    created_at: velha,
    valid_until: "2020-01-02",
  });
  const lr = await db.emporioQuote.findFirst({ where: { id: r.json?.data?.id ?? "x" } });
  check(
    "POST quotes com datas no corpo: 201, created_at é a hora real e a validade conta de hoje",
    r.status === 201 && !!lr && lr.created_at.getTime() >= antes - 1000 && dia(lr.valid_until) === dia(somarDias(hoje, validade)),
    `${r.status} ${j([lr?.created_at, lr?.valid_until])}`,
  );
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
    const ctx = await secao1();
    await secao2(ctx);
    await secao3(ctx);
    await secao4(ctx);
    await secao5(ctx);
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
