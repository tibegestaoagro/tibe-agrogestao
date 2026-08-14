import type { Prisma, StockMovementType } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { decToNum } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { findUnit, descreverQuantidade } from "@/lib/stock/units";

/**
 * O livro-razão do estoque (Módulo 31, §10).
 *
 * **O SALDO NUNCA É GRAVADO.** É a soma das movimentações não canceladas, por
 * produto e fazenda. É a mesma regra do rebanho e existe pelo mesmo motivo: um
 * campo de saldo e uma soma de movimentações são duas verdades, e no dia em que
 * discordarem ninguém sabe qual está certa. Se você se pegar escrevendo um
 * campo de quantidade em `Product`, pare.
 *
 * **O saldo é por PRODUTO e FAZENDA**, não por tenant. O §9.2 exige "fazenda de
 * destino" na compra e o §10.4 exige "fazenda" no uso: sal mineral na Fazenda A
 * não alimenta o gado da Fazenda B sem alguém carregar o caminhão.
 *
 * **`quantity` é sempre positiva.** Para compra, venda, uso e permuta o sinal
 * vem do tipo; para o AJUSTE ele vem dos dois saldos que o §10.6 obriga a
 * guardar, porque uma correção pode ser para mais ou para menos. Guardar
 * quantidade negativa faria toda leitura depender de lembrar a convenção, e a
 * primeira consulta escrita distraidamente somaria tudo.
 */

/**
 * Os tipos que TIRAM do estoque. Compra e permuta de entrada acrescentam; o
 * ajuste tem sinal próprio (ver `deltaDoMovimento`).
 */
const SAIDAS: ReadonlySet<string> = new Set(["venda", "utilizacao", "permuta_saida"]);

/**
 * Quanto uma movimentação mexe no saldo, COM sinal.
 *
 * O `ajuste` não tem sinal fixo: uma correção de 9 para 8 tira uma unidade e
 * uma de 8 para 9 acrescenta. Por isso ele não é decidido pelo tipo, e sim
 * pelos dois saldos que o §10.6 obriga a guardar. `quantity` continua sempre
 * positiva, como em todo movimento.
 *
 * Escrevi esta função uma primeira vez devolvendo +1 para ajuste, com um
 * comentário dizendo que a diferença era gravada com sinal. Não era: um ajuste
 * para MENOS teria somado. O comentário afirmava o que o código ao lado
 * desmentia, e é o defeito que mais apareceu na missão 1.
 */
export function deltaDoMovimento(m: {
  movement_type: StockMovementType | string;
  quantity: number;
  previous_balance?: number | null;
  corrected_balance?: number | null;
}): number {
  if (m.movement_type === "ajuste") {
    const antes = m.previous_balance ?? 0;
    const depois = m.corrected_balance ?? antes;
    return depois - antes;
  }
  return SAIDAS.has(m.movement_type) ? -m.quantity : m.quantity;
}

export type StockPosition = {
  product_id: string;
  property_id: string;
  quantity: number;
};

type StockLedgerClient = TenantPrismaClient | Prisma.TransactionClient;

/**
 * Saldo por produto e fazenda.
 *
 * Sem filtro, devolve toda posição com movimentação. O `where` só é montado
 * quando existe filtro: `AND` de nada é `{}`, mas montar condição vazia foi o
 * que fez `getPositions` do rebanho devolver lista VAZIA com o livro cheio, e
 * ainda fez uma asserção de isolamento passar pelo motivo errado.
 */
export async function getStockBalance(
  db: StockLedgerClient,
  filtro: { product_id?: string; property_id?: string } = {},
): Promise<StockPosition[]> {
  const where: Prisma.StockMovementWhereInput = { canceled_at: null };
  if (filtro.product_id !== undefined) where.product_id = filtro.product_id;
  if (filtro.property_id !== undefined) where.property_id = filtro.property_id;

  const linhas = await db.stockMovement.findMany({
    where,
    select: {
      product_id: true,
      property_id: true,
      movement_type: true,
      quantity: true,
      previous_balance: true,
      corrected_balance: true,
    },
  });

  const total = new Map<string, StockPosition>();
  for (const l of linhas) {
    const chave = `${l.product_id}|${l.property_id}`;
    const atual = total.get(chave) ?? {
      product_id: l.product_id,
      property_id: l.property_id,
      quantity: 0,
    };
    atual.quantity += deltaDoMovimento({
      movement_type: l.movement_type,
      quantity: decToNum(l.quantity) ?? 0,
      previous_balance: decToNum(l.previous_balance),
      corrected_balance: decToNum(l.corrected_balance),
    });
    total.set(chave, atual);
  }

  // Centavo de unidade não existe: 0.1 + 0.2 em ponto flutuante deixaria
  // resíduo, e o produtor veria "0,30000000000000004 saca".
  const posicoes = Array.from(total.values());
  for (const p of posicoes) p.quantity = Math.round(p.quantity * 1000) / 1000;

  return posicoes;
}

export type StockMovementInput = {
  product_id: string;
  property_id: string;
  movement_type: StockMovementType;
  quantity: number;
  occurred_at?: Date | null;
  /** §10.4, opcional: para qual grupo de animais, pasto e finalidade. */
  herd_category_id?: string | null;
  pasture_id?: string | null;
  purpose?: string | null;
  notes?: string | null;
  negotiation_id?: string | null;
  recorded_by_user_id?: string | null;
};

/**
 * Registra uma movimentação. Recusa saída acima do disponível (§10.7).
 *
 * A conferência de saldo e a escrita acontecem na MESMA transação
 * serializável: sem isso, duas saídas simultâneas do mesmo produto leriam o
 * mesmo saldo e as duas passariam, deixando o estoque negativo. É a mesma trava
 * que o livro-razão do rebanho usa.
 */
export async function recordStockMovement(
  db: TenantPrismaClient,
  input: StockMovementInput,
): Promise<ActionResult<{ id: string }>> {
  return runSerializableTenantTransaction(db, async (tx) =>
    recordStockMovementInTx(db, tx, input),
  );
}

/**
 * O corpo, sem abrir transação própria, para a compra de produto conseguir
 * gravar movimento e lançamento financeiro numa transação só. Mesmo motivo de
 * `recordMovementInTx` no rebanho.
 */
export async function recordStockMovementInTx(
  db: TenantPrismaClient,
  tx: Prisma.TransactionClient,
  input: StockMovementInput,
): Promise<ActionResult<{ id: string }>> {
  const produto = await tx.product.findFirst({ where: { id: input.product_id } });
  if (!produto) return fail("INVALID_PRODUCT", "Produto inválido", 422);

  const propriedade = await tx.property.findFirst({ where: { id: input.property_id } });
  if (!propriedade) return fail("INVALID_PROPERTY", "Fazenda inválida", 422);

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return fail("VALIDATION_ERROR", "A quantidade precisa ser maior que zero.", 422);
  }

  const unidade = findUnit(produto.unit);
  if (unidade && !unidade.fracionavel && !Number.isInteger(input.quantity)) {
    // §10.5: "quando necessário, o sistema poderá aceitar quantidades
    // parciais". Meia saca existe; meia ferramenta não, e aceitar seria deixar
    // passar um erro de digitação que o produtor não veria.
    return fail(
      "VALIDATION_ERROR",
      `${produto.name} é contado em ${unidade.plural}, que não aceita quantidade quebrada.`,
      422,
    );
  }

  if (SAIDAS.has(input.movement_type)) {
    const [posicao] = await getStockBalance(tx, {
      product_id: input.product_id,
      property_id: input.property_id,
    });
    const disponivel = posicao?.quantity ?? 0;
    if (disponivel < input.quantity) {
      // §10.7, a mensagem literal do documento. Diferente da do rebanho, que
      // NÃO tem a palavra "disponíveis": as duas foram escritas separadamente
      // pelo cliente e cada uma é citada onde vale.
      return fail(
        "INSUFFICIENT_STOCK",
        `Existem apenas ${descreverQuantidade(disponivel, produto.unit)} disponíveis. Revise a quantidade informada.`,
        422,
      );
    }
  }

  const movimento = await tx.stockMovement.create({
    data: scoped({
      product_id: input.product_id,
      property_id: input.property_id,
      movement_type: input.movement_type,
      quantity: input.quantity,
      occurred_at: input.occurred_at ?? new Date(),
      herd_category_id: input.herd_category_id ?? null,
      pasture_id: input.pasture_id ?? null,
      purpose: input.purpose ?? null,
      notes: input.notes ?? null,
      negotiation_id: input.negotiation_id ?? null,
      recorded_by_user_id: input.recorded_by_user_id ?? null,
    }),
  });

  return ok({ id: movimento.id });
}

/**
 * Ajuste de estoque (§10.6): o produtor informa o saldo REAL e o sistema grava
 * a diferença.
 *
 * O documento é específico sobre o que o histórico precisa guardar: saldo
 * anterior, saldo corrigido, diferença, data, usuário e motivo. Guardar só a
 * diferença não explicaria o que o produtor viu na tela quando decidiu
 * corrigir, que é justamente o que se quer saber ao conferir depois.
 */
export async function adjustStock(
  db: TenantPrismaClient,
  input: {
    product_id: string;
    property_id: string;
    /** O que existe de verdade, contado pelo produtor. */
    corrected_balance: number;
    reason?: string | null;
    recorded_by_user_id?: string | null;
  },
): Promise<ActionResult<{ id: string; diferenca: number }>> {
  return runSerializableTenantTransaction(db, async (tx) => {
    const produto = await tx.product.findFirst({ where: { id: input.product_id } });
    if (!produto) return fail("INVALID_PRODUCT", "Produto inválido", 422);

    const propriedade = await tx.property.findFirst({ where: { id: input.property_id } });
    if (!propriedade) return fail("INVALID_PROPERTY", "Fazenda inválida", 422);

    if (!Number.isFinite(input.corrected_balance) || input.corrected_balance < 0) {
      return fail("VALIDATION_ERROR", "O saldo corrigido não pode ser negativo.", 422);
    }

    const unidade = findUnit(produto.unit);
    if (unidade && !unidade.fracionavel && !Number.isInteger(input.corrected_balance)) {
      return fail(
        "VALIDATION_ERROR",
        `${produto.name} é contado em ${unidade.plural}, que não aceita quantidade quebrada.`,
        422,
      );
    }

    const [posicao] = await getStockBalance(tx, {
      product_id: input.product_id,
      property_id: input.property_id,
    });
    const anterior = posicao?.quantity ?? 0;
    const diferenca = Math.round((input.corrected_balance - anterior) * 1000) / 1000;

    if (diferenca === 0) {
      // Não é erro: é o produtor confirmando que o sistema já estava certo.
      // Gravar um movimento de zero sujaria o histórico sem informar nada.
      return fail(
        "NO_CHANGE",
        `O estoque já está em ${descreverQuantidade(anterior, produto.unit)}. Não mudei nada.`,
        422,
      );
    }

    const movimento = await tx.stockMovement.create({
      data: scoped({
        product_id: input.product_id,
        property_id: input.property_id,
        movement_type: "ajuste",
        // Positiva sempre, como todo movimento. Quem dá o sinal ao saldo são os
        // dois campos abaixo, lidos por `deltaDoMovimento`.
        quantity: Math.abs(diferenca),
        occurred_at: new Date(),
        previous_balance: anterior,
        corrected_balance: input.corrected_balance,
        notes: input.reason ?? null,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
      }),
    });

    return ok({ id: movimento.id, diferenca });
  });
}
