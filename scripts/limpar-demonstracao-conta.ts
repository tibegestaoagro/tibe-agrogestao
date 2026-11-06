/**
 * Limpa de uma conta tudo o que não é do cliente, para ele seguir usando o
 * Meu Empório com os próprios cadastros (pedido do usuário em 06/11/2026, para a
 * Da Mata depois que a Agromax passou a usá-la de verdade em 01/11).
 *
 * FICA (a lista `MANTER`, abaixo):
 * - a conta, os recursos ligados, os perfis e o usuário Dono;
 * - as lojas passadas em `--lojas`, e o que é delas (preço, estoque, limite,
 *   produção, caixa);
 * - os produtos criados desde `--desde`, com apresentações, receitas e a
 *   categoria que eles usam;
 * - as contas bancárias criadas desde `--desde`, as categorias financeiras, o
 *   cliente "Consumidor final" e o vínculo do WhatsApp;
 * - o Histórico do Empório desde `--desde`, das lojas que ficam.
 *
 * SAI todo o resto da conta: as outras lojas e tudo delas (vendas, compras,
 * transferências, devoluções, fiado, caixa), os outros usuários, rebanho,
 * financeiro, serviços, conversas do agente e o contador de numeração (a
 * próxima venda volta a ser a nº 1).
 *
 * Como prova que não apagou nada do cliente: antes de apagar, tira a impressão
 * digital (md5 das linhas) de tudo o que deve ficar; depois de apagar, a
 * impressão digital do que sobrou tem de ser IGUAL, tabela por tabela, e as
 * tabelas fora da lista têm de ficar vazias. Qualquer diferença desfaz tudo
 * (ROLLBACK). Uma linha que fica porque uma linha que fica aponta para ela
 * também reprova: a lista `MANTER` tem de ser corrigida antes.
 *
 * Uso:
 *   npx tsx scripts/limpar-demonstracao-conta.ts --conta <tenant_id> --lojas <id,id> --desde 2026-11-01
 *     banco local: apaga, confere e DESFAZ (ensaio completo).
 *   ... --confirmar
 *     apaga, confere e grava.
 *   Em produção, a URL vai inline e é preciso `--producao`. Sem `--confirmar`,
 *   em produção, só conta (sessão somente leitura).
 */
import "./_env-local";
import { Client } from "pg";

type Args = { conta: string; lojas: string[]; desde: string; confirmar: boolean; producao: boolean };

function lerArgs(): Args {
  const a = process.argv.slice(2);
  const valor = (n: string) => {
    const i = a.indexOf(n);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const conta = valor("--conta");
  const lojas = (valor("--lojas") ?? "").split(",").filter(Boolean);
  const desde = valor("--desde");
  if (!conta || lojas.length === 0 || !desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    console.error("Uso: --conta <tenant_id> --lojas <id,id> --desde AAAA-MM-DD [--confirmar] [--producao]");
    process.exit(2);
  }
  return { conta, lojas, desde, confirmar: a.includes("--confirmar"), producao: a.includes("--producao") };
}

/**
 * O que fica, por tabela. `x` é a linha; $1 = conta, $2 = corte (meia-noite de
 * Brasília do `--desde`, em UTC, como o Prisma grava), $3 = lojas que ficam.
 *
 * Regra geral (tabela fora de `MANTER`): fica o que foi criado desde o corte,
 * e, se a tabela tem loja, só nas lojas que ficam. Assim o que o cliente
 * cadastrar até a hora de rodar (uma venda, um cliente, um login) fica também.
 * Tabela sem `created_at` precisa de regra própria, senão o script para.
 */
const MANTER: Record<string, string> = {
  TenantFeature: "true",
  TenantProfile: "true",
  FinancialCategory: "true",
  WhatsAppContact: "true",
  Vaccine: "false",
  User: `x.role = 'OWNER' OR x.created_at >= $2`,
  PushSubscription: `x.user_id IN ${idsQueFicam("User")}`,
  UserEstablishment: `x.establishment_id = ANY($3) AND x.user_id IN ${idsQueFicam("User")}`,
  Establishment: `x.id = ANY($3)`,
  Contact: `x.system_key = 'consumidor_final' OR x.created_at >= $2`,
  Product: `x.created_at >= $2 OR x.id IN (SELECT ep.product_id FROM "EmporioProduct" ep WHERE ep.tenant_id = $1 AND ep.created_at >= $2)`,
  ProductCategory: `x.created_at >= $2 OR x.id IN (SELECT p.category_id FROM "Product" p WHERE p.tenant_id = $1 AND p.id IN (SELECT ep.product_id FROM "EmporioProduct" ep WHERE ep.tenant_id = $1 AND ep.created_at >= $2))`,
  ProductPresentation: `x.emporio_product_id IN ${idsQueFicam("EmporioProduct")}`,
  Composition: `x.emporio_product_id IN ${idsQueFicam("EmporioProduct")}`,
  CompositionItem: `x.composition_id IN ${idsQueFicam("Composition")}`,
  EmporioSaleItem: `x.sale_id IN ${idsQueFicam("EmporioSale")}`,
  EmporioSaleReturnItem: `x.return_id IN ${idsQueFicam("EmporioSaleReturn")}`,
  EmporioQuoteItem: `x.quote_id IN ${idsQueFicam("EmporioQuote")}`,
  FixedExpenseSplit: `x.template_id IN ${idsQueFicam("FixedExpenseTemplate")} AND (x.establishment_id IS NULL OR x.establishment_id = ANY($3))`,
  CashSession: `x.opened_at >= $2 AND x.establishment_id = ANY($3)`,
  // Sem venda nem orçamento que fique, a numeração recomeça (a próxima venda é a nº 1).
  EmporioCounter: `EXISTS ${idsQueFicam("EmporioSale")} OR EXISTS ${idsQueFicam("EmporioQuote")}`,
};

/** Colunas de cada tabela da conta, lidas do banco no começo. */
const COLUNAS = new Map<string, Set<string>>();

/** A regra de `tabela`, com a linha chamada `apelido`. */
function regra(tabela: string, apelido = "x"): string {
  let r = MANTER[tabela];
  if (r === undefined) {
    const cols = COLUNAS.get(tabela);
    if (!cols?.has("created_at")) throw new Error(`${tabela} não tem created_at nem regra em MANTER`);
    r = cols.has("establishment_id")
      ? `x.created_at >= $2 AND (x.establishment_id IS NULL OR x.establishment_id = ANY($3))`
      : `x.created_at >= $2`;
  }
  return r.replace(/\bx\./g, `${apelido}.`);
}

/** Subconsulta com os ids que ficam em `tabela` (avaliada na hora, por isso pode citar outra regra). */
function idsQueFicam(tabela: string): string {
  const a = `f_${tabela.toLowerCase()}`;
  return `(SELECT ${a}.id FROM "${tabela}" ${a} WHERE ${a}.tenant_id = $1 AND (${"${REGRA:" + tabela + "}"}))`;
}

/** Troca as marcas `${REGRA:Tabela}` pela regra, com o apelido certo. */
function expandir(sql: string): string {
  return sql.replace(/\$\{REGRA:(\w+)\}/g, (_, t: string) => expandir(regra(t, `f_${t.toLowerCase()}`)));
}

const corteEmBrasilia = (dia: string) => `${dia} 03:00:00`;

/**
 * O Postgres precisa saber o tipo de todo parâmetro enviado, e nem toda regra de
 * `MANTER` usa os três: este trecho cita os três com o tipo, sem filtrar nada.
 */
const TIPOS = `($2::timestamp, $3::text[]) IS NOT NULL`;

/** As tabelas com `tenant_id`, e as colunas de cada uma em `COLUNAS`. */
async function tabelasDaConta(c: Client): Promise<string[]> {
  const r = await c.query(
    `SELECT table_name, array_agg(column_name::text) AS cols FROM information_schema.columns
     WHERE table_schema = 'public' GROUP BY table_name
     HAVING bool_or(column_name = 'tenant_id') ORDER BY table_name`,
  );
  for (const x of r.rows) COLUNAS.set(x.table_name, new Set(x.cols as string[]));
  return r.rows.map((x) => x.table_name as string);
}

/** md5 e contagem das linhas da tabela que satisfazem `onde` (com `x` como apelido). */
async function digital(c: Client, tabela: string, onde: string, p: unknown[]) {
  const sql = `SELECT count(*)::int AS n, md5(coalesce(string_agg(row_to_json(x)::text, '|' ORDER BY row_to_json(x)::text), '')) AS h
     FROM "${tabela}" x WHERE x.tenant_id = $1 AND ${TIPOS} AND (${onde})`;
  const r = await c.query(sql, p);
  return { n: r.rows[0].n as number, h: r.rows[0].h as string };
}

async function main() {
  const args = lerArgs();
  const url = process.env.DATABASE_URL ?? "";
  const local = /@(127\.0\.0\.1|localhost):/.test(url);
  if (!local && !args.producao) {
    console.error("A URL não é a do banco local. Para produção, passe a URL inline e --producao.");
    process.exit(2);
  }
  const p = [args.conta, corteEmBrasilia(args.desde), args.lojas];
  const c = new Client({ connectionString: url });
  await c.connect();

  const conta = await c.query(`SELECT name FROM "Tenant" WHERE id = $1`, [args.conta]);
  if (conta.rowCount !== 1) throw new Error("conta não encontrada");
  const lojas = await c.query(`SELECT id, name FROM "Establishment" WHERE tenant_id = $1 AND id = ANY($2)`, [args.conta, args.lojas]);
  if (lojas.rowCount !== args.lojas.length) throw new Error("alguma loja de --lojas não é desta conta");
  console.log(`Conta: ${conta.rows[0].name} (${local ? "banco LOCAL" : "PRODUÇÃO"})`);
  console.log(`Lojas que ficam: ${lojas.rows.map((l) => l.name).join(", ")}`);
  console.log(`Corte: ${args.desde} (00:00 de Brasília)\n`);

  const tabelas = await tabelasDaConta(c);
  const desconhecidas = Object.keys(MANTER).filter((t) => !tabelas.includes(t));
  if (desconhecidas.length) throw new Error(`MANTER cita tabela inexistente: ${desconhecidas.join(", ")}`);
  for (const t of tabelas) regra(t); // tabela sem regra possível para aqui, antes de tudo

  // Loja criada desde o corte e fora de --lojas é do cliente: parar, e não apagar.
  const novas = await c.query(
    `SELECT name FROM "Establishment" WHERE tenant_id = $1 AND created_at >= $2::timestamp AND NOT (id = ANY($3::text[]))`,
    p,
  );
  if (novas.rowCount) throw new Error(`loja criada desde o corte e fora de --lojas: ${novas.rows.map((l) => l.name).join(", ")}`);

  const soContar = !local && !args.confirmar;
  await c.query(soContar ? "BEGIN READ ONLY" : "BEGIN");

  const antes: Record<string, { total: number; fica: { n: number; h: string } }> = {};
  for (const t of tabelas) {
    const total = (await c.query(`SELECT count(*)::int AS n FROM "${t}" WHERE tenant_id = $1`, [args.conta])).rows[0].n as number;
    if (total === 0) continue;
    antes[t] = { total, fica: await digital(c, t, expandir(regra(t)), p) };
  }
  const linhas = Object.entries(antes).map(([t, v]) => ({ tabela: t, total: v.total, fica: v.fica.n, sai: v.total - v.fica.n }));
  console.table(linhas);
  console.log(`Total: sai ${linhas.reduce((s, l) => s + l.sai, 0)}, fica ${linhas.reduce((s, l) => s + l.fica, 0)}.`);

  if (soContar) {
    await c.query("ROLLBACK");
    await c.end();
    console.log("\nProdução sem --confirmar: só contei, nada foi apagado.");
    return;
  }

  // Apaga em passadas: a ordem das chaves estrangeiras se resolve sozinha, e
  // uma linha presa por outra que fica não trava o resto (a conferência pega).
  const pendentes = new Set(Object.keys(antes).filter((t) => antes[t].total > antes[t].fica.n));
  const motivo = new Map<string, string>();
  // A troca forma um ciclo (a venda nova aponta para a devolução, que aponta
  // para a venda original): solta a ponta da venda nas vendas que saem.
  await c.query(
    `UPDATE "EmporioSale" x SET exchange_return_id = NULL
     WHERE x.tenant_id = $1 AND ${TIPOS} AND x.exchange_return_id IS NOT NULL AND NOT coalesce((${expandir(regra("EmporioSale"))}), false)`,
    p,
  );
  for (let passada = 1; pendentes.size > 0 && passada <= 30; passada++) {
    let apagou = 0;
    for (const t of [...pendentes]) {
      await c.query("SAVEPOINT s");
      try {
        const sql = `DELETE FROM "${t}" x WHERE x.tenant_id = $1 AND ${TIPOS} AND NOT coalesce((${expandir(regra(t))}), false)`;
        const r = await c.query(sql, p);
        await c.query("RELEASE SAVEPOINT s");
        apagou += r.rowCount ?? 0;
        pendentes.delete(t);
      } catch (e) {
        motivo.set(t, e instanceof Error ? e.message : String(e));
        await c.query("ROLLBACK TO SAVEPOINT s");
      }
    }
    if (apagou === 0) break;
  }

  // Conferência: o que sobrou de cada tabela é exatamente o que devia ficar.
  const falhas: string[] = [];
  for (const t of Object.keys(antes)) {
    const depois = await digital(c, t, "true", p);
    const esperado = antes[t].fica;
    if (depois.n !== esperado.n || depois.h !== esperado.h) {
      falhas.push(`${t}: devia ficar ${esperado.n} linha(s) intactas, ficaram ${depois.n}${depois.n === esperado.n ? " (alteradas)" : ""}`);
    }
  }
  for (const t of pendentes) falhas.push(`${t}: não consegui apagar (${motivo.get(t) ?? "?"})`);

  if (falhas.length) {
    await c.query("ROLLBACK");
    await c.end();
    console.error("\nREPROVADO, nada foi gravado:\n- " + falhas.join("\n- "));
    process.exit(1);
  }
  if (!args.confirmar) {
    await c.query("ROLLBACK");
    await c.end();
    console.log("\nEnsaio aprovado: o que fica ficou intacto e o resto saiu. Desfeito (sem --confirmar).");
    return;
  }
  await c.query("COMMIT");
  await c.end();
  console.log("\nGravado: o que fica ficou intacto e o resto saiu.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
