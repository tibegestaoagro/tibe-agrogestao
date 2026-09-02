import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 33, fase 2: o serviço contratado de terceiro.
 *
 * Prova, por seção do documento do cliente:
 *   1. §14, §15, §17, §18, §19: o total derivado, e as bordas dele.
 *
 * Roda: `npm run test:m58`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🔧 M58: serviço contratado (Módulo 33, fase 2)\n");

async function main() {
  // ── 1. O total derivado (§14, §15, §17, §18, §19) ──────────────────────
  //
  // Função PURA, sem banco. As bordas (empreito sem valor, log cancelado,
  // preço nulo, `worker_count`) são exatamente o que um teste com fixture
  // esconderia atrás de um caso feliz.

  console.log("1. O total derivado (§14, §15, §17, §18, §19)");
  const { totalDoServico, quantidadeTrabalhada } = await import(
    "@/lib/mao-de-obra/total-do-servico"
  );

  const log = (q: number, cancelado = false) => ({
    quantity: q,
    canceled_at: cancelado ? new Date() : null,
  });

  check(
    "§14: 3 homens por 4 dias a 150 dá R$ 1.800 (12 diárias)",
    totalDoServico(
      { pricing: "dia", unit_price: 150, agreed_amount: null, worker_count: 3 },
      [log(4)],
    ) === 1800,
    String(
      totalDoServico(
        { pricing: "dia", unit_price: 150, agreed_amount: null, worker_count: 3 },
        [log(4)],
      ),
    ),
  );
  check(
    "e a QUANTIDADE é 4, não 12: worker_count multiplica o valor, não os dias",
    quantidadeTrabalhada([log(4)]) === 4,
    String(quantidadeTrabalhada([log(4)])),
  );
  check(
    "§15: empreito de R$ 6.000 ignora quantidade e preço unitário",
    totalDoServico(
      { pricing: "fechado", unit_price: null, agreed_amount: 6000, worker_count: 1 },
      [log(999)],
    ) === 6000,
  );
  check(
    "§17: 30 hectares a 120 dá R$ 3.600",
    totalDoServico(
      { pricing: "hectare", unit_price: 120, agreed_amount: null, worker_count: 1 },
      [log(30)],
    ) === 3600,
  );
  check(
    "§18: 12 horas a 250 dá R$ 3.000",
    totalDoServico(
      { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
      [log(12)],
    ) === 3000,
  );
  check(
    "§19: vários dias somam (5 + 7 + 4 horas a 250 dá R$ 4.000)",
    totalDoServico(
      { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
      [log(5), log(7), log(4)],
    ) === 4000,
  );
  check(
    "log CANCELADO não conta",
    totalDoServico(
      { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
      [log(5), log(7, true)],
    ) === 1250,
    String(
      totalDoServico(
        { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
        [log(5), log(7, true)],
      ),
    ),
  );
  check(
    "sem log nenhum, o total é ZERO, não NaN",
    totalDoServico(
      { pricing: "hectare", unit_price: 120, agreed_amount: null, worker_count: 1 },
      [],
    ) === 0,
  );
  check(
    "preço unitário nulo fora do fechado devolve zero, não NaN",
    totalDoServico(
      { pricing: "hectare", unit_price: null, agreed_amount: null, worker_count: 1 },
      [log(30)],
    ) === 0,
  );
  check(
    "fechado SEM valor combinado devolve zero, e NÃO cai no preço unitário",
    totalDoServico(
      { pricing: "fechado", unit_price: 999, agreed_amount: null, worker_count: 1 },
      [log(2)],
    ) === 0,
    String(
      totalDoServico(
        { pricing: "fechado", unit_price: 999, agreed_amount: null, worker_count: 1 },
        [log(2)],
      ),
    ),
  );
  check(
    "decimal não vira dízima: 2,5 horas a 250 dá 625",
    totalDoServico(
      { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
      [log(2.5)],
    ) === 625,
  );
  check(
    "worker_count zero ou negativo conta como 1, nunca zera o serviço",
    totalDoServico(
      { pricing: "dia", unit_price: 150, agreed_amount: null, worker_count: 0 },
      [log(4)],
    ) === 600,
    String(
      totalDoServico(
        { pricing: "dia", unit_price: 150, agreed_amount: null, worker_count: 0 },
        [log(4)],
      ),
    ),
  );
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M58 verde" : `\n❌ M58: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
