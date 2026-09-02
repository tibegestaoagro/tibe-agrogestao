import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 33, fase 1: a mão de obra fixa.
 *
 * Prova, por seção do documento do cliente:
 *   1. §5 e §7: a data do próximo pagamento, incluindo o dia 31 em fevereiro.
 *
 * Roda: `npm run test:m57`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("👷 M57: mão de obra fixa (Módulo 33, fase 1)\n");

async function main() {
  // ── 1. A data do próximo pagamento (§5, §7) ────────────────────────────
  //
  // Função PURA, sem banco: os casos de borda (dia 31 em fevereiro, "a partir
  // do próprio dia de pagamento") são exatamente o que um teste com banco
  // esconderia atrás de fixture.

  console.log("1. A data do próximo pagamento (§5, §7)");
  const { proximaDataDePagamento } = await import("@/lib/mao-de-obra/proxima-data");

  const d = (s: string) => new Date(`${s}T12:00:00.000Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const proxima = (f: Parameters<typeof proximaDataDePagamento>[0], dia: number | null, base: string) =>
    iso(proximaDataDePagamento(f, dia, d(base)));

  check(
    "mensal, dia 5, a partir de 02/09 cai em 05/09",
    proxima("mensal", 5, "2026-09-02") === "2026-09-05",
    proxima("mensal", 5, "2026-09-02"),
  );
  check(
    "mensal, dia 5, a partir do PRÓPRIO dia 5 cai no mês seguinte",
    proxima("mensal", 5, "2026-09-05") === "2026-10-05",
    proxima("mensal", 5, "2026-09-05"),
  );
  check(
    "mensal, dia 5, a partir de 20/09 cai em 05/10",
    proxima("mensal", 5, "2026-09-20") === "2026-10-05",
    proxima("mensal", 5, "2026-09-20"),
  );
  check(
    "mensal, dia 31, em fevereiro cai no ÚLTIMO dia do mês, não em 03/03",
    proxima("mensal", 31, "2026-02-01") === "2026-02-28",
    proxima("mensal", 31, "2026-02-01"),
  );
  check(
    "mensal, dia 31, em ano bissexto respeita o 29",
    proxima("mensal", 31, "2028-02-01") === "2028-02-29",
    proxima("mensal", 31, "2028-02-01"),
  );
  check(
    "mensal, dia 31, em dezembro vira janeiro do ano seguinte",
    proxima("mensal", 31, "2026-12-31") === "2027-01-31",
    proxima("mensal", 31, "2026-12-31"),
  );
  check(
    "semanal soma 7 dias",
    proxima("semanal", null, "2026-09-02") === "2026-09-09",
    proxima("semanal", null, "2026-09-02"),
  );
  check(
    "quinzenal soma 15 dias",
    proxima("quinzenal", null, "2026-09-02") === "2026-09-17",
    proxima("quinzenal", null, "2026-09-02"),
  );
  check(
    "quinzenal IGNORA o dia habitual (não é pagamento do mês)",
    proxima("quinzenal", 5, "2026-09-02") === "2026-09-17",
    proxima("quinzenal", 5, "2026-09-02"),
  );
  check(
    "diaria soma 1 dia",
    proxima("diaria", null, "2026-09-02") === "2026-09-03",
    proxima("diaria", null, "2026-09-02"),
  );
  check(
    "mensal SEM dia habitual soma um mês a partir da data",
    proxima("mensal", null, "2026-09-02") === "2026-10-02",
    proxima("mensal", null, "2026-09-02"),
  );
  check(
    "`outra` se comporta como mensal",
    proxima("outra", 10, "2026-09-02") === "2026-09-10",
    proxima("outra", 10, "2026-09-02"),
  );
  check(
    "o resultado é sempre ESTRITAMENTE depois da data base",
    proximaDataDePagamento("mensal", 5, d("2026-09-05")).getTime() > d("2026-09-05").getTime(),
  );
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M57 verde" : `\n❌ M57: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
