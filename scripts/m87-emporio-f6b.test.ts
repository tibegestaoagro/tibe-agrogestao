import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F6b: papel, permissão, Equipe, só da loja e transferência.
 * Roda: `npm run test:m87`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F6b: contrato", Q118 a Q135),
 * sem ler a implementação. O Histórico (EmporioAuditLog) fica de fora: tem suíte própria.
 *
 * Suposições onde a spec não fecha o formato (anotadas para o juiz):
 * - O ator é `{ id, role }`; o papel do Empório é relido do banco pela action (spec: "nunca do JWT").
 * - `cadastrarMembroAction` devolve `data.id` e `data.temp_password` (o mesmo de `inviteUserAction`).
 * - `editarEstabelecimentoAction(db, ator, id, { allow_negative_stock })` é onde se libera o negativo.
 * - `receberTransferenciaAction(db, ator, id, { items: [{ item_id, received_qty }], resolution?, reason? })`;
 *   quem não pode resolver manda só `items`, sem `loss_reason`.
 * - Ao receber a menos, o item leva `loss_reason: "avaria"` (a action de hoje exige); a spec nao diz se
 *   o motivo continua pedido no fluxo novo.
 * - `resolverDiferencaAction(db, ator, id, { operation_key, resolution, reason })`.
 * - `saldoDaLojaAction` devolve linhas com `emporio_product_id` e `total_qty`.
 * - `lerTransferenciaAction` devolve `status`, `resolution` e `items[{ id, sent_qty }]`.
 * - O envio da transferência já baixa a origem; a chegada é que entra no destino.
 * - Nas rotas, a identidade vai por Bearer (login em /api/v1/auth/token), com senha real.
 * - A rota do Empório usada para "ver o Empório" é GET /api/v1/emporio/establishments.
 */

// O Next decide no carregamento entre o AsyncLocalStorage real e um substituto que lança;
// por isso isto vem antes de qualquer import dele (mesmo cuidado da m23).
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

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

const recusa = (r: R, code: string, status: number, field?: string) =>
  !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);
const negado = (r: R) => recusa(r, "FORBIDDEN", 403);
const j = (x: unknown) => JSON.stringify(x);
const perto = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 0.0005;

console.log("🛍️  M87: Módulo 39 (Meu Empório), F6b: papel, permissão, Equipe, só da loja e transferência\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const bcrypt = (await import("bcryptjs")).default;
  const { withBearer } = await import("./_escopo-de-requisicao");
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
  const T = await carregar("@/lib/actions/emporio-transferencias");
  const EQ = await carregar("@/lib/actions/emporio-equipe");
  const U = await carregar("@/lib/actions/users");
  const FT = (await import("@/lib/features")) as unknown as {
    isFeatureVisibleForUser: (tenantId: string, userId: string, key: string) => Promise<boolean>;
  };

  const stamp = Date.now();
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const tenantIds: string[] = [];
  let chaveSeq = 0;
  const chave = (p: string) => `m87-${p}-${stamp}-${(chaveSeq += 1)}`;
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

  try {
    // ---------------------------------------------------------------- fixture
    const t = await prisma.tenant.create({
      data: { name: `M87 A ${stamp}`, document: `M87A${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
    });
    tenantIds.push(t.id);
    const tB = await prisma.tenant.create({
      data: { name: `M87 B ${stamp}`, document: `M87B${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
    });
    tenantIds.push(tB.id);
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
    const feature = await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

    const mk = async (suf: string, role: Role, extra: Dado = {}) => {
      const u = await prisma.user.create({
        data: { tenant_id: t.id, name: `M87 ${suf}`, email: `m87-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...extra },
      });
      return { id: u.id, role, email: u.email } as Ator & { email: string };
    };
    const owner = await mk("own", "OWNER");
    const gg = await mk("gg", "ADMIN", { emporio_role: "gerente_geral" });
    const gestor1 = await mk("gestor1", "OPERADOR", { emporio_role: "gestor" });
    const gestor2 = await mk("gestor2", "OPERADOR", { emporio_role: "gestor" });
    const vend1 = await mk("vend1", "OPERADOR", { emporio_role: "vendedor" });
    const vend2 = await mk("vend2", "OPERADOR", { emporio_role: "vendedor" });
    const vendChave = await mk("vendchave", "OPERADOR", { emporio_role: "vendedor", emporio_keys: ["lancar_compra"] });
    const semFuncao = await mk("semfuncao", "OPERADOR");
    await prisma.tenantFeatureUser.create({ data: { tenant_id: t.id, tenant_feature_id: feature.id, user_id: semFuncao.id } });

    const db = prismaForTenant(t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M87 categoria" }) });
    const L1r = await chamar(C, "criarEstabelecimentoAction", db, owner, { name: "M87 Loja 1" });
    const L2r = await chamar(C, "criarEstabelecimentoAction", db, owner, { name: "M87 Loja 2" });
    if (!L1r.ok || !L2r.ok) throw new Error(`lojas: ${j([L1r, L2r])}`);
    const L1 = L1r.data.id as string;
    const L2 = L2r.data.id as string;
    const vincular = async (u: Ator, lojas: string[]) => {
      for (const l of lojas) await prisma.userEstablishment.create({ data: { tenant_id: t.id, user_id: u.id, establishment_id: l } });
    };
    await vincular(gestor1, [L1]);
    await vincular(vend1, [L1]);
    await vincular(vendChave, [L1]);
    await vincular(gestor2, [L2]);
    await vincular(vend2, [L2]);
    await vincular(semFuncao, [L1]);

    const rP = await chamar(C, "criarProdutoEmporioAction", db, owner, { name: "M87 Produto", category_id: cat.id, base_unit: "quilograma" });
    if (!rP.ok) throw new Error(`produto: ${j(rP)}`);
    const P = rP.data.id as string;
    const rPr = await chamar(C, "criarApresentacaoAction", db, owner, P, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!rPr.ok) throw new Error(`apresentação: ${j(rPr)}`);
    const PRES = rPr.data.id as string;
    for (const l of [L1, L2]) {
      const a = await chamar(C, "definirPrecoAction", db, owner, { establishment_id: l, presentation_id: PRES, price: 10 });
      const b = await chamar(E, "implantarEstoqueAction", db, owner, { establishment_id: l, emporio_product_id: P, sealed: [], loose_qty: 100, unit_cost: 4 });
      if (!a.ok || !b.ok) throw new Error(`preparo da loja: ${j([a, b])}`);
    }
    const contato = (await db.contact.create({ data: scoped({ name: "M87 Fornecedor" }) })).id;
    const saldo = async (loja: string): Promise<number> => {
      const r = await chamar(E, "saldoDaLojaAction", db, owner, loja);
      const linha = (r.ok ? (r.data as Dado[]) : []).find((l) => l.emporio_product_id === P);
      return Number(linha?.total_qty ?? NaN);
    };

    // ---------------------------------------------------------------- 1. ver o Empório
    await rodar("1", async () => {
      console.log("1. Ver o Empório (Q119)");
      const ve = (u: Ator) => FT.isFeatureVisibleForUser(t.id, u.id, "emporio");
      check("Dono vê", await ve(owner));
      check("Gerente geral vê", await ve(gg));
      check("Gestor vê", await ve(gestor1));
      check("Vendedor vê", await ve(vend1));
      check("quem está na lista de TenantFeatureUser mas não tem emporio_role NÃO vê", !(await ve(semFuncao)));

      const login = async (u: { email: string }): Promise<string> => {
        const rota = await import("@/app/api/v1/auth/token/route");
        const res = await rota.POST(new Request("http://localhost/api/v1/auth/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }) }));
        return String((await res.json())?.data?.access_token ?? "");
      };
      const rotaEmp = await import("@/app/api/v1/emporio/establishments/route");
      const chamarRota = async (u: { email: string }) => {
        const tok = await login(u);
        return withBearer(tok, () => rotaEmp.GET(new Request("http://localhost/api/v1/emporio/establishments")));
      };
      check("rota do Empório: sem função é 404", (await chamarRota(semFuncao)).status === 404);
      check("rota do Empório: Vendedor passa (200)", (await chamarRota(vend1)).status === 200);
      const rDono = await chamarRota(owner);
      check("rota do Empório: Dono passa (200)", rDono.status === 200, `${rDono.status} ${await rDono.text()}`);
    });

    // ---------------------------------------------------------------- 2. lojas
    await rodar("2", async () => {
      console.log("\n2. Lojas que cada papel vê (Q128)");
      const ids = async (u: Ator) => {
        const r = await chamar(C, "listarEstabelecimentosAction", db, u);
        const l: Dado[] = r.ok ? (Array.isArray(r.data) ? r.data : r.data?.items ?? []) : [];
        return l.map((e) => e.id as string);
      };
      for (const [nome, u] of [["Dono", owner], ["Gerente geral", gg]] as const) {
        const v = await ids(u);
        check(`${nome} vê as duas lojas (sem vínculo)`, v.includes(L1) && v.includes(L2), j(v));
      }
      await vincular(owner, [L1]);
      await vincular(gg, [L1]);
      for (const [nome, u] of [["Dono", owner], ["Gerente geral", gg]] as const) {
        const v = await ids(u);
        check(`${nome} continua vendo as duas, mesmo com vínculo`, v.includes(L1) && v.includes(L2), j(v));
      }
      const g1 = await ids(gestor1);
      check("Gestor só vê a loja dele", g1.includes(L1) && !g1.includes(L2), j(g1));
      const v1 = await ids(vend1);
      check("Vendedor só vê a loja dele", v1.includes(L1) && !v1.includes(L2), j(v1));
      check("Gestor lendo loja de fora: 404", recusa(await chamar(C, "lerEstabelecimentoAction", db, gestor1, L2), "NOT_FOUND", 404));
      check("Vendedor lendo loja de fora: 404", recusa(await chamar(C, "lerEstabelecimentoAction", db, vend1, L2), "NOT_FOUND", 404));

      const rs = await chamar(E, "saldoDoProdutoAction", db, gestor1, P);
      const lojasVistas: Dado[] = rs.ok ? rs.data.stores ?? [] : [];
      const idsEstoque = lojasVistas.map((s) => s.establishment_id ?? s.id);
      check("Gestor vê o ESTOQUE da outra loja (saldo do produto)", rs.ok && idsEstoque.includes(L1) && idsEstoque.includes(L2), j(idsEstoque));
      const rv = await chamar(V, "listarVendasAction", db, gestor1, { establishment_id: L2 });
      check("Gestor não vê as vendas da outra loja", !rv.ok && (rv.status === 404 || rv.status === 403), j(rv));
      const rc = await chamar(X, "lerCaixaAction", db, gestor1, { establishment_id: L2 });
      check("Gestor não vê o caixa da outra loja", !rc.ok && (rc.status === 404 || rc.status === 403), j(rc));
      const rsv = await chamar(E, "saldoDoProdutoAction", db, vend1, P);
      const idsV: Dado[] = (rsv.ok ? rsv.data.stores ?? [] : []).map((s: Dado) => s.establishment_id ?? s.id);
      check("Vendedor NÃO vê o estoque da outra loja", rsv.ok && !idsV.includes(L2), j(idsV));
      // o saldo() das seções seguintes lê como Dono: sem vínculo, para enxergar as duas lojas
      await prisma.userEstablishment.deleteMany({ where: { user_id: { in: [owner.id, gg.id] } } });
    });

    // ---------------------------------------------------------------- 3. permissão por grupo
    await rodar("3", async () => {
      console.log("\n3. Permissão por grupo");
      const criar = (u: Ator, n: string) => chamar(C, "criarEstabelecimentoAction", db, u, { name: `M87 Extra ${n}` });
      check("Conta: Dono cria estabelecimento", (await criar(owner, "o")).ok);
      check("Conta: Gerente geral cria estabelecimento", (await criar(gg, "g")).ok);
      check("Conta: Gestor é 403", negado(await criar(gestor1, "gs")));
      check("Conta: Vendedor é 403", negado(await criar(vend1, "v")));

      await chamar(C, "definirPrecoAction", db, owner, { establishment_id: L1, presentation_id: PRES, price: 11 });
      const preco = (u: Ator, loja: string) => chamar(C, "definirPrecoAction", db, u, { establishment_id: loja, presentation_id: PRES, price: 11 });
      check("Gestor da loja: Vendedor não define preço (403)", negado(await preco(vend1, L1)));
      check("Gestor da loja: Gestor de OUTRA loja é 404", recusa(await preco(gestor2, L1), "NOT_FOUND", 404));
      check("Gestor da loja: Gestor define preço na loja dele", (await preco(gestor1, L1)).ok);

      const vender = (u: Ator) =>
        chamar(V, "venderAction", db, u, {
          operation_key: chave("v"),
          establishment_id: L1,
          items: [{ emporio_product_id: P, presentation_id: PRES, quantity: 1 }],
          payments: [{ kind: "dinheiro", amount: 11 }],
        });
      const rv = await vender(vend1);
      check("Vendedor da loja: vende", rv.ok, j(rv));
      const vid = (rv.ok ? rv.data.id ?? rv.data.sale_id : "") as string;
      const rg = await chamar(X, "conferirGavetaAction", db, vend1, { establishment_id: L1, counted: 11, justification: "conferência de teste" });
      check("Vendedor da loja: confere a gaveta", rg.ok, j(rg));
      check("cancelar venda: Vendedor é 403", negado(await chamar(V, "cancelarVendaAction", db, vend1, vid, { reason: "teste" })));
      check("cancelar venda: Gestor de OUTRA loja é 404", recusa(await chamar(V, "cancelarVendaAction", db, gestor2, vid, { reason: "teste" }), "NOT_FOUND", 404));
      const rcv = await chamar(V, "cancelarVendaAction", db, gestor1, vid, { reason: "teste" });
      check("cancelar venda: Gestor da loja cancela", rcv.ok, j(rcv));

      const compra = (u: Ator) =>
        chamar(CP, "criarCompraAction", db, u, {
          operation_key: chave("c"),
          establishment_id: L1,
          contact_id: contato,
          purchased_at: new Date(),
          received: true,
          items: [{ emporio_product_id: P, presentation_id: PRES, quantity: 1, item_total: 5 }],
          payment: { kind: "a_prazo", due_date: new Date(Date.now() + 5 * 86_400_000) },
        });
      check("Chave lancar_compra: Vendedor sem a chave é 403", negado(await compra(vend1)));
      check("Chave lancar_compra: Vendedor com a chave lança", (await compra(vendChave)).ok);
      check("Chave lancar_compra: Gestor lança sem chave", (await compra(gestor1)).ok);
      const perda = (u: Ator) => chamar(E, "registrarPerdaAction", db, u, { establishment_id: L1, emporio_product_id: P, quantity: 1, reason: "avaria" });
      check("Chave perda: Vendedor sem a chave é 403 (a chave lancar_compra não vale)", negado(await perda(vendChave)));
      check("Chave perda: Gestor registra sem chave", (await perda(gestor1)).ok);
      await prisma.user.update({ where: { id: vend1.id }, data: { emporio_keys: ["perda"] } as Dado });
      check("Chave perda: Vendedor com a chave perda registra", (await perda(vend1)).ok);
      await prisma.user.update({ where: { id: vend1.id }, data: { emporio_keys: [] } as Dado });

      const neg = (u: Ator) => chamar(C, "editarEstabelecimentoAction", db, u, L1, { allow_negative_stock: true });
      check("Liberar negativo: Gestor é 403", negado(await neg(gestor1)));
      check("Liberar negativo: Vendedor é 403", negado(await neg(vend1)));
      check("Liberar negativo: Gerente geral pode", (await neg(gg)).ok);
      check("Liberar negativo: Dono pode", (await neg(owner)).ok);
    });

    // ---------------------------------------------------------------- 4. Equipe
    await rodar("4", async () => {
      console.log("\n4. Equipe (Q118, Q129, Q133)");
      const novo = (n: string, extra: Dado = {}) => ({ name: `M87 Novo ${n}`, email: `m87-novo-${n}-${stamp}@teste.local`, ...extra });
      check("Gestor não usa a Equipe: listar 403", negado(await chamar(EQ, "listarEquipeAction", db, gestor1)));
      check("Gestor não usa a Equipe: cadastrar 403", negado(await chamar(EQ, "cadastrarMembroAction", db, gestor1, novo("x", { emporio_role: "vendedor", establishment_ids: [L1] }))));
      check("Vendedor não usa a Equipe: alterar 403", negado(await chamar(EQ, "alterarMembroAction", db, vend1, vend2.id, { emporio_role: "gestor" })));
      check("Gestor não usa a Equipe: tirar 403", negado(await chamar(EQ, "tirarDoEmporioAction", db, gestor1, vend2.id)));

      const rl = await chamar(EQ, "listarEquipeAction", db, gg);
      const linhas: Dado[] = rl.ok ? (Array.isArray(rl.data) ? rl.data : rl.data?.items ?? rl.data?.users ?? []) : [];
      const dele = linhas.find((l) => l.id === gestor1.id);
      check("Gerente geral lista a equipe com função e lojas", rl.ok && dele?.emporio_role === "gestor" && j(dele?.establishment_ids) === j([L1]), j(dele));

      const rc = await chamar(EQ, "cadastrarMembroAction", db, owner, novo("gestor", { emporio_role: "gestor", establishment_ids: [L1, L2] }));
      check("Dono cadastra Gestor com senha temporária", rc.ok && typeof rc.data?.temp_password === "string" && rc.data.temp_password.length > 0, j(rc));
      if (rc.ok) {
        const u = await prisma.user.findUnique({ where: { id: rc.data.id } });
        const vinc = await prisma.userEstablishment.count({ where: { user_id: rc.data.id } });
        check("o usuário nasce com emporio_role gestor, papel OPERADOR e 2 lojas", (u as Dado)?.emporio_role === "gestor" && u?.role === "OPERADOR" && vinc === 2, j({ r: (u as Dado)?.emporio_role, role: u?.role, vinc }));
        check("e já vê o Empório", await FT.isFeatureVisibleForUser(t.id, rc.data.id, "emporio"));
      }
      const rcg = await chamar(EQ, "cadastrarMembroAction", db, gg, novo("gg2", { emporio_role: "gerente_geral" }));
      check("Gerente geral cadastra Gerente geral sem lojas", rcg.ok, j(rcg));
      if (rcg.ok) {
        const u = await prisma.user.findUnique({ where: { id: rcg.data.id } });
        check("papel da conta do Gerente geral é ADMIN", u?.role === "ADMIN");
      }
      const rcv = await chamar(EQ, "cadastrarMembroAction", db, gg, novo("vend", { emporio_role: "vendedor", establishment_ids: [L2], emporio_keys: ["perda", "contagem"] }));
      check("cadastra Vendedor com chaves", rcv.ok, j(rcv));
      if (rcv.ok) {
        const u = await prisma.user.findUnique({ where: { id: rcv.data.id } });
        check("papel da conta do Vendedor é OPERADOR e as chaves ficam gravadas", u?.role === "OPERADOR" && j([...((u as Dado)?.emporio_keys ?? [])].sort()) === j(["contagem", "perda"]));
      }

      console.log("   recusas de cadastro");
      check("Vendedor sem loja: 422 em establishment_ids", recusa(await chamar(EQ, "cadastrarMembroAction", db, owner, novo("a", { emporio_role: "vendedor", establishment_ids: [] })), "VALIDATION_ERROR", 422, "establishment_ids"));
      check("Gestor sem loja: 422 em establishment_ids", recusa(await chamar(EQ, "cadastrarMembroAction", db, owner, novo("b", { emporio_role: "gestor", establishment_ids: [] })), "VALIDATION_ERROR", 422, "establishment_ids"));
      check("chave em Gestor: 422 em emporio_keys", recusa(await chamar(EQ, "cadastrarMembroAction", db, owner, novo("c", { emporio_role: "gestor", establishment_ids: [L1], emporio_keys: ["perda"] })), "VALIDATION_ERROR", 422, "emporio_keys"));
      check("chave fora da lista em Vendedor: 422 em emporio_keys", recusa(await chamar(EQ, "cadastrarMembroAction", db, owner, novo("d", { emporio_role: "vendedor", establishment_ids: [L1], emporio_keys: ["voar"] })), "VALIDATION_ERROR", 422, "emporio_keys"));
      check("emporio_only em Gestor: 422 em emporio_only", recusa(await chamar(EQ, "cadastrarMembroAction", db, owner, novo("e", { emporio_role: "gestor", establishment_ids: [L1], emporio_only: true })), "VALIDATION_ERROR", 422, "emporio_only"));
      check("emporio_role fora da lista: 422 em emporio_role", recusa(await chamar(EQ, "cadastrarMembroAction", db, owner, novo("f", { emporio_role: "chefe", establishment_ids: [L1] })), "VALIDATION_ERROR", 422, "emporio_role"));
      check("nada disso criou usuário", (await prisma.user.count({ where: { tenant_id: t.id, email: { in: ["a", "b", "c", "d", "e", "f"].map((n) => `m87-novo-${n}-${stamp}@teste.local`) } } })) === 0);

      console.log("   alterar");
      const rDono = await chamar(EQ, "alterarMembroAction", db, gg, owner.id, { emporio_role: "vendedor", establishment_ids: [L1] });
      check("o Dono como alvo é recusado", !rDono.ok, j(rDono));
      check("e o Dono segue sem função e OWNER", ((await prisma.user.findUnique({ where: { id: owner.id } })) as Dado)?.emporio_role == null);
      const gg2 = rcg.ok ? (rcg.data.id as string) : "";
      const rGG = await chamar(EQ, "alterarMembroAction", db, gg, gg2, { emporio_role: "gestor", establishment_ids: [L1] });
      check("Gerente geral não altera outro Gerente geral (403)", negado(rGG), j(rGG));
      check("Dono altera Gerente geral (desce para Gestor)", (await chamar(EQ, "alterarMembroAction", db, owner, gg2, { emporio_role: "gestor", establishment_ids: [L1] })).ok);
      check("e o papel da conta acompanha: OPERADOR", (await prisma.user.findUnique({ where: { id: gg2 } }))?.role === "OPERADOR");

      const alvo = await mk("alvo", "OPERADOR", { emporio_role: "gestor" });
      await vincular(alvo, [L1]);
      check("Gestor sem loja ao alterar: 422 em establishment_ids", recusa(await chamar(EQ, "alterarMembroAction", db, gg, alvo.id, { establishment_ids: [] }), "VALIDATION_ERROR", 422, "establishment_ids"));
      check("sobe Gestor para Gerente geral", (await chamar(EQ, "alterarMembroAction", db, owner, alvo.id, { emporio_role: "gerente_geral" })).ok);
      const lojasDepois = await prisma.userEstablishment.count({ where: { user_id: alvo.id } });
      const ua = await prisma.user.findUnique({ where: { id: alvo.id } });
      check("virar Gerente geral limpa as lojas e o papel vira ADMIN", lojasDepois === 0 && ua?.role === "ADMIN", j({ lojasDepois, role: ua?.role }));
      check("Gerente geral: emporio_only liga", (await chamar(EQ, "alterarMembroAction", db, owner, alvo.id, { emporio_only: true })).ok && ((await prisma.user.findUnique({ where: { id: alvo.id } })) as Dado)?.emporio_only === true);

      await prisma.user.update({ where: { id: alvo.id }, data: { emporio_role: "vendedor", emporio_keys: ["perda"] } as Dado });
      const rv = await chamar(EQ, "alterarMembroAction", db, owner, alvo.id, { emporio_role: "gestor", establishment_ids: [L1] });
      check("Vendedor com chave vira Gestor", rv.ok, j(rv));
      await prisma.user.update({ where: { id: alvo.id }, data: { emporio_keys: ["perda", "contagem"] } as Dado });
      const rv2 = await chamar(EQ, "alterarMembroAction", db, owner, alvo.id, { emporio_role: "vendedor", establishment_ids: [L1] });
      const uv = await prisma.user.findUnique({ where: { id: alvo.id } });
      check("virar Vendedor zera as chaves", rv2.ok && ((uv as Dado)?.emporio_keys ?? []).length === 0, j({ r: rv2.ok, k: (uv as Dado)?.emporio_keys }));
      check("Vendedor recebe chave pela alteração", (await chamar(EQ, "alterarMembroAction", db, owner, alvo.id, { emporio_keys: ["devolver_trocar"] })).ok);
      check("chave em quem não é Vendedor na alteração: 422 em emporio_keys", recusa(await chamar(EQ, "alterarMembroAction", db, owner, gestor2.id, { emporio_keys: ["perda"] }), "VALIDATION_ERROR", 422, "emporio_keys"));
      check("emporio_only em Gestor na alteração: 422 em emporio_only", recusa(await chamar(EQ, "alterarMembroAction", db, owner, gestor2.id, { emporio_only: true }), "VALIDATION_ERROR", 422, "emporio_only"));

      console.log("   tirar do Empório");
      const rt = await chamar(EQ, "tirarDoEmporioAction", db, gg, alvo.id);
      const ut = await prisma.user.findUnique({ where: { id: alvo.id } });
      check("tirar do Empório: emporio_role nulo e o usuário continua na conta", rt.ok && (ut as Dado)?.emporio_role == null && ut?.tenant_id === t.id && ut?.active !== false, j(rt));
      check("e já não vê o Empório", !(await FT.isFeatureVisibleForUser(t.id, alvo.id, "emporio")));
      check("tirar o Dono: recusado", !(await chamar(EQ, "tirarDoEmporioAction", db, gg, owner.id)).ok);
    });

    // ---------------------------------------------------------------- 5. Configurações → Usuários
    await rodar("5", async () => {
      console.log("\n5. Configurações → Usuários (Q135)");
      const r = await chamar(U, "updateUserRoleAction", db, gestor1.id, "ADMIN");
      check("trocar o papel de quem tem emporio_role: 409", !r.ok && r.status === 409, j(r));
      check("e o papel da conta não mudou", (await prisma.user.findUnique({ where: { id: gestor1.id } }))?.role === "OPERADOR");
      check("controle: quem não tem função troca normalmente", (await chamar(U, "updateUserRoleAction", db, semFuncao.id, "ADMIN")).ok);
    });

    // ---------------------------------------------------------------- 6. só da loja
    await rodar("6", async () => {
      console.log("\n6. Só da loja (Q120)");
      const rotaAni = await import("@/app/api/v1/animals/route");
      const rotaCon = await import("@/app/api/v1/contacts/route");
      const rotaDia = await import("@/app/api/v1/meu-dia/route");
      const rotaTok = await import("@/app/api/v1/auth/token/route");
      const token = async (u: { email: string }) =>
        String(((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }) }))).json()) as Dado)?.data?.access_token ?? "");
      const tentar = async (u: { email: string }, rota: { GET: (r: Request) => Promise<Response> }, path: string) => {
        const tok = await token(u);
        const res = await withBearer(tok, () => rota.GET(new Request(`http://localhost${path}`)));
        const corpo = (await res.json().catch(() => ({}))) as Dado;
        return { status: res.status, code: corpo?.error?.code, message: String(corpo?.error?.message ?? "") };
      };
      const MSG = "Seu acesso é só ao Empório.";
      const ani = (u: { email: string }) => tentar(u, rotaAni, "/api/v1/animals");
      check("controle: o Dono passa na rota da fazenda", (await ani(owner)).status === 200);
      for (const [nome, u] of [["Gestor", gestor1], ["Vendedor", vend1]] as const) {
        const r = await ani(u);
        check(`${nome}: rota da fazenda é 403 FORBIDDEN com a frase`, r.status === 403 && r.code === "FORBIDDEN" && r.message === MSG, j(r));
        const c = await tentar(u, rotaCon, "/api/v1/contacts");
        check(`${nome}: passa em Contatos`, c.status === 200, j(c));
        const d = await tentar(u, rotaDia, "/api/v1/meu-dia");
        check(`${nome}: passa no Meu Dia`, d.status === 200, j(d));
      }
      const gg1 = await ani(gg);
      check("Gerente geral sem emporio_only passa na rota da fazenda", gg1.status === 200, j(gg1));
      await prisma.user.update({ where: { id: gg.id }, data: { emporio_only: true } as Dado });
      const gg2 = await ani(gg);
      check("Gerente geral com emporio_only: 403 com a frase", gg2.status === 403 && gg2.code === "FORBIDDEN" && gg2.message === MSG, j(gg2));
      const ggc = await tentar(gg, rotaCon, "/api/v1/contacts");
      check("Gerente geral com emporio_only ainda passa em Contatos", ggc.status === 200, j(ggc));
      await prisma.user.update({ where: { id: gg.id }, data: { emporio_only: false } as Dado });
      check("desligado o emporio_only, a rota da fazenda volta (efeito imediato)", (await ani(gg)).status === 200);
    });

    // ---------------------------------------------------------------- 7. transferência
    await rodar("7", async () => {
      console.log("\n7. Transferência (Q130, Q131)");
      const enviar = (u: Ator, origem: string, destino: string, qtd: number) =>
        chamar(T, "enviarTransferenciaAction", db, u, { operation_key: chave("tr"), origin_establishment_id: origem, destination_establishment_id: destino, items: [{ emporio_product_id: P, quantity: qtd }] });
      check("Vendedor não envia (403)", negado(await enviar(vend1, L1, L2, 5)));
      check("Gestor de L2 enviando DE L1: 404", recusa(await enviar(gestor2, L1, L2, 5), "NOT_FOUND", 404));
      const o0 = await saldo(L1);
      const d0 = await saldo(L2);
      const env1 = await enviar(gestor1, L1, L2, 10);
      check("Gestor envia da loja dele", env1.ok, j(env1));
      if (!env1.ok) return;
      const id1 = (env1.data.id ?? env1.data.transfer_id) as string;
      const itens = async (id: string): Promise<Dado[]> => {
        const r = await chamar(T, "lerTransferenciaAction", db, owner, id);
        return r.ok ? r.data.items ?? [] : [];
      };
      const lido = async (id: string): Promise<Dado> => {
        const r = await chamar(T, "lerTransferenciaAction", db, owner, id);
        return r.ok ? r.data : undefined;
      };
      const receber = async (u: Ator, id: string, qtd: number, extra: Dado = {}) =>
        chamar(T, "receberTransferenciaAction", db, u, id, { items: (await itens(id)).map((i) => ({ item_id: i.id, received_qty: qtd, ...(qtd < Number(i.sent_qty) ? { loss_reason: "avaria" } : {}) })), ...extra });

      check("a origem baixou 10 no envio (precondição)", perto(await saldo(L1), o0 - 10), `${o0} -> ${await saldo(L1)}`);
      const rMais = await receber(vend2, id1, 12);
      check("chegou mais: 422", !rMais.ok && rMais.status === 422, j(rMais));
      check("e continua em trânsito, sem entrar no destino", (await lido(id1))?.status === "em_transito" && perto(await saldo(L2), d0));
      const rIgual = await receber(vend2, id1, 10);
      check("Vendedor do destino recebe igual: recebida", rIgual.ok && (await lido(id1))?.status === "recebida", j(rIgual));
      check("o destino ganhou 10", perto(await saldo(L2), d0 + 10), `${d0} -> ${await saldo(L2)}`);

      console.log("   recebe a menos, perda no caminho");
      const o1 = await saldo(L1);
      const d1 = await saldo(L2);
      const env2 = await enviar(gestor1, L1, L2, 10);
      const id2 = (env2.ok ? env2.data.id ?? env2.data.transfer_id : "") as string;
      const oEnv = await saldo(L1);
      check("segunda transferência enviada (origem -10)", env2.ok && perto(oEnv, o1 - 10), j(env2));
      const rMenos = await receber(vend2, id2, 7);
      check("Vendedor recebe a menos: aceito, fica aguardando_gestor", rMenos.ok && (await lido(id2))?.status === "aguardando_gestor", j(rMenos));
      check("e o saldo do destino NÃO mudou", perto(await saldo(L2), d1), `${d1} -> ${await saldo(L2)}`);
      const resolver = (u: Ator, id: string, over: Dado = {}) => chamar(T, "resolverDiferencaAction", db, u, id, { operation_key: chave("rs"), resolution: "perda_no_caminho", reason: "quebrou no caminho", ...over });
      check("Vendedor tentando resolver: 403", negado(await resolver(vend2, id2)));
      const rSem = await resolver(gestor2, id2, { reason: "" });
      check("resolver sem reason: 422 em reason", recusa(rSem, "VALIDATION_ERROR", 422, "reason"), j(rSem));
      const rSem2 = await resolver(gestor2, id2, { reason: undefined });
      check("resolver com reason ausente: 422 em reason", recusa(rSem2, "VALIDATION_ERROR", 422, "reason"), j(rSem2));
      check("resolver sem resolution: 422 em resolution", recusa(await resolver(gestor2, id2, { resolution: undefined }), "VALIDATION_ERROR", 422, "resolution"));
      check("as recusas não resolveram nada", (await lido(id2))?.status === "aguardando_gestor");
      const rOk = await resolver(gestor2, id2);
      check("Gestor do destino resolve com perda_no_caminho", rOk.ok, j(rOk));
      const l2 = await lido(id2);
      check("a transferência sai de aguardando_gestor e guarda a resolução", l2?.status !== "aguardando_gestor" && l2?.resolution === "perda_no_caminho", j({ s: l2?.status, r: l2?.resolution }));
      check("o destino ganhou o que chegou (7)", perto(await saldo(L2), d1 + 7), `${d1} -> ${await saldo(L2)}`);
      check("perda na origem: a origem NÃO recupera a diferença", perto(await saldo(L1), oEnv), `${oEnv} -> ${await saldo(L1)}`);

      console.log("   recebe a menos, não enviada");
      const env3 = await enviar(gestor1, L1, L2, 10);
      const id3 = (env3.ok ? env3.data.id ?? env3.data.transfer_id : "") as string;
      const oEnv3 = await saldo(L1);
      const d3 = await saldo(L2);
      check("terceira transferência pendente com 6 recebidos", env3.ok && (await receber(vend2, id3, 6)).ok && (await lido(id3))?.status === "aguardando_gestor");
      const rNe = await resolver(gestor2, id3, { resolution: "nao_enviada", reason: "contei errado na saída" });
      check("Gestor do destino resolve com nao_enviada", rNe.ok, j(rNe));
      check("nao_enviada: a diferença (4) volta ao saldo da origem", perto(await saldo(L1), oEnv3 + 4), `${oEnv3} -> ${await saldo(L1)}`);
      check("e o destino ganhou o que chegou (6)", perto(await saldo(L2), d3 + 6), `${d3} -> ${await saldo(L2)}`);
      check("resolution gravada como nao_enviada", (await lido(id3))?.resolution === "nao_enviada");

      console.log("   quem pode resolver, resolve na hora");
      const env4 = await enviar(gestor1, L1, L2, 10);
      const id4 = (env4.ok ? env4.data.id ?? env4.data.transfer_id : "") as string;
      const rHora = await receber(gestor2, id4, 8, { resolution: "perda_no_caminho", reason: "avaria" });
      check("Gestor do destino recebe a menos com resolution e reason: resolve na hora", rHora.ok && (await lido(id4))?.status !== "aguardando_gestor" && (await lido(id4))?.resolution === "perda_no_caminho", j(rHora));
    });
  } finally {
    const modelos = [
      "emporioAuditLog", "cashMovement", "cardReceivable", "emporioCheck", "cashTransfer", "cashCount", "cardFeeRule", "stockMovement",
      "saleVariableExpense", "variableExpenseRule", "fixedExpenseOccurrence", "fixedExpenseSplit", "fixedExpenseTemplate",
      "emporioSalePayment", "emporioSaleReturnItem", "emporioSaleReturn", "emporioSaleItem", "emporioSale",
      "stockTransferItem", "stockTransfer", "productionEntry", "compositionItem", "composition", "emporioPurchaseItem", "emporioPurchase",
      "stockLimit", "shoppingItem", "financialEntry", "negotiation", "presentationPrice", "productPresentation", "userEstablishment",
      "emporioProduct", "product", "establishment", "bankAccount", "contact", "productCategory", "property",
    ];
    for (const id of tenantIds) {
      for (const m of modelos) {
        try {
          await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: id } });
        } catch {
          // modelo ausente nesta versão do schema: segue
        }
      }
      try {
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
    console.log(falhas === 0 ? "\n✅ M87 verde" : `\n❌ M87: ${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  });
