import "./_env-local";
import { Client } from "pg";
import { exigirBancoLocal } from "./_banco-local";

/**
 * Tira da conta do seed (banco LOCAL) o que os outros cenarios deixaram e a
 * demonstracao do Meu Emporio nao tem, para as figuras do manual verem a tela
 * da demonstracao e so ela.
 *
 * Por que existe: dezenas de cenarios (`_cenario-emporio-*`) criam loja, cliente
 * e produto com prefixo proprio na MESMA conta do seed e nao limpam tudo. A conta
 * passou de 3 lojas para 46, e telas do manual (Estabelecimentos, Financeiro de
 * hoje, Caixa, Relatorios, Clientes) cresceram para alem da altura das figuras.
 *
 * O que faz:
 * - apaga toda loja que nao e uma das tres da demonstracao, com tudo o que
 *   depende dela (vendas, caixa, estoque, transferencias, lancamentos...);
 * - apaga todo modelo de despesa fixa que nao e "Aluguel" nem "Energia eletrica";
 * - apaga toda conta bancaria que nao e a "Conta da loja";
 * - apaga todo cliente do Emporio que nao e da demonstracao nem o "Consumidor
 *   final", com o que depende dele.
 *
 * Como apaga sem listar tabela por tabela: percorre as chaves estrangeiras do
 * proprio banco. Cada linha que aponta para uma linha apagada tambem sai (e a
 * que aponta para ela, e assim por diante); chave que e SET NULL so e zerada.
 * Com `session_replication_role = replica` a ordem de exclusao nao importa
 * (ha ciclos: venda e orcamento se apontam). Tudo numa transacao.
 *
 * So banco local: `exigirBancoLocal()` barra o resto, e o usuario do Docker e
 * superuser (o `replica` exige).
 */

/** As tres lojas de `scripts/cenario-demonstracao-emporio.ts` (constante LOJAS). */
export const LOJAS_DA_DEMONSTRACAO = ["Depósito Central", "Loja Centro", "Loja da Rodovia"];
/** Os cinco clientes de `cenario-demonstracao-emporio.ts` (constante CLIENTES) e o cliente de balcao. */
export const CLIENTES_DA_DEMONSTRACAO = [
  "Chácara Três Irmãos",
  "Sítio Boa Esperança",
  "Haras Santa Clara",
  "Fazenda Pedra Branca",
  "Maria das Dores Ferreira",
  "Consumidor final",
];

/** A unica conta bancaria da demonstracao (constante CONTA_NOME). A Posicao de caixa lista todas. */
export const CONTA_DA_DEMONSTRACAO = "Conta da loja";

/** Os dois modelos de despesa fixa da demonstracao (`cenario-demonstracao-emporio.ts`). */
export const MODELOS_DA_DEMONSTRACAO = ["Aluguel", "Energia elétrica"];

type Fk ={ filha: string; coluna: string; mae: string; acao: string; anulavel: boolean };

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function lerFks(c: Client): Promise<Fk[]> {
  const r = await c.query(`
    select cl.relname as filha, att.attname as coluna, cm.relname as mae, con.confdeltype as acao, not att.attnotnull as anulavel
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_class cm on cm.oid = con.confrelid
    join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'public'
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and array_length(con.conkey, 1) = 1
  `);
  return r.rows.map((x) => ({ filha: x.filha, coluna: x.coluna, mae: x.mae, acao: x.acao, anulavel: x.anulavel }));
}

/** Apaga as linhas `ids` de `tabela` e tudo o que depende delas. Devolve quantas linhas saíram. */
async function apagarComDependentes(c: Client, tabela: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const fks = await lerFks(c);
  const apagar = new Map<string, Set<string>>();
  const zerar: { tabela: string; coluna: string; mae: string }[] = [];
  const fila: { tabela: string; ids: string[] }[] = [{ tabela, ids }];
  while (fila.length > 0) {
    const { tabela: t, ids: lote } = fila.pop()!;
    const ja = apagar.get(t) ?? new Set<string>();
    const novos = lote.filter((i) => !ja.has(i));
    if (novos.length === 0) continue;
    novos.forEach((i) => ja.add(i));
    apagar.set(t, ja);
    for (const fk of fks.filter((f) => f.mae === t)) {
      if (fk.acao === "n") {
        zerar.push({ tabela: fk.filha, coluna: fk.coluna, mae: t });
        continue;
      }
      const r = await c.query(`select id from ${q(fk.filha)} where ${q(fk.coluna)} = any($1::text[])`, [novos]);
      if (r.rows.length > 0) fila.push({ tabela: fk.filha, ids: r.rows.map((x) => x.id as string) });
    }
  }
  // O que e SET NULL e aponta para linha apagada passa a apontar para nada, salvo se a propria linha sai.
  for (const z of zerar) {
    const alvo = apagar.get(z.mae);
    if (!alvo || alvo.size === 0) continue;
    await c.query(`update ${q(z.tabela)} set ${q(z.coluna)} = null where ${q(z.coluna)} = any($1::text[])`, [[...alvo]]);
  }
  let total = 0;
  for (const [t, conj] of apagar) {
    const r = await c.query(`delete from ${q(t)} where id = any($1::text[])`, [[...conj]]);
    total += r.rowCount ?? 0;
  }
  return total;
}

export async function limparForaDaDemonstracao(tenant_id: string): Promise<{ lojas: number; clientes: number; contas: number; linhas: number }> {
  exigirBancoLocal();
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("set local session_replication_role = replica");
    const lojas = await c.query(`select id from "Establishment" where tenant_id = $1 and not (name = any($2::text[]))`, [tenant_id, LOJAS_DA_DEMONSTRACAO]);
    const clientes = await c.query(`select id from "EmporioCustomer" where tenant_id = $1 and not (name = any($2::text[]))`, [tenant_id, CLIENTES_DA_DEMONSTRACAO]);
    const contas = await c.query(`select id from "BankAccount" where tenant_id = $1 and name <> $2`, [tenant_id, CONTA_DA_DEMONSTRACAO]);
    let linhas = await apagarComDependentes(c, "Establishment", lojas.rows.map((x) => x.id));
    linhas += await apagarComDependentes(c, "BankAccount", contas.rows.map((x) => x.id));
    // Apagar a loja leva as partes do rateio dela e deixa o modelo de despesa sem nenhuma
    // (a projecao do Financeiro quebra com isso); e outros cenarios penduram modelos proprios nas lojas da demonstracao.
    const modelos = await c.query(`select id from "FixedExpenseTemplate" where tenant_id = $1 and not (name = any($2::text[]))`, [tenant_id, MODELOS_DA_DEMONSTRACAO]);
    linhas += await apagarComDependentes(c, "FixedExpenseTemplate", modelos.rows.map((x) => x.id));
    linhas += await apagarComDependentes(c, "EmporioCustomer", clientes.rows.map((x) => x.id));
    await c.query("commit");
    return { lojas: lojas.rowCount ?? 0, clientes: clientes.rowCount ?? 0, contas: contas.rowCount ?? 0, linhas };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
