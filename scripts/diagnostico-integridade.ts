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

  console.log("\n--- " + TAMANHOS.titulo + " ---");
  const t = await client.query(TAMANHOS.sql);
  for (const linha of t.rows) {
    console.log(`     ${String(linha.tabela).padEnd(16)} ${String(linha.linhas_estimadas).padStart(8)} linhas   ${linha.tamanho}`);
  }

  await client.end();
}

main();
