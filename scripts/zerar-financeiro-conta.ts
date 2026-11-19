/**
 * Zera o financeiro e as vendas de uma conta do Meu Empório, como se a empresa
 * abrisse hoje, sem perder cadastros nem orçamentos (pedido do usuário em
 * 19/11/2026, para a Da Mata: a Agromax usou o sistema para aprender, e o
 * movimento não era real).
 *
 * SAI (a lista `SAI`, abaixo): vendas, devoluções, caixa (movimentos, turnos,
 * conferências, entregas, transferências), cartão (parcelas, antecipações),
 * cheques, boletos, pedidos de pagamento, acordos e liberações de fiado,
 * pagamentos a franqueado, compras, despesas da venda e fixas, os lançamentos
 * financeiros do Empório; do estoque, só o que veio de venda, compra ou
 * devolução; o contador das vendas (a próxima volta a ser a nº 1); e, do
 * Histórico, as linhas dessas operações.
 *
 * FICA todo o resto, intacto: orçamentos, clientes, fornecedores, produtos,
 * preços, receitas, produções, implantações e contagens de estoque, contas
 * bancárias, caixas, adquirentes e taxas, franqueados, configurações, usuários.
 *
 * Como prova: antes de apagar, tira a impressão digital (md5 das linhas) do que
 * deve ficar em CADA tabela da conta; depois, a do que sobrou tem de ser igual.
 * Uma linha que fica e mudou (um SET NULL em cascata, por exemplo) reprova.
 * Qualquer diferença desfaz tudo (ROLLBACK). Com `--confirmar`, grava no fim
 * uma linha `suporte.financeiro_zerado` no Histórico.
 *
 * Uso:
 *   npx tsx scripts/zerar-financeiro-conta.ts --conta <tenant_id>
 *     banco local: apaga, confere e DESFAZ (ensaio completo).
 *   ... --confirmar               apaga, confere e grava.
 *   Em produção, a URL vai inline e é preciso `--producao`. Sem `--confirmar`,
 *   em produção, só conta (sessão somente leitura).
 */
import "./_env-local";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

type Args = { conta: string; confirmar: boolean; producao: boolean };

function lerArgs(): Args {
  const a = process.argv.slice(2);
  const i = a.indexOf("--conta");
  const conta = i >= 0 ? a[i + 1] : undefined;
  if (!conta) {
    console.error("Uso: --conta <tenant_id> [--confirmar] [--producao]");
    process.exit(2);
  }
  return { conta, confirmar: a.includes("--confirmar"), producao: a.includes("--producao") };
}

/** As ações do Histórico que descrevem o que sai (chaves de `src/lib/emporio/historico.ts`). */
const ACOES_QUE_SAEM = [
  "compra.criar", "compra.receber", "compra.cancelar",
  "venda.criar", "venda.cancelar", "venda.editar", "venda.devolver", "venda.trocar", "venda.pedido_para_entrega",
  "fiado.receber", "fiado.liberar", "fiado.cobrar", "fiado.acordo", "fiado.acordo.desfazer",
  "pagamento.pedir", "pagamento.aprovar", "pagamento.recusar",
  "conciliacao.carimbar", "conciliacao.descarimbar",
  "cartao.conferir", "cartao.conferir_dia", "cartao.desfazer_conferencia", "cartao.antecipar", "cartao.antecipacao.desfazer",
  "caixa.transferir", "caixa.conferir", "caixa.saldo_inicial", "caixa.saldo_inicial_removido", "caixa.abrir", "caixa.sangria",
  "caixa.encerrar", "caixa.confirmar_entrega",
  "cheque.depositar", "cheque.compensar", "cheque.devolvido", "cheque.completar",
  "boleto.pagar", "boleto.fiado",
  "despesa.fixa", "despesa.fixa.recalcular", "despesa.corrigir", "despesa.pagar", "despesa.avulsa.criar", "despesa.adiar", "despesa.cancelar",
  "franqueado.pagar",
];

/** Lançamento financeiro do Empório (venda, compra, despesa, avulso). */
const DO_EMPORIO = `(x.related_module = 'emporio' OR x.emporio_manual = true)`;

/**
 * O que SAI, por tabela (`x` é a linha, $1 a conta, $2 as ações do Histórico).
 * Tabela fora daqui: nada sai, e o que tem fica idêntico.
 */
const SAI: Record<string, string> = {
  EmporioSale: "true",
  EmporioSaleItem: "true",
  EmporioSalePayment: "true",
  EmporioSaleReturn: "true",
  EmporioSaleReturnItem: "true",
  CashMovement: "true",
  CashSession: "true",
  CashCount: "true",
  CashHandover: "true",
  CashTransfer: "true",
  CardReceivable: "true",
  CardAnticipation: "true",
  EmporioCheck: "true",
  EmporioBoleto: "true",
  EmporioPaymentRequest: "true",
  EmporioCreditAgreement: "true",
  EmporioCreditRelease: "true",
  EmporioFranchiseePayment: "true",
  EmporioPurchase: "true",
  EmporioPurchaseItem: "true",
  SaleVariableExpense: "true",
  FixedExpenseTemplate: "true",
  FixedExpenseSplit: "true",
  FixedExpenseOccurrence: "true",
  FinancialEntry: DO_EMPORIO,
  FinancialPayment: `x.entry_id IN (SELECT x.id FROM "FinancialEntry" x WHERE x.tenant_id = $1 AND ${DO_EMPORIO})`,
  StockMovement: `(x.sale_id IS NOT NULL OR x.purchase_id IS NOT NULL OR x.sale_return_id IS NOT NULL OR x.sale_variable_expense_id IS NOT NULL)`,
  EmporioCounter: `x.key = 'venda'`,
  EmporioAuditLog: `x.action = ANY($2::text[])`,
};

/** O Postgres precisa do tipo de todo parâmetro, e nem toda regra usa o $2. */
const TIPOS = `($2::text[]) IS NOT NULL`;

const saiDe = (t: string) => SAI[t] ?? "false";

async function tabelasDaConta(c: Client): Promise<string[]> {
  const r = await c.query(
    `SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenant_id' ORDER BY table_name`,
  );
  return r.rows.map((x) => x.table_name as string);
}

/** md5 e contagem das linhas da tabela que satisfazem `onde`. */
async function digital(c: Client, tabela: string, onde: string, p: unknown[]) {
  const r = await c.query(
    `SELECT count(*)::int AS n, md5(coalesce(string_agg(row_to_json(x)::text, '|' ORDER BY row_to_json(x)::text), '')) AS h
     FROM "${tabela}" x WHERE x.tenant_id = $1 AND ${TIPOS} AND (${onde})`,
    p,
  );
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
  const p = [args.conta, ACOES_QUE_SAEM];
  const c = new Client({ connectionString: url });
  await c.connect();

  const conta = await c.query(`SELECT name FROM "Tenant" WHERE id = $1`, [args.conta]);
  if (conta.rowCount !== 1) throw new Error("conta não encontrada");
  console.log(`Conta: ${conta.rows[0].name} (${local ? "banco LOCAL" : "PRODUÇÃO"})\n`);

  const tabelas = await tabelasDaConta(c);
  const desconhecidas = Object.keys(SAI).filter((t) => !tabelas.includes(t));
  if (desconhecidas.length) throw new Error(`SAI cita tabela inexistente: ${desconhecidas.join(", ")}`);

  const soContar = !local && !args.confirmar;
  await c.query(soContar ? "BEGIN READ ONLY" : "BEGIN");

  const antes: Record<string, { total: number; fica: { n: number; h: string } }> = {};
  for (const t of tabelas) {
    const total = (await c.query(`SELECT count(*)::int AS n FROM "${t}" WHERE tenant_id = $1`, [args.conta])).rows[0].n as number;
    if (total === 0) continue;
    antes[t] = { total, fica: await digital(c, t, `NOT coalesce((${saiDe(t)}), false)`, p) };
  }
  const linhas = Object.entries(antes)
    .map(([t, v]) => ({ tabela: t, total: v.total, fica: v.fica.n, sai: v.total - v.fica.n }))
    .filter((l) => l.sai > 0);
  console.table(linhas);
  console.log(`Total que sai: ${linhas.reduce((s, l) => s + l.sai, 0)} linha(s), em ${linhas.length} tabela(s).`);
  console.log(`Ficam intactas: ${Object.values(antes).reduce((s, v) => s + v.fica.n, 0)} linha(s).`);

  if (soContar) {
    await c.query("ROLLBACK");
    await c.end();
    console.log("\nProdução sem --confirmar: só contei, nada foi apagado.");
    return;
  }

  // Apaga em passadas: a ordem das chaves estrangeiras se resolve sozinha.
  const pendentes = new Set(linhas.map((l) => l.tabela));
  const motivo = new Map<string, string>();
  // A troca forma um ciclo (venda nova -> devolução -> venda original), e a
  // edição outro (venda nova -> venda substituída): solta as pontas antes.
  await c.query(`UPDATE "EmporioSale" SET exchange_return_id = NULL, replaces_sale_id = NULL WHERE tenant_id = $1`, [args.conta]);
  for (let passada = 1; pendentes.size > 0 && passada <= 30; passada++) {
    let apagou = 0;
    for (const t of [...pendentes]) {
      await c.query("SAVEPOINT s");
      try {
        const r = await c.query(`DELETE FROM "${t}" x WHERE x.tenant_id = $1 AND ${TIPOS} AND (${saiDe(t)})`, p);
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
  // As contas bancárias ficam com saldo zero: nenhum movimento nem parcela de cartão sobra.
  for (const t of ["CashMovement", "CardReceivable", "EmporioSale"]) {
    const n = (await c.query(`SELECT count(*)::int AS n FROM "${t}" WHERE tenant_id = $1`, [args.conta])).rows[0].n as number;
    if (n !== 0) falhas.push(`${t}: sobraram ${n} linha(s)`);
  }

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
  const total = linhas.reduce((s, l) => s + l.sai, 0);
  await c.query(
    `INSERT INTO "EmporioAuditLog" (id, tenant_id, user_id, establishment_id, action, target_type, target_id, summary)
     VALUES ($1, $2, NULL, NULL, 'suporte.financeiro_zerado', 'conta', $2, $3)`,
    [
      `sup${randomUUID().replace(/-/g, "").slice(0, 22)}`,
      args.conta,
      `Suporte zerou, a pedido do usuário, as vendas, o caixa, as compras e o financeiro da conta (${total} registros); cadastros, orçamentos e estoque ficaram`,
    ],
  );
  await c.query("COMMIT");
  await c.end();
  console.log("\nGravado: o que fica ficou intacto e o resto saiu. Histórico registrado.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
