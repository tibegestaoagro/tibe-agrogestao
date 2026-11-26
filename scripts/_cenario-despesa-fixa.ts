import type { prisma as PrismaBase } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";

/**
 * Apoio dos cenarios do Meu Emporio (nao e suite): solta as lojas e os lancamentos
 * de teste da despesa fixa antes de apagar. A tela de Despesas gera uma
 * `FixedExpenseOccurrence` por mes para cada modelo, e o rateio de um modelo de
 * outro cenario (a despesa que o roteiro f4a cadastra divide entre TODAS as lojas)
 * deixa `FixedExpenseSplit` e ocorrencia apontando para lojas e lancamentos que
 * este cenario vai apagar (chaves estrangeiras Restrict). Roda no client base,
 * fora de sessao, como os cenarios.
 */
type Cliente = Pick<typeof PrismaBase, "fixedExpenseOccurrence" | "fixedExpenseSplit">;

export async function soltarDespesaFixa(
  prisma: Cliente,
  p: { tenant_id: string; lojas: string[]; lancamentos?: string[] },
): Promise<void> {
  exigirBancoLocal();
  const { tenant_id, lojas, lancamentos = [] } = p;
  await prisma.fixedExpenseOccurrence.deleteMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { financial_entry_id: { in: lancamentos } }] },
  });
  await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
}
