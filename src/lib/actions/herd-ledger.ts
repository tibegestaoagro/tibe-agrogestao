import type { HerdMovementType, HerdOwner, HerdSituation, Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction, type TenantTransactionClient } from "@/lib/financial";
import { isValidCategory } from "@/lib/herd/categories";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * O livro-razão do rebanho (Módulo 30, ver docs/specs/module-30-rebanho-livro-razao.md).
 *
 * O SALDO NUNCA É GRAVADO: `getPositions` soma as movimentações não canceladas
 * por posição (categoria x fazenda x pasto x situação x dono), e `recordMovement`
 * é a ÚNICA forma de gravar uma. O bloqueio de saldo negativo (§10.3) vive aqui
 * porque ele PRECISA da soma corrente pra decidir: não tem como validar sem
 * primeiro somar.
 */

export type HerdPositionKey = {
  category_id: string;
  property_id: string;
  pasture_id: string | null;
  situation: HerdSituation;
  owner: HerdOwner;
};

export type HerdPosition = HerdPositionKey & { quantity: number };

/**
 * Cada campo ausente (undefined) é um "qualquer valor"; `pasture_id: null`
 * explícito filtra por "sem pasto informado", diferente de omitir o campo.
 */
export type HerdPositionFilter = {
  category_id?: string;
  property_id?: string;
  pasture_id?: string | null;
  situation?: HerdSituation;
  owner?: HerdOwner;
};

// getPositions roda tanto direto (fora de transação) quanto dentro da
// transação serializável de recordMovement: as duas formas de client servem
// os mesmos modelos, só a marca de tipo de isolamento (`TenantPrismaClient`)
// não sobrevive ao `$transaction`. Ver o comentário sobre a marca em
// src/lib/prisma.ts.
type HerdLedgerClient = TenantPrismaClient | TenantTransactionClient;

type HerdMovementAxisRow = {
  quantity: number;
  from_category_id: string | null;
  from_property_id: string | null;
  from_pasture_id: string | null;
  from_situation: HerdSituation | null;
  from_owner: HerdOwner | null;
  to_category_id: string | null;
  to_property_id: string | null;
  to_pasture_id: string | null;
  to_situation: HerdSituation | null;
  to_owner: HerdOwner | null;
};

function fromWhere(filter: HerdPositionFilter): Prisma.HerdMovementWhereInput {
  const where: Prisma.HerdMovementWhereInput = {};
  if (filter.category_id !== undefined) where.from_category_id = filter.category_id;
  if (filter.property_id !== undefined) where.from_property_id = filter.property_id;
  if (filter.pasture_id !== undefined) where.from_pasture_id = filter.pasture_id;
  if (filter.situation !== undefined) where.from_situation = filter.situation;
  if (filter.owner !== undefined) where.from_owner = filter.owner;
  return where;
}

function toWhere(filter: HerdPositionFilter): Prisma.HerdMovementWhereInput {
  const where: Prisma.HerdMovementWhereInput = {};
  if (filter.category_id !== undefined) where.to_category_id = filter.category_id;
  if (filter.property_id !== undefined) where.to_property_id = filter.property_id;
  if (filter.pasture_id !== undefined) where.to_pasture_id = filter.pasture_id;
  if (filter.situation !== undefined) where.to_situation = filter.situation;
  if (filter.owner !== undefined) where.to_owner = filter.owner;
  return where;
}

function extractPosition(row: HerdMovementAxisRow, side: "from" | "to"): HerdPositionKey | null {
  const category_id = side === "from" ? row.from_category_id : row.to_category_id;
  const property_id = side === "from" ? row.from_property_id : row.to_property_id;
  const pasture_id = side === "from" ? row.from_pasture_id : row.to_pasture_id;
  const situation = side === "from" ? row.from_situation : row.to_situation;
  const owner = side === "from" ? row.from_owner : row.to_owner;
  if (!category_id || !property_id || !situation || !owner) return null;
  return { category_id, property_id, pasture_id, situation, owner };
}

function matchesFilter(pos: HerdPositionKey, filter: HerdPositionFilter): boolean {
  if (filter.category_id !== undefined && pos.category_id !== filter.category_id) return false;
  if (filter.property_id !== undefined && pos.property_id !== filter.property_id) return false;
  if (filter.pasture_id !== undefined && pos.pasture_id !== filter.pasture_id) return false;
  if (filter.situation !== undefined && pos.situation !== filter.situation) return false;
  if (filter.owner !== undefined && pos.owner !== filter.owner) return false;
  return true;
}

function positionKeyString(pos: HerdPositionKey): string {
  return [pos.category_id, pos.property_id, pos.pasture_id ?? "\0", pos.situation, pos.owner].join("|");
}

/**
 * Soma as movimentações não canceladas por posição. Sem filtro, devolve toda
 * posição com alguma movimentação; com filtro (parcial ou completo), só as
 * que casam em TODOS os eixos informados. O filtro no `where` do banco é só
 * otimização (restringe a linhas que tocam a posição por pelo menos um lado);
 * quem decide de verdade é `matchesFilter`, em cima do dado já lido.
 */
export async function getPositions(
  db: HerdLedgerClient,
  filter: HerdPositionFilter = {},
): Promise<HerdPosition[]> {
  const rows = await db.herdMovement.findMany({
    where: {
      canceled_at: null,
      OR: [fromWhere(filter), toWhere(filter)],
    },
    select: {
      quantity: true,
      from_category_id: true,
      from_property_id: true,
      from_pasture_id: true,
      from_situation: true,
      from_owner: true,
      to_category_id: true,
      to_property_id: true,
      to_pasture_id: true,
      to_situation: true,
      to_owner: true,
    },
  });

  const totals = new Map<string, HerdPosition>();
  const apply = (pos: HerdPositionKey | null, delta: number) => {
    if (!pos || !matchesFilter(pos, filter)) return;
    const key = positionKeyString(pos);
    const existing = totals.get(key);
    if (existing) existing.quantity += delta;
    else totals.set(key, { ...pos, quantity: delta });
  };

  for (const row of rows) {
    apply(extractPosition(row, "from"), -row.quantity);
    apply(extractPosition(row, "to"), row.quantity);
  }

  return Array.from(totals.values());
}

const ENTRY_ONLY: readonly HerdMovementType[] = ["saldo_inicial", "nascimento", "compra"];
const EXIT_ONLY: readonly HerdMovementType[] = ["venda", "morte"];
const TRANSFER: readonly HerdMovementType[] = [
  "transferencia_pasto",
  "transferencia_fazenda",
  "mudanca_categoria",
];

export type RecordMovementInput = {
  movement_type: HerdMovementType;
  quantity: number;
  from?: HerdPositionKey | null;
  to?: HerdPositionKey | null;
  value?: number | null;
  reason?: string | null;
  notes?: string | null;
  occurred_at?: Date | null;
  recorded_by_user_id?: string | null;
  batch_id?: string | null;
};

export type HerdMovementRecord = {
  id: string;
  movement_type: HerdMovementType;
  quantity: number;
  from: HerdPositionKey | null;
  to: HerdPositionKey | null;
  value: number | null;
  financial_entry_id: string | null;
  reason: string | null;
  notes: string | null;
  occurred_at: Date;
};

function validateShape(input: RecordMovementInput): { code: string; message: string } | null {
  if (ENTRY_ONLY.includes(input.movement_type)) {
    if (!input.to) return { code: "VALIDATION_ERROR", message: "Este tipo de movimentação exige o destino" };
    if (input.from) return { code: "VALIDATION_ERROR", message: "Este tipo de movimentação não tem origem" };
    return null;
  }
  if (EXIT_ONLY.includes(input.movement_type)) {
    if (!input.from) return { code: "VALIDATION_ERROR", message: "Este tipo de movimentação exige a origem" };
    if (input.to) return { code: "VALIDATION_ERROR", message: "Este tipo de movimentação não tem destino" };
    return null;
  }
  if (TRANSFER.includes(input.movement_type)) {
    if (!input.from || !input.to) {
      return { code: "VALIDATION_ERROR", message: "Este tipo de movimentação exige origem e destino" };
    }
    return null;
  }
  // ajuste: exatamente um dos dois, nunca os dois nem nenhum (§8.7: um ajuste
  // corrige UMA posição por vez, pra cima ou pra baixo, não move entre duas).
  if (!input.from === !input.to) {
    return {
      code: "VALIDATION_ERROR",
      message: "O ajuste deve informar origem OU destino, nunca os dois nem nenhum",
    };
  }
  return null;
}

async function validatePosition(
  db: TenantPrismaClient,
  pos: HerdPositionKey,
): Promise<{ code: string; message: string } | null> {
  if (!isValidCategory(pos.category_id)) {
    return { code: "INVALID_CATEGORY", message: "Categoria inválida" };
  }
  const property = await db.property.findFirst({ where: { id: pos.property_id } });
  if (!property) return { code: "INVALID_PROPERTY", message: "Propriedade inválida" };
  if (pos.pasture_id) {
    const pasture = await db.pasture.findFirst({
      where: { id: pos.pasture_id, property_id: pos.property_id },
    });
    if (!pasture) return { code: "INVALID_PASTURE", message: "Pasto inválido para esta propriedade" };
  }
  return null;
}

const FINANCIAL_CATEGORY: Partial<Record<HerdMovementType, string>> = {
  compra: "Compra de animal",
  venda: "Venda de animal",
};

/**
 * Valida e grava uma movimentação do livro-razão. A checagem de saldo
 * negativo (§10.3) e a criação da linha acontecem na MESMA transação
 * serializável: sem isso, duas vendas simultâneas da última cabeça
 * poderiam passar as duas pelo teste "tem saldo" antes de qualquer uma
 * escrever.
 */
export async function recordMovement(
  db: TenantPrismaClient,
  input: RecordMovementInput,
): Promise<ActionResult<HerdMovementRecord>> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return fail("VALIDATION_ERROR", "A quantidade deve ser um número inteiro maior que zero", 422);
  }

  const shapeError = validateShape(input);
  if (shapeError) return fail(shapeError.code, shapeError.message, 422);

  for (const pos of [input.from, input.to]) {
    if (!pos) continue;
    const error = await validatePosition(db, pos);
    if (error) return fail(error.code, error.message, 422);
  }

  const occurred_at = input.occurred_at ?? new Date();
  const from = input.from ?? null;
  const to = input.to ?? null;

  return runSerializableTenantTransaction(db, async (tx) => {
    if (from) {
      const [current] = await getPositions(tx, from);
      const available = current?.quantity ?? 0;
      if (available < input.quantity) {
        return fail(
          "INSUFFICIENT_BALANCE",
          `Existem apenas ${available} animais nesta categoria. Revise a quantidade informada.`,
          422,
        );
      }
    }

    const movement = await tx.herdMovement.create({
      data: scoped({
        movement_type: input.movement_type,
        quantity: input.quantity,
        from_category_id: from?.category_id ?? null,
        from_property_id: from?.property_id ?? null,
        from_pasture_id: from?.pasture_id ?? null,
        from_situation: from?.situation ?? null,
        from_owner: from?.owner ?? null,
        to_category_id: to?.category_id ?? null,
        to_property_id: to?.property_id ?? null,
        to_pasture_id: to?.pasture_id ?? null,
        to_situation: to?.situation ?? null,
        to_owner: to?.owner ?? null,
        value: input.value ?? null,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
        batch_id: input.batch_id ?? null,
        occurred_at,
      }),
    });

    // Compra e venda geram FinancialEntry só quando há valor informado
    // (decisão 7 da spec); nascimento e morte nunca (§10.4, §10.5).
    let financial_entry_id: string | null = null;
    const financialCategory = FINANCIAL_CATEGORY[input.movement_type];
    if (input.value != null && input.value > 0 && financialCategory) {
      const entry = await createLinkedEntry(tx, {
        entry_type: input.movement_type === "venda" ? "income" : "expense",
        category: financialCategory,
        amount: input.value,
        related_module: "rebanho",
        related_id: movement.id,
        occurred_at,
      });
      financial_entry_id = entry.id;
      await tx.herdMovement.update({ where: { id: movement.id }, data: { financial_entry_id } });
    }

    return ok({
      id: movement.id,
      movement_type: input.movement_type,
      quantity: input.quantity,
      from,
      to,
      value: input.value ?? null,
      financial_entry_id,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      occurred_at,
    });
  });
}
