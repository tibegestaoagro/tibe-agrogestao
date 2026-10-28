import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { hasMinRole } from "@/lib/permissions";
import { descreverQuantidade } from "@/lib/stock/units";
import { custoMedio } from "@/lib/emporio/custo-medio";
import {
  INCLUDE_PRODUTO,
  lacradoEfetivo,
  lojasDoAtor,
  type Ator,
  type ProdutoRow,
} from "@/lib/actions/emporio-catalogo";
import {
  MOTIVOS_DE_PERDA,
  chaveDoEstado,
  lerMovimentos,
  saldosPorEstado,
} from "@/lib/actions/emporio-estoque";

/**
 * Meu Empório, F2b: transferência entre lojas (Módulo 39, Q19, Q21, Q31, Q33,
 * Q73 a Q76).
 *
 * Duas etapas: o envio grava uma `transferencia_saida` por item na origem, e o
 * recebimento grava uma `transferencia_entrada` por item no destino. O saldo
 * continua sendo a soma das movimentações (invariante 2). A diferença que não
 * chegou (Q74) NÃO vira movimentação: fica no item, como perda da origem.
 * Nunca gera lançamento financeiro. A validação é em TypeScript puro.
 */

const NEGADO_OPERADOR = () => fail("FORBIDDEN", "Seu perfil só permite consultar o Empório.", 403);
const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);
const NAO_EM_TRANSITO = () =>
  fail("TRANSFER_NOT_IN_TRANSIT", "Essa transferência não está mais em trânsito.", 409);

const arred3 = (n: number) => Math.round(n * 1000) / 1000;
const arred4 = (n: number) => Math.round(n * 10000) / 10000;
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const DIAS_PARADA = 2;

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type TransferItemView = {
  id: string;
  emporio_product_id: string;
  product_name: string;
  base_unit: string;
  package_state: "lacrado" | "avulso" | null;
  presentation_id: string | null;
  presentation_name: string | null;
  sent_qty: number;
  received_qty: number | null;
  loss_reason: string | null;
  unit_cost: number | null;
};

export type TransferView = {
  id: string;
  origin_establishment_id: string;
  origin_name: string;
  destination_establishment_id: string;
  destination_name: string;
  status: "em_transito" | "recebida" | "cancelada";
  operation_key: string;
  sent_at: string;
  sent_by_user_id: string | null;
  received_at: string | null;
  received_by_user_id: string | null;
  canceled_at: string | null;
  canceled_by_user_id: string | null;
  canceled_reason: string | null;
  notes: string | null;
  created_at: string;
  items: TransferItemView[];
};

const INCLUDE_TRANSFERENCIA = {
  origin: { select: { name: true } },
  destination: { select: { name: true } },
  items: {
    include: {
      emporio_product: { include: { product: { select: { name: true } } } },
      presentation: { select: { name: true } },
    },
    orderBy: { created_at: "asc" },
  },
} as const;

async function buscar(db: TenantPrismaClient, where: Record<string, unknown>, take?: number) {
  return db.stockTransfer.findMany({
    where,
    include: INCLUDE_TRANSFERENCIA,
    orderBy: [{ sent_at: "desc" }, { created_at: "desc" }],
    ...(take ? { take } : {}),
  });
}

type Linha = Awaited<ReturnType<typeof buscar>>[number];

function montarView(t: Linha): TransferView {
  return {
    id: t.id,
    origin_establishment_id: t.origin_establishment_id,
    origin_name: t.origin.name,
    destination_establishment_id: t.destination_establishment_id,
    destination_name: t.destination.name,
    status: t.status,
    operation_key: t.operation_key,
    sent_at: t.sent_at.toISOString(),
    sent_by_user_id: t.sent_by_user_id,
    received_at: isoOrNull(t.received_at),
    received_by_user_id: t.received_by_user_id,
    canceled_at: isoOrNull(t.canceled_at),
    canceled_by_user_id: t.canceled_by_user_id,
    canceled_reason: t.canceled_reason,
    notes: t.notes,
    created_at: t.created_at.toISOString(),
    items: t.items.map((i) => ({
      id: i.id,
      emporio_product_id: i.emporio_product_id,
      product_name: i.emporio_product.product.name,
      base_unit: i.emporio_product.base_unit,
      package_state: i.package_state,
      presentation_id: i.presentation_id,
      presentation_name: i.presentation?.name ?? null,
      sent_qty: decToNum(i.sent_qty) ?? 0,
      received_qty: decToNum(i.received_qty),
      loss_reason: i.loss_reason,
      unit_cost: decToNum(i.unit_cost),
    })),
  };
}

async function viewDe(db: TenantPrismaClient, id: string): Promise<TransferView | null> {
  const [t] = await buscar(db, { id });
  return t ? montarView(t) : null;
}

/** Visível quando a origem OU o destino é visível ao ator. */
function visivel(visiveis: Set<string> | null, t: { origin_establishment_id: string; destination_establishment_id: string }) {
  return !visiveis || visiveis.has(t.origin_establishment_id) || visiveis.has(t.destination_establishment_id);
}

export async function lerTransferenciaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<TransferView>> {
  const visiveis = await lojasDoAtor(db, ator);
  const v = await viewDe(db, id);
  if (!v || !visivel(visiveis, v)) return NAO_ACHADO("Transferência");
  return ok(v);
}

export async function listarTransferenciasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; status?: "em_transito" | "recebida" | "cancelada"; limit?: number } = {},
): Promise<ActionResult<TransferView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const e: Record<string, unknown>[] = [];
  if (opts.establishment_id) {
    e.push({
      OR: [
        { origin_establishment_id: opts.establishment_id },
        { destination_establishment_id: opts.establishment_id },
      ],
    });
  }
  if (visiveis) {
    e.push({
      OR: [
        { origin_establishment_id: { in: [...visiveis] } },
        { destination_establishment_id: { in: [...visiveis] } },
      ],
    });
  }
  if (opts.status === "em_transito" || opts.status === "recebida" || opts.status === "cancelada") {
    e.push({ status: opts.status });
  }
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 200;
  const linhas = await buscar(db, e.length ? { AND: e } : {}, limite);
  return ok(linhas.map(montarView));
}

/**
 * Q33, Meu Dia: em trânsito há mais de 2 dias, só as transferências em que o
 * ator tem acesso às DUAS lojas.
 */
export async function transferenciasParadasAction(
  db: TenantPrismaClient,
  ator: Ator,
  agora: Date = new Date(),
): Promise<ActionResult<TransferView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  const limite = new Date(agora.getTime() - DIAS_PARADA * 24 * 60 * 60 * 1000);
  const linhas = await buscar(db, { status: "em_transito", sent_at: { lt: limite } });
  return ok(
    linhas
      .filter((t) => !visiveis || (visiveis.has(t.origin_establishment_id) && visiveis.has(t.destination_establishment_id)))
      .map(montarView),
  );
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

export type EnviarTransferenciaInput = {
  operation_key: string;
  origin_establishment_id: string;
  destination_establishment_id: string;
  items: {
    emporio_product_id: string;
    presentation_id?: string | null;
    packages?: number | null;
    quantity?: number | null;
  }[];
  notes?: string | null;
};

type ItemPlanejado = {
  produto: ProdutoRow;
  estado: "lacrado" | "avulso" | null;
  presentation_id: string | null;
  base: number;
};

export async function enviarTransferenciaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: EnviarTransferenciaInput,
): Promise<ActionResult<TransferView & { replayed: boolean }>> {
  if (!hasMinRole(ator.role, "OPERADOR")) return NEGADO_OPERADOR();

  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const visiveis = await lojasDoAtor(db, ator);

  const repetida = await db.stockTransfer.findFirst({ where: { operation_key: chave }, select: { id: true } });
  if (repetida) {
    const v = await viewDe(db, repetida.id);
    if (v && visiveis && !visiveis.has(v.origin_establishment_id)) return NAO_ACHADO("Transferência");
    if (v) return ok({ ...v, replayed: true });
  }

  const origemId = input.origin_establishment_id;
  const destinoId = input.destination_establishment_id;
  if (typeof origemId !== "string" || !origemId || (visiveis && !visiveis.has(origemId))) {
    return NAO_ACHADO("Estabelecimento", "origin_establishment_id");
  }
  if (typeof destinoId !== "string" || !destinoId) {
    return fail("VALIDATION_ERROR", "Escolha a loja de destino.", 422, "destination_establishment_id");
  }
  if (origemId === destinoId) {
    return fail("VALIDATION_ERROR", "A origem e o destino devem ser lojas diferentes.", 422, "destination_establishment_id");
  }
  const origem = await db.establishment.findFirst({
    where: { id: origemId },
    select: { id: true, name: true, allow_negative_stock: true, archived_at: true },
  });
  if (!origem) return NAO_ACHADO("Estabelecimento", "origin_establishment_id");
  if (origem.archived_at) {
    return fail("VALIDATION_ERROR", "A loja de origem está arquivada.", 422, "origin_establishment_id");
  }
  // O destino pode não estar no vínculo do ator (a Central manda para uma loja que ele não vê).
  const destino = await db.establishment.findFirst({ where: { id: destinoId }, select: { id: true, archived_at: true } });
  if (!destino) return NAO_ACHADO("Estabelecimento", "destination_establishment_id");
  if (destino.archived_at) {
    return fail("VALIDATION_ERROR", "A loja de destino está arquivada.", 422, "destination_establishment_id");
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    return fail("VALIDATION_ERROR", "Inclua ao menos um item.", 422, "items");
  }
  const ids = [...new Set(input.items.map((i) => i?.emporio_product_id))].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  const produtos = await db.emporioProduct.findMany({ where: { id: { in: ids } }, include: INCLUDE_PRODUTO });
  const porId = new Map<string, ProdutoRow>(produtos.map((p) => [p.id, p]));

  // Itens repetidos no mesmo estado são somados: a checagem de saldo é por produto e estado.
  const planejados = new Map<string, ItemPlanejado>();
  for (const it of input.items) {
    const p = porId.get(it?.emporio_product_id);
    if (!p) return NAO_ACHADO("Produto", "items");
    if (p.archived_at) return fail("VALIDATION_ERROR", "Um dos produtos está arquivado.", 422, "items");

    const temPacotes = it.packages !== undefined && it.packages !== null;
    const temQtd = it.quantity !== undefined && it.quantity !== null;
    let estado: ItemPlanejado["estado"];
    let presentationId: string | null = null;
    let base: number;

    if (!lacradoEfetivo(p)) {
      if (it.presentation_id || temPacotes) {
        return fail("VALIDATION_ERROR", "Esse produto não separa lacrado de avulso: informe só a quantidade.", 422, "items");
      }
      if (!temQtd) return fail("VALIDATION_ERROR", "Informe a quantidade de cada item.", 422, "items");
      estado = null;
      base = it.quantity as number;
    } else if (it.presentation_id) {
      const ap = p.presentations.find((x) => x.id === it.presentation_id);
      if (!ap || ap.archived_at || !ap.is_sealed_package) {
        return fail("VALIDATION_ERROR", "Escolha uma apresentação fechada do produto.", 422, "items");
      }
      if (temQtd) {
        return fail("VALIDATION_ERROR", "Lacrado leva embalagens; avulso leva quantidade. Não os dois no mesmo item.", 422, "items");
      }
      if (!numero(it.packages) || it.packages <= 0 || !Number.isInteger(it.packages)) {
        return fail("VALIDATION_ERROR", "Embalagem lacrada se conta em número inteiro maior que zero.", 422, "items");
      }
      estado = "lacrado";
      presentationId = ap.id;
      base = it.packages * (decToNum(ap.base_qty) ?? 0);
    } else {
      if (temPacotes) {
        return fail("VALIDATION_ERROR", "Embalagens lacradas pedem a apresentação.", 422, "items");
      }
      if (!temQtd) return fail("VALIDATION_ERROR", "Informe a quantidade de cada item.", 422, "items");
      estado = "avulso";
      base = it.quantity as number;
    }

    if (!numero(base) || base <= 0) {
      return fail("VALIDATION_ERROR", "A quantidade de cada item deve ser maior que zero.", 422, "items");
    }
    base = arred3(base);
    if (!(base > 0)) {
      return fail("VALIDATION_ERROR", "A quantidade de cada item deve ser maior que zero.", 422, "items");
    }
    if (p.base_unit === "unidade" && !Number.isInteger(base)) {
      return fail("VALIDATION_ERROR", "Produto vendido por unidade só aceita quantidade inteira.", 422, "items");
    }
    const k = `${p.id}|${chaveDoEstado(presentationId)}`;
    const atual = planejados.get(k);
    if (atual) atual.base = arred3(atual.base + base);
    else planejados.set(k, { produto: p, estado, presentation_id: presentationId, base });
  }
  const itens = [...planejados.values()];

  class Recusa extends Error {
    constructor(public recusa: ActionResult<never>) {
      super("envio recusado");
    }
  }

  const agora = new Date();
  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      // Saldo e custo médio da origem, lidos dentro da transação (Q21, Q76).
      const custos: (number | null)[] = [];
      const movsPorProduto = new Map<string, Awaited<ReturnType<typeof lerMovimentos>>>();
      for (const i of itens) {
        let movs = movsPorProduto.get(i.produto.product_id);
        if (!movs) {
          movs = await lerMovimentos(tx, [origem.id], [i.produto.product_id]);
          movsPorProduto.set(i.produto.product_id, movs);
        }
        const saldo = saldosPorEstado(movs).get(chaveDoEstado(i.presentation_id)) ?? 0;
        if (i.base > saldo && !origem.allow_negative_stock) {
          throw new Recusa(
            fail(
              "INSUFFICIENT_STOCK",
              `Saldo insuficiente de ${i.produto.product.name} em ${origem.name}: há ${descreverQuantidade(saldo, i.produto.base_unit)} e o envio é de ${descreverQuantidade(i.base, i.produto.base_unit)}.`,
              409,
              "items",
            ),
          );
        }
        const medio = custoMedio(movs).custo_medio;
        custos.push(medio === null ? null : arred4(medio));
      }

      const t = await tx.stockTransfer.create({
        data: scoped({
          origin_establishment_id: origem.id,
          destination_establishment_id: destino.id,
          operation_key: chave,
          sent_at: agora,
          sent_by_user_id: ator.id,
          notes: typeof input.notes === "string" ? input.notes.trim() || null : null,
        }),
      });
      await tx.stockTransferItem.createMany({
        data: itens.map((i, idx) =>
          scoped({
            transfer_id: t.id,
            emporio_product_id: i.produto.id,
            package_state: i.estado,
            presentation_id: i.presentation_id,
            sent_qty: i.base,
            unit_cost: custos[idx],
          }),
        ),
      });
      for (let idx = 0; idx < itens.length; idx++) {
        const i = itens[idx];
        await tx.stockMovement.create({
          data: scoped({
            product_id: i.produto.product_id,
            establishment_id: origem.id,
            property_id: null,
            movement_type: "transferencia_saida" as const,
            quantity: i.base,
            occurred_at: agora,
            package_state: i.estado,
            presentation_id: i.presentation_id,
            unit_cost: custos[idx],
            transfer_id: t.id,
            recorded_by_user_id: ator.id,
          }),
        });
      }
      return t.id;
    });
    const v = await viewDe(db, id);
    return v ? ok({ ...v, replayed: false }) : NAO_ACHADO("Transferência");
  } catch (err) {
    if (err instanceof Recusa) return err.recusa;
    if (ehErroUnico(err)) {
      const igual = await db.stockTransfer.findFirst({ where: { operation_key: chave }, select: { id: true } });
      const v = igual ? await viewDe(db, igual.id) : null;
      if (v) return ok({ ...v, replayed: true });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Recebimento e cancelamento
// ---------------------------------------------------------------------------

export type ReceberTransferenciaInput = {
  items: { item_id: string; received_qty: number; loss_reason?: string | null }[];
};

export async function receberTransferenciaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: ReceberTransferenciaInput,
): Promise<ActionResult<TransferView>> {
  if (!hasMinRole(ator.role, "OPERADOR")) return NEGADO_OPERADOR();
  const visiveis = await lojasDoAtor(db, ator);
  const t = await db.stockTransfer.findFirst({ where: { id }, include: { items: true } });
  if (!t || (visiveis && !visiveis.has(t.destination_establishment_id))) return NAO_ACHADO("Transferência");
  if (t.status !== "em_transito") return NAO_EM_TRANSITO();

  if (!Array.isArray(input?.items) || input.items.length === 0) {
    return fail("VALIDATION_ERROR", "Informe o que chegou de cada item.", 422, "items");
  }
  const porItem = new Map(t.items.map((i) => [i.id, i]));
  const vistos = new Set<string>();
  const decididos: { item: (typeof t.items)[number]; recebido: number; motivo: string | null }[] = [];
  for (const r of input.items) {
    const item = porItem.get(r?.item_id);
    if (!item) return fail("VALIDATION_ERROR", "Um dos itens não pertence a essa transferência.", 422, "items");
    if (vistos.has(item.id)) return fail("VALIDATION_ERROR", "Um item foi informado mais de uma vez.", 422, "items");
    vistos.add(item.id);
    if (!numero(r.received_qty) || r.received_qty < 0) {
      return fail("VALIDATION_ERROR", "A quantidade recebida não pode ser negativa.", 422, "items");
    }
    const enviado = decToNum(item.sent_qty) ?? 0;
    const recebido = arred3(r.received_qty);
    if (recebido > enviado) {
      return fail("VALIDATION_ERROR", "Não se aceita mais do que foi enviado. Confira a quantidade recebida.", 422, "items");
    }
    let motivo: string | null = null;
    if (recebido < enviado) {
      if (typeof r.loss_reason !== "string" || !(MOTIVOS_DE_PERDA as readonly string[]).includes(r.loss_reason)) {
        return fail(
          "VALIDATION_ERROR",
          "Chegou menos do que foi enviado: escolha o motivo (vencido, avaria, furto, consumo próprio ou outro).",
          422,
          "items",
        );
      }
      motivo = r.loss_reason;
    }
    decididos.push({ item, recebido, motivo });
  }
  if (vistos.size !== t.items.length) {
    return fail("VALIDATION_ERROR", "Informe o que chegou de todos os itens.", 422, "items");
  }

  const produtos = await db.emporioProduct.findMany({
    where: { id: { in: [...new Set(t.items.map((i) => i.emporio_product_id))] } },
    select: { id: true, product_id: true, base_unit: true },
  });
  const porProduto = new Map(produtos.map((p) => [p.id, p]));
  for (const d of decididos) {
    const p = porProduto.get(d.item.emporio_product_id);
    if (p?.base_unit === "unidade" && !Number.isInteger(d.recebido)) {
      return fail("VALIDATION_ERROR", "Produto vendido por unidade só aceita quantidade inteira.", 422, "items");
    }
  }

  class Recusa extends Error {}
  const agora = new Date();
  try {
    await db.$transaction(async (tx) => {
      // O filtro no update é o que impede o recebimento em dobro por duas chamadas simultâneas.
      const r = await tx.stockTransfer.updateMany({
        where: { id, status: "em_transito" },
        data: { status: "recebida", received_at: agora, received_by_user_id: ator.id },
      });
      if (r.count === 0) throw new Recusa();
      for (const d of decididos) {
        const p = porProduto.get(d.item.emporio_product_id);
        if (!p) throw new Error("produto da transferência sumiu");
        await tx.stockTransferItem.update({
          where: { id: d.item.id },
          data: { received_qty: d.recebido, loss_reason: d.motivo as (typeof MOTIVOS_DE_PERDA)[number] | null },
        });
        if (d.recebido > 0) {
          await tx.stockMovement.create({
            data: scoped({
              product_id: p.product_id,
              establishment_id: t.destination_establishment_id,
              property_id: null,
              movement_type: "transferencia_entrada" as const,
              quantity: d.recebido,
              occurred_at: agora,
              package_state: d.item.package_state,
              presentation_id: d.item.presentation_id,
              unit_cost: decToNum(d.item.unit_cost),
              transfer_id: t.id,
              recorded_by_user_id: ator.id,
            }),
          });
        }
      }
    });
  } catch (err) {
    if (err instanceof Recusa) return NAO_EM_TRANSITO();
    throw err;
  }
  return lerTransferenciaAction(db, ator, id);
}

export async function cancelarTransferenciaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
): Promise<ActionResult<TransferView>> {
  if (!hasMinRole(ator.role, "OPERADOR")) return NEGADO_OPERADOR();
  const visiveis = await lojasDoAtor(db, ator);
  const t = await db.stockTransfer.findFirst({ where: { id } });
  if (!t || !visivel(visiveis, t)) return NAO_ACHADO("Transferência");
  if (t.sent_by_user_id !== ator.id && !hasMinRole(ator.role, "ADMIN")) {
    return fail("FORBIDDEN", "Só quem enviou, o dono ou o administrador podem cancelar a transferência.", 403);
  }
  if (t.status !== "em_transito") return NAO_EM_TRANSITO();
  const motivo = String(input?.reason ?? "").trim();
  if (!motivo) return fail("VALIDATION_ERROR", "Diga o motivo do cancelamento.", 422, "reason");

  class Recusa extends Error {}
  const agora = new Date();
  try {
    await db.$transaction(async (tx) => {
      const r = await tx.stockTransfer.updateMany({
        where: { id, status: "em_transito" },
        data: { status: "cancelada", canceled_at: agora, canceled_by_user_id: ator.id, canceled_reason: motivo },
      });
      if (r.count === 0) throw new Recusa();
      await tx.stockMovement.updateMany({
        where: { transfer_id: id, canceled_at: null },
        data: { canceled_at: agora, canceled_reason: motivo },
      });
    });
  } catch (err) {
    if (err instanceof Recusa) return NAO_EM_TRANSITO();
    throw err;
  }
  return lerTransferenciaAction(db, ator, id);
}
