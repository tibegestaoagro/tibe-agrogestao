import type { Prisma } from "@/generated/prisma/client";
import { scoped } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

/** "venda" agora; "orcamento" fica reservada para a entrega 4. */
export type ChaveDoContador = "venda" | "orcamento";

/** Número exibido: 6 dígitos com zero à esquerda (`004581`); acima disso, por inteiro. */
export function formatarNumero(n: number): string {
  return String(n).padStart(6, "0");
}

/**
 * Próximo número da conta, sem repetir e sem pular: o `upsert` incrementa a linha
 * do contador em uma só instrução. Chamar DENTRO da transação que grava o
 * documento e ANTES de criá-lo, para uma gravação que falha não queimar número
 * (o rollback desfaz o incremento junto).
 *
 * `tx` é o client escopado da conta. O `tenant_id` para a chave composta sai de
 * uma loja da própria conta (a leitura já é escopada), e não de parâmetro.
 */
export async function proximoNumero(tx: Tx, chave: ChaveDoContador): Promise<number> {
  const loja = await tx.establishment.findFirstOrThrow({ select: { tenant_id: true } });
  const tenant_id = loja.tenant_id;
  // Sem tentar de novo em P2002: dentro de uma transação o Postgres já a abortou, e a
  // corrida na criação da linha chega como conflito de serialização (P2034), que
  // `runSerializableTenantTransaction` repete inteira.
  const linha = await tx.emporioCounter.upsert({
    where: { tenant_id_key: { tenant_id, key: chave } },
    create: scoped({ key: chave, value: 1 }),
    update: { value: { increment: 1 } },
  });
  return linha.value;
}
