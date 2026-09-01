import type { MilkChargeType, MilkDestination } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { decToNum } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { conferirLocal } from "@/lib/actions/milk-sites";
import {
  getMilkPositions,
  recordMilkMovementInTx,
  type MilkMovementRecord,
} from "@/lib/actions/milk-ledger";

/**
 * As quatro conversas da fase 2 da Área Leite (§14 a §22). Ver
 * docs/specs/module-32-area-leite.md, seção 12.
 *
 * Endpoints semânticos, e não um `POST /movements` genérico com um tipo no
 * corpo, pelo mesmo motivo que o confinamento separou entrada, alimentação e
 * saída: são gestos diferentes do produtor, com campos obrigatórios
 * diferentes, e um corpo genérico empurraria a validação para o cliente.
 *
 * Nada aqui reimplementa o livro-razão: tudo passa por
 * `recordMilkMovementInTx`, e o volume continua sendo a soma das
 * movimentações (invariante 2).
 */

// ── §14: a produção entra no tanque ──────────────────────────────────────

export type StoreProductionInput = {
  site_id: string;
  liters: number;
  occurred_at?: Date | null;
  production_id?: string | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

/**
 * "Coloquei os 480 litros no tanque" (§14).
 *
 * O leite NASCE aqui do ponto de vista do livro-razão: não há origem, porque a
 * produção não é uma posição. O §37.5 é explícito em que isto não é venda, e
 * por isso nenhum dinheiro é tocado.
 *
 * O destino é sempre um tanque PRÓPRIO e o dono é sempre nulo: leite que entra
 * direto num ponto de coleta de terceiros é a transferência do §16, que tem
 * conversa própria.
 */
export async function storeProduction(
  db: TenantPrismaClient,
  input: StoreProductionInput,
): Promise<ActionResult<MilkMovementRecord>> {
  const local = await conferirLocal(db, input.site_id, "site_id", "proprio");
  if (!local.ok) return local;

  return runSerializableTenantTransaction(db, async (tx) =>
    recordMilkMovementInTx(tx, {
      movement_type: "entrada_producao",
      liters: input.liters,
      occurred_at: input.occurred_at,
      to: { site_id: input.site_id, owner_id: null },
      production_id: input.production_id ?? null,
      notes: input.notes,
      recorded_by_user_id: input.recorded_by_user_id,
    }),
  );
}

// ── §16: entrega em ponto de coleta de terceiros ─────────────────────────

export type TransferInput = {
  from_site_id: string;
  to_site_id: string;
  liters: number;
  occurred_at?: Date | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

/**
 * "Levei 600 litros para o ponto de coleta do Zé" (§16 e §17).
 *
 * O leite continua sendo NOSSO: sai do tanque e aparece no ponto de coleta com
 * `owner_id` nulo dos dois lados. É a tradução direta do §16 ("o leite
 * continuará identificado como pertencente ao produtor até sua venda").
 *
 * ⚠️ **Não gera receita nenhuma**, e isso é o §17 literal: "o envio ao ponto
 * de coleta não deverá, por si só, gerar receita". Quem gera é a venda, na
 * fase 3.
 */
export async function transferToCollectionPoint(
  db: TenantPrismaClient,
  input: TransferInput,
): Promise<ActionResult<MilkMovementRecord>> {
  const origem = await conferirLocal(db, input.from_site_id, "from_site_id", "proprio");
  if (!origem.ok) return origem;

  const destino = await conferirLocal(db, input.to_site_id, "to_site_id", "terceiro");
  if (!destino.ok) return destino;

  return runSerializableTenantTransaction(db, async (tx) =>
    recordMilkMovementInTx(tx, {
      movement_type: "transferencia",
      liters: input.liters,
      occurred_at: input.occurred_at,
      from: { site_id: input.from_site_id, owner_id: null },
      to: { site_id: input.to_site_id, owner_id: null },
      notes: input.notes,
      recorded_by_user_id: input.recorded_by_user_id,
    }),
  );
}

// ── §19: recebimento de leite de terceiros ───────────────────────────────

export type ReceiveFromThirdPartyInput = {
  site_id: string;
  owner_id: string;
  liters: number;
  occurred_at?: Date | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

/**
 * "O João trouxe 300 litros para o meu tanque" (§19).
 *
 * O leite entra no volume físico do tanque e NÃO entra na produção própria: é
 * o §19 literal ("não aumentar a produção própria"), e sai de graça porque
 * produção e livro-razão são coisas separadas neste módulo. O que a produção
 * mede é a ordenha; o que o livro-razão mede é onde o leite está e de quem é.
 *
 * O dono é obrigatório e é um `Contact` cadastrado, nunca um nome digitado:
 * aqui o nome é a CHAVE DE UM SALDO, e "João" e "Joao" partiriam o leite de um
 * produtor em dois (decisão 12.5 da spec).
 */
export async function receiveFromThirdParty(
  db: TenantPrismaClient,
  input: ReceiveFromThirdPartyInput,
): Promise<ActionResult<MilkMovementRecord>> {
  const local = await conferirLocal(db, input.site_id, "site_id", "proprio");
  if (!local.ok) return local;

  const dono = await db.contact.findFirst({
    where: { id: input.owner_id },
    select: { id: true, name: true, archived_at: true },
  });
  if (!dono) return fail("INVALID_OWNER", "Produtor inválido.", 422, "owner_id");
  if (dono.archived_at) {
    return fail("OWNER_ARCHIVED", `"${dono.name}" está arquivado.`, 422, "owner_id");
  }

  return runSerializableTenantTransaction(db, async (tx) =>
    recordMilkMovementInTx(tx, {
      movement_type: "entrada_terceiro",
      liters: input.liters,
      occurred_at: input.occurred_at,
      to: { site_id: input.site_id, owner_id: input.owner_id },
      notes: input.notes,
      recorded_by_user_id: input.recorded_by_user_id,
    }),
  );
}

// ── §15 e §21: a retirada, com composição por dono ───────────────────────

export type WithdrawalItem = {
  /** Nulo = leite próprio. */
  owner_id: string | null;
  liters: number;
};

export type WithdrawInput = {
  site_id: string;
  destination: MilkDestination;
  itens: WithdrawalItem[];
  occurred_at?: Date | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

/**
 * "O laticínio coletou 950 litros" (§15 e §21).
 *
 * A composição é INFORMADA, nunca rateada (decisão 12.3 da spec): o §21 manda
 * "dar baixa separadamente em cada volume", e quando a coleta é parcial o
 * documento não diz como dividir. Ratear transformaria o número de cada
 * produtor numa conta que ninguém fez.
 *
 * Uma linha de movimentação por dono, todas na mesma transação: ou a retirada
 * inteira acontece, ou nenhuma parte dela. Metade gravada deixaria o tanque
 * com uma composição que nunca existiu.
 *
 * ⚠️ **`destination: "venda"` NÃO gera dinheiro nesta fase.** Ela registra que
 * o leite saiu. O §37.8 ("venda gera receita") é cumprido na fase 3, quando a
 * venda existir como negócio, com comprador e preço. Registrar receita aqui
 * exigiria inventar o valor.
 */
export async function withdrawFromSite(
  db: TenantPrismaClient,
  input: WithdrawInput,
): Promise<ActionResult<MilkMovementRecord[]>> {
  const local = await conferirLocal(db, input.site_id, "site_id");
  if (!local.ok) return local;

  const itens = input.itens.filter((i) => i.liters > 0);
  if (itens.length === 0) {
    return fail(
      "VALIDATION_ERROR",
      "Informe quantos litros saíram, de pelo menos um dono.",
      422,
      "itens",
    );
  }

  // Dono repetido somaria duas baixas contra o mesmo saldo, e a conferência de
  // cada uma passaria isolada enquanto a soma estoura. Recusar é mais honesto
  // que juntar em silêncio: quem mandou duas linhas do mesmo dono provavelmente
  // errou de campo.
  const vistos = new Set<string>();
  for (const item of itens) {
    const k = item.owner_id ?? "-";
    if (vistos.has(k)) {
      return fail(
        "DONO_REPETIDO",
        "O mesmo dono aparece duas vezes na retirada.",
        422,
        "itens",
      );
    }
    vistos.add(k);
  }

  return runSerializableTenantTransaction(db, async (tx) => {
    const criados: MilkMovementRecord[] = [];
    for (const item of itens) {
      const resultado = await recordMilkMovementInTx(tx, {
        movement_type: "saida",
        liters: item.liters,
        occurred_at: input.occurred_at,
        from: { site_id: input.site_id, owner_id: item.owner_id },
        destination: input.destination,
        notes: input.notes,
        recorded_by_user_id: input.recorded_by_user_id,
      });
      // A recusa de um dono derruba a retirada inteira: lançar exceção é o que
      // faz a transação voltar atrás. Sem isto, os donos anteriores ficariam
      // com a baixa gravada e o produtor veria uma retirada pela metade.
      if (!resultado.ok) throw new RetiradaRecusada(resultado);
      criados.push(resultado.data);
    }
    return ok(criados);
  }).catch((erro) => {
    if (erro instanceof RetiradaRecusada) return erro.resultado;
    throw erro;
  });
}

/** Carrega a recusa de um dono para fora da transação, desfazendo o resto. */
class RetiradaRecusada extends Error {
  constructor(readonly resultado: Extract<ActionResult<never>, { ok: false }>) {
    super(resultado.message);
  }
}

// ── §22: a receita de funcionar como ponto de coleta ─────────────────────

export type MilkChargeInput = {
  owner_id: string;
  type: MilkChargeType;
  amount: number;
  site_id?: string | null;
  occurred_at?: Date | null;
  period_label?: string | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

export type MilkChargeRecord = {
  id: string;
  owner_id: string;
  site_id: string | null;
  type: MilkChargeType;
  amount: number;
  occurred_at: Date;
  period_label: string | null;
  notes: string | null;
  financial_entry_id: string | null;
  canceled_at: Date | null;
};

const CAMPOS_COBRANCA = {
  id: true,
  owner_id: true,
  site_id: true,
  type: true,
  amount: true,
  occurred_at: true,
  period_label: true,
  notes: true,
  financial_entry_id: true,
  canceled_at: true,
} as const;

/**
 * "Cobro R$ 0,05 por litro do João" (§22).
 *
 * O valor é o que o produtor DIGITOU, nunca calculado, mesmo quando a forma é
 * `por_litro`. O §22 dá o exemplo de R$ 0,05 sobre 5.000 litros mas não diz
 * sobre qual período somar esses litros: isso só aparece no §28, que é a fase
 * 3. Calcular exigiria inventar o período, e é a mesma decisão que a cobrança
 * do confinamento já tomou.
 *
 * A receita alimenta o Financeiro (§22, §32) por `createLinkedEntry`, com
 * `related_module: "leite"`, e nasce PAGA: o §22 fala de cobrar pelo serviço
 * prestado, não de faturar a prazo. Recebimento futuro é o §27, fase 3.
 */
export async function recordMilkCharge(
  db: TenantPrismaClient,
  input: MilkChargeInput,
): Promise<ActionResult<MilkChargeRecord>> {
  const valor = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(valor) || valor <= 0) {
    return fail("VALOR_INVALIDO", "O valor deve ser maior que zero.", 422, "amount");
  }

  const dono = await db.contact.findFirst({
    where: { id: input.owner_id },
    select: { id: true, name: true },
  });
  if (!dono) return fail("INVALID_OWNER", "Produtor inválido.", 422, "owner_id");

  if (input.site_id) {
    const local = await conferirLocal(db, input.site_id, "site_id");
    if (!local.ok) return local;
  }

  const quando = input.occurred_at ?? new Date();

  const criada = await runSerializableTenantTransaction(db, async (tx) => {
    const cobranca = await tx.milkCharge.create({
      data: scoped({
        owner_id: input.owner_id,
        site_id: input.site_id ?? null,
        type: input.type,
        amount: valor,
        occurred_at: quando,
        period_label: input.period_label?.trim() || null,
        notes: input.notes?.trim() || null,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
      }),
      select: CAMPOS_COBRANCA,
    });

    const lancamento = await createLinkedEntry(tx, {
      entry_type: "income",
      amount: valor,
      category: `Ponto de coleta de leite: ${dono.name}${
        input.period_label ? ` (${input.period_label.trim()})` : ""
      }`,
      related_module: "leite",
      related_id: cobranca.id,
      occurred_at: quando,
    });

    await tx.milkCharge.update({
      where: { id: cobranca.id },
      data: { financial_entry_id: lancamento.id },
    });

    return { ...cobranca, financial_entry_id: lancamento.id };
  });

  return ok({ ...criada, amount: decToNum(criada.amount) ?? 0 });
}

/**
 * Cancela a cobrança E o lançamento que ela gerou.
 *
 * Os dois juntos, sempre: foi exatamente aqui que o confinamento errou em
 * 31/08, deixando a conta a pagar viva depois do cancelamento da estadia. O
 * lançamento vira `cancelled`, e não é apagado, porque o DRE do mês em que ele
 * existiu precisa continuar contando a história como ela aconteceu.
 */
export async function cancelMilkCharge(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<MilkChargeRecord>> {
  const cobranca = await db.milkCharge.findFirst({
    where: { id },
    select: { id: true, canceled_at: true, financial_entry_id: true },
  });
  if (!cobranca) return fail("NOT_FOUND", "Cobrança não encontrada.", 404);
  if (cobranca.canceled_at) {
    return fail("JA_CANCELADO", "Esta cobrança já está cancelada.", 422);
  }

  const atualizada = await runSerializableTenantTransaction(db, async (tx) => {
    if (cobranca.financial_entry_id) {
      await tx.financialEntry.updateMany({
        where: { id: cobranca.financial_entry_id },
        data: { status: "cancelled" },
      });
    }
    return tx.milkCharge.update({
      where: { id },
      data: { canceled_at: new Date() },
      select: CAMPOS_COBRANCA,
    });
  });

  return ok({ ...atualizada, amount: decToNum(atualizada.amount) ?? 0 });
}

export async function listMilkCharges(
  db: TenantPrismaClient,
  filtros: { owner_id?: string; limit?: number } = {},
): Promise<MilkChargeRecord[]> {
  const linhas = await db.milkCharge.findMany({
    where: { ...(filtros.owner_id ? { owner_id: filtros.owner_id } : {}) },
    orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }],
    take: Math.min(filtros.limit ?? 50, 200),
    select: CAMPOS_COBRANCA,
  });
  return linhas.map((l) => ({ ...l, amount: decToNum(l.amount) ?? 0 }));
}

/**
 * O painel de armazenamento do §34: quanto tem em cada local, de quem é, e o
 * volume físico total.
 */
export type MilkStorageSummary = {
  proprio_em_tanque: number;
  proprio_em_ponto_de_coleta: number;
  de_terceiros: number;
  fisico_total: number;
};

export async function getMilkStorageSummary(
  db: TenantPrismaClient,
): Promise<MilkStorageSummary> {
  const [posicoes, sites] = await Promise.all([
    getMilkPositions(db),
    db.milkSite.findMany({ select: { id: true, type: true } }),
  ]);
  const tipoDoSite = new Map(sites.map((s) => [s.id, s.type]));

  let proprioTanque = 0;
  let proprioPonto = 0;
  let terceiros = 0;

  for (const p of posicoes) {
    if (p.owner_id) {
      terceiros += p.liters;
    } else if (tipoDoSite.get(p.site_id) === "terceiro") {
      proprioPonto += p.liters;
    } else {
      proprioTanque += p.liters;
    }
  }

  const arred = (n: number) => Math.round(n * 100) / 100;
  return {
    proprio_em_tanque: arred(proprioTanque),
    proprio_em_ponto_de_coleta: arred(proprioPonto),
    de_terceiros: arred(terceiros),
    fisico_total: arred(proprioTanque + proprioPonto + terceiros),
  };
}
