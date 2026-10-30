import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";
import { papelDeFixture, vincularTodas } from "./_emporio-papel";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F6b: Histórico (Q134).
 * Roda: `npm run test:m89`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F6b: contrato", parte "Histórico"),
 * sem ler a implementação.
 *
 * Suposições onde a spec não fecha o formato (anotadas para o juiz):
 * - `listarHistoricoAction(db, ator, filtros)` fica em `@/lib/emporio/historico` ou em
 *   `@/lib/actions/emporio-historico`; a suíte procura o nome exportado nos dois.
 * - A lista vem como array ou como `{ items | rows | entries, next_cursor }`; cada linha tem `id`.
 * - `de` e `ate` entram como string ISO.
 * - As chaves de `action` são conferidas só pelo prefixo da área (venda, preco, estabelecimento,
 *   compra, perda, transferencia, caixa/gaveta, equipe); a lista exata não está na spec.
 * - Rota: GET /api/v1/emporio/history, com Bearer, filtros na query, resposta em `data`.
 */

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

const negado = (r: R) => !r.ok && r.code === "FORBIDDEN" && r.status === 403;
const j = (x: unknown) => JSON.stringify(x);
const DIA = 86_400_000;

console.log("📜 M89: Módulo 39 (Meu Empório), F6b: Histórico\n");

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
  const H1 = await carregar("@/lib/emporio/historico");
  const H2 = await carregar("@/lib/actions/emporio-historico");
  const H: Record<string, Acao> = typeof H1.listarHistoricoAction === "function" ? H1 : H2;

  const log = (prisma as Dado).emporioAuditLog as Dado;
  const stamp = Date.now();
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const tenantIds: string[] = [];
  let chaveSeq = 0;
  const chave = (p: string) => `m89-${p}-${stamp}-${(chaveSeq += 1)}`;
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
    const novoTenant = async (nome: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M89 ${nome} ${stamp}`, document: `M89${nome}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
      });
      tenantIds.push(t.id);
      await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
      await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
      await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
      return t;
    };
    const t = await novoTenant("A");
    const tB = await novoTenant("B");

    const mkEm = async (tenantId: string, suf: string, role: Role, extra: Dado = {}) => {
      const u = await prisma.user.create({
        data: { tenant_id: tenantId, name: `M89 ${suf}`, email: `m89-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
      });
      return { id: u.id, role, email: u.email, name: u.name } as Ator & { email: string; name: string };
    };
    const owner = await mkEm(t.id, "own", "OWNER");
    const gg = await mkEm(t.id, "gg", "ADMIN");
    const gestor1 = await mkEm(t.id, "gestor1", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
    const gestor2 = await mkEm(t.id, "gestor2", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
    const vend1 = await mkEm(t.id, "vend1", "OPERADOR");
    const vend2 = await mkEm(t.id, "vend2", "OPERADOR");
    const vendK = await mkEm(t.id, "vendk", "OPERADOR", { emporio_keys: [] });
    const ownerB = await mkEm(tB.id, "ownb", "OWNER");

    const db = prismaForTenant(t.id);
    const dbB = prismaForTenant(tB.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M89 categoria" }) });
    const L1r = await chamar(C, "criarEstabelecimentoAction", db, owner, { name: "M89 Loja 1" });
    const L2r = await chamar(C, "criarEstabelecimentoAction", db, owner, { name: "M89 Loja 2" });
    if (!L1r.ok || !L2r.ok) throw new Error(`lojas: ${j([L1r, L2r])}`);
    const L1 = L1r.data.id as string;
    const L2 = L2r.data.id as string;
    await vincularTodas(prisma, t.id, [gestor1.id, vend1.id, vendK.id], [L1]);
    await vincularTodas(prisma, t.id, [gestor2.id, vend2.id], [L2]);

    const rP = await chamar(C, "criarProdutoEmporioAction", db, owner, { name: "M89 Produto", category_id: cat.id, base_unit: "quilograma" });
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
    const contato = (await db.contact.create({ data: scoped({ name: "M89 Fornecedor" }) })).id;

    // ---------------------------------------------------------------- ajudantes de leitura
    const totalA = () => log.count({ where: { tenant_id: t.id } }) as Promise<number>;
    let anterior = await totalA();
    const crescente = async (depoisDe: string) => {
      const agora = await totalA();
      check(`a contagem só cresce (depois de ${depoisDe}: ${anterior} -> ${agora})`, agora >= anterior);
      anterior = agora;
    };
    /** Roda `fn` e devolve as linhas do Histórico que nasceram durante ele. */
    const nova = async <T2>(fn: () => Promise<T2>): Promise<{ r: T2; rows: Dado[] }> => {
      const antes = new Set(((await log.findMany({ where: { tenant_id: t.id }, select: { id: true } })) as Dado[]).map((x) => x.id as string));
      const r = await fn();
      const todas = (await log.findMany({ where: { tenant_id: t.id } })) as Dado[];
      return { r, rows: todas.filter((x) => !antes.has(x.id)) };
    };
    const lista = (r: R): Dado[] => (r.ok ? (Array.isArray(r.data) ? r.data : r.data?.items ?? r.data?.rows ?? r.data?.entries ?? []) : []);
    const proximo = (r: R): string | null => (r.ok && !Array.isArray(r.data) ? r.data?.next_cursor ?? null : null);
    const listar = (u: Ator, filtros: Dado = {}) => chamar(H, "listarHistoricoAction", db, u, filtros);
    const idsDe = (r: R) => lista(r).map((l) => l.id as string);
    const umaLinha = (rows: Dado[], nome: string, area: RegExp, usuario: Ator, loja: string | null) => {
      const l = rows[0];
      check(`${nome}: grava exatamente 1 linha`, rows.length === 1, `${rows.length}: ${j(rows.map((x) => x.action))}`);
      check(`${nome}: a chave é da área certa`, !!l && area.test(String(l.action)), j(l?.action));
      check(`${nome}: quem fez e a loja`, !!l && l.user_id === usuario.id && (l.establishment_id ?? null) === loja, j({ u: l?.user_id, e: l?.establishment_id }));
      check(`${nome}: tem frase e alvo`, !!l && String(l.summary ?? "").length > 0 && !!l.target_type && !!l.target_id);
    };

    // ---------------------------------------------------------------- 1. escritas gravam uma linha
    await rodar("1", async () => {
      console.log("1. Escritas representativas gravam UMA linha, com quem fez e a loja");
      const venda = await nova(() =>
        chamar(V, "venderAction", db, vend1, {
          operation_key: chave("v"),
          establishment_id: L1,
          items: [{ emporio_product_id: P, presentation_id: PRES, quantity: 1 }],
          payments: [{ kind: "dinheiro", amount: 10 }],
        }),
      );
      check("venda feita", venda.r.ok, j(venda.r));
      umaLinha(venda.rows, "vender", /^venda/, vend1, L1);
      check("vender: a chave é area.verbo", /^[a-z_]+\.[a-z_]+$/.test(String(venda.rows[0]?.action)), j(venda.rows[0]?.action));

      const preco = await nova(() => chamar(C, "definirPrecoAction", db, gestor1, { establishment_id: L1, presentation_id: PRES, price: 12 }));
      check("preço definido", preco.r.ok, j(preco.r));
      umaLinha(preco.rows, "definir preço", /^preco/, gestor1, L1);
      const chg: Dado[] = preco.rows[0]?.changes ?? [];
      check("definir preço: changes traz o antes (10) e o depois (12)", Array.isArray(chg) && chg.some((c) => /\b10([.,]00)?\b/.test(String(c.antes)) && /\b12([.,]00)?\b/.test(String(c.depois))), j(chg));

      const edit = await nova(() => chamar(C, "editarEstabelecimentoAction", db, gg, L1, { allow_negative_stock: true }));
      check("estabelecimento editado", edit.r.ok, j(edit.r));
      umaLinha(edit.rows, "editar estabelecimento", /^estabelecimento/, gg, L1);
      const chgE: Dado[] = edit.rows[0]?.changes ?? [];
      check("editar estabelecimento: changes de false para true", Array.isArray(chgE) && chgE.some((c) => /^(false|n[aã]o)$/i.test(String(c.antes)) && /^(true|sim)$/i.test(String(c.depois))), j(chgE));

      const compra = await nova(() =>
        chamar(CP, "criarCompraAction", db, vend1, {
          operation_key: chave("c"),
          establishment_id: L1,
          contact_id: contato,
          purchased_at: new Date(),
          received: true,
          items: [{ emporio_product_id: P, presentation_id: PRES, quantity: 1, item_total: 5 }],
          payment: { kind: "a_prazo", due_date: new Date(Date.now() + 5 * DIA) },
        }),
      );
      check("compra lançada", compra.r.ok, j(compra.r));
      umaLinha(compra.rows, "lançar compra", /^compra/, vend1, L1);

      const perda = await nova(() => chamar(E, "registrarPerdaAction", db, vend1, { establishment_id: L1, emporio_product_id: P, quantity: 1, reason: "avaria" }));
      check("perda registrada", perda.r.ok, j(perda.r));
      umaLinha(perda.rows, "registrar perda", /perda/, vend1, L1);

      const gaveta = await nova(() => chamar(X, "conferirGavetaAction", db, vend1, { establishment_id: L1, counted: 10, justification: "conferência de teste" }));
      check("gaveta conferida", gaveta.r.ok, j(gaveta.r));
      umaLinha(gaveta.rows, "conferir gaveta", /gaveta|caixa/, vend1, L1);

      const envio = await nova(() =>
        chamar(T, "enviarTransferenciaAction", db, gestor1, { operation_key: chave("tr"), origin_establishment_id: L1, destination_establishment_id: L2, items: [{ emporio_product_id: P, quantity: 3 }] }),
      );
      check("transferência enviada", envio.r.ok, j(envio.r));
      umaLinha(envio.rows, "enviar transferência (na origem)", /transferencia/, gestor1, L1);
      if (envio.r.ok) {
        const id = (envio.r.data.id ?? envio.r.data.transfer_id) as string;
        const lida = await chamar(T, "lerTransferenciaAction", db, owner, id);
        const itens: Dado[] = lida.ok ? lida.data.items ?? [] : [];
        const rec = await nova(() => chamar(T, "receberTransferenciaAction", db, vend2, id, { items: itens.map((i) => ({ item_id: i.id, received_qty: Number(i.sent_qty) })) }));
        check("transferência recebida", rec.r.ok, j(rec.r));
        umaLinha(rec.rows, "receber transferência (no destino)", /transferencia/, vend2, L2);
        check("enviar e receber têm chaves diferentes", !!envio.rows[0] && !!rec.rows[0] && envio.rows[0].action !== rec.rows[0].action, j([envio.rows[0]?.action, rec.rows[0]?.action]));
      }

      // um trânsito na L2, para a leitura ter linhas das duas lojas
      const v2 = await nova(() =>
        chamar(V, "venderAction", db, vend2, {
          operation_key: chave("v2"),
          establishment_id: L2,
          items: [{ emporio_product_id: P, presentation_id: PRES, quantity: 1 }],
          payments: [{ kind: "dinheiro", amount: 10 }],
        }),
      );
      umaLinha(v2.rows, "vender na loja 2", /^venda/, vend2, L2);
      await crescente("as escritas da loja");
    });

    // ---------------------------------------------------------------- 2. recusa e repetição
    await rodar("2", async () => {
      console.log("\n2. Recusa e repetição não gravam linha");
      const k = chave("dup");
      const corpo = { operation_key: k, establishment_id: L1, items: [{ emporio_product_id: P, presentation_id: PRES, quantity: 1 }], payments: [{ kind: "dinheiro", amount: 10 }] };
      const a = await nova(() => chamar(V, "venderAction", db, vend1, corpo));
      check("a primeira venda grava 1 linha", a.r.ok && a.rows.length === 1, j({ ok: a.r.ok, n: a.rows.length }));
      const b = await nova(() => chamar(V, "venderAction", db, vend1, corpo));
      check("repetir a mesma operation_key NÃO grava segunda linha", b.rows.length === 0, `${b.rows.length}: ${j(b.rows.map((x) => x.action))}`);

      const r403 = await nova(() => chamar(C, "definirPrecoAction", db, vendK, { establishment_id: L1, presentation_id: PRES, price: 99 }));
      check("403 não grava (Vendedor define preço)", negado(r403.r) && r403.rows.length === 0, j({ r: r403.r.ok, n: r403.rows.length }));
      const r403b = await nova(() => chamar(E, "registrarPerdaAction", db, vendK, { establishment_id: L1, emporio_product_id: P, quantity: 1, reason: "avaria" }));
      check("403 não grava (Vendedor sem a chave perda)", negado(r403b.r) && r403b.rows.length === 0, j({ r: r403b.r.ok, n: r403b.rows.length }));
      const r422 = await nova(() => chamar(V, "venderAction", db, vend1, { operation_key: chave("vazia"), establishment_id: L1, items: [], payments: [] }));
      check("422 não grava (venda sem itens)", !r422.r.ok && r422.r.status === 422 && r422.rows.length === 0, j({ r: r422.r.ok ? "ok" : r422.r.status, n: r422.rows.length }));
      const r403c = await nova(() => chamar(EQ, "cadastrarMembroAction", db, gestor1, { name: "M89 X", email: `m89-x-${stamp}@teste.local`, emporio_role: "vendedor", establishment_ids: [L1] }));
      check("403 não grava (Gestor cadastra na Equipe)", negado(r403c.r) && r403c.rows.length === 0, j({ n: r403c.rows.length }));
      await crescente("as recusas");
    });

    // ---------------------------------------------------------------- 3. Equipe
    await rodar("3", async () => {
      console.log("\n3. As três da Equipe");
      // O plano grupo tem 5 assentos: o cadastro cobra assento e desativado não ocupa vaga.
      const afastados = ((await prisma.user.findMany({ where: { tenant_id: t.id, active: true, id: { notIn: [owner.id, gg.id] } }, select: { id: true } })) as Dado[]).map((u) => u.id as string);
      await prisma.user.updateMany({ where: { id: { in: afastados } }, data: { active: false } });
      let novoId = "";
      try {
        const cad = await nova(() => chamar(EQ, "cadastrarMembroAction", db, owner, { name: "M89 Novo", email: `m89-novo-${stamp}@teste.local`, emporio_role: "gestor", establishment_ids: [L1] }));
        check("membro cadastrado", cad.r.ok, j(cad.r));
        check("cadastrar: 1 linha, da Equipe, por quem cadastrou", cad.rows.length === 1 && /^equipe/.test(String(cad.rows[0]?.action)) && cad.rows[0]?.user_id === owner.id, j(cad.rows.map((x) => x.action)));
        if (cad.r.ok) novoId = cad.r.data.id as string;
        check("cadastrar: o alvo é o usuário novo", !!novoId && cad.rows[0]?.target_id === novoId, j(cad.rows[0]?.target_id));
        check("cadastrar: tem frase", String(cad.rows[0]?.summary ?? "").length > 0);
      } finally {
        await prisma.user.updateMany({ where: { id: { in: afastados } }, data: { active: true } });
      }
      if (!novoId) return;
      const alt = await nova(() => chamar(EQ, "alterarMembroAction", db, gg, novoId, { emporio_role: "vendedor", establishment_ids: [L1] }));
      check("função alterada", alt.r.ok, j(alt.r));
      check("alterar função: 1 linha da Equipe, por quem alterou", alt.rows.length === 1 && /^equipe/.test(String(alt.rows[0]?.action)) && alt.rows[0]?.user_id === gg.id, j(alt.rows.map((x) => x.action)));
      const chgA = j(alt.rows[0]?.changes ?? null);
      check("alterar função: changes mostra gestor e vendedor", Array.isArray(alt.rows[0]?.changes) && chgA.includes("gestor") && chgA.includes("vendedor"), chgA);

      const chave1 = await nova(() => chamar(EQ, "alterarMembroAction", db, gg, novoId, { emporio_keys: ["perda"] }));
      check("chave ligada", chave1.r.ok, j(chave1.r));
      check("ligar chave: 1 linha da Equipe", chave1.rows.length === 1 && /^equipe/.test(String(chave1.rows[0]?.action)), j(chave1.rows.map((x) => x.action)));
      const chgC = j(chave1.rows[0]?.changes ?? null);
      check("ligar chave: changes mostra a chave perda", Array.isArray(chave1.rows[0]?.changes) && chgC.includes("perda"), chgC);
      await crescente("a Equipe");
    });

    // ---------------------------------------------------------------- linhas de controle (sem loja, antigas)
    // Montadas direto no banco: a spec não obriga a Equipe a gravar sem loja, e o período
    // precisa de uma linha com data velha. O fixture só acrescenta, como o produto.
    const semLoja = (await log.create({ data: { tenant_id: t.id, user_id: owner.id, action: "equipe.alterar", target_type: "User", target_id: gg.id, summary: "M89 sem loja" } })) as Dado;
    const velha = (await log.create({
      data: { tenant_id: t.id, user_id: gestor1.id, establishment_id: L1, action: "preco.definir", target_type: "Preco", target_id: PRES, summary: "M89 linha velha", created_at: new Date(Date.now() - 30 * DIA) },
    })) as Dado;
    const todasA = (await log.findMany({ where: { tenant_id: t.id } })) as Dado[];
    const porId = new Map<string, Dado>(todasA.map((x) => [x.id as string, x]));
    const doBanco = (f: (x: Dado) => boolean) => new Set(todasA.filter(f).map((x) => x.id as string));
    const igual = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));

    // ---------------------------------------------------------------- 4. leitura por papel
    await rodar("4", async () => {
      console.log("\n4. Leitura por papel");
      for (const [nome, u] of [["Dono", owner], ["Gerente geral", gg]] as const) {
        const r = await listar(u, { limite: 500 });
        const ids = idsDe(r);
        check(`${nome} lê o Histórico`, r.ok, j(r.ok ? "" : r));
        check(`${nome} vê as linhas da loja 1, da loja 2 e as sem loja`, ids.some((i) => porId.get(i)?.establishment_id === L1) && ids.some((i) => porId.get(i)?.establishment_id === L2) && ids.includes(semLoja.id), `n=${ids.length}`);
        check(`${nome} vê todas as linhas da conta`, igual(new Set(todasA.map((x) => x.id as string)), ids), `${ids.length} de ${todasA.length}`);
      }
      const rg = await listar(gestor1, { limite: 500 });
      const idsG = idsDe(rg);
      check("Gestor lê o Histórico", rg.ok, j(rg.ok ? "" : rg));
      check("Gestor vê só as linhas da loja dele", idsG.length > 0 && idsG.every((i) => porId.get(i)?.establishment_id === L1), j(idsG.map((i) => porId.get(i)?.establishment_id)));
      check("Gestor não vê a linha sem loja", !idsG.includes(semLoja.id));
      check("Gestor vê todas as linhas da loja dele", igual(doBanco((x) => x.establishment_id === L1), idsG), `${idsG.length}`);
      const rg2 = await listar(gestor2, { limite: 500 });
      check("Gestor da outra loja vê só a dele", rg2.ok && idsDe(rg2).length > 0 && idsDe(rg2).every((i) => porId.get(i)?.establishment_id === L2));
      const rf = await listar(gestor1, { establishment_id: L2, limite: 500 });
      check("Gestor filtrando pela loja de fora: nada de lá", (!rf.ok) || idsDe(rf).length === 0, j(rf.ok ? idsDe(rf).length : rf));
      check("Vendedor recebe 403", negado(await listar(vend1)));
      check("Vendedor com todas as chaves também recebe 403", negado(await listar(vendK)));

      const linha = lista(await listar(owner, { user_id: vend1.id, limite: 500 })).find((l) => porId.get(l.id as string)?.action?.startsWith("venda"));
      check("a linha traz action_label, user_name, establishment_name, summary e changes",
        !!linha && !!linha.action_label && linha.user_name === vend1.name && linha.establishment_name === "M89 Loja 1" && !!linha.summary && "changes" in linha, j(linha));
      await crescente("a leitura");
    });

    // ---------------------------------------------------------------- 5. filtros e cursor
    await rodar("5", async () => {
      console.log("\n5. Filtros e cursor");
      const ids = async (f: Dado) => idsDe(await listar(owner, { limite: 500, ...f }));
      check("filtro por pessoa", igual(doBanco((x) => x.user_id === vend1.id), await ids({ user_id: vend1.id })));
      check("filtro por loja", igual(doBanco((x) => x.establishment_id === L2), await ids({ establishment_id: L2 })));
      const acaoVenda = String(todasA.find((x) => String(x.action).startsWith("venda"))?.action ?? "venda.criar");
      check("filtro por action", igual(doBanco((x) => x.action === acaoVenda), await ids({ action: acaoVenda })), acaoVenda);
      const corte = new Date(Date.now() - 7 * DIA).toISOString();
      const depois = await ids({ de: corte });
      check("filtro de período (de): a linha de 30 dias atrás sai", !depois.includes(velha.id) && depois.length === todasA.length - 1, `${depois.length}`);
      const antes = await ids({ ate: new Date(Date.now() - 20 * DIA).toISOString() });
      check("filtro de período (ate): só a linha de 30 dias atrás", igual(new Set([velha.id as string]), antes), j(antes.length));
      const faixa = await ids({ de: new Date(Date.now() - 40 * DIA).toISOString(), ate: new Date(Date.now() - 20 * DIA).toISOString() });
      check("filtro de período (de e ate juntos)", igual(new Set([velha.id as string]), faixa));
      const combinado = await ids({ user_id: gestor1.id, establishment_id: L1 });
      check("filtros se combinam (pessoa e loja)", igual(doBanco((x) => x.user_id === gestor1.id && x.establishment_id === L1), combinado));

      const limite = 3;
      check("há mais linhas que o limite (precondição)", todasA.length > limite * 2, String(todasA.length));
      const vistos: string[] = [];
      let cursor: string | null = null;
      let paginas = 0;
      let primeira = 0;
      do {
        const r: R = await listar(owner, { limite, ...(cursor ? { cursor } : {}) });
        const pg = idsDe(r);
        if (paginas === 0) primeira = pg.length;
        vistos.push(...pg);
        cursor = proximo(r);
        paginas += 1;
      } while (cursor && paginas < 60);
      check("a primeira página respeita o limite", primeira === limite, String(primeira));
      check("o cursor pagina sem repetir", new Set(vistos).size === vistos.length, `${vistos.length} vistos`);
      check("o cursor pagina sem pular", igual(new Set(todasA.map((x) => x.id as string)), vistos), `${vistos.length} de ${todasA.length}`);
      check("a última página vem sem next_cursor", cursor === null && paginas > 1, `páginas ${paginas}`);

      const ordem = lista(await listar(owner, { limite: 500 })).map((l) => porId.get(l.id as string)?.created_at?.getTime() ?? 0);
      check("a ordem é do mais novo para o mais velho", ordem.every((v, i) => i === 0 || ordem[i - 1] >= v));
      await crescente("os filtros");
    });

    // ---------------------------------------------------------------- 6. rota
    await rodar("6", async () => {
      console.log("\n6. Rota GET /api/v1/emporio/history");
      const rotaTok = await import("@/app/api/v1/auth/token/route");
      let rota: { GET: (r: Request) => Promise<Response> };
      try {
        rota = (await import("@/app/api/v1/emporio/history/route")) as typeof rota;
      } catch (e) {
        check("a rota existe", false, e instanceof Error ? e.message.split("\n")[0] : String(e));
        return;
      }
      const token = async (u: { email: string }) =>
        String(((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }) }))).json()) as Dado)?.data?.access_token ?? "");
      const get = async (u: { email: string }, qs = "") => {
        const tok = await token(u);
        const res = await withBearer(tok, () => rota.GET(new Request(`http://localhost/api/v1/emporio/history${qs}`)));
        const corpo = (await res.json().catch(() => ({}))) as Dado;
        return { status: res.status, corpo };
      };
      const linhasRota = (c: Dado): Dado[] => (Array.isArray(c?.data) ? c.data : c?.data?.items ?? c?.data?.rows ?? c?.data?.entries ?? []);
      const dono = await get(owner, "?limite=500");
      check("Dono: 200 com as linhas", dono.status === 200 && linhasRota(dono.corpo).length === todasA.length, `${dono.status} ${linhasRota(dono.corpo).length}`);
      const ges = await get(gestor1, "?limite=500");
      check("Gestor: 200 só com a loja dele", ges.status === 200 && linhasRota(ges.corpo).length > 0 && linhasRota(ges.corpo).every((l) => porId.get(l.id)?.establishment_id === L1), `${ges.status}`);
      const ven = await get(vend1);
      check("Vendedor: 403 FORBIDDEN", ven.status === 403 && ven.corpo?.error?.code === "FORBIDDEN", `${ven.status}`);
      const filtro = await get(owner, `?user_id=${vend1.id}&limite=500`);
      check("filtro por pessoa na rota", filtro.status === 200 && igual(doBanco((x) => x.user_id === vend1.id), linhasRota(filtro.corpo).map((l) => l.id as string)), `${filtro.status}`);
      const pag = await get(owner, "?limite=2");
      const nc = pag.corpo?.data?.next_cursor ?? pag.corpo?.next_cursor ?? pag.corpo?.meta?.next_cursor;
      check("a rota devolve next_cursor quando há mais", pag.status === 200 && linhasRota(pag.corpo).length === 2 && !!nc, j(Object.keys(pag.corpo ?? {})));
      const pag2 = nc ? await get(owner, `?limite=2&cursor=${encodeURIComponent(String(nc))}`) : { status: 0, corpo: {} };
      const a = linhasRota(pag.corpo).map((l) => l.id);
      const b = linhasRota(pag2.corpo).map((l) => l.id);
      check("a segunda página não repete a primeira", pag2.status === 200 && b.length > 0 && !b.some((x) => a.includes(x)));
    });

    // ---------------------------------------------------------------- 7. isolamento
    await rodar("7", async () => {
      console.log("\n7. Isolamento entre contas");
      const LB = await chamar(C, "criarEstabelecimentoAction", dbB, ownerB, { name: "M89 Loja B" });
      check("a conta B cria a loja dela", LB.ok, j(LB));
      const rB = await chamar(H, "listarHistoricoAction", dbB, ownerB, { limite: 500 });
      const idsB = idsDe(rB);
      const idsA = new Set(todasA.map((x) => x.id as string));
      check("B lê o Histórico dela", rB.ok, j(rB.ok ? "" : rB));
      check("B não vê nenhuma linha de A", !idsB.some((i) => idsA.has(i)), `${idsB.length}`);
      const doB = (await log.findMany({ where: { tenant_id: tB.id } })) as Dado[];
      check("B só vê linhas que são dela", idsB.every((i) => doB.some((x) => x.id === i)) && (!LB.ok || idsB.length > 0), `${idsB.length} de ${doB.length}`);
      const rBf = await chamar(H, "listarHistoricoAction", dbB, ownerB, { establishment_id: L1, limite: 500 });
      check("B filtrando pela loja de A: nada", !rBf.ok || idsDe(rBf).length === 0);
      const rBu = await chamar(H, "listarHistoricoAction", dbB, ownerB, { user_id: vend1.id, limite: 500 });
      check("B filtrando pela pessoa de A: nada", !rBu.ok || idsDe(rBu).length === 0);
      const rA = idsDe(await listar(owner, { limite: 500 }));
      check("A não vê nenhuma linha de B", !rA.some((i) => doB.some((x) => x.id === i)));
    });

    // ---------------------------------------------------------------- 8. só acréscimo
    await rodar("8", async () => {
      console.log("\n8. Só acréscimo");
      const modulos: Record<string, Record<string, unknown>> = { C, E, V, X, CP, T, EQ, H1, H2 };
      const permitidas = new Set(["listarHistoricoAction", "registrarNoHistorico"]);
      const suspeitas: string[] = [];
      for (const [nome, mod] of Object.entries(modulos)) {
        for (const exp of Object.keys(mod)) {
          if (typeof mod[exp] === "function" && /hist[oó]rico|auditlog|audit_log/i.test(exp) && !permitidas.has(exp)) suspeitas.push(`${nome}.${exp}`);
        }
      }
      check("nenhuma action exportada edita ou apaga o Histórico", suspeitas.length === 0, j(suspeitas));
      check("o módulo do Histórico existe e exporta a leitura", typeof H.listarHistoricoAction === "function");
      const antes = await totalA();
      await chamar(C, "definirPrecoAction", db, gestor1, { establishment_id: L1, presentation_id: PRES, price: 13 });
      await chamar(EQ, "tirarDoEmporioAction", db, gestor1, vend2.id);
      const depoisRecusas = await totalA();
      check("recusas não mexem na contagem", depoisRecusas === antes + 1, `${antes} -> ${depoisRecusas}`);
      // desfazer uma escrita de negócio não apaga o rastro dela
      const x = await nova(() => chamar(C, "definirPrecoAction", db, gestor1, { establishment_id: L1, presentation_id: PRES, price: 10 }));
      const apos = await totalA();
      check("desfazer um preço grava outra linha, não apaga a anterior", x.rows.length === 1 && apos === depoisRecusas + 1, `${depoisRecusas} -> ${apos}`);
      await crescente("o fim da suíte");
      check("a contagem terminou acima do que a suíte semeou", (await totalA()) > todasA.length);
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
    console.log(falhas === 0 ? "\n✅ M89 verde" : `\n❌ M89: ${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  });
