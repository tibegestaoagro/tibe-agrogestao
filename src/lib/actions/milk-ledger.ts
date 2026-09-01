import type { MilkDestination, MilkMovementType } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import type { TenantTransactionClient } from "@/lib/financial";
import { decToNum } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { delegates } from "@/lib/prisma-delegates";

/**
 * O livro-razão do leite (Área Leite, fase 2, §14 a §21). Ver
 * docs/specs/module-32-area-leite.md, seção 12.
 *
 * A posição é `local x dono`, e o volume de cada uma é a SOMA das
 * movimentações que apontam para ela (invariante 2). Não existe campo de
 * saldo, e não pode existir.
 *
 * `owner_id` nulo significa "meu", não "desconhecido". É a mesma escolha do
 * `HerdOwner.proprio`, com a diferença de que aqui o outro lado tem nome, e é
 * isso que faz o §20 funcionar: o tanque com próprio 400, João 300 e Carlos
 * 250 são três posições no mesmo local.
 */

/** A chave de uma posição. `owner_id: null` é o leite próprio. */
export type MilkPositionKey = {
  site_id: string;
  owner_id: string | null;
};

export type MilkPosition = MilkPositionKey & {
  liters: number;
};

/**
 * A chave como texto, para agrupar em memória. O `-` no lugar do nulo é
 * deliberado: `null` e a string "null" colidiriam num `Map` se alguém
 * concatenasse sem pensar, e um contato com id "null" não existe.
 */
function chave(site_id: string, owner_id: string | null): string {
  return `${site_id}|${owner_id ?? "-"}`;
}

function daChave(k: string): MilkPositionKey {
  const [site_id, owner] = k.split("|");
  return { site_id, owner_id: owner === "-" ? null : owner };
}

/**
 * Os saldos por posição, somando o que entrou e subtraindo o que saiu.
 *
 * Posições com saldo zero somem do resultado: um tanque que já teve leite do
 * João e não tem mais não deve continuar listando o João com 0, porque a tela
 * de retirada usa esta lista para oferecer os donos, e oferecer quem não tem
 * nada é convidar a um lançamento que será recusado.
 */
export async function getMilkPositions(
  db: TenantPrismaClient | TenantTransactionClient,
  filtros: { site_id?: string; owner_id?: string | null } = {},
): Promise<MilkPosition[]> {
  const movimentos = await delegates(db).milkMovement.findMany({
    where: { canceled_at: null },
    select: {
      liters: true,
      from_site_id: true,
      from_owner_id: true,
      to_site_id: true,
      to_owner_id: true,
    },
  });

  const saldos = new Map<string, number>();
  const somar = (site: string | null, owner: string | null, litros: number) => {
    if (!site) return;
    const k = chave(site, owner);
    saldos.set(k, (saldos.get(k) ?? 0) + litros);
  };

  for (const m of movimentos) {
    const litros = decToNum(m.liters) ?? 0;
    somar(m.to_site_id, m.to_owner_id, litros);
    somar(m.from_site_id, m.from_owner_id, -litros);
  }

  const saida: MilkPosition[] = [];
  for (const [k, litros] of saldos) {
    // Arredonda antes de comparar: soma de decimais pode deixar 1e-13 para
    // trás, e uma posição "vazia" com 0,0000000000001 apareceria na tela.
    const arredondado = Math.round(litros * 100) / 100;
    if (arredondado === 0) continue;
    const pos = daChave(k);
    if (filtros.site_id && pos.site_id !== filtros.site_id) continue;
    if (filtros.owner_id !== undefined && pos.owner_id !== filtros.owner_id) continue;
    saida.push({ ...pos, liters: arredondado });
  }

  return saida.sort((a, b) => b.liters - a.liters);
}

/** O saldo de UMA posição. Zero quando ela nunca existiu. */
export async function getMilkBalance(
  db: TenantPrismaClient | TenantTransactionClient,
  key: MilkPositionKey,
): Promise<number> {
  const posicoes = await getMilkPositions(db, {
    site_id: key.site_id,
    owner_id: key.owner_id,
  });
  return posicoes[0]?.liters ?? 0;
}

export type RecordMilkMovementInput = {
  movement_type: MilkMovementType;
  liters: number;
  occurred_at?: Date | null;
  from?: MilkPositionKey | null;
  to?: MilkPositionKey | null;
  destination?: MilkDestination | null;
  production_id?: string | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

export type MilkMovementRecord = {
  id: string;
  movement_type: MilkMovementType;
  liters: number;
  occurred_at: Date;
  from_site_id: string | null;
  from_owner_id: string | null;
  to_site_id: string | null;
  to_owner_id: string | null;
  destination: MilkDestination | null;
  production_id: string | null;
  notes: string | null;
  canceled_at: Date | null;
};

const CAMPOS = {
  id: true,
  movement_type: true,
  liters: true,
  occurred_at: true,
  from_site_id: true,
  from_owner_id: true,
  to_site_id: true,
  to_owner_id: true,
  destination: true,
  production_id: true,
  notes: true,
  canceled_at: true,
} as const;

type LinhaCrua = Omit<MilkMovementRecord, "liters"> & { liters: unknown };

function serializar(linha: LinhaCrua): MilkMovementRecord {
  return { ...linha, liters: decToNum(linha.liters) ?? 0 };
}

/**
 * Grava uma movimentação, conferindo que o lado de ORIGEM tem saldo.
 *
 * A conferência de saldo é o que impede o tanque de ficar negativo, e ela vale
 * para toda movimentação que tem `from`: retirada, transferência, e o ajuste
 * para baixo. Sem ela, "o laticínio levou 950" num tanque com 400 gravaria
 * -550 em silêncio, e o produtor descobriria pelo número estranho, não pela
 * recusa.
 *
 * ⚠️ Precisa rodar DENTRO de uma transação serializável quando o chamador grava
 * mais de uma linha (a retirada do §21 grava uma por dono): duas retiradas
 * simultâneas poderiam ler o mesmo saldo e passar as duas.
 */
export async function recordMilkMovementInTx(
  tx: TenantTransactionClient,
  input: RecordMilkMovementInput,
): Promise<ActionResult<MilkMovementRecord>> {
  const litros = Math.round(input.liters * 100) / 100;
  if (!Number.isFinite(litros) || litros <= 0) {
    return fail(
      "QUANTIDADE_INVALIDA",
      "A quantidade em litros deve ser maior que zero.",
      422,
      "liters",
    );
  }

  if (!input.from && !input.to) {
    return fail(
      "MOVIMENTO_SEM_LADO",
      "A movimentação precisa de uma origem ou de um destino.",
      422,
    );
  }

  if (input.from) {
    const saldo = await getMilkBalance(tx, input.from);
    if (litros > saldo) {
      return fail(
        "SALDO_INSUFICIENTE",
        `Não há esse leite no local de origem: o saldo é de ${saldo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} litros.`,
        422,
        "liters",
      );
    }
  }

  const created = await tx.milkMovement.create({
    data: scoped({
      movement_type: input.movement_type,
      liters: litros,
      occurred_at: input.occurred_at ?? new Date(),
      from_site_id: input.from?.site_id ?? null,
      from_owner_id: input.from?.owner_id ?? null,
      to_site_id: input.to?.site_id ?? null,
      to_owner_id: input.to?.owner_id ?? null,
      destination: input.destination ?? null,
      production_id: input.production_id ?? null,
      notes: input.notes?.trim() || null,
      recorded_by_user_id: input.recorded_by_user_id ?? null,
    }),
    select: CAMPOS,
  });

  return ok(serializar(created));
}

/**
 * Cancela uma movimentação (§37.11): ela sai dos saldos e FICA na lista.
 *
 * Cancelar uma ENTRADA pode deixar um saldo negativo, quando o leite que
 * entrou já saiu. Isso é aceito de propósito, pelo mesmo motivo do
 * cancelamento de lactação: recusar prenderia o produtor a um registro errado.
 * O que a tela mostra nesse caso é o saldo real, e cabe a ele lançar o ajuste.
 */
export async function cancelMilkMovement(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<MilkMovementRecord>> {
  const movimento = await db.milkMovement.findFirst({
    where: { id },
    select: { id: true, canceled_at: true },
  });
  if (!movimento) return fail("NOT_FOUND", "Movimentação não encontrada.", 404);
  if (movimento.canceled_at) {
    return fail("JA_CANCELADO", "Esta movimentação já está cancelada.", 422);
  }

  const updated = await db.milkMovement.update({
    where: { id },
    data: { canceled_at: new Date() },
    select: CAMPOS,
  });

  return ok(serializar(updated));
}

export async function listMilkMovements(
  db: TenantPrismaClient,
  filtros: { site_id?: string; owner_id?: string; limit?: number } = {},
): Promise<MilkMovementRecord[]> {
  const linhas = await db.milkMovement.findMany({
    where: {
      ...(filtros.site_id
        ? { OR: [{ from_site_id: filtros.site_id }, { to_site_id: filtros.site_id }] }
        : {}),
      ...(filtros.owner_id
        ? { OR: [{ from_owner_id: filtros.owner_id }, { to_owner_id: filtros.owner_id }] }
        : {}),
    },
    orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }],
    take: Math.min(filtros.limit ?? 50, 200),
    select: CAMPOS,
  });
  return linhas.map(serializar);
}

/**
 * O volume FÍSICO de cada local: a soma de todos os donos (§20).
 *
 * É o número que responde "cabe mais leite no tanque?", e por isso ignora de
 * quem é o leite. O mesmo motivo pelo qual o rebanho conta os animais de
 * terceiros na ocupação do pasto.
 */
export async function getPhysicalVolumeBySite(
  db: TenantPrismaClient,
): Promise<Map<string, number>> {
  const posicoes = await getMilkPositions(db);
  const fisico = new Map<string, number>();
  for (const p of posicoes) {
    fisico.set(p.site_id, Math.round(((fisico.get(p.site_id) ?? 0) + p.liters) * 100) / 100);
  }
  return fisico;
}
