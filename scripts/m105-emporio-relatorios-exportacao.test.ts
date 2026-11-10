import "./_env-local";
import { papelDeFixture, papelFinanceiro, vincularTodas, virarGestor, virarVendedor } from "./_emporio-papel";
import { AsyncLocalStorage } from "node:async_hooks";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório): relatórios do dinheiro em planilha (Q269), vendas por origem (Q268),
 * custo efetivo do cartão (Q272), contas sem vencimento (Q273) e a limpeza da dívida 2.63.
 * Roda: `npm run test:m105`
 *
 * Escrita da spec (docs/superpowers/specs/2026-11-09-emporio-relatorios-e-limpeza-design.md) e dos
 * blocos Interfaces e Step 1 das Tasks 2 e 3 do plano, sem ler a implementação. Módulo, rota, campo ou
 * função ainda inexistente vira recusa `ACTION_AUSENTE`, status 0 ou asserção que falha, nunca erro de
 * sintaxe. Os módulos novos (`@/lib/csv`, `pctEfetivoMes`) entram por `import()` com o especificador numa variável.
 *
 * Seções: 1 o helper de CSV (sem banco), 2 as quatro rotas com `format=csv`, 3 contas sem vencimento,
 * 4 vendas por origem, 5 custo do cartão e `pctEfetivoMes`, 6 cursor dos pedidos decididos, 7 isolamento.
 *
 * O que os briefs calavam e esta suíte ASSUME:
 * - `gerarCsv` não coloca separador de milhar; número vira duas casas (1234.5 vira `1234,50`); `null` vira vazio;
 *   a primeira linha é o título das colunas, unidas por `;`;
 * - `Response.text()` descarta o BOM, então o BOM da resposta é conferido pelos bytes (EF BB BF);
 * - o nome do arquivo segue `attachment; filename="<nome>-AAAA-MM-DD.csv"` (a data é a de `hoje`); a rota
 *   do a receber por idade se chama `a-receber-por-idade` (Q269), as outras só precisam do padrão;
 * - os títulos das colunas das quatro rotas contêm as palavras do brief (cliente, loja, vencimento...), sem acento
 *   obrigatório onde há `[ií]`;
 * - a conta sem vencimento nasce de uma compra a prazo pela rota POST /purchases (a conta criada direto por
 *   Prisma não entra no a pagar por vencimento) e depois tem o `due_date` zerado por Prisma, porque nenhuma
 *   action do Empório cria conta sem vencimento hoje; as contas são achadas no CSV pelos valores (60,00 e 80,00);
 * - `without_due` fica no topo de `data` do a pagar por vencimento e da projeção (`{ count, total, entries }`);
 * - o relatório de vendas devolve `by_origin` no topo e dentro de cada linha de `por_loja`
 *   (o JSON de hoje chama a quebra por loja de `por_loja`); `net` e `freight` em reais; `share_pct` com 2 casas
 *   de tolerância 0,01; o período é o dia de hoje em Brasília;
 * - `card_cost` fica no topo do Resultado da Loja e em cada item de `stores[]` da visão `all`;
 * - a venda de 300 no cartão é crédito parcelado 3x a 3,5% (como a m104), com 10,50 de taxa; a antecipação
 *   de 9,00 é `anteciparAction` recebendo o previsto menos 9;
 * - `pctEfetivoMes(custoCent, previstoCent, diasPonderados)` devolve o % ao mês; `diasPonderados` é a média dos
 *   dias entre a operação e o previsto de cada parcela, ponderada pelo líquido previsto. O oráculo é o
 *   `effective_pct_month` que `anteciparAction` devolve (tolerância 0,01), mais a proporcionalidade (dobrar o
 *   custo dobra o %, dobrar os dias divide por dois);
 * - o cursor dos decididos é `before` (a data) MAIS `before_id` (o id do último da página anterior), a página
 *   é de 200, a ordem é `decided_at` decrescente e depois `id` decrescente. O NOME `before_id` é palpite:
 *   o contrato não dizia como o desempate viaja. Se a implementação escolher outro, ajustar aqui;
 * - tenant B não vê nem exporta nada do A: respostas CSV e JSON sem textos do A, e 404 para loja do A.
 */

let falhas = 0;
let totalChecks = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  totalChecks += 1;
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

const perto = (a: unknown, b: number, tol = 0.005) => typeof a === "number" && Math.abs(a - b) < tol;
const j = (x: unknown): string => JSON.stringify(x) ?? "undefined";
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));
const DIA = 86_400_000;
const SENHA = "SenhaForte#2026";
const BOM = "﻿";
const brDia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const meioDia = (s: string) => new Date(`${s}T12:00:00Z`);
const somaDias = (s: string, k: number) => new Date(meioDia(s).getTime() + k * DIA).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.round((meioDia(ate).getTime() - meioDia(de).getTime()) / DIA);
const dia = (x: Date | string | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const cent = (x: unknown) => Math.round(n(x) * 100);
const HOJE = brDia(new Date());
const mesAtual = () => HOJE.slice(0, 7);

console.log("📊 M105: Módulo 39 (Meu Empório), relatórios por origem, planilha, custo do cartão, contas sem vencimento e limpeza 2.63\n");

// ------------------------------------------------------------------ 1 (sem banco)
async function secao1() {
  console.log("1. O helper de CSV (Q269)");
  const especificador = "@/lib/csv";
  let M: Record<string, Dado> = {};
  try {
    M = (await import(especificador)) as Record<string, Dado>;
  } catch (e) {
    check("o módulo @/lib/csv carrega", false, e instanceof Error ? e.message : String(e));
  }
  const { gerarCsv, respostaCsv } = M;
  check("@/lib/csv exporta gerarCsv e respostaCsv", typeof gerarCsv === "function" && typeof respostaCsv === "function");
  if (typeof gerarCsv === "function") {
    type L = { nome: string; valor: number | null; data: Date | null };
    const colunas = [
      { titulo: "Cliente", valor: (l: L) => l.nome },
      { titulo: "Valor", valor: (l: L) => l.valor },
      { titulo: "Data", valor: (l: L) => l.data },
    ];
    const linhas: L[] = [
      { nome: "Silva; Irmãos", valor: 1234.5, data: new Date("2026-11-09T12:00:00Z") },
      { nome: 'Ele disse "oi"', valor: 0.5, data: null },
      { nome: "Duas\nlinhas", valor: null, data: new Date("2026-01-05T12:00:00Z") },
    ];
    const csv: string = gerarCsv(colunas, linhas);
    check("começa com o BOM", typeof csv === "string" && csv.startsWith(BOM), j(String(csv).slice(0, 10)));
    const sem = String(csv).replace(BOM, "");
    check("a primeira linha são os títulos, com ponto e vírgula", sem.split("\r\n")[0] === "Cliente;Valor;Data", j(sem.split("\r\n")[0]));
    check('"Silva; Irmãos" vai entre aspas (o ; não quebra a coluna)', sem.includes('"Silva; Irmãos";'), j(sem));
    check("1234.5 vira 1234,50 (vírgula, duas casas, sem milhar)", sem.includes(";1234,50;"), j(sem));
    check("a data vira DD/MM/AAAA", sem.includes(";09/11/2026"), j(sem));
    check('aspas internas são dobradas: "Ele disse ""oi"""', sem.includes('"Ele disse ""oi"""'), j(sem));
    check("0.5 vira 0,50", sem.includes(";0,50;"), j(sem));
    check("campo com quebra de linha vai entre aspas", sem.includes('"Duas\nlinhas"'), j(sem));
    check("data nula vira campo vazio", sem.includes(";0,50;\r\n") || sem.includes(";0,50;\r"), j(sem));
    check("o fim de linha é \\r\\n (nenhum \\n solto fora das aspas)", sem.replace(/"[^"]*"/g, "").replace(/\r\n/g, "").indexOf("\n") === -1 && sem.includes("\r\n"), j(sem));
    const csvInj: string = gerarCsv([{ titulo: "T", valor: (l: { t: string }) => l.t }], [{ t: "\tabc" }, { t: "\rabc" }]);
    check("texto que começa com tab ganha apóstrofo", csvInj.includes("'\tabc"), j(csvInj));
    check("texto que começa com CR ganha apóstrofo", csvInj.includes("'\rabc"), j(csvInj));
    check("sem linhas, só os títulos", String(gerarCsv(colunas, [])).replace(BOM, "").split("\r\n")[0] === "Cliente;Valor;Data");
  }
  if (typeof respostaCsv === "function") {
    const res: Response = respostaCsv(`${BOM}A;B\r\n1;2\r\n`, "teste", new Date("2026-11-09T12:00:00Z"));
    check("respostaCsv: status 200 e Content-Type text/csv com charset utf-8", res.status === 200 && /^text\/csv;\s*charset=utf-8$/i.test(res.headers.get("content-type") ?? ""), res.headers.get("content-type") ?? "");
    check('respostaCsv: Content-Disposition attachment com filename="teste-2026-11-09.csv"', res.headers.get("content-disposition") === 'attachment; filename="teste-2026-11-09.csv"', res.headers.get("content-disposition") ?? "");
    const bytes = new Uint8Array(await res.arrayBuffer());
    check("respostaCsv: o corpo começa com os bytes do BOM (EF BB BF)", bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, j([...bytes.slice(0, 4)]));
  }

  const calendario = await import("@/lib/dia-calendario");
  const cartao = await import("@/lib/emporio/cartao");
  const antesDaVirada = new Date("2026-11-10T02:59:59.999Z");
  const depoisDaVirada = new Date("2026-11-10T03:00:00.000Z");
  check("o dia centralizado de Brasília ainda é 9 antes da meia-noite local", calendario.diaIsoEmBrasilia(antesDaVirada) === "2026-11-09");
  check("o CSV usa o mesmo dia centralizado de Brasília", M.diaIsoEmBrasilia(antesDaVirada) === "2026-11-09");
  check("o cartão mantém hojeEmBrasilia como meia-noite UTC do dia local", cartao.hojeEmBrasilia(antesDaVirada).toISOString() === "2026-11-09T00:00:00.000Z");
  check("o dia centralizado avança na meia-noite local", calendario.diaIsoEmBrasilia(depoisDaVirada) === "2026-11-10");
  check("a validação aceita 28/02/2026 e rejeita 31/02/2026", calendario.ehDataCalendario("2026-02-28") && !calendario.ehDataCalendario("2026-02-31"));
  check("a soma de dias cruza a virada de mês nos dois sentidos", calendario.somarDiasCalendario("2026-02-28", 1) === "2026-03-01" && calendario.somarDiasCalendario("2026-03-01", -1) === "2026-02-28");
  check("a conversão mantém a data de calendário em meia-noite UTC", calendario.dataCalendario("2026-03-01").toISOString() === "2026-03-01T00:00:00.000Z");
}

// ------------------------------------------------------------------ rotas
type Resp = { status: number; corpo: Dado; texto: string; headers: Headers; bytes: Uint8Array };
async function chamar(tok: string, rota: () => Promise<Dado>, url: string, metodo: "GET" | "POST" = "GET", corpo?: unknown): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  let m: Dado;
  try {
    m = await rota();
  } catch (e) {
    return { status: 0, corpo: { import_error: e instanceof Error ? e.message.slice(0, 120) : String(e) }, texto: "", headers: new Headers(), bytes: new Uint8Array() };
  }
  const req = new Request(`http://localhost/api/v1/${url}`, { method: metodo, headers: { "content-type": "application/json" }, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req));
  const buf = new Uint8Array(await res.arrayBuffer());
  const texto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
  let corpoJson: Dado = {};
  try {
    corpoJson = JSON.parse(texto);
  } catch {
    corpoJson = {};
  }
  return { status: res.status, corpo: corpoJson, texto, headers: res.headers, bytes: buf };
}
const R_ = {
  aging: () => import("@/app/api/v1/emporio/finance/reports/receivables-aging/route"),
  porVenc: () => import("@/app/api/v1/emporio/finance/reports/payables-by-due/route"),
  porLugar: () => import("@/app/api/v1/emporio/finance/reports/cash-by-place/route"),
  projecao: () => import("@/app/api/v1/emporio/finance/projection/route"),
  vendas: () => import("@/app/api/v1/emporio/reports/sales/route"),
  resultado: () => import("@/app/api/v1/emporio/result/route"),
  compras: () => import("@/app/api/v1/emporio/purchases/route"),
};

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const bcrypt = (await import("bcryptjs")).default;
  const caminhos = {
    catalogo: "@/lib/actions/emporio-catalogo",
    estoque: "@/lib/actions/emporio-estoque",
    vendas: "@/lib/actions/emporio-vendas",
    caixa: "@/lib/actions/emporio-caixa",
    cartoes: "@/lib/actions/emporio-cartoes",
    antecipacao: "@/lib/actions/emporio-antecipacao",
    resultado: "@/lib/actions/emporio-resultado",
    relatorios: "@/lib/actions/emporio-relatorios",
    aprovacoes: "@/lib/actions/emporio-aprovacoes",
  };
  const carregar = async (c: string): Promise<Record<string, Acao>> => {
    try {
      return (await import(c)) as Record<string, Acao>;
    } catch {
      return {};
    }
  };
  const C = await carregar(caminhos.catalogo);
  const E = await carregar(caminhos.estoque);
  const V = await carregar(caminhos.vendas);
  const X = await carregar(caminhos.caixa);
  const K = await carregar(caminhos.cartoes);
  const AN = await carregar(caminhos.antecipacao);
  const RS = await carregar(caminhos.resultado);
  const RL = await carregar(caminhos.relatorios);
  const AP = await carregar(caminhos.aprovacoes);
  const stamp = Date.now();
  const tenantIds: string[] = [];
  const hash = await bcrypt.hash(SENHA, 4);
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M105 ${rotulo} ${stamp}`, document: `M105${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
      });
      tenantIds.push(t.id);
      await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
      await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
      await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
      const mkUser = async (suf: string, role: Role, extra: Dado = {}) => {
        const email = `m105-${rotulo}-${suf}-${stamp}@teste.local`;
        const u = await prisma.user.create({
          data: { tenant_id: t.id, name: `M105 ${rotulo} ${suf}`, email, password_hash: hash, role, ...papelDeFixture(role), ...extra },
        });
        const tok = String(
          (
            (await (
              await rotaTok.POST(
                new Request("http://localhost/api/v1/auth/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: SENHA }) }),
              )
            ).json()) as Dado
          )?.data?.access_token ?? "",
        );
        return { ator: { id: u.id, role } as Ator, tok };
      };
      return { t, mkUser };
    };
    const TA = await mkTenant("A");
    const TB = await mkTenant("B");
    const owner = await TA.mkUser("own", "OWNER");
    const admin = await TA.mkUser("adm", "ADMIN");
    const fin = await TA.mkUser("fin", "OPERADOR", papelFinanceiro());
    const vend = await TA.mkUser("vnd", "OPERADOR");
    const gestor = await TA.mkUser("ges", "OPERADOR");
    const ownerB = await TB.mkUser("own", "OWNER");
    const finB = await TB.mkUser("fin", "OPERADOR", papelFinanceiro());
    const db = prismaForTenant(TA.t.id);
    const dbB = prismaForTenant(TB.t.id);
    const dbx = db as Dado;
    const cat = await db.productCategory.create({ data: scoped({ name: "M105 categoria" }) });
    const cf = (await (await import("@/lib/actions/emporio-clientes")).garantirConsumidorFinal(db)).id;

    const ausente = (nome: string): R => ({ ok: false, code: "ACTION_AUSENTE", message: `action ausente: ${nome}`, status: 501 });
    const chamarAcao = (mods: Record<string, Acao>[], cliente: Dado, nome: string, ...args: unknown[]): Promise<R> => {
      for (const m of mods) if (typeof m[nome] === "function") return m[nome](cliente, ...args);
      return Promise.resolve(ausente(nome));
    };
    const dados = (r: R): Dado => (r.ok ? r.data : undefined);
    const cc = (nome: string, ...a: unknown[]) => chamarAcao([C], db, nome, ...a);
    const ee = (nome: string, ...a: unknown[]) => chamarAcao([E], db, nome, ...a);
    const vv = (nome: string, ...a: unknown[]) => chamarAcao([V], db, nome, ...a);
    const xx = (nome: string, ...a: unknown[]) => chamarAcao([X], db, nome, ...a);
    const kk = (nome: string, ...a: unknown[]) => chamarAcao([K], db, nome, ...a);
    const aa = (nome: string, ...a: unknown[]) => chamarAcao([AN], db, nome, ...a);
    const rs = (nome: string, ...a: unknown[]) => chamarAcao([RS], db, nome, ...a);
    const rl = (nome: string, ...a: unknown[]) => chamarAcao([RL], db, nome, ...a);
    const rlB = (nome: string, ...a: unknown[]) => chamarAcao([RL], dbB, nome, ...a);
    const rsB = (nome: string, ...a: unknown[]) => chamarAcao([RS], dbB, nome, ...a);
    const ap = (nome: string, ...a: unknown[]) => chamarAcao([AP], db, nome, ...a);
    const rodar = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        check(`${nome}: terminou sem exceção`, false, e instanceof Error ? e.message : String(e));
      }
    };

    const mkLoja = async (nome: string) => {
      const l = dados(await cc("criarEstabelecimentoAction", owner.ator, { name: `M105 ${nome}`, kind: "ponto_venda" }));
      if (!l) throw new Error(`não criou a loja ${nome}`);
      return l as { id: string };
    };
    const LD = await mkLoja("Loja dinheiro");
    const LS = await mkLoja("Loja origem");
    const LC = await mkLoja("Loja cartao");
    const LN = await mkLoja("Loja sem cartao");
    const lojas = [LD, LS, LC, LN];
    await vincularTodas(prisma, TA.t.id, [vend.ator.id, gestor.ator.id], lojas.map((l) => l.id));
    await virarGestor(prisma, gestor.ator.id);
    await virarVendedor(prisma, vend.ator.id);
    const { abrirTurnoDeTeste } = await import("./_emporio-turno");
    const turnos: Record<string, string> = {};
    for (const L of lojas) turnos[L.id] = (await abrirTurnoDeTeste(db, owner.ator, L.id)).cash_register_id;

    const mkConta = async (rotulo: string) => {
      const id = dados(await xx("criarContaAction", admin.ator, { name: `M105 Conta ${rotulo} ${stamp}`, bank: "Sicredi" }))?.id as string;
      if (!id) throw new Error(`conta ${rotulo}`);
      return id;
    };

    // ---- Produto: R$ 50 o quilo
    const P = dados(await cc("criarProdutoEmporioAction", owner.ator, { name: `M105 Ração ${stamp}`, category_id: cat.id, base_unit: "quilograma" }));
    if (!P) throw new Error("produto");
    const rAp = await cc("criarApresentacaoAction", owner.ator, P.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!rAp.ok) throw new Error("apresentação");
    const presId = rAp.data.id as string;
    for (const L of lojas) {
      const rp = await cc("definirPrecoAction", admin.ator, { establishment_id: L.id, presentation_id: presId, price: 50 });
      if (!rp.ok) throw new Error("preço");
      const ri = await ee("implantarEstoqueAction", owner.ator, { establishment_id: L.id, emporio_product_id: P.id, sealed: [], loose_qty: 1000, unit_cost: 10 });
      if (!ri.ok) throw new Error("implantar");
    }
    let chaveSeq = 0;
    const chave = (p: string) => `m105-${p}-${stamp}-${(chaveSeq += 1)}`;
    const itens = (qtd: number) => [{ emporio_product_id: P.id, presentation_id: presId, quantity: qtd }]; // qtd x 50
    const vender = (loja: { id: string }, qtd: number, payments: Dado[], over: Dado = {}) =>
      vv("venderAction", admin.ator, { operation_key: chave("v"), establishment_id: loja.id, customer_id: cf, items: itens(qtd), payments, cash_register_id: turnos[loja.id], ...over });
    const contaPix = await mkConta("pix");
    const pix = (amount: number) => ({ kind: "pix", amount, bank_account_id: contaPix });

    // =================================================================== 1
    try {
      await secao1();
    } catch (e) {
      check("seção 1: terminou sem exceção", false, e instanceof Error ? e.message : String(e));
    }

    // Fixtures dos relatórios do dinheiro (Loja dinheiro): um fiado de cliente com ; no nome.
    const NOME_CLIENTE = `M105 Silva; Irmãos ${stamp}`;
    const cliente = (await prisma.emporioCustomer.create({ data: { tenant_id: TA.t.id, name: NOME_CLIENTE, fiado_limit: 5000 } as Dado })) as Dado;
    const rFiado = await vender(LD, 2, [{ kind: "fiado", amount: 100, due_date: meioDia(somaDias(HOJE, -10)) }], { customer_id: cliente.id });
    check("(fixture) venda no fiado de 100 para o cliente de nome com ponto e vírgula", rFiado.ok, j(rFiado).slice(0, 300));
    await vender(LD, 1, [{ kind: "dinheiro", amount: 50 }]);

    // =================================================================== 2
    console.log("\n2. As quatro rotas com format=csv (Q269)");
    await rodar("seção 2", async () => {
      const de = somaDias(HOJE, -14);
      const ate = somaDias(HOJE, 30);
      const rotas: { rotulo: string; rota: () => Promise<Dado>; url: string; titulos: RegExp[]; arquivo?: string; exige403: boolean }[] = [
        { rotulo: "a receber por idade", rota: R_.aging, url: "emporio/finance/reports/receivables-aging", titulos: [/cliente/i, /loja/i, /vencimento/i, /valor/i], arquivo: "a-receber-por-idade", exige403: true },
        { rotulo: "a pagar por vencimento", rota: R_.porVenc, url: `emporio/finance/reports/payables-by-due?de=${de}&ate=${ate}`, titulos: [/semana/i, /conta/i, /vencimento/i, /valor/i, /situa/i], exige403: true },
        { rotulo: "posição por lugar", rota: R_.porLugar, url: `emporio/finance/reports/cash-by-place?de=${somaDias(HOJE, -30)}&ate=${HOJE}`, titulos: [/lugar/i, /tipo/i, /saldo/i], exige403: false },
        { rotulo: "projeção", rota: R_.projecao, url: "emporio/finance/projection?days=30", titulos: [/semana/i, /entradas/i, /sa[ií]das/i, /saldo/i], exige403: false },
      ];
      const comFormato = (u: string) => `${u}${u.includes("?") ? "&" : "?"}format=csv`;
      for (const r of rotas) {
        const csv = await chamar(fin.tok, r.rota, comFormato(r.url));
        check(`${r.rotulo}: format=csv devolve 200 text/csv`, csv.status === 200 && /^text\/csv/i.test(csv.headers.get("content-type") ?? ""), `${csv.status} ${csv.headers.get("content-type")} ${csv.texto.slice(0, 120)}`);
        check(`${r.rotulo}: Content-Disposition attachment com o nome AAAA-MM-DD.csv`, /^attachment; filename="[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.csv"$/.test(csv.headers.get("content-disposition") ?? ""), csv.headers.get("content-disposition") ?? "");
        if (r.arquivo) check(`${r.rotulo}: o arquivo se chama ${r.arquivo}-${HOJE}.csv`, (csv.headers.get("content-disposition") ?? "").includes(`filename="${r.arquivo}-`), csv.headers.get("content-disposition") ?? "");
        check(`${r.rotulo}: o corpo começa com o BOM (bytes)`, csv.bytes[0] === 0xef && csv.bytes[1] === 0xbb && csv.bytes[2] === 0xbf, j([...csv.bytes.slice(0, 4)]));
        const linhas = csv.texto.replace(BOM, "").split("\r\n").filter((l) => l !== "");
        check(`${r.rotulo}: a primeira linha traz os títulos esperados, separados por ;`, linhas.length > 0 && linhas[0].includes(";") && r.titulos.every((t) => t.test(linhas[0])), linhas[0] ?? "");
        const json = await chamar(fin.tok, r.rota, r.url);
        check(`${r.rotulo}: sem format, o JSON segue igual (200 com data)`, json.status === 200 && !!json.corpo?.data, `${json.status} ${json.texto.slice(0, 100)}`);
        const v = await chamar(vend.tok, r.rota, comFormato(r.url));
        const vj = await chamar(vend.tok, r.rota, r.url);
        check(`${r.rotulo}: o Vendedor recebe, no CSV, a mesma recusa do JSON, e não 200`, v.status === vj.status && v.status !== 200 && v.status !== 0, `csv ${v.status} json ${vj.status}`);
        if (r.exige403) check(`${r.rotulo}: o Vendedor recebe 403 no CSV`, v.status === 403, `${v.status}`);
      }
      const ag = await chamar(fin.tok, R_.aging, comFormato("emporio/finance/reports/receivables-aging"));
      const linhaCli = ag.texto.split("\r\n").find((l) => l.includes("Irmãos")) ?? "";
      check('o a receber por idade em CSV traz o cliente com ; entre aspas ("M105 Silva; Irmãos ...")', linhaCli.includes(`"${NOME_CLIENTE}"`), linhaCli || ag.texto.slice(0, 200));
      check("e o valor 100 sai com vírgula decimal (100,00), sem ponto", /(^|;)100,00(;|$)/.test(linhaCli), linhaCli);
      const agL = await chamar(fin.tok, R_.aging, comFormato(`emporio/finance/reports/receivables-aging?establishment_id=${LS.id}`));
      check("os mesmos filtros valem no CSV: pela loja sem o fiado, o cliente não aparece", agL.status === 200 && !agL.texto.includes("Irmãos"), `${agL.status} ${agL.texto.slice(0, 200)}`);
    });

    // =================================================================== 3
    console.log("\n3. Contas sem vencimento (2.50, Q273)");
    let semVencId = "";
    await rodar("seção 3", async () => {
      // Conta a pagar nascida de uma compra a prazo pela rota (a conta criada direto por Prisma não entra no relatório).
      const mk = async (amount: number, due: Date | null, lojaId = LD.id) => {
        const r = await chamar(owner.tok, R_.compras, "emporio/purchases", "POST", {
          operation_key: chave("compra"), establishment_id: lojaId, purchased_at: new Date().toISOString(), received: false,
          items: [{ emporio_product_id: P.id, presentation_id: presId, quantity: 1, item_total: amount }],
          payment: { kind: "a_prazo", due_date: `${somaDias(HOJE, 5)}T12:00:00Z` },
        });
        const e = (await dbx.financialEntry.findFirst({ where: { related_module: "emporio", related_id: String(r.corpo?.data?.id), entry_type: "expense" } })) as Dado;
        if (!e) throw new Error(`compra de ${amount}: ${r.status} ${r.texto.slice(0, 200)}`);
        await dbx.financialEntry.update({ where: { id: e.id }, data: { due_date: due } });
        return e;
      };
      await mk(60, meioDia(somaDias(HOJE, 5)));
      const url = `emporio/finance/reports/payables-by-due?de=${HOJE}&ate=${somaDias(HOJE, 30)}`;
      const pjUrl = "emporio/finance/projection?days=30";
      const somaSemanasPag = (d: Dado) => ((d?.weeks ?? []) as Dado[]).reduce((s, w) => s + n(w.payables?.total), 0);
      const antes = (await chamar(fin.tok, R_.porVenc, url)).corpo?.data as Dado;
      const projAntes = (await chamar(fin.tok, R_.projecao, pjUrl)).corpo?.data as Dado;
      check("(fixture) antes, o a pagar tem só a conta com vencimento (60)", perto(antes?.total, 60), j(antes?.total));
      check("antes: without_due existe e está vazio (count 0, total 0)", antes?.without_due?.count === 0 && perto(antes?.without_due?.total, 0), j(antes?.without_due));
      const sem = await mk(80, null);
      semVencId = sem.id;
      const depois = (await chamar(fin.tok, R_.porVenc, url)).corpo?.data as Dado;
      check("depois: a conta sem vencimento aparece em without_due (count 1, total 80)", depois?.without_due?.count === 1 && perto(depois?.without_due?.total, 80), j(depois?.without_due));
      check("without_due.entries traz a conta (o id dela aparece)", Array.isArray(depois?.without_due?.entries) && depois.without_due.entries.length === 1 && j(depois.without_due.entries).includes(sem.id), j(depois?.without_due?.entries));
      check("a soma do a pagar com vencimento continua igual à anterior (60)", perto(depois?.total, n(antes?.total)) && perto(depois?.total, 60), `${antes?.total} -> ${depois?.total}`);
      check("e a soma das semanas também não mudou", perto(somaSemanasPag({ weeks: depois?.weeks?.map((w: Dado) => ({ payables: { total: w.total } })) }), 60), j(depois?.weeks?.map((w: Dado) => w.total)));
      const projDepois = (await chamar(fin.tok, R_.projecao, pjUrl)).corpo?.data as Dado;
      check("a projeção traz a conta sem vencimento em without_due (count 1, total 80)", projDepois?.without_due?.count === 1 && perto(projDepois?.without_due?.total, 80), j(projDepois?.without_due));
      check("a projeção não conta a conta sem vencimento nas semanas (soma igual à de antes)", perto(somaSemanasPag(projDepois), somaSemanasPag(projAntes)), `${somaSemanasPag(projAntes)} -> ${somaSemanasPag(projDepois)}`);
      const csv = await chamar(fin.tok, R_.porVenc, `${url}&format=csv`);
      const linhas = csv.texto.split("\r\n").filter((l) => l !== "");
      const iSem = linhas.findIndex((l) => /(^|;)80,00(;|$)/.test(l));
      const iCom = linhas.findIndex((l) => /(^|;)60,00(;|$)/.test(l));
      check("o CSV do a pagar traz as duas contas (pelos valores 60,00 e 80,00) e a sem vencimento vem ao fim, depois da com vencimento", iSem >= 0 && iCom >= 0 && iSem > iCom, j(linhas));
      check("a linha da conta sem vencimento traz o valor 80,00", /(^|;)80,00(;|$)/.test(linhas[iSem] ?? ""), linhas[iSem] ?? "");
      // Fix round 1: a lista com vencimento no teto não pode esconder as contas sem vencimento. O teto vem por parâmetro
      // (só do teste, as rotas nunca o passam): com teto 1 e 2 contas com vencimento, a lista principal é cortada.
      await mk(70, meioDia(somaDias(HOJE, 6)));
      const FIN = await carregar("@/lib/actions/emporio-relatorios-financeiro");
      const noTeto = await chamarAcao([FIN], db, "lerAPagarPorVencimentoAction", fin.ator, { de: meioDia(HOJE), ate: meioDia(somaDias(HOJE, 30)), teto: 1 });
      const dt = dados(noTeto);
      check("(fixture) com teto 1 a lista principal é cortada (nota de teto e soma menor que 130)", !!dt && (dt.notes ?? []).some((x: string) => /5\.000/.test(x)) && n(dt.total) < 130, j(dt?.notes) + " " + j(dt?.total));
      check("e a conta sem vencimento continua em without_due (count 1, total 80), com a consulta própria", dt?.without_due?.count === 1 && perto(dt?.without_due?.total, 80), j(dt?.without_due));

      const mesmaSemana1 = await mk(31.25, meioDia(somaDias(HOJE, 1)));
      const mesmaSemana2 = await mk(42.75, meioDia(somaDias(HOJE, 2)));
      const vencida = await mk(19.5, meioDia(somaDias(HOJE, -10)));
      const outraLoja = await mk(999, meioDia(somaDias(HOJE, 1)), LS.id);
      const filtro = `${url}&establishment_id=${LD.id}`;
      const individual = await chamar(fin.tok, R_.porVenc, `${filtro}&format=csv`);
      const linhasInd = individual.texto.split("\r\n").filter(Boolean);
      const dataBr = (s: string) => s.split("-").reverse().join("/");
      for (const [e, deslocamento, valor] of [[mesmaSemana1, 1, "31,25"], [mesmaSemana2, 2, "42,75"], [vencida, -10, "19,50"]] as [Dado, number, string][]) {
        const linhasDaConta = linhasInd.filter((l) => l.includes(e.id));
        check(`CSV individual: ${valor} tem uma linha por entry_id com o próprio vencimento`, linhasDaConta.length === 1 && linhasDaConta[0].includes(dataBr(somaDias(HOJE, deslocamento))) && linhasDaConta[0].includes(`;${valor};`), j(linhasDaConta));
      }
      const linhaVencida = linhasInd.find((l) => l.includes(vencida.id)) ?? "";
      check("CSV individual: a vencida anterior ao período entra na primeira semana como Vencida", linhaVencida.includes(`${dataBr(HOJE)} a ${dataBr(somaDias(HOJE, 6))}`) && linhaVencida.endsWith(";Vencida"), linhaVencida);
      check("CSV individual: sem vencimento mantém o id e fica após as contas datadas", linhasInd.findIndex((l) => l.includes(sem.id)) > linhasInd.findIndex((l) => l.includes(vencida.id)) && (linhasInd.find((l) => l.includes(sem.id)) ?? "").includes(";Sem vencimento;80,00;"), j(linhasInd));
      check("CSV individual: o filtro de loja exclui a conta da outra loja", !individual.texto.includes(outraLoja.id) && !individual.texto.includes("999,00"), individual.texto);
      const agregado = (await chamar(fin.tok, R_.porVenc, filtro)).corpo?.data;
      check("JSON continua agregado por nome, sem detalhe por conta", !Object.hasOwn(agregado ?? {}, "entries") && agregado?.weeks?.[0]?.items?.length === 1 && perto(agregado?.weeks?.[0]?.total, 223.5), j(agregado?.weeks?.[0]));
      const detalheNoTeto = await chamarAcao([FIN], db, "lerAPagarPorVencimentoCsvAction", fin.ator, { de: meioDia(HOJE), ate: meioDia(somaDias(HOJE, 30)), establishment_id: LD.id, teto: 1 });
      const dc = dados(detalheNoTeto);
      check("CSV individual: detalhe respeita o teto e avisa o corte nas notas", detalheNoTeto.ok && dc?.entries?.filter((e: Dado) => e.due_date !== null).length === 1 && dc?.entries?.filter((e: Dado) => e.due_date === null).length === 1 && dc?.without_due?.count === 1 && dc?.notes?.length > 0, j(detalheNoTeto));
      if (detalheNoTeto.ok) {
        const { csvDoAPagarPorVencimento } = await import("@/lib/emporio/csv-financeiro");
        check("CSV individual: a planilha avisa o corte", csvDoAPagarPorVencimento(dc).includes("Nota: Mais de 5.000 contas pendentes"));
      }
    });

    // =================================================================== 4
    console.log("\n4. Vendas por origem (2.54, Q268)");
    await rodar("seção 4", async () => {
      const r1 = await vender(LS, 2, [pix(100)]);
      const r2 = await vender(LS, 1, [pix(50)]);
      const r3 = await vender(LS, 4, [pix(230)], { origin: "ecommerce", freight_amount: 30 });
      check("(fixture) duas vendas de balcão (100 e 50) e uma e-commerce (200 com frete 30)", r1.ok && r2.ok && r3.ok, j([r1, r2, r3]).slice(0, 400));
      const rel = await rl("relatorioDeVendasAction", admin.ator, { from: HOJE, to: HOJE, establishment_id: LS.id });
      const d = dados(rel);
      const linha = (x: Dado, o: string) => ((x?.by_origin ?? []) as Dado[]).find((l) => l.origin === o);
      check("o relatório de vendas ok", rel.ok, j(rel).slice(0, 200));
      check("by_origin traz sempre as duas linhas, balcao e ecommerce", Array.isArray(d?.by_origin) && d.by_origin.length === 2 && !!linha(d, "balcao") && !!linha(d, "ecommerce"), j(d?.by_origin));
      const b = linha(d, "balcao");
      const e = linha(d, "ecommerce");
      check("balcão: 2 vendas, líquido 150, frete 0, 42,86%", b?.count === 2 && perto(b?.net, 150) && perto(b?.freight, 0) && perto(b?.share_pct, 42.86, 0.011), j(b));
      check("e-commerce: 1 venda, líquido 200, frete 30, 57,14%", e?.count === 1 && perto(e?.net, 200) && perto(e?.freight, 30) && perto(e?.share_pct, 57.14, 0.011), j(e));
      const somaNet = ((d?.by_origin ?? []) as Dado[]).reduce((s, l) => s + n(l.net), 0);
      const totalLoja = ((d?.por_loja ?? []) as Dado[]).reduce((s, l) => s + n(l.total), 0);
      check("a soma do líquido por origem (350) bate com o total do relatório por loja", perto(somaNet, 350) && perto(totalLoja, 350), `${somaNet} contra ${totalLoja}`);
      check("as participações somam 100", perto(((d?.by_origin ?? []) as Dado[]).reduce((s, l) => s + n(l.share_pct), 0), 100, 0.011), j(d?.by_origin));
      const linhaLoja = ((d?.por_loja ?? []) as Dado[]).find((l) => l.establishment_id === LS.id);
      check("por_loja[].by_origin traz a mesma quebra da loja", !!linhaLoja && perto(linha(linhaLoja, "balcao")?.net, 150) && perto(linha(linhaLoja, "ecommerce")?.freight, 30) && perto(linha(linhaLoja, "ecommerce")?.net, 200), j(linhaLoja));
      const vazio = dados(await rl("relatorioDeVendasAction", admin.ator, { from: HOJE, to: HOJE, establishment_id: LN.id }));
      const bz = linha(vazio, "balcao");
      const ez = linha(vazio, "ecommerce");
      check("loja sem vendas: as duas linhas existem, com zero (e participação 0)", !!bz && !!ez && bz.count === 0 && ez.count === 0 && perto(bz.net, 0) && perto(ez.net, 0) && perto(bz.share_pct, 0) && perto(ez.share_pct, 0), j(vazio?.by_origin));
      const todas = dados(await rl("relatorioDeVendasAction", admin.ator, { from: HOJE, to: HOJE }));
      const lojaTodas = ((todas?.por_loja ?? []) as Dado[]).find((l) => l.establishment_id === LS.id);
      check("com todas as lojas, a loja de origem traz by_origin dela e o topo soma o dinheiro das outras", perto(linha(lojaTodas, "ecommerce")?.net, 200) && perto(linha(todas, "ecommerce")?.net, 200) && n(linha(todas, "balcao")?.net) >= 150, j(todas?.by_origin));
      const rota = await chamar(owner.tok, R_.vendas, `emporio/reports/sales?from=${HOJE}&to=${HOJE}&establishment_id=${LS.id}`);
      const bRota = linha(rota.corpo?.data, "balcao");
      check("a rota GET /reports/sales devolve by_origin (balcão 2 / 150, e-commerce frete 30)", rota.status === 200 && bRota?.count === 2 && perto(bRota?.net, 150) && perto(linha(rota.corpo?.data, "ecommerce")?.freight, 30), `${rota.status} ${rota.texto.slice(0, 200)}`);
      const cancel = await vender(LS, 2, [pix(100)]);
      if (cancel.ok) {
        const rc = await vv("cancelarVendaAction", gestor.ator, dados(cancel).id, { reason: "teste m105" });
        const depois = linha(dados(await rl("relatorioDeVendasAction", admin.ator, { from: HOJE, to: HOJE, establishment_id: LS.id })), "balcao");
        check("venda cancelada não entra em by_origin (balcão segue 2 / 150)", rc.ok && depois?.count === 2 && perto(depois?.net, 150), j([rc.ok, depois]));
      } else check("(fixture) venda extra para cancelar", false, j(cancel).slice(0, 200));
    });

    // =================================================================== 5
    console.log("\n5. Custo efetivo do cartão e pctEfetivoMes (2.61, Q272, 2.63)");
    await rodar("seção 5", async () => {
      const conta = await mkConta("cartao");
      const rAdq = await kk("criarAdquirenteAction", admin.ator, { name: `M105 Adq ${stamp}` });
      const adq = dados(rAdq)?.id as string;
      if (!adq) throw new Error(`adquirente: ${j(rAdq)}`);
      const rT = await kk("criarTaxaAction", admin.ator, {
        establishment_id: LC.id, acquirer_id: adq, brand: "visa_master", kind: "credito_parcelado", installments_from: 2, installments_to: 12,
        fee_pct: 3.5, days: 30, bank_account_id: conta, valid_from: meioDia("2020-01-01"),
      });
      if (!rT.ok) throw new Error(`taxa: ${j(rT)}`);
      const lerLoja = async (id: string) => dados(await rs("resultadoDaLojaAction", admin.ator, { establishment_id: id, month: mesAtual() }));
      const semCartao = await lerLoja(LN.id);
      check("mês sem cartão: card_cost existe, com zeros e pct nulo", !!semCartao?.card_cost && perto(semCartao.card_cost.card_sales, 0) && perto(semCartao.card_cost.mdr, 0) && perto(semCartao.card_cost.anticipation, 0) && semCartao.card_cost.pct === null, j(semCartao?.card_cost));
      const rV = await vender(LC, 6, [{ kind: "credito_parcelado", amount: 300, installments: 3, acquirer_id: adq, brand: "visa_master" }]);
      check("(fixture) venda de 300 no crédito 3x a 3,5%", rV.ok, j(rV).slice(0, 300));
      if (!rV.ok) return;
      const recs = ((await dbx.cardReceivable.findMany({ where: { sale_id: rV.data.id } })) as Dado[]).sort((x, y) => x.installment - y.installment);
      const antes = (await lerLoja(LC.id))?.card_cost;
      check("antes da antecipação: 300 no cartão, taxa 10,50, antecipação 0, pct 3,5", !!antes && perto(antes.card_sales, 300) && perto(antes.mdr, 10.5, 0.011) && perto(antes.anticipation, 0) && perto(antes.pct, 3.5, 0.011), j(antes));
      const S = recs.reduce((s, r) => s + cent(r.net_amount), 0);
      const rAnt = await aa("anteciparAction", admin.ator, { receivable_ids: recs.map((r) => r.id), operated_on: meioDia(HOJE), received_net: (S - 900) / 100 });
      check("(fixture) antecipou as três parcelas com custo de 9,00", rAnt.ok, j(rAnt).slice(0, 300));
      const depois = (await lerLoja(LC.id))?.card_cost;
      check("depois: card_cost 300 / 10,50 / 9 / 6,5", !!depois && perto(depois.card_sales, 300) && perto(depois.mdr, 10.5, 0.011) && perto(depois.anticipation, 9, 0.011) && perto(depois.pct, 6.5, 0.011), j(depois));
      const todas = dados(await rs("resultadoDaLojaAction", admin.ator, { establishment_id: "all", month: mesAtual() }));
      const linhaLC = ((todas?.stores ?? []) as Dado[]).find((s) => s.establishment_id === LC.id);
      check("a visão all traz card_cost em stores[] (a loja do cartão: 300 / 10,50 / 9 / 6,5)", !!linhaLC?.card_cost && perto(linhaLC.card_cost.card_sales, 300) && perto(linhaLC.card_cost.anticipation, 9, 0.011) && perto(linhaLC.card_cost.pct, 6.5, 0.011), j(linhaLC?.card_cost));
      const linhaLN = ((todas?.stores ?? []) as Dado[]).find((s) => s.establishment_id === LN.id);
      check("e a loja sem cartão aparece com pct nulo", linhaLN?.card_cost?.pct === null, j(linhaLN?.card_cost));
      check("o total da visão all traz card_cost (as vendas no cartão das lojas somadas, pct = (taxa + antecipação) / vendas)", !!todas?.card_cost && perto(todas.card_cost.card_sales, 300) && perto(todas.card_cost.pct, 6.5, 0.011), j(todas?.card_cost));
      const rota = await chamar(owner.tok, R_.resultado, `emporio/result?establishment_id=${LC.id}&month=${mesAtual()}`);
      check("a rota GET /result devolve card_cost", rota.status === 200 && perto(rota.corpo?.data?.card_cost?.pct, 6.5, 0.011), `${rota.status} ${rota.texto.slice(0, 200)}`);

      // pctEfetivoMes
      const especificador = "@/lib/emporio/cartao";
      let M: Record<string, Dado> = {};
      try {
        M = (await import(especificador)) as Record<string, Dado>;
      } catch (e) {
        check("o módulo @/lib/emporio/cartao carrega", false, e instanceof Error ? e.message : String(e));
      }
      const { pctEfetivoMes } = M;
      check("@/lib/emporio/cartao exporta pctEfetivoMes", typeof pctEfetivoMes === "function");
      if (typeof pctEfetivoMes === "function" && rAnt.ok) {
        const dias = recs.reduce((s, r) => s + cent(r.net_amount) * diasEntre(HOJE, dia(r.expected_on)), 0) / S;
        const esperado = n(rAnt.data.effective_pct_month);
        const f = pctEfetivoMes(900, S, dias) as number;
        check("pctEfetivoMes(custo 9,00 em centavos, previsto, dias ponderados) é igual ao effective_pct_month que a action devolve", typeof f === "number" && perto(f, esperado, 0.01) && esperado > 0, `${f} contra ${esperado} (dias ${dias})`);
        const dobroCusto = pctEfetivoMes(1800, S, dias) as number;
        const dobroDias = pctEfetivoMes(900, S, dias * 2) as number;
        check("dobrar o custo dobra o %; dobrar os dias divide por dois", perto(dobroCusto, f * 2, 0.02) && perto(dobroDias, f / 2, 0.02), `${f} ${dobroCusto} ${dobroDias}`);
        const lista = dados(await aa("listarAntecipacoesAction", admin.ator, {}));
        const item = ((Array.isArray(lista) ? lista : (lista?.items ?? [])) as Dado[]).find((x) => x.id === rAnt.data.id);
        check("e a lista de antecipações devolve o mesmo % da função", !!item && perto(item.effective_pct_month, f, 0.01), j(item?.effective_pct_month));
      }
    });

    // =================================================================== 6
    console.log("\n6. Cursor dos pedidos decididos, com desempate por id (2.63)");
    await rodar("seção 6", async () => {
      const base = Date.now() - 3_000_000_000;
      const dec = (i: number, quando: number) => ({
        tenant_id: TA.t.id, requested_by_user_id: fin.ator.id, entry_ids: ["x"], total: 1, status: i % 2 ? "aprovado" : "recusado",
        establishment_id: LD.id, decided_at: new Date(base + quando * 1000), decided_by_user_id: owner.ator.id,
      });
      // 202 pedidos; os de índice 1 e 2 caem no MESMO instante, e são o par que atravessa a fronteira da página de 200.
      const dados_ = Array.from({ length: 202 }, (_, i) => dec(i, i === 1 ? 2 : i));
      const criados: Dado[] = await (prisma as Dado).emporioPaymentRequest.createManyAndReturn({ data: dados_, select: { id: true, decided_at: true } });
      const ids = new Set(criados.map((c) => c.id as string));
      const empate = criados.filter((c) => new Date(c.decided_at).getTime() === base + 2000);
      check("(fixture) dois pedidos decididos no mesmo decided_at", empate.length === 2, String(empate.length));
      const p1 = await ap("listarPedidosDePagamentoAction", fin.ator, { status: "decididos" });
      const d1: Dado[] = p1.ok ? p1.data : [];
      check("a primeira página traz 200 decididos, do mais novo ao mais antigo", d1.length === 200 && d1.every((p, i) => i === 0 || new Date(d1[i - 1].decided_at).getTime() >= new Date(p.decided_at).getTime()), j([p1.ok, d1.length]));
      const vistos: string[] = d1.map((p) => p.id);
      let pag = d1;
      for (let i = 0; i < 5 && pag.length === 200; i++) {
        const ult = pag[pag.length - 1];
        const pn = await ap("listarPedidosDePagamentoAction", fin.ator, { status: "decididos", before: ult.decided_at, before_id: ult.id });
        pag = pn.ok ? pn.data : [];
        vistos.push(...pag.map((p) => p.id));
      }
      const meus = vistos.filter((id) => ids.has(id));
      check("percorrendo as páginas, nenhum pedido se repete", new Set(vistos).size === vistos.length, `${vistos.length} vistos, ${new Set(vistos).size} únicos`);
      check("e nenhum se perde: os 202 aparecem (inclusive o par empatado na fronteira)", new Set(meus).size === 202, `${new Set(meus).size} de 202`);
      check("os dois pedidos empatados aparecem, um em cada página", empate.every((e) => vistos.includes(e.id as string)), j(empate.map((e) => e.id)));
      await (prisma as Dado).emporioPaymentRequest.deleteMany({ where: { id: { in: [...ids] } } });
    });

    // =================================================================== 7
    console.log("\n7. Isolamento entre tenants");
    await rodar("seção 7", async () => {
      const textosDoA = ["Irmãos", "M105 Loja"];
      const comFormato = (u: string) => `${u}${u.includes("?") ? "&" : "?"}format=csv`;
      const urls: [string, () => Promise<Dado>, string][] = [
        ["a receber por idade", R_.aging, "emporio/finance/reports/receivables-aging"],
        ["a pagar por vencimento", R_.porVenc, `emporio/finance/reports/payables-by-due?de=${HOJE}&ate=${somaDias(HOJE, 30)}`],
        ["posição por lugar", R_.porLugar, `emporio/finance/reports/cash-by-place?de=${somaDias(HOJE, -30)}&ate=${HOJE}`],
        ["projeção", R_.projecao, "emporio/finance/projection?days=30"],
      ];
      for (const [rotulo, rota, url] of urls) {
        const b = await chamar(finB.tok, rota, comFormato(url));
        check(`o tenant B exporta ${rotulo} em CSV sem nenhuma linha do A`, b.status === 200 && textosDoA.every((t) => !b.texto.includes(t)), `${b.status} ${b.texto.slice(0, 160)}`);
      }
      const bv = (await chamar(finB.tok, R_.porVenc, urls[1][2])).corpo?.data as Dado;
      check("o a pagar do B não traz a conta sem vencimento do A (without_due vazio)", bv?.without_due?.count === 0 && perto(bv?.without_due?.total, 0), j(bv?.without_due));
      const bp = (await chamar(finB.tok, R_.projecao, urls[3][2])).corpo?.data as Dado;
      check("a projeção do B também não", bp?.without_due?.count === 0, j(bp?.without_due));
      const vB = await rlB("relatorioDeVendasAction", ownerB.ator, { from: HOJE, to: HOJE });
      const linhasB = ((dados(vB)?.by_origin ?? []) as Dado[]);
      check("o relatório de vendas do B tem by_origin zerado (nada do e-commerce do A)", vB.ok && linhasB.length === 2 && linhasB.every((l) => l.count === 0 && perto(l.net, 0) && perto(l.freight, 0)), j(vB).slice(0, 300));
      const vBA = await rlB("relatorioDeVendasAction", ownerB.ator, { from: HOJE, to: HOJE, establishment_id: LS.id });
      check("o B pedindo a loja do A no relatório de vendas: 404", !vBA.ok && vBA.status === 404, j(vBA).slice(0, 200));
      const rBA = await rsB("resultadoDaLojaAction", ownerB.ator, { establishment_id: LC.id, month: mesAtual() });
      check("o B pedindo o Resultado da loja do A (card_cost): 404", !rBA.ok && rBA.status === 404, j(rBA).slice(0, 200));
      const rotaBA = await chamar(ownerB.tok, R_.vendas, `emporio/reports/sales?from=${HOJE}&to=${HOJE}&establishment_id=${LS.id}`);
      check("pela rota, o B pedindo a loja do A: 404", rotaBA.status === 404, `${rotaBA.status} ${rotaBA.texto.slice(0, 160)}`);
      void semVencId;
    });
  } finally {
    const p = prisma as Dado;
    for (const id of tenantIds) {
      try {
        await p.tenant.delete({ where: { id } });
        continue;
      } catch {
        // o cascade esbarra em Restrict (venda aponta para a taxa, antecipação para a conta): limpa na ordem
      }
      try {
        await p.emporioPaymentRequest?.deleteMany({ where: { tenant_id: id } });
        await p.cashMovement.deleteMany({ where: { tenant_id: id } });
        await p.cardReceivable.deleteMany({ where: { tenant_id: id } });
        await p.cardAnticipation?.deleteMany({ where: { tenant_id: id } });
        await p.cashCount.deleteMany({ where: { tenant_id: id } });
        await p.cashTransfer.deleteMany({ where: { tenant_id: id } });
        await p.emporioCheck.deleteMany({ where: { tenant_id: id } });
        await p.stockMovement.deleteMany({ where: { tenant_id: id } });
        await p.emporioSalePayment.deleteMany({ where: { tenant_id: id } });
        await p.cardFeeRate?.deleteMany({ where: { tenant_id: id } });
        await p.cardAcquirer?.deleteMany({ where: { tenant_id: id } });
        await p.emporioSaleReturnItem.deleteMany({ where: { tenant_id: id } });
        await p.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, replaces_sale_id: null } });
        await p.emporioSaleReturn.deleteMany({ where: { tenant_id: id } });
        await p.emporioSaleItem.deleteMany({ where: { tenant_id: id } });
        await p.emporioSale.deleteMany({ where: { tenant_id: id } });
        await p.stockLimit.deleteMany({ where: { tenant_id: id } });
        await p.shoppingItem.deleteMany({ where: { tenant_id: id } });
        await p.financialEntry.deleteMany({ where: { tenant_id: id } });
        await p.presentationPrice.deleteMany({ where: { tenant_id: id } });
        await p.productPresentation.deleteMany({ where: { tenant_id: id } });
        await p.userEstablishment.deleteMany({ where: { tenant_id: id } });
        await p.emporioProduct.deleteMany({ where: { tenant_id: id } });
        await p.product.deleteMany({ where: { tenant_id: id } });
        await p.establishment.deleteMany({ where: { tenant_id: id } });
        await p.bankAccount.deleteMany({ where: { tenant_id: id } });
        await p.emporioCustomer.deleteMany({ where: { tenant_id: id } });
        await p.contact.deleteMany({ where: { tenant_id: id } });
        await p.productCategory.deleteMany({ where: { tenant_id: id } });
        await p.property.deleteMany({ where: { tenant_id: id } });
        await p.tenant.delete({ where: { id } });
      } catch (e) {
        falhas += 1;
        console.log(`  ❌ limpeza do tenant ${id} falhou: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
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
    console.log(falhas === 0 ? `\n✅ M105 verde (${totalChecks} checagens)` : `\n❌ M105: ${falhas} falha(s) em ${totalChecks} checagens`);
    process.exit(falhas === 0 ? 0 : 1);
  });
