import type {
  ConfinementSiteType,
  HerdChargeType,
  HerdStayType,
} from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { openStay, saldoAberto, type HerdStayRecord } from "@/lib/actions/herd-stays";
import { getPositions } from "@/lib/actions/herd-ledger";
import { situacaoDaEstadia, donoDaEstadia } from "@/lib/herd/stay-rules";
import { recordStockMovement } from "@/lib/actions/stock-ledger";
import { decToNum } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Dias de calendário no fuso do produtor (§8: "o produtor não deverá precisar
 * realizar esse cálculo"). `Math.floor(ms / 86_400_000)` conta MILISSEGUNDOS,
 * não dias: uma entrada ao meio-dia de 10/08, lida às 08:00 de 25/08, dava 14
 * em vez de 15, e só virava 15 ao meio-dia. Aqui a data (não o instante) de
 * cada lado é lida em America/Sao_Paulo (o servidor pode estar em outro fuso;
 * o produtor não está) e a diferença é de dias de calendário, contada uma vez
 * só, sem depender da hora do dia.
 */
const FUSO_PRODUTOR = "America/Sao_Paulo";
const formatarDataFuso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_PRODUTOR,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function diasDeCalendario(inicio: Date, agora: Date): number {
  const paraDataUTC = (d: Date) => {
    const [ano, mes, dia] = formatarDataFuso.format(d).split("-").map(Number);
    return Date.UTC(ano, mes - 1, dia);
  };
  return Math.max(0, Math.floor((paraDataUTC(agora) - paraDataUTC(inicio)) / 86_400_000));
}

/**
 * Confinamento: fase 3 do Módulo 30. Ver
 * docs/superpowers/specs/2026-08-31-confinamento-fase-3-do-modulo-30.md.
 *
 * O terreno de estadia (`HerdStay`, `openStay`/`closeStay`/`listStays`,
 * `stay-rules.ts`) já existe desde a fase 2: este módulo só acrescenta o
 * cadastro do local (`ConfinementSite`) e as duas leituras que a fase 3 pede
 * (alimentação vinculada, custo acumulado). Nada aqui reimplementa o
 * livro-razão: a quantidade continua sendo a soma das movimentações
 * (invariante 2).
 */

// ─────────────────────────────────────────────────────────────
// Cadastro do local (§5)
// ─────────────────────────────────────────────────────────────

export type CreateConfinementSiteInput = {
  name: string;
  type: ConfinementSiteType;
  property_id?: string | null;
  counterparty_name?: string | null;
  city?: string | null;
  capacity?: number | null;
  notes?: string | null;
};

export type ConfinementSiteRecord = {
  id: string;
  name: string;
  type: ConfinementSiteType;
  property_id: string | null;
  counterparty_name: string | null;
  city: string | null;
  capacity: number | null;
  notes: string | null;
  archived_at: Date | null;
};

export async function createConfinementSite(
  db: TenantPrismaClient,
  input: CreateConfinementSiteInput,
): Promise<ActionResult<ConfinementSiteRecord>> {
  const name = input.name.trim();
  if (!name) {
    return fail("VALIDATION_ERROR", "O nome do confinamento é obrigatório.", 422, "name");
  }

  if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity <= 0)) {
    return fail(
      "VALIDATION_ERROR",
      "A capacidade deve ser um número inteiro maior que zero.",
      422,
      "capacity",
    );
  }

  let property_id: string | null = null;
  let counterparty_name: string | null = null;

  if (input.type === "proprio") {
    if (!input.property_id) {
      return fail(
        "VALIDATION_ERROR",
        "Informe a fazenda relacionada para confinamento próprio.",
        422,
        "property_id",
      );
    }
    const property = await db.property.findFirst({ where: { id: input.property_id } });
    if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");
    if (property.archived_at) {
      return fail(
        "PROPERTY_ARCHIVED",
        "Não é possível cadastrar confinamento em fazenda arquivada.",
        422,
        "property_id",
      );
    }
    property_id = input.property_id;
  } else {
    const counterparty = input.counterparty_name?.trim();
    if (!counterparty) {
      return fail(
        "VALIDATION_ERROR",
        "Informe o nome da empresa ou proprietário do Boitel.",
        422,
        "counterparty_name",
      );
    }
    counterparty_name = counterparty;
  }

  const site = await db.confinementSite.create({
    data: scoped({
      name,
      type: input.type,
      property_id,
      counterparty_name,
      city: input.city?.trim() || null,
      capacity: input.capacity ?? null,
      notes: input.notes?.trim() || null,
    }),
  });

  return ok(site);
}

/** Lista os confinamentos cadastrados. Exclui arquivados por padrão. */
export async function listConfinementSites(
  db: TenantPrismaClient,
  filtro: { type?: ConfinementSiteType; include_archived?: boolean } = {},
): Promise<ConfinementSiteRecord[]> {
  return db.confinementSite.findMany({
    where: {
      ...(filtro.type ? { type: filtro.type } : {}),
      ...(filtro.include_archived ? {} : { archived_at: null }),
    },
    orderBy: { name: "asc" },
  });
}

/** Arquiva um confinamento (não deleta, mesmo padrão de `Property`/`Pasture`). Idempotente. */
export async function archiveConfinementSite(
  db: TenantPrismaClient,
  siteId: string,
): Promise<ActionResult<ConfinementSiteRecord>> {
  const site = await db.confinementSite.findFirst({ where: { id: siteId } });
  if (!site) return fail("NOT_FOUND", "Confinamento não encontrado.", 404);
  if (site.archived_at) return ok(site);

  const updated = await db.confinementSite.update({
    where: { id: siteId },
    data: { archived_at: new Date() },
  });
  return ok(updated);
}

// ─────────────────────────────────────────────────────────────
// Entrada de animais no confinamento (§6, §7)
// ─────────────────────────────────────────────────────────────

export type OpenConfinementStayInput = {
  confinement_site_id: string;
  category_id: string;
  quantity: number;
  /** Fazenda de origem dos animais (§6). Sem ela, vale a fazenda do site (só existe para `proprio`). */
  property_id?: string | null;
  pasture_id?: string | null;
  started_at?: Date | null;
  expected_end_at?: Date | null;
  charge_type?: HerdChargeType | null;
  charge_value?: number | null;
  due_date?: Date | null;
  reason?: string | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

/**
 * Resolve de qual pasto os animais saem quando o produtor não informa
 * `pasture_id` (§6: "Pasto de origem" é opcional).
 *
 * "Sem pasto informado" precisa significar "de onde houver", não "só de quem
 * não tem pasto": `openStay` monta a posição de origem com o `pasture_id`
 * literal que recebe, e `getPositions`/`matchesFilter` (`herd-ledger.ts`)
 * tratam `null` como filtro estrito. Passar `null` adiante quando o saldo real
 * está num pasto específico fazia a entrada ser recusada com "0 animais",
 * mesmo com o rebanho cheio.
 *
 * Se o saldo da categoria estiver espalhado em mais de um pasto, a origem é
 * ambígua e a ação RECUSA dizendo onde está, em vez de escolher por conta
 * própria: lançar do pasto errado é dado errado gravado em silêncio.
 */
async function resolverPastoDeOrigem(
  db: TenantPrismaClient,
  params: { property_id: string; category_id: string },
): Promise<ActionResult<string | null>> {
  const posicoes = await getPositions(db, {
    property_id: params.property_id,
    category_id: params.category_id,
    situation: "presente",
    owner: "proprio",
  });
  const comSaldo = posicoes.filter((p) => p.quantity > 0);

  if (comSaldo.length === 0) {
    return fail(
      "INSUFFICIENT_BALANCE",
      "Não há animais desta categoria disponíveis nesta fazenda.",
      422,
      "quantity",
    );
  }
  if (comSaldo.length === 1) {
    return ok(comSaldo[0].pasture_id);
  }

  const idsComNome = comSaldo.map((p) => p.pasture_id).filter((id): id is string => id !== null);
  const pastos = idsComNome.length
    ? await db.pasture.findMany({ where: { id: { in: idsComNome } }, select: { id: true, name: true } })
    : [];
  const nomePorId = new Map(pastos.map((p) => [p.id, p.name]));
  const nomes = comSaldo.map((p) =>
    p.pasture_id ? (nomePorId.get(p.pasture_id) ?? p.pasture_id) : "sem pasto informado",
  );

  return fail(
    "ORIGEM_AMBIGUA",
    `O saldo desta categoria está espalhado em mais de um pasto (${nomes.join(", ")}). Informe de qual pasto os animais saem.`,
    422,
    "pasture_id",
  );
}

/**
 * Abre uma estadia de confinamento, reusando `openStay` (fase 2): não existe
 * um segundo caminho de estadia, só a validação do site e a derivação do tipo
 * a partir dele (`proprio` -> `confinamento`, `boitel` -> `boitel`), para
 * quem confinamento e boitel não colidirem numa mesma estadia.
 */
export async function openConfinementStay(
  db: TenantPrismaClient,
  input: OpenConfinementStayInput,
): Promise<ActionResult<HerdStayRecord>> {
  const site = await db.confinementSite.findFirst({ where: { id: input.confinement_site_id } });
  if (!site) {
    return fail("INVALID_CONFINEMENT_SITE", "Confinamento inválido.", 422, "confinement_site_id");
  }
  if (site.archived_at) {
    return fail(
      "CONFINEMENT_SITE_ARCHIVED",
      "Este confinamento está arquivado.",
      422,
      "confinement_site_id",
    );
  }

  const property_id = input.property_id ?? site.property_id;
  if (!property_id) {
    return fail(
      "VALIDATION_ERROR",
      "Informe a fazenda de origem dos animais.",
      422,
      "property_id",
    );
  }

  const type: HerdStayType = site.type === "boitel" ? "boitel" : "confinamento";

  let pasture_id = input.pasture_id ?? null;
  if (pasture_id === null) {
    const origem = await resolverPastoDeOrigem(db, { property_id, category_id: input.category_id });
    if (!origem.ok) return origem;
    pasture_id = origem.data;
  }

  return openStay(db, {
    type,
    property_id,
    category_id: input.category_id,
    quantity: input.quantity,
    pasture_id,
    counterparty_name: site.type === "boitel" ? site.counterparty_name : null,
    location_name: site.name,
    city: site.city,
    started_at: input.started_at ?? null,
    expected_end_at: input.expected_end_at ?? null,
    charge_type: input.charge_type ?? null,
    charge_value: input.charge_value ?? null,
    due_date: input.due_date ?? null,
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    recorded_by_user_id: input.recorded_by_user_id ?? null,
    confinement_site_id: site.id,
  });
}

// ─────────────────────────────────────────────────────────────
// Alimentação (§10, §11, §12)
// ─────────────────────────────────────────────────────────────

export type ConfinementFeedingInput = {
  stay_id: string;
  quantity: number;
  /** Produto do catálogo de estoque. Obrigatório: ver `recordConfinementFeeding`. */
  product_id?: string | null;
  /** Não usado hoje: `product_id` é obrigatório, então não sobra caso descritivo. Mantido no tipo por compatibilidade de contrato. */
  product_name?: string | null;
  occurred_at?: Date | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

export type ConfinementFeedingResult = {
  stay_id: string;
  /** Sempre `true` hoje: `product_id` é obrigatório, então todo registro cai no estoque. */
  registered_in_stock: boolean;
  stock_movement_id: string | null;
};

/**
 * Registra o consumo de um produto no confinamento (§10).
 *
 * Cria um `StockMovement` de `utilizacao` vinculado à estadia (§11): o saldo
 * cai pelas mesmas regras que já valem para qualquer uso de estoque
 * (inclusive a recusa por saldo insuficiente, que não é relaxada aqui).
 *
 * Sem `product_id` a ação RECUSA, e não é falta de suporte a "consumo fora do
 * catálogo": até 31/08 o pedido sem produto era aceito sem gravar nada, e o
 * produtor saía achando que tinha registrado o trato. `StockMovement.product_id`
 * é obrigatório no schema, e não existe hoje tabela para um histórico de
 * consumo livre; aceitar em silêncio era o pior modo de falha (o registro
 * some sem aviso). Decisão do usuário: recusar é mais barato que perder o
 * dado; cadastrar o produto no estoque primeiro é o caminho.
 */
export async function recordConfinementFeeding(
  db: TenantPrismaClient,
  input: ConfinementFeedingInput,
): Promise<ActionResult<ConfinementFeedingResult>> {
  const stay = await db.herdStay.findFirst({ where: { id: input.stay_id } });
  if (!stay) return fail("NOT_FOUND", "Estadia não encontrada.", 404, "stay_id");
  if (stay.canceled_at) {
    return fail("ESTADIA_CANCELADA", "Esta estadia foi cancelada.", 422, "stay_id");
  }

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return fail(
      "VALIDATION_ERROR",
      "A quantidade utilizada precisa ser maior que zero.",
      422,
      "quantity",
    );
  }

  if (!input.product_id) {
    return fail(
      "PRODUCT_REQUIRED",
      "Cadastre o produto no estoque antes de registrar a alimentação.",
      422,
      "product_id",
    );
  }

  const movimento = await recordStockMovement(db, {
    product_id: input.product_id,
    property_id: stay.property_id,
    movement_type: "utilizacao",
    quantity: input.quantity,
    occurred_at: input.occurred_at ?? new Date(),
    purpose: "Alimentação de confinamento",
    notes: input.notes ?? null,
    recorded_by_user_id: input.recorded_by_user_id ?? null,
    stay_id: stay.id,
  });
  if (!movimento.ok) return movimento;

  return ok({ stay_id: stay.id, registered_in_stock: true, stock_movement_id: movimento.data.id });
}

// ─────────────────────────────────────────────────────────────
// Resumo do lote: dias, alimentação e custo (§8, §13, §14, §24)
// ─────────────────────────────────────────────────────────────

export type ConfinementFeedingLine = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
};

export type ConfinementLotSummary = {
  id: string;
  type: HerdStayType;
  confinement_site_id: string | null;
  property_id: string;
  location_name: string | null;
  started_at: Date;
  days_confined: number;
  /** O que ainda está no lote. Derivado das movimentações, nunca gravado. */
  quantity: number;
  aberta: boolean;
  charge_type: HerdChargeType | null;
  charge_value: number | null;
  /** Quantidades usadas por produto (StockMovement com este stay_id). */
  feeding: ConfinementFeedingLine[];
  /**
   * Soma das despesas ligadas a esta estadia (FinancialEntry por
   * `related_id`), a cobrança do site incluída quando existir. NUNCA soma o
   * valor do estoque em R$: nem `Product` nem `StockMovement` têm preço no
   * schema atual, e "nunca estimativa" (decisão 3 da spec) proíbe inventar um.
   */
  financial_cost: number;
  canceled_at: Date | null;
};

export async function getConfinementLotSummary(
  db: TenantPrismaClient,
  stayId: string,
): Promise<ActionResult<ConfinementLotSummary>> {
  const stay = await db.herdStay.findFirst({ where: { id: stayId } });
  if (!stay) return fail("NOT_FOUND", "Estadia não encontrada.", 404);

  const [movimentos, alimentacao, custos] = await Promise.all([
    db.herdMovement.findMany({
      where: { stay_id: stayId, canceled_at: null },
      select: {
        quantity: true,
        from_situation: true,
        from_owner: true,
        to_situation: true,
        to_owner: true,
      },
    }),
    db.stockMovement.findMany({
      where: { stay_id: stayId, canceled_at: null, movement_type: "utilizacao" },
      include: { product: { select: { name: true, unit: true } } },
    }),
    db.financialEntry.findMany({ where: { related_id: stayId, entry_type: "expense" } }),
  ]);

  const situacao = situacaoDaEstadia(stay.type);
  const dono = donoDaEstadia(stay.type);
  const quantity = saldoAberto(movimentos, situacao, dono);

  const feedingByProduct = new Map<string, ConfinementFeedingLine>();
  for (const m of alimentacao) {
    const atual = feedingByProduct.get(m.product_id) ?? {
      product_id: m.product_id,
      product_name: m.product.name,
      unit: m.product.unit,
      quantity: 0,
    };
    atual.quantity += decToNum(m.quantity) ?? 0;
    feedingByProduct.set(m.product_id, atual);
  }

  const financial_cost = custos.reduce((soma, c) => soma + (decToNum(c.amount) ?? 0), 0);
  const days_confined = diasDeCalendario(stay.started_at, new Date());

  return ok({
    id: stay.id,
    type: stay.type,
    confinement_site_id: stay.confinement_site_id,
    property_id: stay.property_id,
    location_name: stay.location_name,
    started_at: stay.started_at,
    days_confined,
    quantity,
    aberta: quantity > 0 && stay.canceled_at === null,
    charge_type: stay.charge_type,
    charge_value: decToNum(stay.charge_value),
    feeding: Array.from(feedingByProduct.values()),
    financial_cost,
    canceled_at: stay.canceled_at,
  });
}

export type ConfinementLotListItem = {
  id: string;
  type: HerdStayType;
  confinement_site_id: string | null;
  property_id: string;
  location_name: string | null;
  started_at: Date;
  days_confined: number;
  quantity: number;
  aberta: boolean;
  canceled_at: Date | null;
};

/**
 * Os lotes ativos (§9, §25 "quantos lotes ativos"), em uma consulta batida
 * para todos, como `listStays` já faz para as outras estadias: uma por lote
 * viraria N+1 na tela principal.
 */
export async function listConfinementLots(
  db: TenantPrismaClient,
  filtro: { confinement_site_id?: string; type?: HerdStayType; apenas_abertas?: boolean } = {},
): Promise<ConfinementLotListItem[]> {
  const stays = await db.herdStay.findMany({
    where: {
      type: filtro.type ?? { in: ["confinamento", "boitel"] },
      ...(filtro.confinement_site_id ? { confinement_site_id: filtro.confinement_site_id } : {}),
    },
    orderBy: { started_at: "desc" },
  });
  if (stays.length === 0) return [];

  const movimentos = await db.herdMovement.findMany({
    where: { stay_id: { in: stays.map((s) => s.id) }, canceled_at: null },
    select: {
      stay_id: true,
      quantity: true,
      from_situation: true,
      from_owner: true,
      to_situation: true,
      to_owner: true,
    },
  });
  const porEstadia = new Map<string, typeof movimentos>();
  for (const m of movimentos) {
    if (!m.stay_id) continue;
    const lista = porEstadia.get(m.stay_id) ?? [];
    lista.push(m);
    porEstadia.set(m.stay_id, lista);
  }

  const agora = new Date();
  const itens = stays.map((stay) => {
    const aberto = saldoAberto(
      porEstadia.get(stay.id) ?? [],
      situacaoDaEstadia(stay.type),
      donoDaEstadia(stay.type),
    );
    return {
      id: stay.id,
      type: stay.type,
      confinement_site_id: stay.confinement_site_id,
      property_id: stay.property_id,
      location_name: stay.location_name,
      started_at: stay.started_at,
      days_confined: diasDeCalendario(stay.started_at, agora),
      quantity: aberto,
      aberta: aberto > 0 && stay.canceled_at === null,
      canceled_at: stay.canceled_at,
    };
  });

  return filtro.apenas_abertas ? itens.filter((i) => i.aberta) : itens;
}
