import type { HerdMovementType, HerdOwner, HerdSituation, Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction, type TenantTransactionClient } from "@/lib/financial";
import { isValidCategory } from "@/lib/herd/categories";
import { medirLeituraDeSaldo } from "@/lib/jobs/medir-saldo";
import { decToNum, isoOrNull } from "@/lib/serialize";
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

/**
 * Os enums do schema como lista em runtime, para o Zod das rotas e o parse de
 * query string. `satisfies` é o guardrail: listar um valor que não existe no
 * enum do Prisma para de compilar.
 */
export const HERD_SITUATIONS = [
  "presente",
  "evento",
  "pasto_terceiro",
  "boitel",
  "confinamento",
  "desaparecido",
] as const satisfies readonly HerdSituation[];

export const HERD_OWNERS = ["proprio", "terceiro"] as const satisfies readonly HerdOwner[];

export const HERD_MOVEMENT_TYPES = [
  "saldo_inicial",
  "nascimento",
  "compra",
  "venda",
  "morte",
  "transferencia_pasto",
  "transferencia_fazenda",
  "mudanca_categoria",
  "ajuste",
] as const satisfies readonly HerdMovementType[];

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
  /**
   * Sem filtro nenhum, o `OR` precisa sumir do `where`.
   *
   * `OR: [{}, {}]` NÃO significa "qualquer linha" no Prisma: significa nenhuma.
   * Com isso, `getPositions(db, {})` devolvia lista vazia mesmo com o livro
   * cheio, contrariando o que este próprio arquivo documenta logo acima
   * ("sem filtro, devolve toda posição com alguma movimentação").
   *
   * O estrago real era em dois lugares. `GET /api/v1/herd/positions` sem
   * nenhum query param respondia "rebanho vazio" a quem tem gado. E o teste de
   * isolamento do m33 (`getPositions(dbB).length === 0`) passava por este bug,
   * não por isolamento: teria passado igual se um tenant enxergasse o outro.
   * Achado em 2026-08-13 escrevendo o m36.
   */
  const inicio = Date.now();
  const from = fromWhere(filter);
  const to = toWhere(filter);
  const temFiltro = Object.keys(from).length > 0 || Object.keys(to).length > 0;

  const rows = await db.herdMovement.findMany({
    where: {
      canceled_at: null,
      ...(temFiltro ? { OR: [from, to] } : {}),
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

  medirLeituraDeSaldo("getPositions", inicio, rows.length);
  return Array.from(totals.values());
}

/**
 * Filtro do histórico (§10.7). Os eixos de posição (categoria, fazenda, pasto)
 * casam quando a movimentação toca o valor em QUALQUER um dos dois lados: uma
 * transferência do Pasto A para o Pasto B aparece no histórico dos dois.
 *
 * `include_canceled` nasce `true` de propósito: o §10.8 exige que o registro
 * cancelado continue identificado no histórico. É `getPositions` que ignora
 * canceladas, porque lá elas não podem contar no saldo; aqui elas precisam
 * aparecer, marcadas. É por isso que as duas leituras são funções separadas em
 * vez de um parâmetro da mesma.
 */
export type HerdMovementFilter = {
  category_id?: string;
  property_id?: string;
  pasture_id?: string | null;
  movement_type?: HerdMovementType;
  since?: Date;
  until?: Date;
  include_canceled?: boolean;
};

export type ListMovementsOptions = { limit?: number; offset?: number };

export type HerdMovementHistoryItem = {
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
  created_at: Date;
  canceled_at: Date | null;
  canceled_reason: string | null;
  recorded_by: { id: string; name: string } | null;
};

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;

function eitherSide(
  fromField: keyof Prisma.HerdMovementWhereInput,
  toField: keyof Prisma.HerdMovementWhereInput,
  value: string | null,
): Prisma.HerdMovementWhereInput {
  return { OR: [{ [fromField]: value }, { [toField]: value }] };
}

function historyWhere(filter: HerdMovementFilter): Prisma.HerdMovementWhereInput {
  const where: Prisma.HerdMovementWhereInput = {};
  if (filter.include_canceled === false) where.canceled_at = null;
  if (filter.movement_type !== undefined) where.movement_type = filter.movement_type;
  if (filter.since !== undefined || filter.until !== undefined) {
    where.occurred_at = {
      ...(filter.since !== undefined ? { gte: filter.since } : {}),
      ...(filter.until !== undefined ? { lte: filter.until } : {}),
    };
  }

  const axes: Prisma.HerdMovementWhereInput[] = [];
  if (filter.category_id !== undefined) {
    axes.push(eitherSide("from_category_id", "to_category_id", filter.category_id));
  }
  if (filter.property_id !== undefined) {
    axes.push(eitherSide("from_property_id", "to_property_id", filter.property_id));
  }
  if (filter.pasture_id !== undefined) {
    axes.push(eitherSide("from_pasture_id", "to_pasture_id", filter.pasture_id));
  }
  if (axes.length > 0) where.AND = axes;

  return where;
}

/**
 * O histórico do §10.7, da movimentação mais recente para a mais antiga.
 * Devolve `total` do filtro inteiro (não da página) para a tela conseguir
 * paginar sem uma segunda chamada.
 */
export async function listMovements(
  db: HerdLedgerClient,
  filter: HerdMovementFilter = {},
  options: ListMovementsOptions = {},
): Promise<{ items: HerdMovementHistoryItem[]; total: number }> {
  const where = historyWhere(filter);
  const take = Math.min(Math.max(options.limit ?? DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);
  const skip = Math.max(options.offset ?? 0, 0);

  const [rows, total] = await Promise.all([
    db.herdMovement.findMany({
      where,
      // created_at e id desempatam: sem eles, duas movimentações no mesmo dia
      // podem trocar de lugar entre uma página e outra e sumir da listagem.
      orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }, { id: "desc" }],
      take,
      skip,
      include: { recorded_by: { select: { id: true, name: true } } },
    }),
    db.herdMovement.count({ where }),
  ]);

  const items = rows.map((row) => ({
    id: row.id,
    movement_type: row.movement_type,
    quantity: row.quantity,
    from: extractPosition(row, "from"),
    to: extractPosition(row, "to"),
    value: decToNum(row.value),
    financial_entry_id: row.financial_entry_id,
    reason: row.reason,
    notes: row.notes,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    canceled_at: row.canceled_at,
    canceled_reason: row.canceled_reason,
    recorded_by: row.recorded_by ? { id: row.recorded_by.id, name: row.recorded_by.name } : null,
  }));

  return { items, total };
}

/**
 * Contrato HTTP do histórico: `Date` vira ISO8601, como no resto de `/api/v1`.
 * Fica aqui (e não em serializers.ts) porque o tipo de origem é de action, não
 * do Prisma: mesmo motivo de `serializeBatch` viver em `animal-batches.ts`.
 */
export function serializeHerdMovement(m: HerdMovementHistoryItem) {
  return {
    id: m.id,
    movement_type: m.movement_type,
    quantity: m.quantity,
    from: m.from,
    to: m.to,
    value: m.value,
    financial_entry_id: m.financial_entry_id,
    reason: m.reason,
    notes: m.notes,
    occurred_at: m.occurred_at.toISOString(),
    created_at: m.created_at.toISOString(),
    canceled_at: isoOrNull(m.canceled_at),
    canceled_reason: m.canceled_reason,
    recorded_by: m.recorded_by,
  };
}

/** Mesma ideia, para o retorno de `recordMovement` (que ainda não tem histórico). */
export function serializeHerdMovementRecord(m: HerdMovementRecord) {
  return {
    id: m.id,
    movement_type: m.movement_type,
    quantity: m.quantity,
    from: m.from,
    to: m.to,
    value: m.value,
    financial_entry_id: m.financial_entry_id,
    reason: m.reason,
    notes: m.notes,
    occurred_at: m.occurred_at.toISOString(),
  };
}

/** As 4 linhas de "Movimentações do mês" do §12. */
export type HerdPeriodTotals = {
  nascimentos: number;
  compras: number;
  vendas: number;
  mortes: number;
};

const PERIOD_TYPES = ["nascimento", "compra", "venda", "morte"] as const;

/**
 * Soma por tipo no período, para o bloco de movimentações do §11/§12.
 * Ignora canceladas pelo mesmo motivo do saldo: o que foi desfeito não conta.
 */
// Recebe `TenantPrismaClient`, não o union `HerdLedgerClient`: `groupBy` tem
// sobrecargas genéricas demais para o TypeScript resolver sobre uma união, e
// esta função nunca roda dentro da transação de `recordMovement`.
export async function getPeriodTotals(
  db: TenantPrismaClient,
  since: Date,
  until: Date,
  filter: { property_id?: string } = {},
): Promise<HerdPeriodTotals> {
  const rows = await db.herdMovement.groupBy({
    by: ["movement_type"],
    where: {
      canceled_at: null,
      occurred_at: { gte: since, lte: until },
      movement_type: { in: [...PERIOD_TYPES] },
      ...(filter.property_id
        ? {
            OR: [
              { from_property_id: filter.property_id },
              { to_property_id: filter.property_id },
            ],
          }
        : {}),
    },
    _sum: { quantity: true },
  });

  const total = (type: (typeof PERIOD_TYPES)[number]) =>
    rows.find((r) => r.movement_type === type)?._sum.quantity ?? 0;

  return {
    nascimentos: total("nascimento"),
    compras: total("compra"),
    vendas: total("venda"),
    mortes: total("morte"),
  };
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
  /** Envelope comercial que originou o movimento (Negociações). */
  negotiation_id?: string | null;
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

const REVERSAL_CATEGORY: Partial<Record<HerdMovementType, string>> = {
  compra: "Estorno de compra de animal",
  venda: "Estorno de venda de animal",
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
  return runSerializableTenantTransaction(db, async (tx) =>
    recordMovementInTx(db, tx, input),
  );
}

/**
 * O corpo de `recordMovement`, SEM abrir transação.
 *
 * Existe porque uma operação maior precisa gravar vários movimentos e os
 * lançamentos financeiros de uma vez só: uma negociação de gado com 2
 * categorias e 3 parcelas são 6 escritas que ou entram todas ou nenhuma.
 * Chamar `recordMovement` em sequência abriria uma transação por movimento, e
 * uma falha no terceiro deixaria os dois primeiros gravados.
 *
 * `db` continua sendo pedido separado porque as validações de leitura (posição,
 * propriedade, pasto) rodam fora do escopo transacional, como antes.
 */
export async function recordMovementInTx(
  db: TenantPrismaClient,
  tx: TenantTransactionClient,
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

  return (async () => {
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
        negotiation_id: input.negotiation_id ?? null,
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
  })();
}

/**
 * Cancela uma movimentação (§10.8). Não apaga: marca `canceled_at`, e a linha
 * continua identificada no histórico. O saldo se recalcula sozinho, porque ele
 * sempre foi a soma das não canceladas.
 *
 * O bloqueio de saldo negativo vale aqui também, e olha para o lado OPOSTO ao
 * de `recordMovement`: cancelar devolve animais à origem e os TIRA do destino,
 * então quem pode ficar negativo é o destino. O caso real: comprar 10, vender
 * 8, e depois tentar cancelar a compra. Bloquear em vez de cancelar em cascata
 * é deliberado: cascata desfaria em silêncio movimentações que o produtor não
 * pediu para desfazer.
 *
 * Editar uma movimentação é cancelar e lançar de novo. Não existe edição no
 * lugar porque o §10.8 exige que o registro original permaneça identificado no
 * histórico, e sobrescrever a linha é justamente o que apagaria esse rastro.
 *
 * O `FinancialEntry` da compra/venda segue a régua decidida com o usuário em
 * 2026-08-05: **pendente é apagado, pago é estornado**. Erro recém-digitado
 * some limpo, sem sujeira no DRE; dinheiro que de fato entrou ou saiu nunca é
 * apagado, ganha um lançamento contrário com rastro. Atenção: hoje
 * `recordMovement` cria o lançamento como `paid` (o evento já ocorreu), então
 * na prática o caminho que roda é o do estorno. O ramo do apagar existe para
 * lançamento pendente, que passa a ser possível se um dia a compra a prazo
 * entrar no contrato.
 */
export async function cancelMovement(
  db: TenantPrismaClient,
  id: string,
  reason: string,
): Promise<ActionResult<HerdMovementHistoryItem>> {
  return runSerializableTenantTransaction(db, async (tx) => {
    const movement = await tx.herdMovement.findFirst({ where: { id } });
    if (!movement) return fail("NOT_FOUND", "Movimentação não encontrada", 404);
    if (movement.canceled_at) {
      return fail("ALREADY_CANCELED", "Esta movimentação já foi cancelada", 422);
    }

    /**
     * MOVIMENTO QUE PERTENCE A UMA NEGOCIAÇÃO SÓ SE DESFAZ PELA NEGOCIAÇÃO
     * (Módulo 31).
     *
     * A situação da negociação é derivada dos filhos, mas só dos FINANCEIROS.
     * Cancelar o movimento por fora devolvia os animais e deixava o envelope
     * exibindo "Quitada", com o dinheiro intacto e o rebanho já desfeito: um
     * estado que nem o painel nem o produtor conseguem ler, e que ninguém
     * pediu, porque quem cancela quer desfazer o NEGÓCIO.
     *
     * Recusar e apontar o caminho certo é melhor que cancelar a negociação
     * inteira por conta própria: desfazer dinheiro é decisão do produtor, e o
     * cancelamento da negociação tem travas próprias (parcela já paga, animais
     * já revendidos) que precisam ser respeitadas.
     */
    if (movement.negotiation_id) {
      return fail(
        "BELONGS_TO_NEGOTIATION",
        "Esta movimentação faz parte de um negócio. Para desfazer, cancele o negócio em Negociações: assim os animais e o financeiro voltam juntos.",
        422,
      );
    }

    const to = extractPosition(movement, "to");
    if (to) {
      const [current] = await getPositions(tx, to);
      const available = current?.quantity ?? 0;
      if (available < movement.quantity) {
        return fail(
          "INSUFFICIENT_BALANCE",
          `Não dá para cancelar: esta movimentação trouxe ${movement.quantity} animais e restam apenas ${available} nesta posição. Cancele antes as movimentações que usaram estes animais.`,
          422,
        );
      }
    }

    let clearFinancialLink = false;
    if (movement.financial_entry_id) {
      const entry = await tx.financialEntry.findFirst({ where: { id: movement.financial_entry_id } });
      if (entry && entry.status === "pending") {
        // Ainda não virou dinheiro: apagar não perde nada, e evita deixar uma
        // conta a pagar de uma compra que não existe mais.
        await tx.financialEntry.delete({ where: { id: entry.id } });
        clearFinancialLink = true;
      } else if (entry) {
        await createLinkedEntry(tx, {
          entry_type: entry.entry_type === "income" ? "expense" : "income",
          category: REVERSAL_CATEGORY[movement.movement_type] ?? "Estorno de movimentação de rebanho",
          amount: decToNum(entry.amount) ?? 0,
          related_module: "rebanho",
          related_id: movement.id,
          // O estorno é datado no dia do cancelamento, não no da compra: é
          // quando o dinheiro voltou, e é isso que o fluxo de caixa precisa ver.
          occurred_at: new Date(),
        });
      }
    }

    const canceled = await tx.herdMovement.update({
      where: { id },
      data: {
        canceled_at: new Date(),
        canceled_reason: reason,
        // Sem isso o vínculo apontaria para uma linha apagada.
        ...(clearFinancialLink ? { financial_entry_id: null } : {}),
      },
      include: { recorded_by: { select: { id: true, name: true } } },
    });

    return ok({
      id: canceled.id,
      movement_type: canceled.movement_type,
      quantity: canceled.quantity,
      from: extractPosition(canceled, "from"),
      to: extractPosition(canceled, "to"),
      value: decToNum(canceled.value),
      financial_entry_id: canceled.financial_entry_id,
      reason: canceled.reason,
      notes: canceled.notes,
      occurred_at: canceled.occurred_at,
      created_at: canceled.created_at,
      canceled_at: canceled.canceled_at,
      canceled_reason: canceled.canceled_reason,
      recorded_by: canceled.recorded_by
        ? { id: canceled.recorded_by.id, name: canceled.recorded_by.name }
        : null,
    });
  });
}
