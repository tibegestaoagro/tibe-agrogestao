/**
 * Confere a migração dos clientes e fornecedores do Empório (Frente 1, Task 6:
 * `20261106180000_emporio_clientes_saem_de_contatos`). Só LÊ: a sessão é aberta
 * somente leitura, então serve também contra a produção (URL inline).
 *
 *   npx tsx scripts/conferir-clientes-emporio.ts antes --saida <arquivo>
 *     ANTES da migração: grava, por conta (tenant_id), quantos clientes e
 *     fornecedores devem existir depois, as vendas sem cliente e a soma do fiado
 *     em aberto. Só contagens: nenhum nome, documento ou telefone.
 *   npx tsx scripts/conferir-clientes-emporio.ts depois --antes <arquivo> [--ensaio]
 *     DEPOIS: compara com o arquivo e sai com código 1 se algo não bate.
 *     `--ensaio` confere também, caso por caso, a conta do cenário
 *     `scripts/sql/ensaio-clientes-emporio.sql` (ids com prefixo ensaio_cli_).
 *
 * O `antes` funciona nos dois formatos: no banco da produção (sem as tabelas
 * novas) e no de dev, que já tem clientes e fornecedores no formato novo e os
 * soma ao que a migração vai copiar (o id copiado é o do contato, então a
 * união não conta duas vezes).
 */
import "./_env-local";
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";

type Contagem = {
  clientes: number;
  fornecedores: number;
  vendas_sem_cliente: number;
  fiado_lancamentos: number;
  fiado_centavos: number;
};
type ArquivoAntes = { gerado_em: string; banco: string; por_conta: Record<string, Contagem> };

const CONTA_ENSAIO = "ensaio_cli_conta";
const ACOES_DE_CLIENTE = "('cliente.cadastrar', 'cliente.completar')";
const FIADO_ABERTO = `
  FROM "FinancialEntry" f
  LEFT JOIN (SELECT entry_id, SUM(ROUND(amount * 100)) AS pago FROM "FinancialPayment" GROUP BY entry_id) p ON p.entry_id = f.id
  WHERE f.related_module = 'emporio' AND f.entry_type = 'income' AND f.category = 'Vendas do Empório'
    AND f.status = 'pending' AND ROUND(f.amount * 100) - COALESCE(p.pago, 0) > 0`;

function valor(args: string[], nome: string): string | undefined {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

function bancoSemSenha(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(URL ilegível)";
  }
}

async function tabelaExiste(c: Client, tabela: string): Promise<boolean> {
  const r = await c.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [tabela]);
  return (r.rowCount ?? 0) > 0;
}

async function colunaExiste(c: Client, tabela: string, coluna: string): Promise<boolean> {
  const r = await c.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tabela, coluna],
  );
  return (r.rowCount ?? 0) > 0;
}

async function porConta(c: Client, sql: string, campo: keyof Contagem, alvo: Record<string, Contagem>): Promise<void> {
  const r = await c.query(sql);
  for (const linha of r.rows as { tenant_id: string; n: string | number }[]) {
    const atual = alvo[linha.tenant_id] ?? vazia();
    atual[campo] = Number(linha.n);
    alvo[linha.tenant_id] = atual;
  }
}

function vazia(): Contagem {
  return { clientes: 0, fornecedores: 0, vendas_sem_cliente: 0, fiado_lancamentos: 0, fiado_centavos: 0 };
}

async function fiado(c: Client, alvo: Record<string, Contagem>): Promise<void> {
  await porConta(c, `SELECT f.tenant_id, COUNT(*) AS n ${FIADO_ABERTO} GROUP BY f.tenant_id`, "fiado_lancamentos", alvo);
  await porConta(
    c,
    `SELECT f.tenant_id, SUM(ROUND(f.amount * 100) - COALESCE(p.pago, 0)) AS n ${FIADO_ABERTO} GROUP BY f.tenant_id`,
    "fiado_centavos",
    alvo,
  );
}

async function contarAntes(c: Client): Promise<Record<string, Contagem>> {
  if (!(await colunaExiste(c, "EmporioSale", "contact_id"))) {
    throw new Error("EmporioSale.contact_id não existe: este banco já passou pela migração. Use `depois`.");
  }
  const novas = await tabelaExiste(c, "EmporioCustomer");
  const temCustomerId = await colunaExiste(c, "EmporioSale", "customer_id");
  const out: Record<string, Contagem> = {};

  await porConta(
    c,
    `WITH ids AS (
       SELECT c.tenant_id, c.id FROM "Contact" c
       WHERE c.system_key IS NULL AND (
         EXISTS (SELECT 1 FROM "EmporioSale" s WHERE s.contact_id = c.id)
         OR EXISTS (SELECT 1 FROM "EmporioQuote" q WHERE q.contact_id = c.id)
         OR EXISTS (SELECT 1 FROM "EmporioCheck" k WHERE k.contact_id = c.id)
         OR EXISTS (SELECT 1 FROM "EmporioAuditLog" a
                    WHERE a.target_type = 'contato' AND a.target_id = c.id AND a.action IN ${ACOES_DE_CLIENTE}))
       ${novas ? `UNION SELECT tenant_id, id FROM "EmporioCustomer" WHERE system_key IS NULL` : ""}
     ), cf AS (
       SELECT tenant_id FROM "Contact" WHERE system_key = 'consumidor_final'
       ${novas ? `UNION SELECT tenant_id FROM "EmporioCustomer" WHERE system_key = 'consumidor_final'` : ""}
     )
     SELECT tenant_id, COUNT(*) AS n FROM (SELECT tenant_id FROM ids UNION ALL SELECT tenant_id FROM cf) x GROUP BY tenant_id`,
    "clientes",
    out,
  );
  await porConta(
    c,
    `SELECT tenant_id, COUNT(*) AS n FROM (
       SELECT c.tenant_id, c.id FROM "Contact" c WHERE EXISTS (SELECT 1 FROM "EmporioPurchase" p WHERE p.contact_id = c.id)
       ${novas ? `UNION SELECT tenant_id, id FROM "EmporioSupplier"` : ""}
     ) x GROUP BY tenant_id`,
    "fornecedores",
    out,
  );
  await porConta(
    c,
    `SELECT tenant_id, COUNT(*) AS n FROM "EmporioSale"
     WHERE contact_id IS NULL ${temCustomerId ? "AND customer_id IS NULL" : ""} GROUP BY tenant_id`,
    "vendas_sem_cliente",
    out,
  );
  await fiado(c, out);
  return out;
}

async function contarDepois(c: Client): Promise<Record<string, Contagem>> {
  const out: Record<string, Contagem> = {};
  await porConta(c, `SELECT tenant_id, COUNT(*) AS n FROM "EmporioCustomer" GROUP BY tenant_id`, "clientes", out);
  await porConta(c, `SELECT tenant_id, COUNT(*) AS n FROM "EmporioSupplier" GROUP BY tenant_id`, "fornecedores", out);
  await porConta(c, `SELECT tenant_id, COUNT(*) AS n FROM "EmporioSale" WHERE customer_id IS NULL GROUP BY tenant_id`, "vendas_sem_cliente", out);
  await fiado(c, out);
  return out;
}

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe = ""): void {
  if (!ok) falhas++;
  console.log(`${ok ? "  ok  " : "  FALHOU"} ${nome}${!ok && detalhe ? `  (${detalhe})` : ""}`);
}

async function um<T>(c: Client, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const r = await c.query(sql, params);
  return r.rows[0] as T | undefined;
}

async function conferirEnsaio(c: Client): Promise<void> {
  console.log("\nConta do ensaio (ensaio_cli_conta):");
  const clientes = (await c.query(`SELECT id, name, system_key, person_kind FROM "EmporioCustomer" WHERE tenant_id = $1 ORDER BY id`, [CONTA_ENSAIO]))
    .rows as { id: string; name: string; system_key: string | null; person_kind: string | null }[];
  const fornecedores = (await c.query(`SELECT id, name, kind, person_kind FROM "EmporioSupplier" WHERE tenant_id = $1 ORDER BY id`, [CONTA_ENSAIO]))
    .rows as { id: string; name: string; kind: string; person_kind: string | null }[];
  const contatos = (await c.query(`SELECT id FROM "Contact" WHERE tenant_id = $1 ORDER BY id`, [CONTA_ENSAIO])).rows as { id: string }[];

  confere("5 clientes", clientes.length === 5, `${clientes.length}`);
  confere("2 fornecedores", fornecedores.length === 2, `${fornecedores.length}`);
  confere(
    "os clientes têm os ids dos contatos (Consumidor final, Fiado, Ambos, Fazenda, Balcão)",
    clientes.map((x) => x.id).join(",") === "ensaio_cli_ambos,ensaio_cli_balcao,ensaio_cli_cf,ensaio_cli_fazenda,ensaio_cli_fiado",
    clientes.map((x) => x.id).join(","),
  );
  const cf = clientes.find((x) => x.id === "ensaio_cli_cf");
  confere("o Consumidor final veio com o system_key e o nome", cf?.system_key === "consumidor_final" && cf?.name === "Consumidor final");
  const fiadoCli = clientes.find((x) => x.id === "ensaio_cli_fiado");
  confere("Ensaio Fiado veio com o nome e PF", fiadoCli?.name === "Ensaio Fiado" && fiadoCli?.person_kind === "pf");
  confere(
    "os fornecedores têm os ids dos contatos (Ambos, Fornecedor), do tipo externo",
    fornecedores.map((x) => x.id).join(",") === "ensaio_cli_ambos,ensaio_cli_fornecedor" && fornecedores.every((x) => x.kind === "externo"),
    fornecedores.map((x) => `${x.id}:${x.kind}`).join(","),
  );
  const forn = fornecedores.find((x) => x.id === "ensaio_cli_fornecedor");
  confere("Ensaio Fornecedor veio com o nome e PJ", forn?.name === "Ensaio Fornecedor" && forn?.person_kind === "pj");
  confere(
    "ficam em Contatos só Ensaio Fazenda e Ensaio Contatos",
    contatos.map((x) => x.id).join(",") === "ensaio_cli_contatos,ensaio_cli_fazenda",
    contatos.map((x) => x.id).join(","),
  );

  const lanc = async (id: string) =>
    um<{ contact_id: string | null; emporio_customer_id: string | null; emporio_supplier_id: string | null }>(
      c,
      `SELECT contact_id, emporio_customer_id, emporio_supplier_id FROM "FinancialEntry" WHERE id = $1`,
      [id],
    );
  const fiado = await lanc("ensaio_cli_lanc_fiado");
  confere("o fiado aponta para Ensaio Fiado, sem contact_id", fiado?.emporio_customer_id === "ensaio_cli_fiado" && fiado?.contact_id === null, JSON.stringify(fiado));
  const vendaCf = await lanc("ensaio_cli_lanc_venda_cf");
  confere("o lançamento da venda do Consumidor final aponta para ele", vendaCf?.emporio_customer_id === "ensaio_cli_cf" && vendaCf?.contact_id === null, JSON.stringify(vendaCf));
  const pagar = await lanc("ensaio_cli_lanc_pagar");
  confere(
    "a conta a pagar aponta para Ensaio Fornecedor, sem contact_id",
    pagar?.emporio_supplier_id === "ensaio_cli_fornecedor" && pagar?.emporio_customer_id === null && pagar?.contact_id === null,
    JSON.stringify(pagar),
  );
  const compraAmbos = await lanc("ensaio_cli_lanc_compra_ambos");
  confere("a compra de Ensaio Ambos aponta para o fornecedor", compraAmbos?.emporio_supplier_id === "ensaio_cli_ambos" && compraAmbos?.emporio_customer_id === null);
  const vendaAmbos = await lanc("ensaio_cli_lanc_venda_ambos");
  confere("a venda de Ensaio Ambos aponta para o cliente", vendaAmbos?.emporio_customer_id === "ensaio_cli_ambos" && vendaAmbos?.emporio_supplier_id === null);
  const geral = await lanc("ensaio_cli_lanc_geral");
  confere(
    "o lançamento geral continua com contact_id de Ensaio Fazenda",
    geral?.contact_id === "ensaio_cli_fazenda" && geral?.emporio_customer_id === null && geral?.emporio_supplier_id === null,
    JSON.stringify(geral),
  );

  const orc = await um<{ customer_id: string | null }>(c, `SELECT customer_id FROM "EmporioQuote" WHERE id = 'ensaio_cli_orcamento'`);
  confere("o orçamento tem customer_id de Ensaio Fiado", orc?.customer_id === "ensaio_cli_fiado", JSON.stringify(orc));
  const che = await um<{ customer_id: string | null }>(c, `SELECT customer_id FROM "EmporioCheck" WHERE id = 'ensaio_cli_cheque'`);
  confere("o cheque tem customer_id de Ensaio Fiado", che?.customer_id === "ensaio_cli_fiado", JSON.stringify(che));
  const vendas = (await c.query(`SELECT id, customer_id FROM "EmporioSale" WHERE tenant_id = $1 ORDER BY number`, [CONTA_ENSAIO])).rows as {
    id: string;
    customer_id: string | null;
  }[];
  confere(
    "as vendas apontam para os clientes de mesmo id",
    vendas.map((v) => v.customer_id).join(",") === "ensaio_cli_cf,ensaio_cli_fiado,ensaio_cli_fiado,ensaio_cli_ambos,ensaio_cli_fazenda",
    vendas.map((v) => v.customer_id).join(","),
  );
  const compras = (await c.query(`SELECT supplier_id FROM "EmporioPurchase" WHERE tenant_id = $1 ORDER BY id`, [CONTA_ENSAIO])).rows as {
    supplier_id: string | null;
  }[];
  confere(
    "as compras apontam para os fornecedores de mesmo id",
    compras.map((v) => v.supplier_id).join(",") === "ensaio_cli_ambos,ensaio_cli_fornecedor",
    compras.map((v) => v.supplier_id).join(","),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const modo = args[0];
  if (modo !== "antes" && modo !== "depois") {
    console.error("Uso: antes --saida <arquivo> | depois --antes <arquivo> [--ensaio]");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL ?? "";
  const banco = bancoSemSenha(url);
  console.log(`Banco: ${banco}`);

  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");

    if (modo === "antes") {
      const saida = valor(args, "--saida");
      if (!saida) throw new Error("Falta --saida <arquivo>.");
      const por_conta = await contarAntes(c);
      const arquivo: ArquivoAntes = { gerado_em: new Date().toISOString(), banco, por_conta };
      writeFileSync(saida, JSON.stringify(arquivo, null, 2));
      for (const [conta, n] of Object.entries(por_conta)) console.log(`  ${conta}: ${JSON.stringify(n)}`);
      console.log(`Gravado em ${saida} (${Object.keys(por_conta).length} contas).`);
      return;
    }

    const arqAntes = valor(args, "--antes");
    if (!arqAntes) throw new Error("Falta --antes <arquivo>.");
    const antes = JSON.parse(readFileSync(arqAntes, "utf8")) as ArquivoAntes;
    if (antes.banco !== banco) throw new Error(`O arquivo é de outro banco (${antes.banco}).`);

    console.log("\nGeral:");
    for (const t of ["EmporioSale", "EmporioQuote", "EmporioCheck", "EmporioPurchase"]) {
      confere(`${t}.contact_id não existe mais`, !(await colunaExiste(c, t, "contact_id")));
    }
    const cfs = await um<{ n: string }>(c, `SELECT COUNT(*) AS n FROM "Contact" WHERE system_key = 'consumidor_final'`);
    confere("nenhum Contact com system_key consumidor_final", Number(cfs?.n) === 0, `${cfs?.n}`);
    const comContato = await um<{ n: string }>(c, `SELECT COUNT(*) AS n FROM "FinancialEntry" WHERE related_module = 'emporio' AND contact_id IS NOT NULL`);
    confere("nenhum lançamento do Empório com contact_id", Number(comContato?.n) === 0, `${comContato?.n}`);
    const semNome = await um<{ n: string }>(
      c,
      `SELECT COUNT(*) AS n ${FIADO_ABERTO}
         AND NOT EXISTS (SELECT 1 FROM "EmporioCustomer" ec WHERE ec.id = f.emporio_customer_id AND btrim(ec.name) <> '')`,
    );
    confere("todo lançamento de fiado em aberto tem o nome do cliente", Number(semNome?.n) === 0, `${semNome?.n} sem nome`);

    const depois = await contarDepois(c);
    const contas = [...new Set([...Object.keys(antes.por_conta), ...Object.keys(depois)])].sort();
    console.log(`\nPor conta (${contas.length}):`);
    for (const conta of contas) {
      const a = antes.por_conta[conta] ?? vazia();
      const d = depois[conta] ?? vazia();
      const campos: (keyof Contagem)[] = ["clientes", "fornecedores", "vendas_sem_cliente", "fiado_lancamentos", "fiado_centavos"];
      const diferentes = campos.filter((k) => a[k] !== d[k]);
      confere(
        `${conta}: clientes ${d.clientes}, fornecedores ${d.fornecedores}, vendas sem cliente ${d.vendas_sem_cliente}, fiado ${d.fiado_lancamentos} lanç. / ${d.fiado_centavos} centavos`,
        diferentes.length === 0,
        diferentes.map((k) => `${k}: antes ${a[k]}, depois ${d[k]}`).join("; "),
      );
    }

    if (args.includes("--ensaio")) await conferirEnsaio(c);

    console.log(falhas === 0 ? "\nTudo confere." : `\n${falhas} conferência(s) falharam.`);
    if (falhas > 0) process.exitCode = 1;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
