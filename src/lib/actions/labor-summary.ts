import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";

/**
 * O custo de mão de obra do §30, separado nas três colunas que o documento
 * pede: "Mão de obra fixa / Mão de obra eventual / Serviços terceirizados".
 *
 * A REGRA DE CLASSIFICAÇÃO NÃO É ÓBVIA, e é por isso que ela está escrita aqui
 * e tem teste:
 *
 * | coluna | o que soma |
 * |---|---|
 * | `fixa` | lançamentos pagos com `related_module: mao_de_obra` (o salário, o adiantamento, a gratificação, o benefício) |
 * | `eventual` | pagos de `ServiceJob` COM `worker_id`, ou SEM contraparte nenhuma (os três homens sem nome do §14) |
 * | `terceirizados` | pagos de `ServiceJob` COM `contact_id` |
 *
 * O serviço sem contraparte cai em `eventual`, e não em `terceirizados`, porque
 * é assim que o §14 o descreve: "vieram 3 homens trabalhar na cerca" é mão de
 * obra avulsa, não uma empresa contratada. Quem tem `contact_id` foi
 * identificado como prestador, e o §36 separa os dois de propósito.
 *
 * ⚠️ **Só o PAGO entra.** O §30 pergunta "quanto estou GASTANDO", e conta a
 * pagar ainda não é gasto: incluí-la faria o resumo do mês subir com um
 * empreito combinado hoje e pago no ano que vem.
 *
 * O período filtra por `paid_at`, que é quando o dinheiro saiu. É o mesmo
 * critério do fluxo de caixa (`getCashFlow`), e deliberadamente NÃO o do DRE,
 * que é por competência: o §30 oferece "este mês, mês anterior, este ano", que
 * são perguntas de caixa.
 */

export type LaborSummary = {
  fixa: number;
  eventual: number;
  terceirizados: number;
  total: number;
};

export async function getLaborSummary(
  db: TenantPrismaClient,
  periodo: { de: Date; ate: Date },
): Promise<LaborSummary> {
  const janela = { gte: periodo.de, lte: periodo.ate };

  const [daMaoDeObra, deServico] = await Promise.all([
    db.financialEntry.findMany({
      where: {
        related_module: "mao_de_obra",
        entry_type: "expense",
        status: "paid",
        paid_at: janela,
      },
      select: { amount: true },
    }),
    db.financialEntry.findMany({
      where: {
        related_module: "servico",
        entry_type: "expense",
        status: "paid",
        paid_at: janela,
      },
      select: { amount: true, related_id: true },
    }),
  ]);

  const fixa = daMaoDeObra.reduce((s, e) => s + (decToNum(e.amount) ?? 0), 0);

  const ids = deServico.map((e) => e.related_id).filter((id): id is string => Boolean(id));
  const jobs =
    ids.length === 0
      ? []
      : await db.serviceJob.findMany({
          where: { id: { in: ids } },
          select: { id: true, contact_id: true },
        });
  const temContato = new Map(jobs.map((j) => [j.id, j.contact_id !== null]));

  let eventual = 0;
  let terceirizados = 0;
  for (const e of deServico) {
    const valor = decToNum(e.amount) ?? 0;
    // Lançamento cujo serviço sumiu (o job foi apagado) conta como eventual em
    // vez de desaparecer: o dinheiro saiu, e o total tem que fechar.
    if (e.related_id && temContato.get(e.related_id)) terceirizados += valor;
    else eventual += valor;
  }

  return {
    fixa,
    eventual,
    terceirizados,
    total: fixa + eventual + terceirizados,
  };
}
