import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M123: Módulo 39 (Meu Empório), balcão rápido (frente D, Q357 a Q361): código de barras na
 * apresentação, atalhos configuráveis e medidas das etiquetas.
 * Roda: `npm run test:m123`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-18-emporio-balcao-rapido-design.md e do bloco
 * Interfaces da Task 2 do plano, sem ler a implementação nova. O que está sob prova passa pela ROTA
 * (Request construído); fixtures usam as actions antigas e Prisma. Módulo ou rota que ainda não existe
 * vira falha de checagem (status 0 ou import_error), nunca exceção que derruba a suíte.
 *
 * Seção 1: pura (dígito verificador, normalização, módulos EAN contra a tabela L/G/R, busca, teclas).
 * Seção 2: apresentação (criar, editar, limpar, unicidade, arquivar e desarquivar, Histórico, permissão, tenant).
 * Seção 3: gerar o código interno.
 * Seção 4: corrida de duas gravações do mesmo código.
 * Seção 5: catálogo do balcão.
 * Seção 6: configurações do balcão e das etiquetas.
 *
 * Leituras adotadas onde a spec era ambígua (ver o relato):
 * - o 409 do desarquivar produto: só se confere status e código, não o campo;
 * - grade A4 que não cabe: 422 num campo `label_a4_*` (a spec não diz qual);
 * - tecla repetida contra o valor JÁ GRAVADO (payload parcial) também é 422 no campo enviado;
 * - o gerador numera como "20" + contador com 10 dígitos zero à esquerda + verificador.
 */

let falhas = 0;
let secaoAtual = "0";
const contagem: Record<string, { ok: number; falhas: number }> = {};
function check(nome: string, cond: boolean, detalhe?: string) {
  const c = (contagem[secaoAtual] ??= { ok: 0, falhas: 0 });
  if (cond) {
    c.ok += 1;
    console.log(`  ✅ ${nome}`);
  } else {
    c.falhas += 1;
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const j = (x: unknown) => JSON.stringify(x);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;

console.log("🛒 M123: Módulo 39 (Meu Empório), balcão rápido: código de barras, atalhos e etiquetas (Q357 a Q361)\n");

const tenantIds: string[] = [];
const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;

const MSG_TAMANHO = "O código de barras tem 8 ou 13 números.";
const MSG_NAO_CONFERE = "O código de barras não confere: verifique os números.";

// --- o padrão EAN, escrito aqui a partir do padrão (não do código) ---

/** Dígito verificador: da direita para a esquerda, pesos 3, 1, 3, 1...; vale para EAN-13 (12 dígitos) e EAN-8 (7). */
function verificadorDoPadrao(dados: string): number {
  let soma = 0;
  const ds = dados.split("").map(Number);
  for (let i = 0; i < ds.length; i += 1) soma += ds[ds.length - 1 - i] * (i % 2 === 0 ? 3 : 1);
  return (10 - (soma % 10)) % 10;
}
const ean13 = (doze: string) => `${doze}${verificadorDoPadrao(doze)}`;
const ean8 = (sete: string) => `${sete}${verificadorDoPadrao(sete)}`;

const TAB_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const TAB_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const TAB_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
/** Paridade do primeiro dígito: como codificar os seis dígitos da esquerda (L ou G). */
const PARIDADE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function modulosEsperados(codigo: string): string {
  const ds = codigo.split("").map(Number);
  if (codigo.length === 13) {
    const par = PARIDADE[ds[0]];
    const esq = ds.slice(1, 7).map((d, i) => (par[i] === "L" ? TAB_L[d] : TAB_G[d])).join("");
    const dir = ds.slice(7).map((d) => TAB_R[d]).join("");
    return `101${esq}01010${dir}101`;
  }
  const esq = ds.slice(0, 4).map((d) => TAB_L[d]).join("");
  const dir = ds.slice(4).map((d) => TAB_R[d]).join("");
  return `101${esq}01010${dir}101`;
}

// ---------------------------------------------------------------------------
// Seção 1 (pura)
// ---------------------------------------------------------------------------

async function secao1Pura() {
  secaoAtual = "1";
  console.log("1. As libs puras (sem banco)");
  let C: Dado = null;
  try {
    C = await import("@/lib/emporio/codigo-de-barras");
  } catch (e) {
    check("src/lib/emporio/codigo-de-barras.ts existe e importa", false, e instanceof Error ? e.message.slice(0, 100) : String(e));
  }
  if (C) {
    console.log("  (a) digitoVerificadorEan");
    const dv = typeof C.digitoVerificadorEan === "function" ? (s: string): unknown => C.digitoVerificadorEan(s) : () => undefined;
    check("exporta digitoVerificadorEan", typeof C.digitoVerificadorEan === "function");
    check("400638133393 dá 1", dv("400638133393") === 1);
    check("9638507 (EAN-8) dá 4", dv("9638507") === 4);
    check("003600029145 (UPC-A com o 0) dá 2", dv("003600029145") === 2);
    let todos = true;
    for (let k = 0; k < 30; k += 1) {
      const doze = String(100000000000 + k * 37_654_321_987).slice(0, 12).padStart(12, "0");
      if (dv(doze) !== verificadorDoPadrao(doze)) todos = false;
    }
    check("30 códigos de 12 dígitos batem com o dígito do padrão", todos);

    console.log("  (b) normalizarCodigoDeBarras");
    const nm = typeof C.normalizarCodigoDeBarras === "function" ? (s: unknown): Dado => C.normalizarCodigoDeBarras(s) : () => null;
    check("exporta normalizarCodigoDeBarras", typeof C.normalizarCodigoDeBarras === "function");
    const v1 = nm("4006381333931");
    check("4006381333931 (EAN-13 válido): ok com o próprio código", v1?.ok === true && v1.codigo === "4006381333931", j(v1));
    const v1b = nm("  4006381333931  ");
    check("espaços nas pontas são aparados", v1b?.ok === true && v1b.codigo === "4006381333931", j(v1b));
    const v2 = nm("4006381333932");
    check("4006381333932: não confere", v2?.ok === false && v2.mensagem === MSG_NAO_CONFERE, j(v2));
    const v3 = nm("96385074");
    check("96385074 (EAN-8 válido): ok", v3?.ok === true && v3.codigo === "96385074", j(v3));
    const v3b = nm("96385075");
    check("96385075 (EAN-8 errado): não confere", v3b?.ok === false && v3b.mensagem === MSG_NAO_CONFERE, j(v3b));
    const v4 = nm("036000291452");
    check("036000291452 (UPC-A) vira 0036000291452", v4?.ok === true && v4.codigo === "0036000291452", j(v4));
    const v4b = nm("036000291453");
    check("UPC-A com dígito errado: não confere", v4b?.ok === false && v4b.mensagem === MSG_NAO_CONFERE, j(v4b));
    for (const vazio of ["", "  ", null, undefined]) {
      const v = nm(vazio);
      check(`${j(vazio) ?? "undefined"} vira nulo (sem código), ok`, v?.ok === true && v.codigo === null, j(v));
    }
    for (const ruim of ["12345", "123456789", "12345678901234", "4006381333A31", "abcdefgh", "4006-3813-33931"]) {
      const v = nm(ruim);
      check(`"${ruim}": recusa de tamanho`, v?.ok === false && v.mensagem === MSG_TAMANHO, j(v));
    }

    console.log("  (c) modulosEan contra a tabela L, G e R do padrão");
    const me = typeof C.modulosEan === "function" ? (s: string): Dado => C.modulosEan(s) : () => "";
    check("exporta modulosEan", typeof C.modulosEan === "function");
    const m13 = String(me("4006381333931"));
    check("EAN-13 tem 95 módulos, só 0 e 1", m13.length === 95 && /^[01]+$/.test(m13), `${m13.length}`);
    check("guardas 101 no começo e no fim e 01010 no meio (EAN-13)", m13.startsWith("101") && m13.endsWith("101") && m13.slice(45, 50) === "01010", m13);
    const m8 = String(me("96385074"));
    check("EAN-8 tem 67 módulos, só 0 e 1", m8.length === 67 && /^[01]+$/.test(m8), `${m8.length}`);
    check("guardas 101 e 01010 no meio (EAN-8)", m8.startsWith("101") && m8.endsWith("101") && m8.slice(31, 36) === "01010", m8);
    check("4006381333931 igual ao esperado pela tabela", m13 === modulosEsperados("4006381333931"));
    check("96385074 igual ao esperado pela tabela", m8 === modulosEsperados("96385074"));
    let paridadesOk = 0;
    for (let d = 0; d <= 9; d += 1) {
      const cod = ean13(`${d}23456789012`);
      if (String(me(cod)) === modulosEsperados(cod)) paridadesOk += 1;
    }
    check("as 10 paridades do primeiro dígito (0 a 9) batem com a tabela", paridadesOk === 10, `${paridadesOk} de 10`);
    let oitoOk = 0;
    for (const sete of ["0000000", "1234567", "9876543", "5551212", "0101010"]) {
      const cod = ean8(sete);
      if (String(me(cod)) === modulosEsperados(cod)) oitoOk += 1;
    }
    check("5 EAN-8 diferentes batem com a tabela", oitoOk === 5, `${oitoOk} de 5`);
    let todosDigitos = true;
    for (let d = 0; d <= 9; d += 1) {
      const cod = ean13(`789${String(d).repeat(9)}`);
      if (String(me(cod)) !== modulosEsperados(cod)) todosDigitos = false;
    }
    check("dígitos repetidos de 0 a 9 nos dois lados do código batem com a tabela (R, L e G)", todosDigitos);

    console.log("  (d) codigoParaBusca");
    const cb = typeof C.codigoParaBusca === "function" ? (s: string): unknown => C.codigoParaBusca(s) : () => undefined;
    check("exporta codigoParaBusca", typeof C.codigoParaBusca === "function");
    check("13 dígitos ficam iguais", cb("4006381333931") === "4006381333931");
    check("8 dígitos ficam iguais", cb("96385074") === "96385074");
    check("12 dígitos viram 13 com o 0", cb("036000291452") === "0036000291452");
    check("espaços nas pontas são aparados", cb("  4006381333931 ") === "4006381333931");
    check("14 dígitos passam como estão", cb("14006381333938") === "14006381333938");
    check("7 dígitos: null", cb("1234567") === null);
    check("15 dígitos: null", cb("123456789012345") === null);
    check("texto com letras: null", cb("racao") === null && cb("4006abc1333931") === null);
    check("com hífen ou espaço no meio: null", cb("4006-381333931") === null && cb("4006 381333931") === null);
    check("vazio: null", cb("") === null && cb("   ") === null);
  }

  console.log("  (e) atalhos: teclas permitidas, padrões e teclaDoEvento");
  let A: Dado = null;
  try {
    A = await import("@/lib/emporio/atalhos");
  } catch (e) {
    check("src/lib/emporio/atalhos.ts existe e importa", false, e instanceof Error ? e.message.slice(0, 100) : String(e));
    return;
  }
  const esperadas = ["F2", "F4", "F8", "F9", "Ctrl+Enter", ...Array.from({ length: 9 }, (_, i) => `Alt+${i + 1}`)];
  const teclas: string[] = Array.isArray(A.TECLAS_PERMITIDAS) ? [...A.TECLAS_PERMITIDAS] : [];
  check("TECLAS_PERMITIDAS: F2, F4, F8, F9, Ctrl+Enter e Alt+1 a Alt+9, nada mais", teclas.length === esperadas.length && esperadas.every((t) => teclas.includes(t)), j(teclas));
  check("nenhuma tecla reservada do navegador na lista (F1, F3, F5, F6, F7, F10, F11, F12)", ["F1", "F3", "F5", "F6", "F7", "F10", "F11", "F12"].every((t) => !teclas.includes(t)));
  check("ACOES_DE_ATALHO: produto, cliente, vendedor, pagamento, fechar, nessa ordem", j(A.ACOES_DE_ATALHO) === j(["produto", "cliente", "vendedor", "pagamento", "fechar"]), j(A.ACOES_DE_ATALHO));
  const padrao = A.ATALHOS_PADRAO ?? {};
  check("ATALHOS_PADRAO: F2, F4, F8, F9 e Ctrl+Enter", padrao.produto === "F2" && padrao.cliente === "F4" && padrao.vendedor === "F8" && padrao.pagamento === "F9" && padrao.fechar === "Ctrl+Enter", j(padrao));
  const ev = (key: string, m: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}) =>
    typeof A.teclaDoEvento === "function" ? A.teclaDoEvento({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...m }) : undefined;
  check("exporta teclaDoEvento", typeof A.teclaDoEvento === "function");
  check("F2 dá \"F2\"", ev("F2") === "F2");
  check("F9 dá \"F9\"", ev("F9") === "F9");
  check("Ctrl+Enter dá \"Ctrl+Enter\"", ev("Enter", { ctrlKey: true }) === "Ctrl+Enter");
  check("Alt+3 dá \"Alt+3\"", ev("3", { altKey: true }) === "Alt+3");
  check("Alt+9 dá \"Alt+9\"", ev("9", { altKey: true }) === "Alt+9");
  check("Shift+C dá null", ev("C", { shiftKey: true }) === null);
  check("F5 dá null", ev("F5") === null);
  check("F1, F3, F12 dão null", ev("F1") === null && ev("F3") === null && ev("F12") === null);
  check("Enter puro dá null (é o do leitor)", ev("Enter") === null);
  check("uma letra solta dá null", ev("a") === null);
  check("número sem Alt dá null", ev("3") === null);
  check("Alt+0 dá null", ev("0", { altKey: true }) === null);
  check("Meta+Enter dá null", ev("Enter", { metaKey: true }) === null);
}

// ---------------------------------------------------------------------------
// Montagem (banco)
// ---------------------------------------------------------------------------

async function comBanco(fn: () => Promise<void>) {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await fn();
}

type Usuario = { id: string; role: "OWNER" | "OPERADOR"; email: string };
type Papeis = "owner" | "gerente" | "vend" | "vendSem" | "caixa";
type Mundo = {
  rotulo: string;
  tenantId: string;
  db: Dado;
  owner: Usuario;
  tok: Record<Papeis, string>;
  loja: string;
  categoriaId: string;
};

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M123 ${rotulo} ${stamp}`, document: `M123${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  await (prisma as Dado).emporioSettings.upsert({ where: { tenant_id: t.id }, create: { tenant_id: t.id }, update: {} });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M123 ${suf}`, email: `m123-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const gerente = await mk("ger", "OPERADOR", { emporio_role: "gerente_geral", emporio_keys: [] });
  const vend = await mk("vend", "OPERADOR"); // vendedor com TODAS as chaves, inclusive cadastrar_produto
  const vendSem = await mk("vsem", "OPERADOR", { emporio_role: "vendedor", emporio_keys: [] });
  const caixa = await mk("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });

  const db = prismaForTenant(t.id) as Dado;
  const l = await Cat.criarEstabelecimentoAction(db, owner, { name: `M123 ${rotulo} Loja` });
  if (!l.ok) throw new Error(`loja: ${j(l)}`);
  const loja = l.data.id as string;
  await vincularTodas(prisma, t.id, [gerente.id, vend.id, vendSem.id, caixa.id], [loja]);
  const cat = await db.productCategory.create({ data: scoped({ name: `M123 categoria ${rotulo}` }) });

  const tok = {} as Mundo["tok"];
  const pares: [Papeis, Usuario][] = [["owner", owner], ["gerente", gerente], ["vend", vend], ["vendSem", vendSem], ["caixa", caixa]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { rotulo, tenantId: t.id, db, owner, tok, loja, categoriaId: cat.id as string };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes). As novas ainda podem não existir.
const R = {
  criarPres: () => import("@/app/api/v1/emporio/products/[id]/presentations/route"),
  pres: () => import("@/app/api/v1/emporio/presentations/[id]/route"),
  arquivarPres: () => import("@/app/api/v1/emporio/presentations/[id]/archive/route"),
  arquivarProd: () => import("@/app/api/v1/emporio/products/[id]/archive/route"),
  produto: () => import("@/app/api/v1/emporio/products/[id]/route"),
  gerar: () => import("@/app/api/v1/emporio/presentations/barcode/route"),
  settings: () => import("@/app/api/v1/emporio/settings/route"),
  balcao: () => import("@/app/api/v1/emporio/settings/balcao/route"),
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
  if (typeof m[metodo] !== "function") return { status: 0, corpo: { import_error: `a rota não exporta ${metodo}` } };
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  try {
    const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  } catch (e) {
    return { status: 0, corpo: { throw: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
}
const ok2xx = (r: Resp) => r.status >= 200 && r.status < 300;
const recusou = (r: Resp, status: number, field?: string, code?: string) =>
  r.status === status && (field === undefined || r.corpo?.error?.field === field) && (code === undefined || r.corpo?.error?.code === code);
const dados = (r: Resp): Dado => r.corpo?.data;
const msg = (r: Resp): string => String(r.corpo?.error?.message ?? "");
const resumo = (r: Resp) => `${r.status} ${j(r.corpo).slice(0, 220)}`;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 12).join(" | ").slice(0, 900) : String(e));
  }
}

async function prismaCru(): Promise<Dado> {
  return (await import("@/lib/prisma")).prisma as Dado;
}

// --- fixtures ---

let seqCodigo = 0;
/** Um EAN-13 válido e único nesta execução (prefixo 789, sequência própria). */
const codigoNovo = () => ean13(`789${String(Date.now() % 1_000_000).padStart(6, "0")}${String((seqCodigo += 1)).padStart(3, "0")}`);
let seqNome = 0;

type Prod = { id: string; nome: string; pres: { id: string; nome: string }[] };
/** Produto com N apresentações (nomes distintos), pelas actions antigas. */
async function novoProduto(w: Mundo, apresentacoes = 1): Promise<Prod> {
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const nome = `M123 Produto ${w.rotulo} ${stamp} ${(seqNome += 1)}`;
  const p = await Cat.criarProdutoEmporioAction(w.db, w.owner, { name: nome, category_id: w.categoriaId, base_unit: "quilograma" });
  if (!p.ok) throw new Error(`produto: ${j(p)}`);
  const pres: Prod["pres"] = [];
  for (let i = 0; i < apresentacoes; i += 1) {
    const pn = `Saco ${i + 1} ${seqNome}`;
    const a = await Cat.criarApresentacaoAction(w.db, w.owner, p.data.id, { name: pn, base_qty: i + 1, is_sealed_package: false });
    if (!a.ok) throw new Error(`apresentação: ${j(a)}`);
    pres.push({ id: a.data.id as string, nome: pn });
  }
  return { id: p.data.id as string, nome, pres };
}

const criarPres = (tok: string, produtoId: string, corpo: Dado) => chamar(tok, R.criarPres, "POST", `emporio/products/${produtoId}/presentations`, corpo, produtoId);
const editarPres = (tok: string, id: string, corpo: Dado) => chamar(tok, R.pres, "PATCH", `emporio/presentations/${id}`, corpo, id);
const arquivarPres = (tok: string, id: string, archived: boolean) => chamar(tok, R.arquivarPres, "POST", `emporio/presentations/${id}/archive`, { archived }, id);
const arquivarProd = (tok: string, id: string, archived: boolean) => chamar(tok, R.arquivarProd, "POST", `emporio/products/${id}/archive`, { archived }, id);
const lerProduto = (tok: string, id: string) => chamar(tok, R.produto, "GET", `emporio/products/${id}`, undefined, id);
const gerar = (tok: string) => chamar(tok, R.gerar, "POST", "emporio/presentations/barcode", {});

const lerPres = async (id: string): Promise<Dado> => (await prismaCru()).productPresentation.findUnique({ where: { id } });
const comCodigo = async (w: Mundo, codigo: string): Promise<number> => (await prismaCru()).productPresentation.count({ where: { tenant_id: w.tenantId, barcode: codigo } });
const nPres = async (produtoId: string): Promise<number> => (await prismaCru()).productPresentation.count({ where: { emporio_product_id: produtoId } });
const logsDe = async (id: string, action?: string): Promise<Dado[]> =>
  (await prismaCru()).emporioAuditLog.findMany({ where: { target_id: id, ...(action ? { action } : {}) }, orderBy: { created_at: "asc" } });

let A = null as unknown as Mundo;
let B = null as unknown as Mundo;

const novaPres = (nome: string, extra: Dado = {}) => ({ name: nome, base_qty: 1, is_sealed_package: false, ...extra });

// ---------------------------------------------------------------------------
// Seção 2: o código na apresentação
// ---------------------------------------------------------------------------

async function secao2() {
  secaoAtual = "2";
  console.log("\n2. O código na apresentação: criar, editar, limpar, único entre as ativas");
  const O = A.tok.owner;

  console.log("  (a) criar e editar");
  const p1 = await novoProduto(A, 1);
  const c1 = codigoNovo();
  const rCria = await criarPres(O, p1.id, novaPres("Saco com código", { barcode: c1 }));
  check("criar apresentação com barcode: 2xx", ok2xx(rCria), resumo(rCria));
  check("a resposta traz o barcode", dados(rCria)?.barcode === c1, j(dados(rCria)));
  const idCria = String(dados(rCria)?.id ?? "");
  check("no banco, o barcode gravado", (await lerPres(idCria))?.barcode === c1);
  const rSem = await criarPres(O, p1.id, novaPres("Saco sem código"));
  check("criar sem barcode: 2xx e barcode null na resposta", ok2xx(rSem) && dados(rSem)?.barcode === null, resumo(rSem));
  const rVazioCria = await criarPres(O, p1.id, novaPres("Saco código vazio", { barcode: "  " }));
  check("criar com barcode só espaços: 2xx e vira null", ok2xx(rVazioCria) && dados(rVazioCria)?.barcode === null && (await lerPres(String(dados(rVazioCria)?.id)))?.barcode === null, resumo(rVazioCria));
  const prov = codigoNovo();
  const oficial = codigoNovo();
  const idSem = String(dados(rSem)?.id ?? "");
  const rProv = await editarPres(O, idSem, { barcode: prov });
  check("editar: cadastrar um provisório", ok2xx(rProv) && dados(rProv)?.barcode === prov, resumo(rProv));
  const rOfi = await editarPres(O, idSem, { barcode: oficial });
  check("editar: trocar o provisório pelo oficial", ok2xx(rOfi) && dados(rOfi)?.barcode === oficial && (await lerPres(idSem))?.barcode === oficial, resumo(rOfi));
  check("o provisório ficou livre (nenhuma apresentação o tem)", (await comCodigo(A, prov)) === 0);
  const rNome = await editarPres(O, idSem, { name: "Saco renomeado" });
  check("editar só o nome não mexe no barcode", ok2xx(rNome) && (await lerPres(idSem))?.barcode === oficial, resumo(rNome));
  const rAparado = await editarPres(O, idSem, { barcode: `  ${oficial}  ` });
  check("regravar o próprio código (com espaços) é aceito, não conflita consigo mesmo", ok2xx(rAparado) && (await lerPres(idSem))?.barcode === oficial, resumo(rAparado));
  const rLimpa = await editarPres(O, idSem, { barcode: null });
  check("editar com barcode null limpa o código", ok2xx(rLimpa) && dados(rLimpa)?.barcode === null && (await lerPres(idSem))?.barcode === null, resumo(rLimpa));
  await editarPres(O, idSem, { barcode: oficial });
  const rLimpa2 = await editarPres(O, idSem, { barcode: "   " });
  check("editar com barcode só espaços também limpa", ok2xx(rLimpa2) && (await lerPres(idSem))?.barcode === null, resumo(rLimpa2));

  console.log("  (b) formato: 422 em barcode");
  const antes = await nPres(p1.id);
  const rMau = await criarPres(O, p1.id, novaPres("Saco errado", { barcode: "4006381333932" }));
  check("criar com dígito errado: 422 em barcode, \"não confere\"", recusou(rMau, 422, "barcode") && msg(rMau) === MSG_NAO_CONFERE, resumo(rMau));
  const rCurto = await criarPres(O, p1.id, novaPres("Saco curto", { barcode: "12345" }));
  check("criar com 5 números: 422 em barcode, de tamanho", recusou(rCurto, 422, "barcode") && msg(rCurto) === MSG_TAMANHO, resumo(rCurto));
  const rLetra = await criarPres(O, p1.id, novaPres("Saco letra", { barcode: "40063813339AB" }));
  check("criar com letras: 422 em barcode, de tamanho", recusou(rLetra, 422, "barcode") && msg(rLetra) === MSG_TAMANHO, resumo(rLetra));
  check("as recusas não criaram apresentação", (await nPres(p1.id)) === antes);
  await editarPres(O, idSem, { barcode: oficial });
  const rEdMau = await editarPres(O, idSem, { barcode: "4006381333932" });
  check("editar com dígito errado: 422 em barcode", recusou(rEdMau, 422, "barcode") && msg(rEdMau) === MSG_NAO_CONFERE, resumo(rEdMau));
  const rEdCurto = await editarPres(O, idSem, { barcode: "1234567" });
  check("editar com 7 números: 422 em barcode, de tamanho", recusou(rEdCurto, 422, "barcode") && msg(rEdCurto) === MSG_TAMANHO, resumo(rEdCurto));
  check("a recusa não mexeu no código gravado", (await lerPres(idSem))?.barcode === oficial);

  console.log("  (c) UPC-A (12 dígitos) é gravado com o 0 na frente");
  const p2 = await novoProduto(A, 2);
  const rUpc = await editarPres(O, p2.pres[0].id, { barcode: "036000291452" });
  check("editar com 036000291452: 2xx e grava 0036000291452", ok2xx(rUpc) && dados(rUpc)?.barcode === "0036000291452" && (await lerPres(p2.pres[0].id))?.barcode === "0036000291452", resumo(rUpc));
  const rUpcDup = await editarPres(O, p2.pres[1].id, { barcode: "0036000291452" });
  check("o mesmo código escrito com 13 dígitos é o repetido: 409", recusou(rUpcDup, 409, "barcode", "BARCODE_IN_USE"), resumo(rUpcDup));
  const rUpcDup2 = await editarPres(O, p2.pres[1].id, { barcode: "036000291452" });
  check("e escrito com 12 dígitos também: 409", recusou(rUpcDup2, 409, "barcode", "BARCODE_IN_USE"), resumo(rUpcDup2));
  const rEan8 = await editarPres(O, p2.pres[1].id, { barcode: "96385074" });
  check("EAN-8 válido é aceito e gravado como está", ok2xx(rEan8) && (await lerPres(p2.pres[1].id))?.barcode === "96385074", resumo(rEan8));

  console.log("  (d) repetido entre ativas: 409 BARCODE_IN_USE, nomeando o dono");
  const p3 = await novoProduto(A, 2);
  const dono = codigoNovo();
  await editarPres(O, p3.pres[0].id, { barcode: dono });
  const rRep = await editarPres(O, p3.pres[1].id, { barcode: dono });
  check("editar para um código de outra apresentação ativa: 409 em barcode", recusou(rRep, 409, "barcode", "BARCODE_IN_USE"), resumo(rRep));
  check("a mensagem nomeia o produto e a apresentação donos", msg(rRep).includes(p3.nome) && msg(rRep).includes(p3.pres[0].nome), msg(rRep));
  check("a segunda apresentação segue sem código", (await lerPres(p3.pres[1].id))?.barcode === null);
  const p4 = await novoProduto(A, 0);
  const rRepCria = await criarPres(O, p4.id, novaPres("Saco repetido", { barcode: dono }));
  check("criar com código de outro produto: 409 em barcode, nomeando o dono", recusou(rRepCria, 409, "barcode", "BARCODE_IN_USE") && msg(rRepCria).includes(p3.nome), resumo(rRepCria));
  check("e nada foi criado", (await nPres(p4.id)) === 0);

  console.log("  (e) arquivada não segura o código; desarquivar confere");
  const p5 = await novoProduto(A, 1);
  const p6 = await novoProduto(A, 1);
  const cx = codigoNovo();
  await editarPres(O, p5.pres[0].id, { barcode: cx });
  const rArq = await arquivarPres(O, p5.pres[0].id, true);
  check("arquivar a apresentação com código: 2xx", ok2xx(rArq), resumo(rArq));
  const rLivre = await editarPres(O, p6.pres[0].id, { barcode: cx });
  check("o mesmo código em apresentação ARQUIVADA não bloqueia: outra o recebe", ok2xx(rLivre) && (await lerPres(p6.pres[0].id))?.barcode === cx, resumo(rLivre));
  const rDes = await arquivarPres(O, p5.pres[0].id, false);
  check("desarquivar a apresentação com código já tomado: 409 BARCODE_IN_USE", recusou(rDes, 409, undefined, "BARCODE_IN_USE"), resumo(rDes));
  check("a mensagem nomeia quem tem o código", msg(rDes).includes(p6.nome), msg(rDes));
  check("e ela segue arquivada", (await lerPres(p5.pres[0].id))?.archived_at !== null);
  await arquivarPres(O, p6.pres[0].id, true);
  const rDes2 = await arquivarPres(O, p5.pres[0].id, false);
  check("com o código liberado, desarquivar passa", ok2xx(rDes2) && (await lerPres(p5.pres[0].id))?.archived_at === null, resumo(rDes2));

  console.log("  (f) produto arquivado solta o código; desarquivar o produto confere");
  const p7 = await novoProduto(A, 1);
  const p8 = await novoProduto(A, 1);
  const cp = codigoNovo();
  await editarPres(O, p7.pres[0].id, { barcode: cp });
  const rArqProd = await arquivarProd(O, p7.id, true);
  check("arquivar o produto: 2xx", ok2xx(rArqProd), resumo(rArqProd));
  const rUsa = await editarPres(O, p8.pres[0].id, { barcode: cp });
  check("o código de apresentação de produto arquivado fica livre", ok2xx(rUsa), resumo(rUsa));
  const rDesProd = await arquivarProd(O, p7.id, false);
  check("desarquivar o produto com código tomado: 409 BARCODE_IN_USE", recusou(rDesProd, 409, undefined, "BARCODE_IN_USE"), resumo(rDesProd));
  check("a mensagem nomeia o dono atual", msg(rDesProd).includes(p8.nome), msg(rDesProd));
  check("e o produto segue arquivado", (await (await prismaCru()).emporioProduct.findUnique({ where: { id: p7.id } }))?.archived_at !== null);
  await arquivarProd(O, p8.id, true);
  const rDesProd2 = await arquivarProd(O, p7.id, false);
  check("com o código liberado, desarquivar o produto passa", ok2xx(rDesProd2), resumo(rDesProd2));
  check("o código segue na apresentação do produto reativado", (await lerPres(p7.pres[0].id))?.barcode === cp);

  console.log("  (g) Histórico com antes e depois");
  const p9 = await novoProduto(A, 1);
  const velho = codigoNovo();
  const novo = codigoNovo();
  await editarPres(O, p9.pres[0].id, { barcode: velho });
  const n0 = (await logsDe(p9.id, "apresentacao.editar")).length;
  await editarPres(O, p9.pres[0].id, { barcode: novo });
  const lgs = await logsDe(p9.id, "apresentacao.editar");
  const ultimo = lgs[lgs.length - 1];
  check("a troca de código gravou uma linha de Histórico a mais", lgs.length === n0 + 1, `${n0} -> ${lgs.length}`);
  check("a linha traz o código de antes e o de depois", !!ultimo && j(ultimo.changes).includes(velho) && j(ultimo.changes).includes(novo), j(ultimo?.changes));
  const rQuebra = await editarPres(O, p9.pres[0].id, { barcode: "4006381333932" });
  check("a recusa não gravou Histórico", rQuebra.status === 422 && (await logsDe(p9.id, "apresentacao.editar")).length === n0 + 1);

  console.log("  (h) permissão: gravar exige cadastrar_produto; ler é de quem vê o produto");
  const p10 = await novoProduto(A, 1);
  const cv = codigoNovo();
  const rVendSem = await editarPres(A.tok.vendSem, p10.pres[0].id, { barcode: cv });
  check("Vendedor sem a chave: editar com barcode é 403", recusou(rVendSem, 403), resumo(rVendSem));
  check("e o código não foi gravado", (await lerPres(p10.pres[0].id))?.barcode === null);
  const rVendSemCria = await criarPres(A.tok.vendSem, p10.id, novaPres("Saco do sem chave", { barcode: codigoNovo() }));
  check("Vendedor sem a chave: criar com barcode é 403", recusou(rVendSemCria, 403), resumo(rVendSemCria));
  const rCaixa = await editarPres(A.tok.caixa, p10.pres[0].id, { barcode: cv });
  check("Caixa: 403", recusou(rCaixa, 403), resumo(rCaixa));
  const rVendCom = await editarPres(A.tok.vend, p10.pres[0].id, { barcode: cv });
  check("Vendedor COM a chave grava: 2xx", ok2xx(rVendCom) && (await lerPres(p10.pres[0].id))?.barcode === cv, resumo(rVendCom));
  const rGer = await editarPres(A.tok.gerente, p10.pres[0].id, { barcode: null });
  check("Gerente geral limpa o código: 2xx", ok2xx(rGer), resumo(rGer));
  await editarPres(O, p10.pres[0].id, { barcode: cv });
  const rLer = await lerProduto(A.tok.vendSem, p10.id);
  check("Vendedor sem a chave LÊ o produto e vê o barcode da apresentação", ok2xx(rLer) && j(dados(rLer)).includes(cv), resumo(rLer));
  const rLerOwner = await lerProduto(O, p10.id);
  check("o GET do produto traz o campo barcode na apresentação", ok2xx(rLerOwner) && j(dados(rLerOwner)).includes(`"barcode":"${cv}"`), resumo(rLerOwner));

  console.log("  (i) outro tenant: não vê nem colide");
  const pB = await novoProduto(B, 1);
  const rB = await editarPres(B.tok.owner, pB.pres[0].id, { barcode: cv });
  check("o MESMO código em outra conta é aceito (a unicidade é por conta)", ok2xx(rB) && (await lerPres(pB.pres[0].id))?.barcode === cv, resumo(rB));
  const rBinvade = await editarPres(B.tok.owner, p10.pres[0].id, { barcode: codigoNovo() });
  check("o Dono de B não edita a apresentação de A: 404", recusou(rBinvade, 404), resumo(rBinvade));
  const rBlê = await lerProduto(B.tok.owner, p10.id);
  check("nem lê o produto de A: 404", recusou(rBlê, 404), resumo(rBlê));
  check("a apresentação de A segue com o código de A", (await lerPres(p10.pres[0].id))?.barcode === cv);
}

// ---------------------------------------------------------------------------
// Seção 3: gerar o código interno
// ---------------------------------------------------------------------------

async function secao3() {
  secaoAtual = "3";
  console.log("\n3. Gerar o código interno (POST /api/v1/emporio/presentations/barcode)");
  const O = A.tok.owner;
  const ean13Valido = (c: string) => /^\d{13}$/.test(c) && verificadorDoPadrao(c.slice(0, 12)) === Number(c[12]);

  const r1 = await gerar(O);
  const g1 = String(dados(r1)?.barcode ?? "");
  check("Dono gera: 2xx com barcode", ok2xx(r1) && g1 !== "", resumo(r1));
  check("tem 13 dígitos e começa com 20", /^20\d{11}$/.test(g1), g1);
  check("o dígito verificador confere (EAN-13)", ean13Valido(g1), g1);
  check("a resposta só traz o barcode (não cria nada)", Object.keys(dados(r1) ?? {}).join(",") === "barcode", j(dados(r1)));
  check("não gravou em nenhuma apresentação", (await comCodigo(A, g1)) === 0);
  const r2 = await gerar(O);
  const g2 = String(dados(r2)?.barcode ?? "");
  check("dois pedidos seguidos dão códigos diferentes", g2 !== "" && g2 !== g1, `${g1} e ${g2}`);
  check("o segundo também é válido e começa com 20", /^20\d{11}$/.test(g2) && ean13Valido(g2), g2);
  const cont = await (await prismaCru()).emporioCounter.findMany({ where: { tenant_id: A.tenantId } });
  check("o contador usa a chave codigo_de_barras", j(cont).includes("codigo_de_barras"), j(cont).slice(0, 200));

  console.log("  (a) pula o que já está em apresentação ativa");
  const n1 = Number(g2.slice(2, 12));
  const ocupa = (n: number) => ean13(`20${String(n).padStart(10, "0")}`);
  const p = await novoProduto(A, 3);
  const r1ok = await editarPres(O, p.pres[0].id, { barcode: ocupa(n1 + 1) });
  const r2ok = await editarPres(O, p.pres[1].id, { barcode: ocupa(n1 + 2) });
  check("preparação: os dois próximos códigos digitados à mão em apresentação ativa (código com 20 é aceito)", ok2xx(r1ok) && ok2xx(r2ok), `${resumo(r1ok)} | ${resumo(r2ok)}`);
  const r3 = await gerar(O);
  const g3 = String(dados(r3)?.barcode ?? "");
  check("o gerado não é nenhum dos dois ocupados", g3 !== "" && g3 !== ocupa(n1 + 1) && g3 !== ocupa(n1 + 2), g3);
  check("e é o seguinte livre (a sequência pulou os dois)", g3 === ocupa(n1 + 3), `${g3} contra ${ocupa(n1 + 3)}`);
  check("valido e começa com 20", ean13Valido(g3) && g3.startsWith("20"));
  check("nada foi gravado pelo gerar", (await comCodigo(A, g3)) === 0);

  console.log("  (b) permissão");
  const rSem = await gerar(A.tok.vendSem);
  check("Vendedor sem a chave: 403", recusou(rSem, 403), resumo(rSem));
  const rCx = await gerar(A.tok.caixa);
  check("Caixa: 403", recusou(rCx, 403), resumo(rCx));
  const rCom = await gerar(A.tok.vend);
  check("Vendedor com a chave: 2xx", ok2xx(rCom) && /^20\d{11}$/.test(String(dados(rCom)?.barcode ?? "")), resumo(rCom));
  const rGer = await gerar(A.tok.gerente);
  check("Gerente geral: 2xx", ok2xx(rGer), resumo(rGer));
  const rB = await gerar(B.tok.owner);
  check("outra conta tem o contador próprio: 2xx e código válido", ok2xx(rB) && ean13Valido(String(dados(rB)?.barcode ?? "")), resumo(rB));
}

// ---------------------------------------------------------------------------
// Seção 4: a corrida
// ---------------------------------------------------------------------------

async function secao4() {
  secaoAtual = "4";
  console.log("\n4. A corrida: duas gravações do mesmo código ao mesmo tempo, só uma passa");
  const O = A.tok.owner;

  console.log("  (a) duas edições em apresentações diferentes");
  let rodadasOk = 0;
  const detalhes: string[] = [];
  for (let k = 0; k < 5; k += 1) {
    const p = await novoProduto(A, 2);
    const c = codigoNovo();
    const [x, y] = await Promise.all([editarPres(O, p.pres[0].id, { barcode: c }), editarPres(O, p.pres[1].id, { barcode: c })]);
    const passou = [x, y].filter(ok2xx).length;
    const barrou = [x, y].filter((r) => recusou(r, 409, "barcode", "BARCODE_IN_USE")).length;
    const n = await comCodigo(A, c);
    if (passou === 1 && barrou === 1 && n === 1) rodadasOk += 1;
    else detalhes.push(`rodada ${k}: ${x.status}/${y.status}, ${n} no banco`);
  }
  check("5 rodadas de 2 edições simultâneas: sempre 1 grava, 1 leva 409 BARCODE_IN_USE, 1 linha no banco", rodadasOk === 5, detalhes.join("; "));

  console.log("  (b) duas criações em produtos diferentes");
  let criacoesOk = 0;
  const det2: string[] = [];
  for (let k = 0; k < 3; k += 1) {
    const pa = await novoProduto(A, 0);
    const pb = await novoProduto(A, 0);
    const c = codigoNovo();
    const [x, y] = await Promise.all([criarPres(O, pa.id, novaPres("Corrida A", { barcode: c })), criarPres(O, pb.id, novaPres("Corrida B", { barcode: c }))]);
    const passou = [x, y].filter(ok2xx).length;
    const barrou = [x, y].filter((r) => recusou(r, 409, "barcode", "BARCODE_IN_USE")).length;
    const n = await comCodigo(A, c);
    if (passou === 1 && barrou === 1 && n === 1) criacoesOk += 1;
    else det2.push(`rodada ${k}: ${x.status}/${y.status}, ${n} no banco`);
  }
  check("3 rodadas de 2 criações simultâneas: sempre 1 grava e 1 leva 409", criacoesOk === 3, det2.join("; "));

  console.log("  (c) editar e desarquivar ao mesmo tempo");
  const pd = await novoProduto(A, 2);
  const cd = codigoNovo();
  await editarPres(O, pd.pres[0].id, { barcode: cd });
  await arquivarPres(O, pd.pres[0].id, true);
  const [e, d] = await Promise.all([editarPres(O, pd.pres[1].id, { barcode: cd }), arquivarPres(O, pd.pres[0].id, false)]);
  const ativas = await (await prismaCru()).productPresentation.count({ where: { tenant_id: A.tenantId, barcode: cd, archived_at: null } });
  check("a editar e o desarquivar disputando o código: nunca duas ativas com ele", ativas <= 1 && [e, d].filter(ok2xx).length >= 1 && (ok2xx(e) !== ok2xx(d) || ativas === 1), `${e.status}/${d.status}, ${ativas} ativas`);
}

// ---------------------------------------------------------------------------
// Seção 5: o catálogo do balcão
// ---------------------------------------------------------------------------

async function secao5() {
  secaoAtual = "5";
  console.log("\n5. O catálogo do balcão traz o barcode por apresentação");
  const O = A.tok.owner;
  const { carregarCatalogoDeVenda } = await import("@/app/(dashboard)/emporio/_components/catalogo-venda");
  const { codigoParaBusca } = await import("@/lib/emporio/codigo-de-barras").catch(() => ({ codigoParaBusca: null as null | ((s: string) => string | null) }));

  const dois = await novoProduto(A, 2);
  const cSeg = codigoNovo();
  await editarPres(O, dois.pres[1].id, { barcode: cSeg });
  const arq = await novoProduto(A, 2);
  const cArq = codigoNovo();
  const cArqPres = codigoNovo();
  await editarPres(O, arq.pres[0].id, { barcode: cArq });
  await editarPres(O, arq.pres[1].id, { barcode: cArqPres });
  await arquivarPres(O, arq.pres[1].id, true);
  const upc = await novoProduto(A, 1);
  // outro UPC-A que o da seção 2 (a mesma conta, e o código é único entre as ativas)
  const upc12 = `12345678901${verificadorDoPadrao("12345678901")}`;
  await editarPres(O, upc.pres[0].id, { barcode: upc12 });
  const prodArq = await novoProduto(A, 1);
  const cProdArq = codigoNovo();
  await editarPres(O, prodArq.pres[0].id, { barcode: cProdArq });
  await arquivarProd(O, prodArq.id, true);

  const cat = await carregarCatalogoDeVenda(A.db, [A.loja]);
  const produtos: Dado[] = cat.produtos as Dado[];
  const achar = (id: string) => produtos.find((p) => p.id === id);

  const pDois = achar(dois.id);
  check("o produto de duas apresentações está no catálogo", !!pDois && pDois.apresentacoes.length === 2, j(pDois?.apresentacoes));
  const ap = (id: string) => pDois?.apresentacoes.find((a: Dado) => a.id === id);
  check("a primeira apresentação (sem código) vem com barcode null", ap(dois.pres[0].id)?.barcode === null, j(ap(dois.pres[0].id)));
  check("a SEGUNDA traz o barcode dela, e a leitura casa com ela, não com a padrão", ap(dois.pres[1].id)?.barcode === cSeg, j(ap(dois.pres[1].id)));
  const todas: Dado[] = produtos.flatMap((p) => p.apresentacoes.map((a: Dado) => ({ ...a, produto: p.id })));
  const lida = todas.filter((a) => a.barcode === cSeg);
  check("procurando o código lido, só uma apresentação casa: a segunda do produto certo", lida.length === 1 && lida[0].id === dois.pres[1].id && lida[0].produto === dois.id, j(lida));

  const pArq = achar(arq.id);
  check("a apresentação arquivada não vem, nem o código dela", !!pArq && pArq.apresentacoes.length === 1 && pArq.apresentacoes[0].barcode === cArq && !todas.some((a) => a.barcode === cArqPres), j(pArq?.apresentacoes));
  check("o produto arquivado fica fora do catálogo, com o código dele", !achar(prodArq.id) && !todas.some((a) => a.barcode === cProdArq));

  const pUpc = achar(upc.id);
  check("o código vem como foi gravado (13 dígitos, com o 0)", pUpc?.apresentacoes[0]?.barcode === `0${upc12}`, j(pUpc?.apresentacoes));
  if (typeof codigoParaBusca === "function") {
    const lido = codigoParaBusca(upc12);
    check("o leitor de um produto americano (12 dígitos) acha a mesma apresentação gravada com o 0", !!lido && todas.filter((a) => a.barcode === lido).length === 1 && todas.find((a) => a.barcode === lido)?.id === upc.pres[0].id, String(lido));
  } else {
    check("codigoParaBusca importável para a leitura de 12 dígitos", false);
  }
  check("toda apresentação do catálogo tem o campo barcode (string ou null)", todas.length > 0 && todas.every((a) => "barcode" in a && (a.barcode === null || typeof a.barcode === "string")));
}

// ---------------------------------------------------------------------------
// Seção 6: as configurações do balcão
// ---------------------------------------------------------------------------

const DEFAULTS_BALCAO = {
  shortcut_product: "F2", shortcut_customer: "F4", shortcut_seller: "F8", shortcut_payment: "F9", shortcut_close: "Ctrl+Enter",
  show_shortcut_legend: true, label_default_format: "a4",
  label_a4_columns: 3, label_a4_rows: 7, label_a4_width: 63.5, label_a4_height: 38.1, label_a4_margin_top: 15.15, label_a4_margin_left: 7.2, label_a4_gap_x: 2.5, label_a4_gap_y: 0,
  label_roll_width: 40, label_roll_height: 25, label_roll_columns: 1, label_roll_gap_x: 2,
};

async function secao6() {
  secaoAtual = "6";
  console.log("\n6. Configurações do balcão e das etiquetas (PATCH /api/v1/emporio/settings/balcao)");
  const O = A.tok.owner;
  const ler = (tok: string) => chamar(tok, R.settings, "GET", "emporio/settings");
  const salvar = (tok: string, corpo: Dado) => chamar(tok, R.balcao, "PATCH", "emporio/settings/balcao", corpo);
  const logs = async (): Promise<Dado[]> => (await prismaCru()).emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "configuracoes.balcao" }, orderBy: { created_at: "asc" } });
  const a4 = (o: Dado = {}) => ({ label_a4_columns: 3, label_a4_rows: 7, label_a4_width: 63.5, label_a4_height: 38.1, label_a4_margin_top: 15.15, label_a4_margin_left: 7.2, label_a4_gap_x: 2.5, label_a4_gap_y: 0, ...o });

  console.log("  (a) ler com os padrões");
  const r0 = await ler(O);
  const d0 = dados(r0);
  check("GET settings: 2xx", ok2xx(r0), resumo(r0));
  const sc = d0?.shortcuts ?? {};
  check("atalhos padrão: F2, F4, F8, F9, Ctrl+Enter", sc.produto === "F2" && sc.cliente === "F4" && sc.vendedor === "F8" && sc.pagamento === "F9" && sc.fechar === "Ctrl+Enter", j(sc));
  check("legenda ligada e formato padrão a4", d0?.show_shortcut_legend === true && d0?.label_default_format === "a4", j({ l: d0?.show_shortcut_legend, f: d0?.label_default_format }));
  const la = d0?.label_a4 ?? {};
  check("folha A4: 3 x 7, 63,5 x 38,1 mm, margens 15,15 e 7,2, 2,5 entre colunas, 0 entre linhas",
    la.columns === 3 && la.rows === 7 && perto(la.width, 63.5) && perto(la.height, 38.1) && perto(la.margin_top, 15.15) && perto(la.margin_left, 7.2) && perto(la.gap_x, 2.5) && perto(la.gap_y, 0) , j(la));
  const lr = d0?.label_roll ?? {};
  check("rolo: 40 x 25 mm, 1 coluna, 2 mm entre colunas", perto(lr.width, 40) && perto(lr.height, 25) && lr.columns === 1 && perto(lr.gap_x, 2), j(lr));
  check("as medidas vêm como número, não texto", typeof la.width === "number" && typeof la.margin_top === "number" && typeof lr.gap_x === "number");
  const rVend = await ler(A.tok.vend);
  check("quem não é Dono lê (o balcão precisa das teclas): 2xx com shortcuts", ok2xx(rVend) && dados(rVend)?.shortcuts?.fechar === "Ctrl+Enter", resumo(rVend));

  console.log("  (b) salvar teclas e medidas");
  const n0 = (await logs()).length;
  const corpo = {
    shortcut_product: "Alt+1", shortcut_customer: "Alt+2", shortcut_seller: "Alt+3", shortcut_payment: "Alt+4", shortcut_close: "F2",
    show_shortcut_legend: false, label_default_format: "rolo",
    ...a4({ label_a4_columns: 2, label_a4_rows: 5, label_a4_width: 90, label_a4_height: 50.5, label_a4_margin_top: 10, label_a4_margin_left: 12.5, label_a4_gap_x: 3, label_a4_gap_y: 1.5 }),
    label_roll_width: 50, label_roll_height: 30, label_roll_columns: 2, label_roll_gap_x: 3.5,
  };
  const rs = await salvar(O, corpo);
  check("Dono salva tudo de uma vez: 2xx", ok2xx(rs), resumo(rs));
  const d1 = dados(await ler(O));
  check("as teclas gravadas voltam no GET", d1?.shortcuts?.produto === "Alt+1" && d1?.shortcuts?.cliente === "Alt+2" && d1?.shortcuts?.vendedor === "Alt+3" && d1?.shortcuts?.pagamento === "Alt+4" && d1?.shortcuts?.fechar === "F2", j(d1?.shortcuts));
  check("legenda desligada e formato rolo", d1?.show_shortcut_legend === false && d1?.label_default_format === "rolo");
  const a = d1?.label_a4 ?? {};
  check("folha A4 gravada", a.columns === 2 && a.rows === 5 && perto(a.width, 90) && perto(a.height, 50.5) && perto(a.margin_top, 10) && perto(a.margin_left, 12.5) && perto(a.gap_x, 3) && perto(a.gap_y, 1.5), j(a));
  const r = d1?.label_roll ?? {};
  check("rolo gravado", perto(r.width, 50) && perto(r.height, 30) && r.columns === 2 && perto(r.gap_x, 3.5), j(r));
  check("a resposta do PATCH também traz as configurações novas", dados(rs)?.shortcuts?.produto === "Alt+1" && dados(rs)?.label_roll?.columns === 2, j(dados(rs)).slice(0, 200));
  const bd = await (await prismaCru()).emporioSettings.findFirst({ where: { tenant_id: A.tenantId } });
  check("no banco, as colunas planas", bd?.shortcut_product === "Alt+1" && bd?.label_default_format === "rolo" && bd?.label_a4_columns === 2 && bd?.label_roll_columns === 2 && bd?.show_shortcut_legend === false, j(bd).slice(0, 200));
  const rParcial = await salvar(O, { shortcut_customer: "Alt+5" });
  check("payload parcial muda só o campo enviado", ok2xx(rParcial) && dados(await ler(O))?.shortcuts?.cliente === "Alt+5" && dados(await ler(O))?.shortcuts?.produto === "Alt+1", resumo(rParcial));
  const rVazio = await salvar(O, {});
  check("corpo vazio não derruba (2xx sem mudar nada, ou 422), nunca 500", rVazio.status === 200 || rVazio.status === 422 || rVazio.status === 201, resumo(rVazio));
  const gerente = await salvar(A.tok.gerente, { shortcut_customer: "Alt+6" });
  check("Gerente geral também salva (tem a chave conta)", ok2xx(gerente) && dados(await ler(O))?.shortcuts?.cliente === "Alt+6", resumo(gerente));

  console.log("  (c) tecla inválida ou repetida: 422 no campo");
  const antesTeclas = j(dados(await ler(O))?.shortcuts);
  for (const [campo, tecla] of [["shortcut_product", "F5"], ["shortcut_customer", "Shift+C"], ["shortcut_seller", "F1"], ["shortcut_payment", "Alt+0"], ["shortcut_close", "Enter"], ["shortcut_product", ""], ["shortcut_close", "f2"]] as const) {
    const rt = await salvar(O, { [campo]: tecla });
    check(`${campo} = "${tecla}" (fora da lista): 422 em ${campo}`, recusou(rt, 422, campo), resumo(rt));
  }
  check("as recusas não mudaram nada", j(dados(await ler(O))?.shortcuts) === antesTeclas);
  const rRep = await salvar(O, { shortcut_product: "F9", shortcut_payment: "F9" });
  check("produto e pagamento ambos F9 no mesmo envio: 422 no campo da SEGUNDA (shortcut_payment)", recusou(rRep, 422, "shortcut_payment"), resumo(rRep));
  const rRep2 = await salvar(O, { shortcut_customer: "F8", shortcut_seller: "F8" });
  check("cliente e vendedor ambos F8: 422 em shortcut_seller", recusou(rRep2, 422, "shortcut_seller"), resumo(rRep2));
  check("o envio repetido não gravou nem a primeira", j(dados(await ler(O))?.shortcuts) === antesTeclas);
  const rContraGravado = await salvar(O, { shortcut_seller: "Alt+1" });
  check("tecla já gravada em outra ação (payload parcial): 422 no campo enviado", recusou(rContraGravado, 422, "shortcut_seller"), resumo(rContraGravado));
  const rTroca = await salvar(O, { shortcut_product: "Alt+7", shortcut_customer: "Alt+1" });
  check("trocar duas teclas no mesmo envio (a de um vira a do outro) é válido", ok2xx(rTroca) && dados(await ler(O))?.shortcuts?.produto === "Alt+7" && dados(await ler(O))?.shortcuts?.cliente === "Alt+1", resumo(rTroca));

  console.log("  (d) folha A4: medidas e grade que cabe");
  const antesA4 = j(dados(await ler(O))?.label_a4);
  const campoA4 = (rr: Resp) => String(rr.corpo?.error?.field ?? "").startsWith("label_a4_");
  const rCols = await salvar(O, a4({ label_a4_columns: 4, label_a4_width: 63.5, label_a4_margin_left: 7.2, label_a4_gap_x: 2.5 }));
  check("4 colunas de 63,5 mm não cabem nos 210: 422 num campo label_a4_*", rCols.status === 422 && campoA4(rCols), resumo(rCols));
  const rLin = await salvar(O, a4({ label_a4_rows: 8 }));
  check("8 linhas de 38,1 mm com margem de 15,15 não cabem nos 297: 422 num campo label_a4_*", rLin.status === 422 && campoA4(rLin), resumo(rLin));
  const rMargem = await salvar(O, a4({ label_a4_margin_left: 150 }));
  check("margem da esquerda de 150 mm: não cabe, 422 num campo label_a4_*", rMargem.status === 422 && campoA4(rMargem), resumo(rMargem));
  check("as três recusas não gravaram nada", j(dados(await ler(O))?.label_a4) === antesA4);
  const rJusto = await salvar(O, a4({ label_a4_columns: 1, label_a4_rows: 1, label_a4_width: 205, label_a4_height: 282, label_a4_margin_left: 5, label_a4_margin_top: 15, label_a4_gap_x: 0, label_a4_gap_y: 0 }));
  check("grade que ocupa exatamente 210 x 297 mm cabe: 2xx", ok2xx(rJusto), resumo(rJusto));
  const rPassa = await salvar(O, a4({ label_a4_columns: 1, label_a4_rows: 1, label_a4_width: 205.01, label_a4_height: 282, label_a4_margin_left: 5, label_a4_margin_top: 15, label_a4_gap_x: 0, label_a4_gap_y: 0 }));
  check("um centésimo de milímetro a mais na largura (210,01): 422", rPassa.status === 422 && campoA4(rPassa), resumo(rPassa));
  const rPassaAlt = await salvar(O, a4({ label_a4_columns: 1, label_a4_rows: 1, label_a4_width: 205, label_a4_height: 282.01, label_a4_margin_left: 5, label_a4_margin_top: 15, label_a4_gap_x: 0, label_a4_gap_y: 0 }));
  check("um centésimo a mais na altura (297,01): 422", rPassaAlt.status === 422 && campoA4(rPassaAlt), resumo(rPassaAlt));
  await salvar(O, a4());
  for (const [campo, valor] of [["label_a4_width", 0], ["label_a4_height", -5], ["label_a4_columns", 0], ["label_a4_rows", -1], ["label_a4_margin_top", -1], ["label_a4_margin_left", -0.5], ["label_a4_gap_x", -1], ["label_a4_gap_y", -2], ["label_a4_columns", 2.5], ["label_a4_width", "larga"]] as const) {
    const rr = await salvar(O, a4({ [campo]: valor }));
    check(`${campo} = ${j(valor)}: 422 em ${campo}`, recusou(rr, 422, campo), resumo(rr));
  }
  const rZeroOk = await salvar(O, a4({ label_a4_gap_x: 0, label_a4_gap_y: 0, label_a4_margin_top: 0, label_a4_margin_left: 0 }));
  check("espaço entre etiquetas e margens podem ser zero: 2xx", ok2xx(rZeroOk), resumo(rZeroOk));
  const rDec = await salvar(O, a4({ label_a4_height: 38.15 }));
  check("a altura aceita décimo e centésimo de milímetro (38,15)", ok2xx(rDec) && perto(dados(await ler(O))?.label_a4?.height, 38.15), resumo(rDec));

  console.log("  (e) rolo: colunas de 1 a 3 e medidas positivas");
  for (const cols of [1, 2, 3]) {
    const rr = await salvar(O, { label_roll_columns: cols });
    check(`rolo com ${cols} coluna(s): 2xx`, ok2xx(rr), resumo(rr));
  }
  const rCol4 = await salvar(O, { label_roll_columns: 4 });
  check("rolo com 4 colunas: 422 em label_roll_columns", recusou(rCol4, 422, "label_roll_columns"), resumo(rCol4));
  const rCol0 = await salvar(O, { label_roll_columns: 0 });
  check("rolo com 0 colunas: 422 em label_roll_columns", recusou(rCol0, 422, "label_roll_columns"), resumo(rCol0));
  for (const [campo, valor] of [["label_roll_width", 0], ["label_roll_height", -3], ["label_roll_gap_x", -1], ["label_roll_columns", 1.5]] as const) {
    const rr = await salvar(O, { [campo]: valor });
    check(`${campo} = ${j(valor)}: 422 em ${campo}`, recusou(rr, 422, campo), resumo(rr));
  }
  const rGap0 = await salvar(O, { label_roll_gap_x: 0 });
  check("espaço entre colunas do rolo zero: 2xx", ok2xx(rGap0), resumo(rGap0));

  console.log("  (f) formato padrão e legenda");
  const rFmt = await salvar(O, { label_default_format: "pdf" });
  check("formato fora de a4 e rolo: 422 em label_default_format", recusou(rFmt, 422, "label_default_format"), resumo(rFmt));
  const rLeg = await salvar(O, { show_shortcut_legend: "sim" });
  check("legenda que não é booleano: 422 em show_shortcut_legend", recusou(rLeg, 422, "show_shortcut_legend"), resumo(rLeg));
  const rFmtOk = await salvar(O, { label_default_format: "a4", show_shortcut_legend: true });
  check("a4 e legenda ligada: 2xx", ok2xx(rFmtOk) && dados(await ler(O))?.label_default_format === "a4" && dados(await ler(O))?.show_shortcut_legend === true, resumo(rFmtOk));

  console.log("  (g) permissão: a chave conta");
  const antesPerm = j(dados(await ler(O)));
  const rV = await salvar(A.tok.vend, { shortcut_product: "Alt+9" });
  check("Vendedor (mesmo com todas as chaves, sem a conta): 403", recusou(rV, 403), resumo(rV));
  const rVs = await salvar(A.tok.vendSem, { shortcut_product: "Alt+9" });
  check("Vendedor sem chaves: 403", recusou(rVs, 403), resumo(rVs));
  const rCx = await salvar(A.tok.caixa, { show_shortcut_legend: false });
  check("Caixa: 403", recusou(rCx, 403), resumo(rCx));
  check("as recusas de permissão não mudaram nada", j(dados(await ler(O))) === antesPerm);

  console.log("  (h) Histórico configuracoes.balcao com antes e depois");
  const nAntes = (await logs()).length;
  const rH = await salvar(O, { shortcut_product: "Alt+8", label_roll_width: 45 });
  check("preparação: salvar de novo", ok2xx(rH), resumo(rH));
  const lg = await logs();
  check("cada gravação com sucesso escreve uma linha configuracoes.balcao", lg.length === nAntes + 1 && lg.length > n0, `${n0} -> ${nAntes} -> ${lg.length}`);
  const ult = lg[lg.length - 1];
  check("a linha traz antes e depois (Alt+7 para Alt+8)", !!ult && j(ult.changes).includes("Alt+7") && j(ult.changes).includes("Alt+8"), j(ult?.changes));
  check("o resumo não diz null nem undefined", !!ult && !/null|undefined/.test(String(ult.summary)), String(ult?.summary));
  const rBad = await salvar(O, { shortcut_product: "F5" });
  check("a recusa não escreve Histórico", rBad.status === 422 && (await logs()).length === lg.length);

  console.log("  (i) voltar ao padrão");
  const rPad = await salvar(O, DEFAULTS_BALCAO);
  check("enviar os padrões: 2xx", ok2xx(rPad), resumo(rPad));
  const dp = dados(await ler(O));
  check("tudo volta aos valores de fábrica", dp?.shortcuts?.produto === "F2" && dp?.shortcuts?.cliente === "F4" && dp?.shortcuts?.vendedor === "F8" && dp?.shortcuts?.pagamento === "F9" && dp?.shortcuts?.fechar === "Ctrl+Enter" && dp?.show_shortcut_legend === true && dp?.label_default_format === "a4" && dp?.label_a4?.columns === 3 && dp?.label_a4?.rows === 7 && perto(dp?.label_a4?.height, 38.1) && perto(dp?.label_roll?.width, 40) && dp?.label_roll?.columns === 1, j(dp).slice(0, 300));

  console.log("  (j) outro tenant");
  const dB = dados(await chamar(B.tok.owner, R.settings, "GET", "emporio/settings"));
  check("a outra conta segue com os padrões (nada vazou)", dB?.shortcuts?.produto === "F2" && dB?.label_roll?.columns === 1);
  await salvar(O, { shortcut_product: "Alt+1" });
  const dB2 = dados(await chamar(B.tok.owner, R.settings, "GET", "emporio/settings"));
  check("gravar na conta A não muda a B", dB2?.shortcuts?.produto === "F2");
  const rBsalva = await salvar(B.tok.owner, { shortcut_product: "Alt+1" });
  check("a mesma tecla na conta B é aceita e só vale lá", ok2xx(rBsalva) && dados(await ler(O))?.shortcuts?.produto === "Alt+1", resumo(rBsalva));
  const logsB = await (await prismaCru()).emporioAuditLog.count({ where: { tenant_id: B.tenantId, action: "configuracoes.balcao" } });
  check("o Histórico da conta B tem só a escrita dela", logsB === 1, String(logsB));
}

// ---------------------------------------------------------------------------
// Limpeza e main
// ---------------------------------------------------------------------------

async function limpar() {
  if (tenantIds.length === 0) return;
  secaoAtual = "limpeza";
  const { prisma } = await import("@/lib/prisma");
  const modelos = [
    "emporioAuditLog", "stockMovement", "presentationPrice", "productPresentation", "emporioProduct", "product", "productCategory", "emporioCounter",
    "emporioSettings", "userEstablishment", "establishment", "user", "tenantProfile", "tenantFeature",
  ];
  for (let passada = 0; passada < 2; passada += 1) {
    for (const id of tenantIds) {
      for (const m of modelos) {
        try {
          await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: id } });
        } catch {
          // modelo ausente nesta versão do schema, ou referência que a próxima passada resolve: segue
        }
      }
    }
  }
  for (const id of tenantIds) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
  const sobrou = await prisma.tenant.count({ where: { id: { in: tenantIds } } });
  check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
}

async function main() {
  try {
    await rodar("1 pura", secao1Pura);
    await comBanco(async () => {
      await rodar("montagem", async () => {
        secaoAtual = "montagem";
        A = await montar("A");
        B = await montar("B");
      });
      if (!A || !B) {
        check("a montagem dos tenants terminou (sem ela as seções 2 a 6 não rodam)", false);
        return;
      }
      await rodar("2", secao2);
      await rodar("3", secao3);
      await rodar("4", secao4);
      await rodar("5", secao5);
      await rodar("6", secao6);
    });
  } finally {
    await limpar();
  }
  console.log("\nChecagens por seção:");
  for (const [s, c] of Object.entries(contagem)) console.log(`  seção ${s}: ${c.ok + c.falhas} (${c.ok} verdes, ${c.falhas} vermelhas)`);
  const total = Object.values(contagem).reduce((s, c) => s + c.ok + c.falhas, 0);
  console.log(falhas === 0 ? `\n✅ M123 verde (${total} checagens)` : `\n❌ M123: ${falhas} falha(s) em ${total} checagens`);
  // As rotas de token deixam o Redis aberto: o processo não encerra sozinho.
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
