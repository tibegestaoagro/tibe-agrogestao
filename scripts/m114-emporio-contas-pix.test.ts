import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M114: Módulo 39 (Meu Empório), contas PIX escolhidas no lançamento (Q310 a Q317).
 * Roda: `npm run test:m114`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-13-emporio-contas-pix-design.md e do contrato
 * do briefing, sem ler a implementação nova. Contas pelas actions; venda, fiado, relatório e a leitura
 * nova pelas ROTAS (Request construído).
 *
 * Seção 1: cadastro com os campos novos e a view; conta antiga segue "todas as lojas".
 * Seção 2: CNPJ com máscara e CNPJ inválido.
 * Seção 3: disponibilidade (lista vazia recusada; restrita à loja A some da B).
 * Seção 4: conta PIX padrão (definir indisponível; restringir a padrão de loja fora, citando a loja).
 * Seção 5: leitura das contas PIX da loja (caixa, vendedor, sem acesso), sem saldo.
 * Seção 6: venda (conta de outra loja, arquivada, sem conta cai na padrão, "todas as lojas" nas duas).
 * Seção 7: relatório pix_by_account no total e por loja.
 * Seção 8: editar venda cuja conta deixou de valer passa; venda nova com ela não.
 * Seção 9: fiado com conta indisponível.
 * Seção 10: isolamento entre tenants.
 *
 * Suposições (ver o relato): a view da venda traz `payments[].bank_account_name`; "sem acesso" a uma loja
 * é recusa 4xx (não 200); a lista da leitura nova para a conta "todas as lojas" não é conferida em
 * `pix_available_establishment_ids` (o contrato não diz se vem vazia ou cheia).
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
const perto = (a: unknown, b: number, tol = 0.005) => typeof a === "number" && Math.abs(a - b) < tol;

console.log("🏦 M114: Módulo 39 (Meu Empório), contas PIX escolhidas no lançamento (Q310 a Q317)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];

type Ator = { id: string; role: "OWNER" | "OPERADOR" | "VISUALIZADOR" };
type Mundo = {
  tenantId: string;
  db: Dado;
  owner: Ator;
  tok: { owner: string; caixa: string; vendedor: string; caixaL2: string; semFuncao: string };
  L1: string;
  L2: string;
  nomeL1: string;
  reg1: string;
  reg2: string;
  prodId: string;
  presId: string;
};

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M114 ${rotulo} ${stamp}`, document: `M114${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR" | "VISUALIZADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M114 ${suf}`, email: `m114-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id as string, role, email: u.email as string };
  };
  const owner = await mk("own", "OWNER");
  const caixa = await mk("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const vendedor = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: [] });
  const caixaL2 = await mk("caixal2", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const semFuncao = await mk("semf", "VISUALIZADOR");

  const db = prismaForTenant(t.id) as Dado;
  const nomeL1 = `M114 ${rotulo} Loja 1`;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: nomeL1 });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M114 ${rotulo} Loja 2` });
  if (!l1.ok || !l2.ok) throw new Error(`loja: ${j(l1)} ${j(l2)}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma as Dado, t.id, [caixa.id, vendedor.id], [L1]);
  await vincularTodas(prisma as Dado, t.id, [caixaL2.id], [L2]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M114 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M114 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const loja of [L1, L2]) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: loja, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: loja, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  }
  await abrirTurnoDeTeste(db, owner, L1);
  await abrirTurnoDeTeste(db, owner, L2);
  const reg1 = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;
  const reg2 = (await db.cashRegister.findFirst({ where: { establishment_id: L2, number: 1 } }))?.id as string;

  const token = async (u: { email: string }) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  const tok = { owner: await token(owner), caixa: await token(caixa), vendedor: await token(vendedor), caixaL2: await token(caixaL2), semFuncao: await token(semFuncao) };
  return { tenantId: t.id, db, owner, tok, L1, L2, nomeL1, reg1, reg2, prodId: prod.data.id as string, presId: pres.data.id as string };
}

const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  replace: () => import("@/app/api/v1/emporio/sales/[id]/replace/route"),
  pixContas: () => import("@/app/api/v1/emporio/establishments/[id]/pix-accounts/route"),
  contas: () => import("@/app/api/v1/emporio/bank-accounts/route"),
  receive: () => import("@/app/api/v1/emporio/receivables/receive/route"),
  relatorio: () => import("@/app/api/v1/emporio/reports/sales/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST" | "PATCH", url: string, corpo?: unknown, id?: string): Promise<Resp> {
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
const erro = (r: Resp, status: number, field?: string, code?: string) =>
  r.status === status && (field === undefined || r.corpo?.error?.field === field) && (code === undefined || r.corpo?.error?.code === code);
const recusada = (r: Resp) => r.status >= 400 && r.status < 500;
const erroA = (r: Dado, status: number, field: string, code = "VALIDATION_ERROR") =>
  r?.ok === false && r.status === status && r.field === field && r.code === code;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m114-${p}-${stamp}-${(seq += 1)}`;
const idDe = (r: Resp) => String(r.corpo?.data?.id ?? "");

async function cliente(w: Mundo, nome: string) {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: nome } as Dado })) as Dado;
}
const itens = (w: Mundo, quantity: number) => [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity }];
const pix = (amount: number, bank_account_id?: string) => ({ kind: "pix", amount, ...(bank_account_id ? { bank_account_id } : {}) });

type Loja = "L1" | "L2";
const vender = (w: Mundo, loja: Loja, cli: Dado, quantity: number, payments: Dado[], tok?: string) =>
  chamar(tok ?? w.tok.owner, R.sales, "POST", "emporio/sales", {
    operation_key: chave("venda"),
    establishment_id: w[loja],
    cash_register_id: loja === "L1" ? w.reg1 : w.reg2,
    customer_id: cli.id,
    items: itens(w, quantity),
    payments,
  });
const lerPix = (tok: string, lojaId: string) => chamar(tok, R.pixContas, "GET", `emporio/establishments/${lojaId}/pix-accounts`, undefined, lojaId);
const pagamentosDe = (r: Resp): Dado[] => (Array.isArray(r.corpo?.data?.payments) ? r.corpo.data.payments : []);

async function main() {
  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    const A = await montar("A");
    const B = await montar("B");
    const Caixa = (await import("@/lib/actions/emporio-caixa")) as Dado;
    const criar = (w: Mundo, input: Dado) => Caixa.criarContaAction(w.db, w.owner, input);
    const editar = (w: Mundo, id: string, input: Dado) => Caixa.editarContaAction(w.db, w.owner, id, input);
    const definir = (w: Mundo, lojaId: string, bank_account_id: string | null) => Caixa.definirContaPixAction(w.db, w.owner, lojaId, { bank_account_id });
    const vendasDe = (w: Mundo) => P.emporioSale.count({ where: { tenant_id: w.tenantId } }) as Promise<number>;
    const CA = await cliente(A, "M114 Cliente A");
    const CB = await cliente(B, "M114 Cliente B");

    let cAntiga = "";
    let cTodas = "";
    let cL1 = "";
    let cL2 = "";
    let cArq = "";
    const nomeCL1 = `M114 PIX Loja 1 ${stamp}`;

    // -------------------------------------------------------------------- 1
    await rodar("cadastro", async () => {
      console.log("1. Cadastro com os campos novos e a view (Q310, Q311)");
      const antiga = await criar(A, { name: `M114 Conta Antiga ${stamp}`, bank: "Sicredi" });
      check("conta só com name e bank: ok", antiga.ok === true, j(antiga));
      cAntiga = antiga.data?.id ?? "";
      check("a conta antiga é 'todas as lojas' (pix_all_establishments true)", antiga.data?.pix_all_establishments === true, j(antiga.data));
      check("a view traz document e beneficiary vazios", (antiga.data?.document ?? null) === null && (antiga.data?.beneficiary ?? null) === null, j(antiga.data));
      check("a view traz pix_available_establishment_ids como lista", Array.isArray(antiga.data?.pix_available_establishment_ids), j(antiga.data));

      const site = await criar(A, { name: `M114 PIX Site ${stamp}`, bank: "Sicoob", document: "11.444.777/0001-61", beneficiary: "Agromax Comércio LTDA", pix_all_establishments: true });
      check("conta do site com CNPJ e favorecido: ok", site.ok === true, j(site));
      cTodas = site.data?.id ?? "";
      check("devolve beneficiary e pix_all_establishments true", site.data?.beneficiary === "Agromax Comércio LTDA" && site.data?.pix_all_establishments === true, j(site.data));

      const l1 = await criar(A, { name: nomeCL1, bank: "Sicoob", document: "11222333000181", beneficiary: "Agromax Loja 1", pix_all_establishments: false, establishment_ids: [A.L1] });
      check("conta restrita à loja 1: ok", l1.ok === true, j(l1));
      cL1 = l1.data?.id ?? "";
      check("a view devolve pix_all_establishments false e a loja 1 em pix_available_establishment_ids", l1.data?.pix_all_establishments === false && j(l1.data?.pix_available_establishment_ids) === j([A.L1]), j(l1.data));

      const l2 = await criar(A, { name: `M114 PIX Loja 2 ${stamp}`, bank: "Sicoob", pix_all_establishments: false, establishment_ids: [A.L2] });
      check("conta restrita à loja 2: ok", l2.ok === true, j(l2));
      cL2 = l2.data?.id ?? "";

      const arq = await criar(A, { name: `M114 PIX Arquivada ${stamp}`, bank: "Sicoob" });
      cArq = arq.data?.id ?? "";
      const arquivou = await editar(A, cArq, { archived: true });
      check("arquivar uma conta (editar com archived): ok", arquivou.ok === true && !!arquivou.data?.archived_at, j(arquivou));

      const lista = await Caixa.listarContasAction(A.db, A.owner);
      const vista = (lista.data ?? []).find((c: Dado) => c.id === cL1);
      check("listarContasAction traz os campos novos da conta restrita", lista.ok === true && vista?.beneficiary === "Agromax Loja 1" && vista?.pix_all_establishments === false, j(vista));

      const ed = await editar(A, cTodas, { name: `M114 PIX Site ${stamp}`, beneficiary: "Agromax Editado" });
      check("editar o favorecido: ok e gravado", ed.ok === true && ed.data?.beneficiary === "Agromax Editado", j(ed));
    });

    // -------------------------------------------------------------------- 2
    await rodar("cnpj", async () => {
      console.log("\n2. CNPJ com máscara e CNPJ inválido (Q310)");
      const ok = await criar(A, { name: `M114 Mascara ${stamp}`, document: "11.222.333/0001-81" });
      check("CNPJ com máscara: ok e grava só dígitos", ok.ok === true && ok.data?.document === "11222333000181", j(ok));
      const ruim = await criar(A, { name: `M114 CNPJ Ruim ${stamp}`, document: "11.222.333/0001-82" });
      check("dígito verificador errado: VALIDATION_ERROR no campo document", erroA(ruim, 422, "document"), j(ruim));
      const curto = await criar(A, { name: `M114 CNPJ Curto ${stamp}`, document: "123" });
      check("CNPJ curto: VALIDATION_ERROR no campo document", erroA(curto, 422, "document"), j(curto));
      const nenhuma = await P.bankAccount.count({ where: { tenant_id: A.tenantId, name: { in: [`M114 CNPJ Ruim ${stamp}`, `M114 CNPJ Curto ${stamp}`] } } });
      check("as recusas não cadastraram conta", nenhuma === 0, `${nenhuma}`);
      const edRuim = await editar(A, cTodas, { document: "11.444.777/0001-62" });
      check("editar com CNPJ inválido: recusa no campo document", erroA(edRuim, 422, "document"), j(edRuim));
      const depois = await Caixa.listarContasAction(A.db, A.owner);
      const v = (depois.data ?? []).find((c: Dado) => c.id === cTodas);
      check("e o CNPJ da conta segue o anterior", v?.document === "11444777000161", j(v));
      const edOk = await editar(A, cTodas, { document: "11.444.777/0001-61" });
      check("editar com CNPJ com máscara válido: grava só dígitos", edOk.ok === true && edOk.data?.document === "11444777000161", j(edOk));
    });

    // -------------------------------------------------------------------- 3
    await rodar("disponibilidade", async () => {
      console.log("\n3. Disponibilidade da conta para o PIX (Q311)");
      const vazia = await criar(A, { name: `M114 Sem Lojas ${stamp}`, pix_all_establishments: false, establishment_ids: [] });
      check("restrita sem lojas (lista vazia): VALIDATION_ERROR no campo establishment_ids", erroA(vazia, 422, "establishment_ids"), j(vazia));
      const semLista = await criar(A, { name: `M114 Sem Lista ${stamp}`, pix_all_establishments: false });
      check("restrita sem mandar a lista: VALIDATION_ERROR no campo establishment_ids", erroA(semLista, 422, "establishment_ids"), j(semLista));
      const edVazia = await editar(A, cL2, { pix_all_establishments: false, establishment_ids: [] });
      check("editar para restrita sem lojas: recusa no campo establishment_ids", erroA(edVazia, 422, "establishment_ids"), j(edVazia));
      check("as recusas não criaram conta", (await P.bankAccount.count({ where: { tenant_id: A.tenantId, name: { in: [`M114 Sem Lojas ${stamp}`, `M114 Sem Lista ${stamp}`] } } })) === 0);

      const disp = (c: string, l: string): Promise<boolean> => Caixa.contaPixDisponivelParaLoja(A.db, c, l);
      check("contaPixDisponivelParaLoja: a restrita à loja 1 vale na 1", (await disp(cL1, A.L1)) === true);
      check("contaPixDisponivelParaLoja: a restrita à loja 1 não vale na 2", (await disp(cL1, A.L2)) === false);
      check("contaPixDisponivelParaLoja: 'todas as lojas' vale nas duas", (await disp(cTodas, A.L1)) === true && (await disp(cTodas, A.L2)) === true);
      check("contaPixDisponivelParaLoja: a conta antiga vale nas duas", (await disp(cAntiga, A.L1)) === true && (await disp(cAntiga, A.L2)) === true);

      const naA = await lerPix(A.tok.owner, A.L1);
      const naB = await lerPix(A.tok.owner, A.L2);
      const idsA = (naA.corpo?.data ?? []).map((c: Dado) => c.id);
      const idsB = (naB.corpo?.data ?? []).map((c: Dado) => c.id);
      check("leitura da loja 1: 200 e traz a conta restrita à 1", naA.status === 200 && idsA.includes(cL1), `${naA.status} ${j(naA.corpo)}`);
      check("leitura da loja 2: 200 e NÃO traz a conta restrita à 1", naB.status === 200 && !idsB.includes(cL1), `${naB.status} ${j(naB.corpo)}`);
      check("a conta restrita à 2 aparece só na 2", idsB.includes(cL2) && !idsA.includes(cL2), `A=${j(idsA)} B=${j(idsB)}`);
      check("'todas as lojas' e a antiga aparecem nas duas", [cTodas, cAntiga].every((c) => idsA.includes(c) && idsB.includes(c)));
      check("a conta arquivada não aparece em nenhuma", !idsA.includes(cArq) && !idsB.includes(cArq));

      const alargar = await editar(A, cL1, { pix_all_establishments: false, establishment_ids: [A.L1, A.L2] });
      check("ampliar a lista para as duas lojas: ok", alargar.ok === true && alargar.data?.pix_available_establishment_ids?.length === 2, j(alargar));
      check("agora a conta vale na loja 2", (await disp(cL1, A.L2)) === true);
      const volta = await editar(A, cL1, { pix_all_establishments: false, establishment_ids: [A.L1] });
      check("voltar para só a loja 1: ok", volta.ok === true && (await disp(cL1, A.L2)) === false, j(volta));
    });

    // -------------------------------------------------------------------- 4
    await rodar("conta padrão", async () => {
      console.log("\n4. Conta PIX padrão da loja (Q313)");
      const foraDaLista = await definir(A, A.L1, cL2);
      check("definir como padrão da loja 1 uma conta só da loja 2: 422 no campo bank_account_id", erroA(foraDaLista, 422, "bank_account_id"), j(foraDaLista));
      const ok1 = await definir(A, A.L1, cL1);
      check("definir a conta da própria loja como padrão: ok", ok1.ok === true, j(ok1));
      const ok2 = await definir(A, A.L2, cL2);
      check("definir a conta da loja 2 como padrão da 2: ok", ok2.ok === true, j(ok2));
      const todas = await definir(A, A.L1, cTodas);
      check("definir uma conta 'todas as lojas' como padrão: ok", todas.ok === true, j(todas));
      await definir(A, A.L1, cL1);

      const tirar = await editar(A, cL1, { pix_all_establishments: false, establishment_ids: [A.L2] });
      check("restringir a conta que é a padrão da loja 1 a só a loja 2: 422 no campo establishment_ids", erroA(tirar, 422, "establishment_ids"), j(tirar));
      check("a mensagem cita o nome da loja", typeof tirar.message === "string" && tirar.message.includes(A.nomeL1), j(tirar));
      const ainda = await Caixa.contaPixDisponivelParaLoja(A.db, cL1, A.L1);
      check("a recusa não mudou a disponibilidade (segue valendo na 1)", ainda === true);
      const loja1 = await P.establishment.findUnique({ where: { id: A.L1 } });
      check("e a loja 1 segue com a conta padrão", loja1?.pix_bank_account_id === cL1, `${loja1?.pix_bank_account_id}`);
      const tirarTodas = await editar(A, cL1, { pix_all_establishments: false, establishment_ids: [A.L1, A.L2] });
      check("ampliar a lista de quem é padrão: ok", tirarTodas.ok === true, j(tirarTodas));
      await editar(A, cL1, { pix_all_establishments: false, establishment_ids: [A.L1] });
    });

    // -------------------------------------------------------------------- 5
    await rodar("leitura da loja", async () => {
      console.log("\n5. Leitura das contas PIX da loja, sem saldo (caixa, vendedor)");
      const cx = await lerPix(A.tok.caixa, A.L1);
      check("o Caixa da loja 1 lê a lista: 200", cx.status === 200 && Array.isArray(cx.corpo?.data), `${cx.status} ${j(cx.corpo)}`);
      const linhas: Dado[] = cx.corpo?.data ?? [];
      check("a lista não tem campo balance em linha nenhuma", linhas.length > 0 && linhas.every((c) => !("balance" in c)), j(linhas));
      check("cada linha traz id, name, bank, beneficiary, document e is_store_default", linhas.every((c) => ["id", "name", "bank", "beneficiary", "document", "is_store_default"].every((k) => k in c)), j(linhas[0]));
      check("a padrão da loja vem primeiro e só ela é marcada", linhas[0]?.id === cL1 && linhas[0]?.is_store_default === true && linhas.filter((c) => c.is_store_default).length === 1, j(linhas.map((c) => [c.id === cL1, c.is_store_default])));
      check("a restrita à loja 2 e a arquivada ficam de fora", !linhas.some((c) => c.id === cL2 || c.id === cArq), j(linhas.map((c) => c.id)));
      check("o CNPJ vem só com dígitos e o favorecido da padrão", linhas[0]?.document === "11222333000181" && linhas[0]?.beneficiary === "Agromax Loja 1", j(linhas[0]));
      check("o texto da resposta não carrega saldo", !j(cx.corpo).toLowerCase().includes("balance"));

      const vd = await lerPix(A.tok.vendedor, A.L1);
      check("o Vendedor da loja 1 também lê: 200 e igual ao do Caixa", vd.status === 200 && j(vd.corpo?.data?.map((c: Dado) => c.id)) === j(linhas.map((c) => c.id)), `${vd.status} ${j(vd.corpo)}`);
      const dono = await lerPix(A.tok.owner, A.L1);
      check("o Dono lê: 200", dono.status === 200, `${dono.status} ${j(dono.corpo)}`);

      const fora = await lerPix(A.tok.caixaL2, A.L1);
      check("Caixa só da loja 2 lendo a loja 1: recusa 4xx sem dados", recusada(fora) && !Array.isArray(fora.corpo?.data), `${fora.status} ${j(fora.corpo)}`);
      const semF = await lerPix(A.tok.semFuncao, A.L1);
      check("usuário sem função no Empório: recusa 4xx sem dados", recusada(semF) && !Array.isArray(semF.corpo?.data), `${semF.status} ${j(semF.corpo)}`);
      const caixa2 = await lerPix(A.tok.caixaL2, A.L2);
      check("o Caixa da loja 2 lê a própria loja e vê a conta da 2 primeiro", caixa2.status === 200 && caixa2.corpo?.data?.[0]?.id === cL2, `${caixa2.status} ${j(caixa2.corpo)}`);

      const contas = await chamar(A.tok.caixa, R.contas, "GET", "emporio/bank-accounts");
      check("o saldo continua restrito: o Caixa não lista as contas (recusa 4xx)", recusada(contas), `${contas.status}`);

      const act = await Caixa.listarContasPixDaLojaAction(A.db, A.owner, A.L1);
      check("a action devolve as mesmas contas, sem balance", act.ok === true && act.data.length === linhas.length && act.data.every((c: Dado) => !("balance" in c)), j(act));
    });

    // -------------------------------------------------------------------- 6
    await rodar("venda", async () => {
      console.log("\n6. Venda com a conta do PIX (Q315)");
      const antes = await vendasDe(A);
      const outra = await vender(A, "L1", CA, 5, [pix(50, cL2)]);
      check("PIX numa conta só da loja 2, vendendo na loja 1: 422 no campo payments", erro(outra, 422, "payments", "VALIDATION_ERROR"), `${outra.status} ${j(outra.corpo)}`);
      const arqRec = await vender(A, "L1", CA, 5, [pix(50, cArq)]);
      check("PIX numa conta arquivada: 422 no campo payments", erro(arqRec, 422, "payments", "VALIDATION_ERROR"), `${arqRec.status} ${j(arqRec.corpo)}`);
      const inex = await vender(A, "L1", CA, 5, [pix(50, "id-que-nao-existe")]);
      check("PIX numa conta inexistente: 422 no campo payments", erro(inex, 422, "payments", "VALIDATION_ERROR"), `${inex.status} ${j(inex.corpo)}`);
      const invertida = await vender(A, "L2", CA, 5, [pix(50, cL1)]);
      check("o inverso: conta só da loja 1 vendendo na loja 2: 422 no campo payments", erro(invertida, 422, "payments", "VALIDATION_ERROR"), `${invertida.status} ${j(invertida.corpo)}`);
      check("nenhuma recusa criou venda", (await vendasDe(A)) === antes, `${antes} -> ${await vendasDe(A)}`);

      const padrao = await vender(A, "L1", CA, 5, [pix(50)]);
      check("PIX sem bank_account_id: 201", padrao.status === 201, `${padrao.status} ${j(padrao.corpo)}`);
      const pg = pagamentosDe(padrao).find((p) => p.kind === "pix");
      check("cai na conta padrão da loja (bank_account_name)", pg?.bank_account_name === nomeCL1, j(pagamentosDe(padrao)));
      const padrao2 = await vender(A, "L2", CA, 3, [pix(30)]);
      check("na loja 2, sem conta, cai na padrão da 2", padrao2.status === 201 && pagamentosDe(padrao2).find((p) => p.kind === "pix")?.bank_account_name === `M114 PIX Loja 2 ${stamp}`, `${padrao2.status} ${j(padrao2.corpo)}`);

      const t1 = await vender(A, "L1", CA, 2, [pix(20, cTodas)]);
      check("conta 'todas as lojas' na loja 1: 201 e identificada", t1.status === 201 && pagamentosDe(t1).find((p) => p.kind === "pix")?.bank_account_name === `M114 PIX Site ${stamp}`, `${t1.status} ${j(t1.corpo)}`);
      const t2 = await vender(A, "L2", CA, 1, [pix(10, cTodas)]);
      check("conta 'todas as lojas' na loja 2: 201", t2.status === 201, `${t2.status} ${j(t2.corpo)}`);
      const misto = await vender(A, "L1", CA, 5, [pix(15, cTodas), { kind: "dinheiro", amount: 35 }]);
      check("PIX numa conta mais dinheiro na mesma venda: 201", misto.status === 201, `${misto.status} ${j(misto.corpo)}`);
      const dinh = await vender(A, "L1", CA, 1, [{ kind: "dinheiro", amount: 10 }]);
      check("venda só em dinheiro segue passando: 201", dinh.status === 201, `${dinh.status} ${j(dinh.corpo)}`);

    });

    // -------------------------------------------------------------------- 7
    await rodar("relatório", async () => {
      console.log("\n7. Relatório: PIX por conta, no total e por loja (Q317)");
      const hoje = Date.now();
      const de = new Date(hoje - DIA).toISOString().slice(0, 10);
      const ate = new Date(hoje + DIA).toISOString().slice(0, 10);
      const r = await chamar(A.tok.owner, R.relatorio, "GET", `emporio/reports/sales?from=${de}&to=${ate}`);
      check("o relatório responde 200", r.status === 200, `${r.status} ${j(r.corpo)}`);
      const d = r.corpo?.data ?? {};
      const porConta = (lista: Dado[] | undefined) => new Map<string, Dado>((lista ?? []).map((x) => [x.bank_account_id, x]));
      check("pix_by_account existe no topo, com bank_account_id, name, count e amount", Array.isArray(d.pix_by_account) && d.pix_by_account.every((x: Dado) => ["bank_account_id", "name", "count", "amount"].every((k) => k in x)), j(d.pix_by_account));

      const total = porConta(d.pix_by_account);
      const esperaL1 = 50;
      const esperaCountL1 = 1;
      check("total: conta da loja 1 com a(s) venda(s) dela", total.get(cL1)?.count === esperaCountL1 && perto(total.get(cL1)?.amount, esperaL1), j(total.get(cL1)));
      check("total: a conta 'todas as lojas' soma 20 + 10 + 15 = 45 em 3 pagamentos", total.get(cTodas)?.count === 3 && perto(total.get(cTodas)?.amount, 45), j(total.get(cTodas)));
      check("total: a conta da loja 2 soma 30 em 1 pagamento", total.get(cL2)?.count === 1 && perto(total.get(cL2)?.amount, 30), j(total.get(cL2)));
      check("o nome da conta vem no item", total.get(cTodas)?.name === `M114 PIX Site ${stamp}`, j(total.get(cTodas)));
      check("a venda só em dinheiro não gera linha de PIX nem some conta sem PIX", !total.has(cArq) && !total.has(cAntiga));

      const porLoja: Dado[] = d.por_loja ?? [];
      const l1 = porLoja.find((l) => l.establishment_id === A.L1);
      const l2 = porLoja.find((l) => l.establishment_id === A.L2);
      check("cada item de por_loja traz pix_by_account", Array.isArray(l1?.pix_by_account) && Array.isArray(l2?.pix_by_account), j(porLoja.map((l) => Object.keys(l))));
      const m1 = porConta(l1?.pix_by_account);
      const m2 = porConta(l2?.pix_by_account);
      check("loja 1: a conta da loja 1 e a 'todas' (20 + 15 = 35, 2 pagamentos)", m1.get(cL1)?.count === esperaCountL1 && perto(m1.get(cL1)?.amount, esperaL1) && m1.get(cTodas)?.count === 2 && perto(m1.get(cTodas)?.amount, 35), j(l1?.pix_by_account));
      check("loja 1: não aparece a conta da loja 2", !m1.has(cL2));
      check("loja 2: a conta da loja 2 (30) e a 'todas' (10, 1 pagamento)", m2.get(cL2)?.count === 1 && perto(m2.get(cL2)?.amount, 30) && m2.get(cTodas)?.count === 1 && perto(m2.get(cTodas)?.amount, 10), j(l2?.pix_by_account));
      check("loja 2: não aparece a conta da loja 1", !m2.has(cL1));
      const somaLojas = [...m1.values(), ...m2.values()].reduce((s, x) => s + Number(x.amount), 0);
      const somaTotal = [...total.values()].reduce((s, x) => s + Number(x.amount), 0);
      check("a soma por loja bate com a soma do total", perto(somaLojas, somaTotal) && perto(somaTotal, esperaL1 + 45 + 30), `${somaLojas} x ${somaTotal}`);

      const filtrado = await chamar(A.tok.owner, R.relatorio, "GET", `emporio/reports/sales?from=${de}&to=${ate}&establishment_id=${A.L2}`);
      const mf = porConta(filtrado.corpo?.data?.pix_by_account);
      check("filtrando pela loja 2, o topo só tem as contas da loja 2", filtrado.status === 200 && mf.has(cL2) && !mf.has(cL1) && perto(mf.get(cL2)?.amount, 30), `${filtrado.status} ${j(filtrado.corpo?.data?.pix_by_account)}`);
    });

    // -------------------------------------------------------------------- 8
    await rodar("editar venda", async () => {
      console.log("\n8. Editar venda cuja conta deixou de valer (Q315)");
      await definir(A, A.L1, cTodas);
      const v = await vender(A, "L1", CA, 4, [pix(40, cL1)]);
      check("venda de 40 no PIX da conta da loja 1: 201", v.status === 201, `${v.status} ${j(v.corpo)}`);
      const restringe = await editar(A, cL1, { pix_all_establishments: false, establishment_ids: [A.L2] });
      check("agora a conta deixa de valer na loja 1 (restringida à 2): ok, pois já não é a padrão", restringe.ok === true, j(restringe));
      check("a conta já não vale na loja 1", (await Caixa.contaPixDisponivelParaLoja(A.db, cL1, A.L1)) === false);

      const nova = await vender(A, "L1", CA, 4, [pix(40, cL1)]);
      check("controle: uma venda NOVA nessa conta é recusada em payments", erro(nova, 422, "payments"), `${nova.status} ${j(nova.corpo)}`);
      const troca = await chamar(A.tok.owner, R.replace, "POST", `emporio/sales/${idDe(v)}/replace`, {
        operation_key: chave("repl"), cash_register_id: A.reg1, customer_id: CA.id, items: itens(A, 4), payments: [pix(40, cL1)], reason: "ajuste",
      }, idDe(v));
      check("editar a venda mantendo o PIX na conta que deixou de valer: 201", troca.status === 201, `${troca.status} ${j(troca.corpo)}`);
      check("a venda nova segue identificada na mesma conta", pagamentosDe(troca).find((p) => p.kind === "pix")?.bank_account_name === nomeCL1, j(pagamentosDe(troca)));

      const troca2 = await chamar(A.tok.owner, R.replace, "POST", `emporio/sales/${idDe(troca)}/replace`, {
        operation_key: chave("repl"), cash_register_id: A.reg1, customer_id: CA.id, items: itens(A, 4), payments: [pix(40, cL2)], reason: "trocar de conta",
      }, idDe(troca));
      check("editar trocando o PIX para OUTRA conta indisponível: 422 no campo payments", erro(troca2, 422, "payments"), `${troca2.status} ${j(troca2.corpo)}`);
      const intacta = await P.emporioSale.findUnique({ where: { id: idDe(troca) } });
      check("a recusa deixou a venda concluída", intacta?.status === "concluida", `${intacta?.status}`);
    });

    // -------------------------------------------------------------------- 9
    await rodar("fiado", async () => {
      console.log("\n9. Fiado recebido no PIX (Q315)");
      const f = await vender(A, "L1", CA, 3, [{ kind: "fiado", amount: 30 }]);
      check("venda no fiado de 30: 201", f.status === 201, `${f.status} ${j(f.corpo)}`);
      const receber = (bank_account_id: string | undefined, amount = 10) =>
        chamar(A.tok.owner, R.receive, "POST", "emporio/receivables/receive", {
          operation_key: chave("rec"), customer_id: CA.id, establishment_id: A.L1, amount, kind: "pix", cash_register_id: A.reg1, ...(bank_account_id ? { bank_account_id } : {}),
        });
      const movs = () => P.cashMovement.count({ where: { tenant_id: A.tenantId, origin: "recebimento_fiado" } }) as Promise<number>;
      const antes = await movs();
      const rec = await receber(cL1);
      check("PIX do fiado numa conta indisponível para a loja: 422 no campo bank_account_id", erro(rec, 422, "bank_account_id"), `${rec.status} ${j(rec.corpo)}`);
      const arq = await receber(cArq);
      check("PIX do fiado numa conta arquivada: 422 no campo bank_account_id", erro(arq, 422, "bank_account_id"), `${arq.status} ${j(arq.corpo)}`);
      check("as recusas não moveram dinheiro", (await movs()) === antes, `${antes} -> ${await movs()}`);
      const ok = await receber(cTodas);
      check("conta 'todas as lojas': 201", ok.status === 201, `${ok.status} ${j(ok.corpo)}`);
      const semConta = await receber(undefined, 5);
      check("sem conta informada: usa a padrão da loja e passa (201)", semConta.status === 201, `${semConta.status} ${j(semConta.corpo)}`);
      const mov = await P.cashMovement.findMany({ where: { tenant_id: A.tenantId, origin: "recebimento_fiado" }, orderBy: { created_at: "asc" } });
      check("os dois recebimentos foram para a conta 'todas' (a escolhida e a padrão atual)", mov.length === antes + 2 && mov.slice(antes).every((m: Dado) => m.bank_account_id === cTodas), j(mov.map((m: Dado) => m.bank_account_id)));
    });

    // -------------------------------------------------------------------- 10
    await rodar("isolamento", async () => {
      console.log("\n10. Isolamento entre tenants");
      const lojaDeA = await lerPix(B.tok.owner, A.L1);
      check("B lê as contas PIX da loja do A: 404", lojaDeA.status === 404, `${lojaDeA.status} ${j(lojaDeA.corpo)}`);
      check("e não vaza nenhuma conta do A", !j(lojaDeA.corpo).includes(cTodas) && !j(lojaDeA.corpo).includes(nomeCL1));
      const lojaDeB = await lerPix(B.tok.owner, B.L1);
      check("B lê a própria loja: 200 e sem nenhuma conta do A", lojaDeB.status === 200 && !(lojaDeB.corpo?.data ?? []).some((c: Dado) => [cAntiga, cTodas, cL1, cL2].includes(c.id)), j(lojaDeB.corpo));
      const contasB = await chamar(B.tok.owner, R.contas, "GET", "emporio/bank-accounts");
      check("a lista de contas do B (200) não traz as do A", contasB.status === 200 && !(contasB.corpo?.data ?? []).some((c: Dado) => [cAntiga, cTodas, cL1, cL2].includes(c.id)), j(contasB.corpo));
      const antes = await vendasDe(B);
      const v = await vender(B, "L1", CB, 5, [pix(50, cTodas)]);
      check("B vende no PIX com a conta do A: recusa 4xx", recusada(v), `${v.status} ${j(v.corpo)}`);
      check("e não criou venda", (await vendasDe(B)) === antes);
      const ed = await Caixa.editarContaAction(B.db, B.owner, cTodas, { beneficiary: "invasão" });
      check("B edita a conta do A pela action: recusa", ed.ok === false, j(ed));
      const doA = await Caixa.listarContasAction(A.db, A.owner);
      check("a conta do A ficou intacta", (doA.data ?? []).find((c: Dado) => c.id === cTodas)?.beneficiary === "Agromax Editado");
      const dispB = await Caixa.contaPixDisponivelParaLoja(B.db, cTodas, B.L1);
      check("contaPixDisponivelParaLoja: a conta do A nunca vale para o B", dispB === false);
    });

    // -------------------------------------------------------------------- 11
    await rodar("achados do juiz", async () => {
      console.log("\n11. Achados do juiz: CNPJ alfanumérico, loja arquivada, conta escolhida inativa");
      const alfa = await criar(B, { name: `M114 CNPJ Alfa ${stamp}`, document: "12.ABC.345/01DE-35" });
      check("CNPJ alfanumérico da Receita: ok, grava sem pontuação (como o fornecedor)", alfa.ok === true && alfa.data?.document === "12ABC34501DE35", j(alfa));

      const x = await criar(B, { name: `M114 Conta X ${stamp}` });
      const xId = x.data?.id ?? "";
      const def = await definir(B, B.L2, xId);
      check("a conta X vira a padrão da loja 2 do B", def.ok === true, j(def));
      const antesDeArquivar = await editar(B, xId, { pix_all_establishments: false, establishment_ids: [B.L1] });
      check("controle: com a loja 2 ativa, tirar a loja 2 da lista é recusado", erroA(antesDeArquivar, 422, "establishment_ids"), j(antesDeArquivar));
      await P.establishment.update({ where: { id: B.L2 }, data: { archived_at: new Date() } });
      const depois = await editar(B, xId, { pix_all_establishments: false, establishment_ids: [B.L1] });
      check("com a loja 2 arquivada, a padrão dela não segura a lista", depois.ok === true, j(depois));

      const y = await criar(B, { name: `M114 Conta Y ${stamp}` });
      await editar(B, y.data?.id ?? "", { archived: true });
      const v = await vender(B, "L1", CB, 1, [pix(10, y.data?.id)]);
      check("venda com a conta escolhida arquivada: 422 em payments", erro(v, 422, "payments"), `${v.status} ${j(v.corpo)}`);
      check("e a mensagem fala da conta escolhida, não de cadastrar conta", String(v.corpo?.error?.message ?? "").includes("não está mais ativa"), j(v.corpo));
    });

    // -------------------------------------------------------------------- 12
    await rodar("não recebe PIX", async () => {
      console.log("\n12. Conta que não recebe PIX (Q318)");
      const cartao = await criar(A, { name: `M114 Cartão Stone ${stamp}`, bank: "Stone", receives_pix: false, pix_all_establishments: false, establishment_ids: [] });
      check("criar com receives_pix false: ok, mesmo com lista vazia (as lojas não valem)", cartao.ok === true && cartao.data?.receives_pix === false, j(cartao));
      const cId = cartao.data?.id ?? "";
      const disp = (l: string): Promise<boolean> => Caixa.contaPixDisponivelParaLoja(A.db, cId, l);
      check("não vale para o PIX de nenhuma loja", (await disp(A.L1)) === false && (await disp(A.L2)) === false);
      const naLista = [(await lerPix(A.tok.owner, A.L1)).corpo?.data ?? [], (await lerPix(A.tok.owner, A.L2)).corpo?.data ?? []].flat().map((c: Dado) => c.id);
      check("fica fora da lista do PIX das duas lojas", !naLista.includes(cId), j(naLista));
      const def = await definir(A, A.L1, cId);
      check("definir como conta PIX da loja: 422 em bank_account_id", erroA(def, 422, "bank_account_id"), j(def));
      const v = await vender(A, "L1", CA, 1, [pix(10, cId)]);
      check("venda no PIX com ela: 422 em payments", erro(v, 422, "payments"), `${v.status} ${j(v.corpo)}`);

      const padrao = (await P.establishment.findUnique({ where: { id: A.L1 } }))?.pix_bank_account_id as string;
      const tirar = await editar(A, padrao, { receives_pix: false });
      check("tirar do PIX a conta PIX padrão de uma loja ativa: 422 em receives_pix", erroA(tirar, 422, "receives_pix"), j(tirar));
      check("a mensagem cita a loja", typeof tirar.message === "string" && tirar.message.includes(A.nomeL1), j(tirar));

      const volta = await editar(A, cId, { receives_pix: true, pix_all_establishments: true });
      check("voltar a receber PIX em todas as lojas: ok", volta.ok === true && volta.data?.receives_pix === true && volta.data?.pix_all_establishments === true, j(volta));
      check("e agora vale nas duas lojas", (await disp(A.L1)) === true && (await disp(A.L2)) === true);
      const restrita = await editar(A, cId, { pix_all_establishments: false, establishment_ids: [A.L2] });
      check("restringir à loja 2", restrita.ok === true && (await disp(A.L1)) === false, j(restrita));
      const sai = await editar(A, cId, { receives_pix: false });
      check("sair do PIX apaga a lista de lojas (volta a 'todas', sem valer)", sai.ok === true && sai.data?.receives_pix === false && j(sai.data?.pix_available_establishment_ids) === "[]", j(sai));
      check("e a junção ficou vazia", (await P.bankAccountPixEstablishment.count({ where: { bank_account_id: cId } })) === 0);
    });
  } finally {
    for (const id of tenantIds.reverse()) {
      await P_limpar(id);
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M114 (Módulo 39, Empório): as contas PIX no lançamento passaram." : `\n❌ M114 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

async function P_limpar(id: string) {
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
