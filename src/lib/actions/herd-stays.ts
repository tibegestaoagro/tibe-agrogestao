import type { HerdChargeType, HerdStayType } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { recordMovementInTx, type HerdPositionKey } from "@/lib/actions/herd-ledger";
import { isValidCategory } from "@/lib/herd/categories";
import { donoDaEstadia, situacaoDaEstadia, tipoDeEnvio } from "@/lib/herd/stay-rules";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * As estadias temporárias do rebanho (Módulo 30, fase 2). Ver
 * docs/superpowers/specs/2026-08-27-modulo-30-fase-2-design.md.
 *
 * A estadia guarda a IDENTIDADE e os atributos do episódio; a quantidade
 * continua sendo a soma das movimentações que apontam para ela (invariante 2),
 * e "aberta" é `saldo > 0`, nunca um campo.
 *
 * Nada de cálculo de cobrança: `charge_type` é informação do acordo, e o valor
 * lançado é o que o produtor digitou. O documento do cliente não define a
 * fórmula, e fórmula inventada gera dinheiro errado em silêncio.
 */

export type OpenStayInput = {
  type: HerdStayType;
  property_id: string;
  category_id: string;
  quantity: number;
  /** Pasto de origem (ou de destino, quando o animal é de terceiro). */
  pasture_id?: string | null;
  counterparty_name?: string | null;
  location_name?: string | null;
  city?: string | null;
  started_at?: Date | null;
  expected_end_at?: Date | null;
  charge_type?: HerdChargeType | null;
  charge_value?: number | null;
  /** Vencimento da conta gerada. Sem ele, vale o retorno previsto, e depois hoje. */
  due_date?: Date | null;
  reason?: string | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

export type HerdStayRecord = {
  id: string;
  type: HerdStayType;
  property_id: string;
  counterparty_name: string | null;
  started_at: Date;
  quantity: number;
  financial_entry_id: string | null;
};

/**
 * Despesa para quem cobra do produtor, receita para quem paga a ele.
 *
 * O documento é explícito nos dois sentidos: pasto de terceiros e boitel
 * "geram despesa ou conta a pagar"; animais de terceiros na fazenda "geram
 * receita ou conta a receber". Desaparecimento não gera nada: não há acordo
 * nem contraparte.
 */
const COBRANCA: Partial<Record<HerdStayType, { entry_type: "expense" | "income"; category: string }>> = {
  pasto_terceiro: { entry_type: "expense", category: "Arrendamento de pasto" },
  boitel: { entry_type: "expense", category: "Boitel" },
  evento: { entry_type: "expense", category: "Leilão e feira" },
  terceiro_na_fazenda: { entry_type: "income", category: "Aluguel de pasto" },
};

export async function openStay(
  db: TenantPrismaClient,
  input: OpenStayInput,
): Promise<ActionResult<HerdStayRecord>> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return fail(
      "VALIDATION_ERROR",
      "A quantidade deve ser um número inteiro maior que zero.",
      422,
      "quantity",
    );
  }
  if (!isValidCategory(input.category_id)) {
    return fail("INVALID_CATEGORY", "Categoria inválida.", 422, "category_id");
  }
  if (input.charge_value != null && input.charge_value <= 0) {
    return fail(
      "VALIDATION_ERROR",
      "O valor combinado precisa ser maior que zero.",
      422,
      "charge_value",
    );
  }

  const situacao = situacaoDaEstadia(input.type);
  const dono = donoDaEstadia(input.type);
  const started_at = input.started_at ?? new Date();

  return runSerializableTenantTransaction(db, async (tx) => {
    const stay = await tx.herdStay.create({
      data: scoped({
        type: input.type,
        property_id: input.property_id,
        counterparty_name: input.counterparty_name ?? null,
        location_name: input.location_name ?? null,
        city: input.city ?? null,
        started_at,
        expected_end_at: input.expected_end_at ?? null,
        charge_type: input.charge_type ?? null,
        charge_value: input.charge_value ?? null,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
      }),
    });

    // A posição de onde as cabeças saem, e a de onde elas passam a estar.
    // Animal de terceiro é ENTRADA: não sai de lugar nenhum, porque não estava
    // aqui. Nos outros, ele sai de `presente`/`proprio`, que é onde estava.
    const daFazenda: HerdPositionKey = {
      category_id: input.category_id,
      property_id: input.property_id,
      pasture_id: input.pasture_id ?? null,
      situation: "presente",
      owner: "proprio",
    };
    const naEstadia: HerdPositionKey = {
      category_id: input.category_id,
      property_id: input.property_id,
      // Quem está em pasto de terceiro, boitel ou evento não ocupa pasto NOSSO,
      // e quem desapareceu saiu da quantidade disponível do pasto. O animal de
      // terceiro é o único que fica num pasto daqui.
      pasture_id: input.type === "terceiro_na_fazenda" ? input.pasture_id ?? null : null,
      situation: situacao,
      owner: dono,
    };

    const ehEntrada = input.type === "terceiro_na_fazenda";
    const movimento = await recordMovementInTx(db, tx, {
      movement_type: tipoDeEnvio(input.type),
      quantity: input.quantity,
      from: ehEntrada ? null : daFazenda,
      to: naEstadia,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      occurred_at: started_at,
      recorded_by_user_id: input.recorded_by_user_id ?? null,
      stay_id: stay.id,
    });

    // A recusa do movimento (saldo insuficiente, propriedade inexistente) tem
    // que derrubar a estadia junto: estadia sem movimento é saldo mentindo.
    // Devolver o erro AQUI não desfaz a transação sozinho, então o `throw` é
    // deliberado, e o `catch` de fora traduz de volta.
    if (!movimento.ok) throw new EstadiaRecusada(movimento.code, movimento.message, movimento.field);

    const cobranca = COBRANCA[input.type];
    let financial_entry_id: string | null = null;
    if (cobranca && input.charge_value != null) {
      const entry = await createLinkedEntry(tx, {
        entry_type: cobranca.entry_type,
        category: cobranca.category,
        amount: input.charge_value,
        related_module: "rebanho",
        related_id: stay.id,
        occurred_at: started_at,
        status: "pending",
        due_date: input.due_date ?? input.expected_end_at ?? started_at,
      });
      financial_entry_id = entry.id;
    }

    return ok({
      id: stay.id,
      type: stay.type,
      property_id: stay.property_id,
      counterparty_name: stay.counterparty_name,
      started_at: stay.started_at,
      quantity: input.quantity,
      financial_entry_id,
    });
  }).catch((erro: unknown) => {
    if (erro instanceof EstadiaRecusada) {
      return fail(erro.code, erro.message, 422, erro.field);
    }
    throw erro;
  });
}

/**
 * Recusa de negócio de dentro da transação.
 *
 * Existe porque devolver `fail()` de dentro do `$transaction` CONFIRMA a
 * transação: é a armadilha que a seção 6 da spec do Módulo 31 documenta, e que
 * aqui deixaria a estadia gravada sem a movimentação dela.
 */
class EstadiaRecusada extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "EstadiaRecusada";
  }
}
