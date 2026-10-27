import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F1: estabelecimentos e catálogo.
 * Roda: `npm run test:m78`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, F1: contrato Q50 a
 * Q59), sem ler a implementação. Chama as actions direto, sem rota: a rota
 * depende de sessão do NextAuth. O módulo das actions e o de preço são
 * carregados por `import()` com especificador em variável, para o arquivo
 * compilar mesmo antes de a implementação existir.
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

console.log("🛍️  M78: Módulo 39 (Meu Empório), F1: estabelecimentos e catálogo\n");

async function puras() {
  const caminho = "@/lib/emporio/preco";
  const { precoSugerido } = (await import(caminho)) as {
    precoSugerido: (custo: number | null, despesas: number, lucro: number) => number | null;
  };
  console.log("1. precoSugerido (função pura)");
  check("100 com 15% e 20% = 138", precoSugerido(100, 15, 20) === 138, String(precoSugerido(100, 15, 20)));
  check("100 sem percentuais = 100", precoSugerido(100, 0, 0) === 100);
  check("100 só despesas 15% = 115", precoSugerido(100, 15, 0) === 115);
  check("sem custo (null) = null", precoSugerido(null, 15, 20) === null);
  check("arredonda a centavos: 9,99 +10% +10% = 12,09", precoSugerido(9.99, 10, 10) === 12.09, String(precoSugerido(9.99, 10, 10)));
  check("arredonda a centavos: 33,33 +7% +13% = 40,30", precoSugerido(33.33, 7, 13) === 40.3, String(precoSugerido(33.33, 7, 13)));
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const caminhoAcoes = "@/lib/actions/emporio-catalogo";
  const A = (await import(caminhoAcoes)) as Record<string, Acao>;
  const { listProductsWithBalance } = await import("@/lib/actions/products");

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M78 ${rotulo} ${stamp}`, document: `M78${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
      });
      tenantIds.push(t.id);
      const mkUser = async (suf: string, role: Role): Promise<Ator> => {
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M78 ${rotulo} ${suf}`, email: `m78-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: "x", role },
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
    const cat = await db.productCategory.create({ data: scoped({ name: "M78 categoria" }) });

    const chamar = (nome: string, ...args: unknown[]) => {
      const f = A[nome];
      if (typeof f !== "function") return Promise.reject(new Error(`action ausente: ${nome}`));
      return f(db, ...args);
    };
    const chamarB = (nome: string, ...args: unknown[]) => A[nome](dbB, ...args);
    const dados = (r: R): Dado => (r.ok ? r.data : undefined);
    const ids = (d: Dado): string[] => {
      const arr: Dado[] = Array.isArray(d) ? d : (d?.items ?? []);
      return arr.map((x) => x.product_id ?? x.id);
    };
    const lista = (d: Dado): Dado[] => (Array.isArray(d) ? d : (d?.items ?? []));
    const detalhe = async (ator: Ator, pid: string): Promise<Dado> => dados(await chamar("lerProdutoEmporioAction", ator, pid));
    const linha = (det: Dado, est: string, pres: string): Dado =>
      (det?.prices ?? []).find((p: Dado) => p.establishment_id === est && p.presentation_id === pres);
    const definirPreco = (ator: Ator, est: string, pres: string, price: number, ex: number | null, lu: number | null) =>
      chamar("definirPrecoAction", ator, { establishment_id: est, presentation_id: pres, price, expense_pct: ex, profit_pct: lu });

    // ---- Estabelecimentos e produto-base (usados em várias seções)
    const rL1 = await chamar("criarEstabelecimentoAction", owner, { name: "M78 Loja 1", kind: "ponto_venda", default_expense_pct: 10, default_profit_pct: 10 });
    const rL2 = await chamar("criarEstabelecimentoAction", admin, { name: "M78 Loja 2", kind: "central" });
    const L1 = dados(rL1);
    const L2 = dados(rL2);
    if (!L1 || !L2) throw new Error(`não criou as lojas: ${j(rL1)} ${j(rL2)}`);

    console.log("\n2. Q53, precedência dos percentuais, pelas actions");
    const rRacao = await chamar("criarProdutoEmporioAction", op, { name: "M78 Ração", category_id: cat.id, base_unit: "quilograma" });
    const racao = dados(rRacao);
    if (!racao) throw new Error(`não criou o produto: ${j(rRacao)}`);
    const rCusto = await chamar("editarProdutoEmporioAction", op, racao.id, { reference_cost: 9.5 });
    check("OPERADOR define reference_cost", rCusto.ok, j(rCusto));
    const rSaca = await chamar("criarApresentacaoAction", op, racao.id, { name: "Saca 10 kg", base_qty: 10, is_sealed_package: true });
    const rQuilo = await chamar("criarApresentacaoAction", op, racao.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    const saca = dados(rSaca);
    const quilo = dados(rQuilo);
    if (!saca || !quilo) throw new Error(`não criou apresentações: ${j(rSaca)} ${j(rQuilo)}`);

    let det = await detalhe(admin, racao.id);
    let s1 = linha(det, L1.id, saca.id);
    let s2 = linha(det, L2.id, saca.id);
    check("loja 1, sem exceção: padrão da loja (10 e 10)", !!s1 && s1.expense_pct_efetivo === 10 && s1.profit_pct_efetivo === 10, j(s1));
    check("loja 1: sugerido da saca = 114,95", perto(s1?.suggested_price, 114.95), j(s1?.suggested_price));
    check("loja 2, sem nada: 0 e 0, sugerido = custo (95)", !!s2 && s2.expense_pct_efetivo === 0 && s2.profit_pct_efetivo === 0 && perto(s2.suggested_price, 95), j(s2));

    const rExProd = await chamar("editarProdutoEmporioAction", admin, racao.id, { expense_pct: 20 });
    check("ADMIN grava exceção de despesas no produto", rExProd.ok, j(rExProd));
    det = await detalhe(admin, racao.id);
    s1 = linha(det, L1.id, saca.id);
    s2 = linha(det, L2.id, saca.id);
    check("produto vence loja nas despesas (20) e o lucro segue o da loja (10)", s1?.expense_pct_efetivo === 20 && s1?.profit_pct_efetivo === 10, j(s1));
    check("loja 1: sugerido = 95 x 1,2 x 1,1 = 125,40", perto(s1?.suggested_price, 125.4), j(s1?.suggested_price));
    check("loja 2: despesas 20 (produto), lucro 0 (sem padrão)", s2?.expense_pct_efetivo === 20 && s2?.profit_pct_efetivo === 0, j(s2));

    const rP1 = await definirPreco(admin, L1.id, saca.id, 130, 50, null);
    const rP2 = await definirPreco(admin, L1.id, quilo.id, 15, null, 0);
    check("ADMIN define preço com exceção", rP1.ok && rP2.ok, j([rP1, rP2]));
    det = await detalhe(admin, racao.id);
    s1 = linha(det, L1.id, saca.id);
    const q1 = linha(det, L1.id, quilo.id);
    check("apresentação na loja vence produto nas despesas (50)", s1?.expense_pct_efetivo === 50, j(s1));
    check("lucro da saca segue a loja (10): despesas e lucro independentes", s1?.profit_pct_efetivo === 10, j(s1));
    check("sugerido da saca = 95 x 1,5 x 1,1 = 156,75", perto(s1?.suggested_price, 156.75), j(s1?.suggested_price));
    check("lucro 0 na apresentação vence o 10 da loja (zero não é ausente)", q1?.profit_pct_efetivo === 0, j(q1));
    check("a exceção da saca não vaza para o quilo (despesas 20 do produto)", q1?.expense_pct_efetivo === 20, j(q1));
    check("quilo na loja 1: sugerido = 9,5 x 1,2 = 11,40", perto(q1?.suggested_price, 11.4), j(q1?.suggested_price));

    console.log("\n3. Custo da apresentação = reference_cost x base_qty");
    check("saca de 10 kg com custo 9,5/kg = 95", perto(s1?.cost, 95), j(s1?.cost));
    check("quilo = 9,5", perto(q1?.cost, 9.5), j(q1?.cost));
    check("reference_cost vem como number", typeof det?.reference_cost === "number" && det.reference_cost === 9.5, j(det?.reference_cost));

    console.log("\n4. Lojas independentes (§8) e sem preço (Q54)");
    await definirPreco(admin, L2.id, saca.id, 140, null, null);
    await definirPreco(admin, L1.id, saca.id, 135, 50, null);
    det = await detalhe(admin, racao.id);
    s1 = linha(det, L1.id, saca.id);
    s2 = linha(det, L2.id, saca.id);
    check("loja 1 mudou para 135", s1?.price === 135, j(s1?.price));
    check("loja 2 continua em 140", s2?.price === 140, j(s2?.price));
    check("a exceção própria da loja 2 segue nula", s2?.expense_pct === null && s2?.profit_pct === null, j(s2));
    const q2 = linha(det, L2.id, quilo.id);
    check("quilo sem preço na loja 2: linha existe, price null", !!q2 && q2.price === null, j(q2));
    check("quilo sem preço: suggested_price preenchido (11,40)", perto(q2?.suggested_price, 11.4), j(q2?.suggested_price));
    check("uma linha por loja x apresentação ativa (2 x 2)", (det?.prices ?? []).length === 4, String((det?.prices ?? []).length));
    const rSemCusto = await chamar("criarProdutoEmporioAction", op, { name: "M78 Sem custo", category_id: cat.id, base_unit: "unidade" });
    const semCusto = await detalhe(admin, dados(rSemCusto)?.id);
    await chamar("criarApresentacaoAction", op, dados(rSemCusto)?.id, { name: "Unidade", base_qty: 1, is_sealed_package: false });
    const semCusto2 = await detalhe(admin, dados(rSemCusto)?.id);
    check("produto sem custo: sugerido null", !!semCusto && (semCusto2?.prices ?? []).length > 0 && (semCusto2.prices as Dado[]).every((p) => p.suggested_price === null), j(semCusto2?.prices));

    console.log("\n5. Q55, quem escreve o quê");
    check("OPERADOR cria estabelecimento: 403", recusa(await chamar("criarEstabelecimentoAction", op, { name: "M78 Op", kind: "central" }), "FORBIDDEN", 403));
    check("OPERADOR edita estabelecimento: 403", recusa(await chamar("editarEstabelecimentoAction", op, L1.id, { city: "X" }), "FORBIDDEN", 403));
    check("OPERADOR define preço: 403", recusa(await definirPreco(op, L1.id, saca.id, 1, null, null), "FORBIDDEN", 403));
    check("OPERADOR manda expense_pct no produto: 403", recusa(await chamar("editarProdutoEmporioAction", op, racao.id, { expense_pct: 5 }), "FORBIDDEN", 403));
    check("OPERADOR manda profit_pct no produto: 403", recusa(await chamar("editarProdutoEmporioAction", op, racao.id, { profit_pct: 5 }), "FORBIDDEN", 403));
    check("as recusas do OPERADOR não mexeram: o preço da loja 1 segue 135",(await detalhe(admin, racao.id)).prices.find((p: Dado) => p.establishment_id === L1.id && p.presentation_id === saca.id)?.price === 135);
    check("OPERADOR edita apresentação", (await chamar("editarApresentacaoAction", op, saca.id, { name: "Saca 10 kg" })).ok);
    check("VISUALIZADOR cria produto: 403", recusa(await chamar("criarProdutoEmporioAction", visu, { name: "M78 Vis", category_id: cat.id, base_unit: "litro" }), "FORBIDDEN", 403));
    check("VISUALIZADOR lê a lista de lojas", (await chamar("listarEstabelecimentosAction", visu)).ok);
    check("ADMIN cria estabelecimento (Loja 2 já foi criada por ADMIN)", rL2.ok);
    check("OWNER define preço", (await definirPreco(owner, L1.id, saca.id, 135, 50, null)).ok);
    check("OPERADOR não define vínculos: 403", recusa(await chamar("definirVinculosAction", op, L1.id, [op.id]), "FORBIDDEN", 403));

    console.log("\n6. Q8 e Q56, visibilidade por vínculo");
    const rVin = await chamar("definirVinculosAction", owner, L1.id, [vinc.id]);
    check("OWNER vincula o usuário à loja 1", rVin.ok, j(rVin));
    const vistas = lista(dados(await chamar("listarEstabelecimentosAction", vinc))).map((e) => e.id);
    check("vinculado vê só a loja 1 na lista", vistas.includes(L1.id) && !vistas.includes(L2.id) && vistas.length === 1, j(vistas));
    check("vinculado: detalhe da loja 2 = 404", recusa(await chamar("lerEstabelecimentoAction", vinc, L2.id), "NOT_FOUND", 404));
    check("vinculado: detalhe da loja 1 ok", (await chamar("lerEstabelecimentoAction", vinc, L1.id)).ok);
    const detVinc = await detalhe(vinc, racao.id);
    const lojasNaTabela = new Set((detVinc?.prices ?? []).map((p: Dado) => p.establishment_id));
    check("tabela de preço do vinculado só traz a loja 1", lojasNaTabela.size === 1 && lojasNaTabela.has(L1.id), j([...lojasNaTabela]));
    check("definirPreco do vinculado na loja 2: 404", recusa(await definirPreco(vinc, L2.id, quilo.id, 9, null, null), "NOT_FOUND", 404));
    check("e nada foi gravado na loja 2", linha(await detalhe(admin, racao.id), L2.id, quilo.id)?.price === null);
    const vistasAdmin = lista(dados(await chamar("listarEstabelecimentosAction", admin))).map((e) => e.id);
    check("sem vínculo vê as duas", vistasAdmin.includes(L1.id) && vistasAdmin.includes(L2.id));
    const lerL1 = dados(await chamar("lerEstabelecimentoAction", owner, L1.id));
    check("a view devolve user_ids", Array.isArray(lerL1?.user_ids) && lerL1.user_ids.length === 1 && lerL1.user_ids[0] === vinc.id, j(lerL1?.user_ids));
    const rVinB = await chamar("definirVinculosAction", owner, L1.id, [ownerB.id]);
    check("vínculo com usuário de outro tenant: 422 em user_ids", recusa(rVinB, "VALIDATION_ERROR", 422, "user_ids"), j(rVinB));
    check("e a lista anterior permanece", dados(await chamar("lerEstabelecimentoAction", owner, L1.id))?.user_ids?.[0] === vinc.id);
    await chamar("definirVinculosAction", owner, L1.id, []);
    const volta = lista(dados(await chamar("listarEstabelecimentosAction", vinc))).map((e) => e.id);
    check("vínculos vazios (substitui): o usuário volta a ver as duas", volta.includes(L1.id) && volta.includes(L2.id), j(volta));

    console.log("\n7. Q57, lacrado e avulso automático");
    const rSal = await chamar("criarProdutoEmporioAction", op, { name: "M78 Sal", category_id: cat.id, base_unit: "quilograma" });
    const sal = dados(rSal);
    const rSalSaca = await chamar("criarApresentacaoAction", op, sal.id, { name: "Saca 10 kg", base_qty: 10, is_sealed_package: true });
    let d = await detalhe(op, sal.id);
    check("só saca fechada: track_sealed null, efetivo falso", d.track_sealed === null && d.track_sealed_efetivo === false, j([d.track_sealed, d.track_sealed_efetivo]));
    const rSalQuilo = await chamar("criarApresentacaoAction", op, sal.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    d = await detalhe(op, sal.id);
    check("com quilo avulso também: efetivo verdadeiro", d.track_sealed_efetivo === true, j(d.track_sealed_efetivo));
    await chamar("editarProdutoEmporioAction", op, sal.id, { track_sealed: false });
    d = await detalhe(op, sal.id);
    check("track_sealed false explícito desliga", d.track_sealed === false && d.track_sealed_efetivo === false, j([d.track_sealed, d.track_sealed_efetivo]));
    await chamar("editarProdutoEmporioAction", op, sal.id, { track_sealed: null });
    d = await detalhe(op, sal.id);
    check("null volta ao automático (verdadeiro)", d.track_sealed === null && d.track_sealed_efetivo === true, j([d.track_sealed, d.track_sealed_efetivo]));
    await chamar("arquivarApresentacaoAction", op, dados(rSalQuilo)?.id, true);
    d = await detalhe(op, sal.id);
    check("arquivar o quilo volta o automático a falso", d.track_sealed_efetivo === false, j(d.track_sealed_efetivo));
    check("apresentação criada segue no detalhe com archived_at", rSalSaca.ok && (d.presentations ?? []).some((p: Dado) => p.name === "Quilo" && p.archived_at));
    check("apresentação arquivada não gera linha de preço", !(d.prices ?? []).some((p: Dado) => p.presentation_id === dados(rSalQuilo)?.id));

    console.log("\n8. Validações");
    check("base_qty 0: 422 em base_qty", recusa(await chamar("criarApresentacaoAction", op, sal.id, { name: "Zero", base_qty: 0, is_sealed_package: false }), "VALIDATION_ERROR", 422, "base_qty"));
    check("base_qty negativo: 422 em base_qty", recusa(await chamar("criarApresentacaoAction", op, sal.id, { name: "Neg", base_qty: -1, is_sealed_package: false }), "VALIDATION_ERROR", 422, "base_qty"));
    const un = dados(await chamar("criarProdutoEmporioAction", op, { name: "M78 Un", category_id: cat.id, base_unit: "unidade" }));
    check("base_qty 1,5 em unidade: 422 em base_qty", recusa(await chamar("criarApresentacaoAction", op, un.id, { name: "Meia", base_qty: 1.5, is_sealed_package: false }), "VALIDATION_ERROR", 422, "base_qty"));
    check("base_qty 1,5 em quilograma é aceito", (await chamar("criarApresentacaoAction", op, sal.id, { name: "Um e meio", base_qty: 1.5, is_sealed_package: false })).ok);
    check("base_unit \"saca\": 422 em base_unit", recusa(await chamar("criarProdutoEmporioAction", op, { name: "M78 Saca", category_id: cat.id, base_unit: "saca" }), "VALIDATION_ERROR", 422, "base_unit"));
    check("nome de apresentação repetido: 409 em name", recusa(await chamar("criarApresentacaoAction", op, sal.id, { name: "Saca 10 kg", base_qty: 10, is_sealed_package: true }), "DUPLICATE_NAME", 409, "name"));
    check("percentual 1001 no padrão da loja: 422", recusa(await chamar("editarEstabelecimentoAction", owner, L2.id, { default_expense_pct: 1001 }), "VALIDATION_ERROR", 422, "default_expense_pct"));
    check("percentual 1001 no produto: 422 em expense_pct", recusa(await chamar("editarProdutoEmporioAction", admin, sal.id, { expense_pct: 1001 }), "VALIDATION_ERROR", 422, "expense_pct"));
    check("percentual negativo no produto: 422 em profit_pct", recusa(await chamar("editarProdutoEmporioAction", admin, sal.id, { profit_pct: -1 }), "VALIDATION_ERROR", 422, "profit_pct"));
    check("percentual 1000 é aceito (limite)", (await chamar("editarProdutoEmporioAction", admin, sal.id, { expense_pct: 1000 })).ok);
    check("percentual 1001 no preço: 422 em expense_pct", recusa(await definirPreco(admin, L1.id, quilo.id, 10, 1001, null), "VALIDATION_ERROR", 422, "expense_pct"));
    check("preço negativo: 422 em price", recusa(await definirPreco(admin, L1.id, quilo.id, -1, null, null), "VALIDATION_ERROR", 422, "price"));
    check("custo de referência negativo: 422 em reference_cost", recusa(await chamar("editarProdutoEmporioAction", op, sal.id, { reference_cost: -1 }), "VALIDATION_ERROR", 422, "reference_cost"));
    check("nome de loja repetido: 409 em name", recusa(await chamar("criarEstabelecimentoAction", owner, { name: "M78 Loja 1", kind: "central" }), "DUPLICATE_NAME", 409, "name"));
    check("a recusa não gravou o preço negativo", linha(await detalhe(admin, racao.id), L1.id, quilo.id)?.price === 15);

    console.log("\n9. Q50 e Q51, criar no Empório e trazer da fazenda");
    const rNovo = await chamar("criarProdutoEmporioAction", op, { name: "M78 Milho novo", category_id: cat.id, base_unit: "litro", brand: "Marca X" });
    const novo = dados(rNovo);
    check("cria o produto no Empório", rNovo.ok, j(rNovo));
    check("created_in_emporio verdadeiro, base_unit e marca", novo?.created_in_emporio === true && novo?.base_unit === "litro" && novo?.brand === "Marca X", j(novo));
    const pNovo = novo ? await db.product.findUnique({ where: { id: novo.product_id } }) : null;
    check("cria o Product com unit = base_unit", pNovo?.unit === "litro" && pNovo?.name === "M78 Milho novo", j(pNovo));
    check("nome repetido no Empório: 409 DUPLICATE_NAME em name", recusa(await chamar("criarProdutoEmporioAction", op, { name: "M78 Milho novo", category_id: cat.id, base_unit: "litro" }), "DUPLICATE_NAME", 409, "name"));
    const fazProd = await db.product.create({ data: scoped({ name: "M78 Semente fazenda", category_id: cat.id, unit: "saca" }) });
    const fazProd2 = await db.product.create({ data: scoped({ name: "M78 Adubo fazenda", category_id: cat.id, unit: "saca" }) });
    check("nome que já existe no catálogo da fazenda: 409 DUPLICATE_NAME em name", recusa(await chamar("criarProdutoEmporioAction", op, { name: "M78 Semente fazenda", category_id: cat.id, base_unit: "quilograma" }), "DUPLICATE_NAME", 409, "name"));
    let cand = ids(dados(await chamar("listarCandidatosAction", op)));
    check("candidatos trazem os produtos da fazenda", cand.includes(fazProd.id) && cand.includes(fazProd2.id), j(cand));
    check("candidatos não trazem o que nasceu no Empório", !cand.includes(novo?.product_id) && !cand.includes(pNovo?.id ?? ""));
    const rTraz = await chamar("criarProdutoEmporioAction", op, { product_id: fazProd.id, base_unit: "quilograma" });
    check("traz o produto da fazenda", rTraz.ok, j(rTraz));
    check("trazido: created_in_emporio falso, base_unit quilograma", dados(rTraz)?.created_in_emporio === false && dados(rTraz)?.base_unit === "quilograma", j(dados(rTraz)));
    const pFaz = await db.product.findUnique({ where: { id: fazProd.id } });
    check("Product.unit da fazenda continua \"saca\"", pFaz?.unit === "saca", j(pFaz?.unit));
    check("o mesmo produto de novo: 409 ALREADY_IN_EMPORIO", recusa(await chamar("criarProdutoEmporioAction", op, { product_id: fazProd.id, base_unit: "quilograma" }), "ALREADY_IN_EMPORIO", 409));
    cand = ids(dados(await chamar("listarCandidatosAction", op)));
    check("candidatos não trazem mais o produto trazido, mas trazem o outro", !cand.includes(fazProd.id) && cand.includes(fazProd2.id), j(cand));
    const rInex = await chamar("criarProdutoEmporioAction", op, { product_id: "nao-existe", base_unit: "quilograma" });
    check("product_id inexistente é recusado", !rInex.ok && (rInex.status === 404 || rInex.status === 422), j(rInex));

    console.log("\n10. Q51 na fazenda: listProductsWithBalance");
    const fazenda = await db.property.create({ data: scoped({ name: "M78 fazenda" }) });
    let prods = await listProductsWithBalance(db);
    let nomes = prods.map((p) => p.id);
    check("produto criado no Empório, sem movimentação em propriedade, não aparece", !nomes.includes(novo?.product_id), "apareceu");
    check("produto da fazenda trazido para o Empório continua aparecendo", nomes.includes(fazProd.id));
    check("produto da fazenda que ficou fora também aparece", nomes.includes(fazProd2.id));
    await prisma.stockMovement.create({ data: { tenant_id: TA.t.id, product_id: novo?.product_id, movement_type: "compra", quantity: 5, occurred_at: new Date(), establishment_id: L1.id, property_id: null } });
    prods = await listProductsWithBalance(db);
    check("movimentação só de loja não faz aparecer na fazenda", !prods.map((p) => p.id).includes(novo?.product_id));
    await prisma.stockMovement.create({ data: { tenant_id: TA.t.id, product_id: novo?.product_id, movement_type: "compra", quantity: 3, occurred_at: new Date(), property_id: fazenda.id } });
    prods = await listProductsWithBalance(db);
    nomes = prods.map((p) => p.id);
    const aparece = prods.find((p) => p.id === novo?.product_id);
    check("depois de uma movimentação com property_id, passa a aparecer", !!aparece);
    check("e o saldo da fazenda é só o dela (3)", aparece?.saldo_total === 3, String(aparece?.saldo_total));

    console.log("\n11. Isolamento entre tenants");
    check("B não vê lojas de A", lista(dados(await chamarB("listarEstabelecimentosAction", ownerB))).length === 0);
    check("B não vê produtos de A", lista(dados(await chamarB("listarProdutosEmporioAction", ownerB))).length === 0);
    check("B não vê candidatos de A", ids(dados(await chamarB("listarCandidatosAction", ownerB))).length === 0);
    check("B lê loja de A: 404", recusa(await chamarB("lerEstabelecimentoAction", ownerB, L1.id), "NOT_FOUND", 404));
    check("B lê produto de A: 404", recusa(await chamarB("lerProdutoEmporioAction", ownerB, racao.id), "NOT_FOUND", 404));
    check("B edita produto de A: 404", recusa(await chamarB("editarProdutoEmporioAction", ownerB, racao.id, { reference_cost: 1 }), "NOT_FOUND", 404));
    check("B cria apresentação em produto de A: 404", recusa(await chamarB("criarApresentacaoAction", ownerB, racao.id, { name: "Intruso", base_qty: 1, is_sealed_package: false }), "NOT_FOUND", 404));
    check("B define preço com ids de A: 404", recusa(await chamarB("definirPrecoAction", ownerB, { establishment_id: L1.id, presentation_id: saca.id, price: 1, expense_pct: null, profit_pct: null }), "NOT_FOUND", 404));
    check("B arquiva loja de A: 404", recusa(await chamarB("arquivarEstabelecimentoAction", ownerB, L1.id, true), "NOT_FOUND", 404));
    check("nada de A foi alterado por B", (await detalhe(admin, racao.id)).reference_cost === 9.5 && linha(await detalhe(admin, racao.id), L1.id, saca.id)?.price === 135);
    const rLojaB = await chamarB("criarEstabelecimentoAction", ownerB, { name: "M78 Loja 1", kind: "central" });
    check("B pode ter loja com o mesmo nome de A (unicidade é por tenant)", rLojaB.ok, j(rLojaB));

    console.log("\n12. Arquivar");
    const rTmp = await chamar("criarEstabelecimentoAction", owner, { name: "M78 Loja temporária", kind: "ponto_venda" });
    const tmp = dados(rTmp);
    check("arquivar loja", (await chamar("arquivarEstabelecimentoAction", owner, tmp.id, true)).ok);
    check("some da lista padrão", !lista(dados(await chamar("listarEstabelecimentosAction", owner))).some((e) => e.id === tmp.id));
    const comArq = lista(dados(await chamar("listarEstabelecimentosAction", owner, { incluir_arquivados: true })));
    const achada = comArq.find((e) => e.id === tmp.id);
    check("aparece com incluir_arquivados, com archived_at", !!achada && !!achada.archived_at, j(achada));
    check("desarquivar volta à lista", (await chamar("arquivarEstabelecimentoAction", owner, tmp.id, false)).ok && lista(dados(await chamar("listarEstabelecimentosAction", owner))).some((e) => e.id === tmp.id));
    check("OPERADOR arquivar loja: 403", recusa(await chamar("arquivarEstabelecimentoAction", op, tmp.id, true), "FORBIDDEN", 403));
    check("arquivar produto (OPERADOR)", (await chamar("arquivarProdutoEmporioAction", op, un.id, true)).ok);
    check("produto arquivado some da lista padrão", !lista(dados(await chamar("listarProdutosEmporioAction", op))).some((p) => p.id === un.id));
    const prodArq = lista(dados(await chamar("listarProdutosEmporioAction", op, { incluir_arquivados: true }))).find((p) => p.id === un.id);
    check("aparece com incluir_arquivados, com archived_at", !!prodArq && !!prodArq.archived_at, j(prodArq));
    check("produto arquivado do Empório não volta como candidato",!ids(dados(await chamar("listarCandidatosAction", op))).includes(un.product_id));
  } finally {
    for (const id of tenantIds) {
      try {
        await prisma.stockMovement.deleteMany({ where: { tenant_id: id } });
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
    const sobrou = await prisma.tenant.count({ where: { name: { contains: `M78 ` }, id: { in: tenantIds } } });
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
    console.log(falhas === 0 ? "\n✅ M78 verde" : `\n❌ M78: ${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  });
