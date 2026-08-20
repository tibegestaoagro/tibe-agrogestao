import "dotenv/config";
import { Client } from "pg";

/**
 * Conta orfaos e mede tabelas ANTES de escrever a migracao de integridade.
 *
 * Existe porque o banco local nao serve de prova aqui: ele nao tem nenhuma
 * venda, morte ou transferencia de rebanho, e a tabela de pastos esta vazia.
 * Onde o local diz "zero orfaos", ele na verdade diz "nao observei". Um
 * `ADD CONSTRAINT` contra dado sujo derruba a migracao no meio do deploy, e a
 * Vercel nao roda migracao no build: o estrago apareceria com o schema ja
 * dessincronizado.
 *
 * SOMENTE LEITURA. Nao ha um unico comando de escrita neste arquivo, e a
 * conexao e aberta com `default_transaction_read_only`, para que o banco
 * recuse qualquer escrita mesmo que alguem acrescente uma por engano.
 *
 * Uso:
 *   npx tsx scripts/diagnostico-integridade.ts            (usa DATABASE_URL do .env)
 *   DATABASE_URL="...local..." npx tsx scripts/diagnostico-integridade.ts
 */

type Consulta = { titulo: string; sql: string };

const ORFAOS: Consulta[] = [
  {
    titulo: "HerdMovement.from_property_id sem Property",
    sql: `SELECT count(*)::int AS n FROM "HerdMovement" h WHERE h.from_property_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "Property" p WHERE p.id = h.from_property_id)`,
  },
  {
    titulo: "HerdMovement.to_property_id sem Property",
    sql: `SELECT count(*)::int AS n FROM "HerdMovement" h WHERE h.to_property_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "Property" p WHERE p.id = h.to_property_id)`,
  },
  {
    titulo: "HerdMovement.from_pasture_id sem Pasture",
    sql: `SELECT count(*)::int AS n FROM "HerdMovement" h WHERE h.from_pasture_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "Pasture" p WHERE p.id = h.from_pasture_id)`,
  },
  {
    titulo: "HerdMovement.to_pasture_id sem Pasture",
    sql: `SELECT count(*)::int AS n FROM "HerdMovement" h WHERE h.to_pasture_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "Pasture" p WHERE p.id = h.to_pasture_id)`,
  },
  {
    titulo: "HerdMovement.financial_entry_id sem FinancialEntry (o mais suspeito: ha DELETE fisico em cancelMovement)",
    sql: `SELECT count(*)::int AS n FROM "HerdMovement" h WHERE h.financial_entry_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "FinancialEntry" f WHERE f.id = h.financial_entry_id)`,
  },
  {
    titulo: "HerdMovement apontando para Property de OUTRO tenant",
    sql: `SELECT count(*)::int AS n FROM "HerdMovement" h
          JOIN "Property" p ON p.id = h.to_property_id WHERE p.tenant_id <> h.tenant_id`,
  },
];

const ALERTAS: Consulta[] = [
  {
    titulo: "Alert com related_id ou related_module nulo",
    sql: `SELECT count(*)::int AS n FROM "Alert" WHERE related_id IS NULL OR related_module IS NULL`,
  },
  {
    titulo: "Alert duplicado pela identidade logica MAIS o dia (a chave escolhida)",
    sql: `SELECT count(*)::int AS n FROM (
            SELECT 1 FROM "Alert"
            GROUP BY tenant_id, alert_type, related_module, related_id, (scheduled_for AT TIME ZONE 'UTC')::date
            HAVING count(*) > 1
          ) d`,
  },
  {
    titulo: "Alert com scheduled_for nulo (entraria na chave do dia como NULL)",
    sql: `SELECT count(*)::int AS n FROM "Alert" WHERE scheduled_for IS NULL`,
  },
];

/**
 * As duas verdades do rebanho.
 *
 * `AnimalBatch.quantity` e a soma de `HerdMovement` sao fontes concorrentes, e
 * o invariante 2 diz que o saldo e o livro-razao. Esta secao mede a distancia
 * entre as duas e mostra DE ONDE ela vem, porque a causa muda a correcao:
 *
 * - lote com quantidade que o razao nao conhece: veio de `POST /api/v1/animals`
 *   ou do cadastro assistido do WhatsApp, que gravam ficha sem movimentacao;
 * - movimentacao sem lote: veio de uma compra registrada por categoria, sem
 *   brinco, que e o caminho normal do modelo novo.
 *
 * O segundo nao e defeito: e o modelo por categoria funcionando. O primeiro e
 * rebanho invisivel ao saldo.
 */
const REBANHO: Consulta[] = [
  {
    titulo: "cabecas em AnimalBatch (todas as fazendas)",
    sql: `SELECT COALESCE(sum(quantity),0)::int AS n FROM "AnimalBatch"`,
  },
  {
    titulo: "cabecas pelo livro-razao (entradas menos saidas, sem canceladas)",
    sql: `SELECT (COALESCE(sum(CASE WHEN to_category_id IS NOT NULL THEN quantity ELSE 0 END),0)
                - COALESCE(sum(CASE WHEN from_category_id IS NOT NULL THEN quantity ELSE 0 END),0))::int AS n
          FROM "HerdMovement" WHERE canceled_at IS NULL`,
  },
  {
    titulo: "LOTES com saldo que o razao nao conhece (rebanho invisivel)",
    sql: `SELECT COALESCE(sum(b.quantity),0)::int AS n FROM "AnimalBatch" b
          WHERE b.quantity > 0
            AND NOT EXISTS (SELECT 1 FROM "HerdMovement" h WHERE h.batch_id = b.id AND h.canceled_at IS NULL)`,
  },
  {
    titulo: "movimentacoes sem lote (esperado: compra por categoria, sem brinco)",
    sql: `SELECT COALESCE(sum(quantity),0)::int AS n FROM "HerdMovement"
          WHERE batch_id IS NULL AND canceled_at IS NULL AND to_category_id IS NOT NULL`,
  },
];

const TAMANHOS: Consulta = {
  titulo: "tamanho das tabelas que recebem indice",
  sql: `SELECT relname AS tabela,
               n_live_tup::int AS linhas_estimadas,
               pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
        FROM pg_stat_user_tables
        WHERE relname IN ('FinancialEntry','HerdMovement','StockMovement','Alert')
        ORDER BY n_live_tup DESC`,
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL nao definida.");
    process.exit(1);
  }

  const producao = /neon\.tech/i.test(url);
  console.log(producao ? "BANCO: PRODUCAO (Neon)" : "BANCO: local");
  console.log("modo: somente leitura\n");

  const client = new Client({ connectionString: url });
  await client.connect();
  // Trava do lado do servidor: qualquer escrita passa a ser recusada.
  await client.query("SET default_transaction_read_only = on");

  console.log("--- orfaos de chave estrangeira ---");
  for (const c of [...ORFAOS]) {
    const r = await client.query<{ n: number }>(c.sql);
    const n = r.rows[0]?.n ?? 0;
    console.log(`${n === 0 ? "ok  " : "!!  "} ${String(n).padStart(6)}  ${c.titulo}`);
  }

  console.log("\n--- alertas ---");
  for (const c of ALERTAS) {
    const r = await client.query<{ n: number }>(c.sql);
    const n = r.rows[0]?.n ?? 0;
    console.log(`${n === 0 ? "ok  " : "!!  "} ${String(n).padStart(6)}  ${c.titulo}`);
  }

  console.log("\n--- as duas verdades do rebanho ---");
  const numeros: Record<string, number> = {};
  for (const c of REBANHO) {
    const r = await client.query<{ n: number }>(c.sql);
    const n = r.rows[0]?.n ?? 0;
    numeros[c.titulo] = n;
    console.log(`     ${String(n).padStart(6)}  ${c.titulo}`);
  }
  const emLote = numeros["cabecas em AnimalBatch (todas as fazendas)"] ?? 0;
  const noRazao = numeros["cabecas pelo livro-razao (entradas menos saidas, sem canceladas)"] ?? 0;
  const invisivel = numeros["LOTES com saldo que o razao nao conhece (rebanho invisivel)"] ?? 0;
  console.log(`     ${String(noRazao - emLote).padStart(6)}  diferenca (razao menos lotes)`);
  if (invisivel > 0) {
    console.log("");
    console.log(`     !! ${invisivel} cabeca(s) existem como ficha e NAO aparecem no saldo.`);
    console.log("        Vieram de POST /api/v1/animals ou do cadastro assistido do");
    console.log("        WhatsApp, que gravam ficha sem emitir movimentacao.");
  }

  console.log("\n--- " + TAMANHOS.titulo + " ---");
  const t = await client.query(TAMANHOS.sql);
  for (const linha of t.rows) {
    console.log(`     ${String(linha.tabela).padEnd(16)} ${String(linha.linhas_estimadas).padStart(8)} linhas   ${linha.tamanho}`);
  }

  await client.end();
}

main();
