import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { exigir, papelDoEmporio, pode } from "@/lib/emporio/papel";
import { descreverQuantidade } from "@/lib/stock/units";
import { itens as frasItens, registrarNoHistorico } from "@/lib/emporio/historico";
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
 *
 * F6b (Q130, Q131): quem recebe a menos e não é Gestor do destino (nem Dono ou
 * Gerente geral) deixa a transferência em `aguardando_gestor`, sem entrar nada
 * no destino. A resolução é `perda_no_caminho` (a regra acima) ou
 * `nao_enviada` (a diferença volta ao saldo da origem, como uma
 * `transferencia_entrada` ligada à transferência, com o custo da saída).
 * Nunca gera lançamento financeiro. A validação é em TypeScript puro.
 */

export const RESOLUCOES = ["perda_no_caminho", "nao_enviada"] as const;
type Resolucao = (typeof RESOLUCOES)[number];
const ehResolucao = (v: unknown): v is Resolucao => (RESOLUCOES as readonly unknown[]).includes(v);

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

export type StatusDaTransferencia = "em_transito" | "aguardando_gestor" | "recebida" | "cancelada";

export type TransferView = {
  id: string;
  origin_establishment_id: string;
  origin_name: string;
  destination_establishment_id: string;
  destination_name: string;
  status: StatusDaTransferencia;
  operation_key: string;
  resolution: Resolucao | null;
  resolution_reason: string | null;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
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
    resolution: t.resolution,
    resolution_reason: t.resolution_reason,
    resolved_at: isoOrNull(t.resolved_at),
    resolved_by_user_id: t.resolved_by_user_id,
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
  opts: { establishment_id?: string; status?: StatusDaTransferencia; limit?: number } = {},
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
  if (
    opts.status === "em_transito" ||
    opts.status === "aguardando_gestor" ||
    opts.status === "recebida" ||
    opts.status === "cancelada"
  ) {
    e.push({ status: opts.status });
  }
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 200;
  const linhas = await buscar(db, e.length ? { AND: e } : {}, limite);
  return ok(linhas.map(montarView));
}

/**
 * Q33, Meu Dia: em trânsito há mais de 2 dias, só as transferências em que o
 * ator tem acesso às DUAS lojas. Q131: as `aguardando_gestor` entram, sem
 * esperar dias, para quem resolve no destino (Gestor, Gerente geral, Dono).
 */
export async function transferenciasParadasAction(
  db: TenantPrismaClient,
  ator: Ator,
  agora: Date = new Date(),
): Promise<ActionResult<TransferView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  const papel = await papelDoEmporio(db, ator);
  const limite = new Date(agora.getTime() - DIAS_PARADA * 24 * 60 * 60 * 1000);
  const linhas = await buscar(db, {
    OR: [{ status: "em_transito", sent_at: { lt: limite } }, { status: "aguardando_gestor" }],
  });
  return ok(
    linhas
      .filter((t) =>
        t.status === "aguardando_gestor"
          ? pode(papel, "gestor_da_loja", t.destination_establishment_id)
          : !visiveis || (visiveis.has(t.origin_establishment_id) && visiveis.has(t.destination_establishment_id)),
      )
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
  const neg = await exigir(db, ator, "gestor_da_loja", "enviar uma transferência");
  if (neg) return neg;

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
  const destino = await db.establishment.findFirst({
    where: { id: destinoId },
    select: { id: true, name: true, archived_at: true },
  });
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
  const destinoNome = destino.name;

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
      await registrarNoHistorico(tx, ator, {
        action: "transferencia.enviar",
        establishment_id: origem.id,
        target_type: "transferencia",
        target_id: t.id,
        summary: `Enviou ${frasItens(itens.length)} da ${origem.name} para a ${destinoNome}`,
      });
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
  /** Só vale para quem pode resolver (Gestor do destino, Gerente geral, Dono) e só quando chegou menos. */
  resolution?: string | null;
  reason?: string | null;
};

type ItemDaTransferencia = {
  id: string;
  emporio_product_id: string;
  package_state: "lacrado" | "avulso" | null;
  presentation_id: string | null;
  sent_qty: unknown;
  unit_cost: unknown;
};

type ItemDecidido = {
  item: ItemDaTransferencia;
  recebido: number;
  motivo: (typeof MOTIVOS_DE_PERDA)[number] | null;
};

type ProdutoDaTransferencia = { id: string; product_id: string; base_unit: string };

type TransferenciaComItens = {
  id: string;
  origin_establishment_id: string;
  destination_establishment_id: string;
  items: ItemDaTransferencia[];
};

/**
 * Fecha a transferência: marca `recebida`, grava o que chegou por item, entra
 * no destino o que chegou e, na resolução `nao_enviada`, devolve a diferença à
 * origem como `transferencia_entrada` ligada à transferência (movimentação,
 * nunca campo de saldo). Devolve false quando outra chamada já mudou o status.
 */
async function liquidar(
  tx: Parameters<Parameters<TenantPrismaClient["$transaction"]>[0]>[0],
  t: TransferenciaComItens,
  statusAntes: "em_transito" | "aguardando_gestor",
  decididos: ItemDecidido[],
  porProduto: Map<string, ProdutoDaTransferencia>,
  ator: Ator,
  agora: Date,
  recebedorId: string,
  resolucao: { resolution: Resolucao; reason: string } | null,
): Promise<boolean> {
  // O filtro no update é o que impede o recebimento em dobro por duas chamadas simultâneas.
  const r = await tx.stockTransfer.updateMany({
    where: { id: t.id, status: statusAntes },
    data: {
      status: "recebida",
      received_at: agora,
      received_by_user_id: recebedorId,
      ...(resolucao
        ? {
            resolution: resolucao.resolution,
            resolution_reason: resolucao.reason,
            resolved_at: agora,
            resolved_by_user_id: ator.id,
          }
        : {}),
    },
  });
  if (r.count === 0) return false;
  for (const d of decididos) {
    const p = porProduto.get(d.item.emporio_product_id);
    if (!p) throw new Error("produto da transferência sumiu");
    const falta = arred3((decToNum(d.item.sent_qty) ?? 0) - d.recebido);
    await tx.stockTransferItem.update({
      where: { id: d.item.id },
      data: {
        received_qty: d.recebido,
        loss_reason: resolucao?.resolution === "nao_enviada" ? null : d.motivo,
      },
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
    if (resolucao?.resolution === "nao_enviada" && falta > 0) {
      await tx.stockMovement.create({
        data: scoped({
          product_id: p.product_id,
          establishment_id: t.origin_establishment_id,
          property_id: null,
          movement_type: "transferencia_entrada" as const,
          quantity: falta,
          occurred_at: agora,
          package_state: d.item.package_state,
          presentation_id: d.item.presentation_id,
          unit_cost: decToNum(d.item.unit_cost),
          transfer_id: t.id,
          notes: `Estorno da diferença (não foi enviada): ${resolucao.reason}`,
          recorded_by_user_id: ator.id,
        }),
      });
    }
  }
  return true;
}

/** Nome das duas lojas da transferência, para a frase do Histórico. */
async function nomesDasLojas(db: TenantPrismaClient, origemId: string, destinoId: string) {
  const lojas = await db.establishment.findMany({
    where: { id: { in: [origemId, destinoId] } },
    select: { id: true, name: true },
  });
  const nome = (id: string) => lojas.find((l) => l.id === id)?.name ?? "uma loja";
  return { origem: nome(origemId), destino: nome(destinoId) };
}

async function produtosDe(db: TenantPrismaClient, t: TransferenciaComItens) {
  const produtos = await db.emporioProduct.findMany({
    where: { id: { in: [...new Set(t.items.map((i) => i.emporio_product_id))] } },
    select: { id: true, product_id: true, base_unit: true },
  });
  return new Map(produtos.map((p) => [p.id, p]));
}

/** `resolution` e `reason` do corpo, ou a recusa no campo. */
function lerResolucao(
  resolution: unknown,
  reason: unknown,
): ActionResult<{ resolution: Resolucao; reason: string }> {
  if (!ehResolucao(resolution)) {
    return fail("VALIDATION_ERROR", "Diga como resolver: perda no caminho ou não foi enviada.", 422, "resolution");
  }
  const motivo = typeof reason === "string" ? reason.trim() : "";
  if (!motivo) return fail("VALIDATION_ERROR", "Diga o motivo da resolução.", 422, "reason");
  return ok({ resolution, reason: motivo });
}

export async function receberTransferenciaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: ReceberTransferenciaInput,
): Promise<ActionResult<TransferView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "receber uma transferência");
  if (neg) return neg;
  const visiveis = await lojasDoAtor(db, ator);
  const t = await db.stockTransfer.findFirst({ where: { id }, include: { items: true } });
  if (!t || (visiveis && !visiveis.has(t.destination_establishment_id))) return NAO_ACHADO("Transferência");
  if (t.status !== "em_transito") return NAO_EM_TRANSITO();

  if (!Array.isArray(input?.items) || input.items.length === 0) {
    return fail("VALIDATION_ERROR", "Informe o que chegou de cada item.", 422, "items");
  }
  const porItem = new Map(t.items.map((i) => [i.id, i]));
  const vistos = new Set<string>();
  const decididos: ItemDecidido[] = [];
  let chegouMenos = false;
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
    const informado = r.loss_reason;
    if (informado != null && !(MOTIVOS_DE_PERDA as readonly string[]).includes(informado)) {
      return fail("VALIDATION_ERROR", "Motivo de perda inválido (vencido, avaria, furto, consumo próprio ou outro).", 422, "items");
    }
    if (recebido < enviado) chegouMenos = true;
    decididos.push({
      item,
      recebido,
      motivo: recebido < enviado ? ((informado as ItemDecidido["motivo"]) ?? "outro") : null,
    });
  }
  if (vistos.size !== t.items.length) {
    return fail("VALIDATION_ERROR", "Informe o que chegou de todos os itens.", 422, "items");
  }

  const papel = await papelDoEmporio(db, ator);
  const resolve = chegouMenos && pode(papel, "gestor_da_loja", t.destination_establishment_id);
  let resolucao: { resolution: Resolucao; reason: string } | null = null;
  if (resolve) {
    const l = lerResolucao(input.resolution, input.reason);
    if (!l.ok) return l;
    resolucao = l.data;
  }

  const porProduto = await produtosDe(db, t);
  for (const d of decididos) {
    const p = porProduto.get(d.item.emporio_product_id);
    if (p?.base_unit === "unidade" && !Number.isInteger(d.recebido)) {
      return fail("VALIDATION_ERROR", "Produto vendido por unidade só aceita quantidade inteira.", 422, "items");
    }
  }

  class Recusa extends Error {}
  const agora = new Date();
  const lojas = await nomesDasLojas(db, t.origin_establishment_id, t.destination_establishment_id);
  const aviso = (aguardando: boolean) =>
    aguardando
      ? `Recebeu a transferência da ${lojas.origem} na ${lojas.destino} com diferença: aguarda o gestor`
      : chegouMenos
        ? `Recebeu a transferência da ${lojas.origem} na ${lojas.destino} com diferença, já resolvida`
        : `Recebeu a transferência da ${lojas.origem} na ${lojas.destino}`;
  try {
    await db.$transaction(async (tx) => {
      if (chegouMenos && !resolve) {
        // Q131: nada entra no destino até o Gestor resolver; o que chegou fica guardado.
        const r = await tx.stockTransfer.updateMany({
          where: { id, status: "em_transito" },
          data: { status: "aguardando_gestor", received_by_user_id: ator.id },
        });
        if (r.count === 0) throw new Recusa();
        for (const d of decididos) {
          await tx.stockTransferItem.update({
            where: { id: d.item.id },
            data: { received_qty: d.recebido, loss_reason: d.motivo },
          });
        }
        await registrarNoHistorico(tx, ator, {
          action: "transferencia.receber",
          establishment_id: t.destination_establishment_id,
          target_type: "transferencia",
          target_id: id,
          summary: aviso(true),
        });
        return;
      }
      const feito = await liquidar(tx, t, "em_transito", decididos, porProduto, ator, agora, ator.id, resolucao);
      if (!feito) throw new Recusa();
      await registrarNoHistorico(tx, ator, {
        action: "transferencia.receber",
        establishment_id: t.destination_establishment_id,
        target_type: "transferencia",
        target_id: id,
        summary: aviso(false),
      });
    });
  } catch (err) {
    if (err instanceof Recusa) return NAO_EM_TRANSITO();
    throw err;
  }
  return lerTransferenciaAction(db, ator, id);
}

export type ResolverDiferencaInput = {
  operation_key: string;
  resolution: string;
  reason: string;
};

/**
 * Q131: o Gestor do destino (ou Gerente geral, Dono) resolve a diferença de uma
 * transferência `aguardando_gestor`. Idempotente: a transferência não guarda a
 * `operation_key`, então repetir é reconhecido por estar já resolvida, pela mesma
 * pessoa, com a mesma resolução e o mesmo motivo (devolve a gravada).
 */
export async function resolverDiferencaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: ResolverDiferencaInput,
): Promise<ActionResult<TransferView & { replayed: boolean }>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "resolver a diferença de uma transferência");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const visiveis = await lojasDoAtor(db, ator);
  const t = await db.stockTransfer.findFirst({ where: { id }, include: { items: true } });
  if (!t || (visiveis && !visiveis.has(t.destination_establishment_id))) return NAO_ACHADO("Transferência");

  if (t.status !== "aguardando_gestor") {
    const motivoRepetido = typeof input.reason === "string" ? input.reason.trim() : "";
    if (
      t.status === "recebida" &&
      t.resolution !== null &&
      t.resolution === input.resolution &&
      t.resolution_reason === motivoRepetido &&
      t.resolved_by_user_id === ator.id
    ) {
      const v = await viewDe(db, id);
      if (v) return ok({ ...v, replayed: true });
    }
    return fail("TRANSFER_NOT_AWAITING", "Essa transferência não está aguardando o gestor.", 409);
  }

  const l = lerResolucao(input.resolution, input.reason);
  if (!l.ok) return l;

  const decididos: ItemDecidido[] = [];
  for (const item of t.items) {
    if (item.received_qty === null) {
      return fail("VALIDATION_ERROR", "A transferência não tem o que chegou registrado.", 422, "items");
    }
    const recebido = decToNum(item.received_qty) ?? 0;
    const enviado = decToNum(item.sent_qty) ?? 0;
    decididos.push({
      item,
      recebido,
      motivo: recebido < enviado ? (item.loss_reason ?? "outro") : null,
    });
  }
  const porProduto = await produtosDe(db, t);

  class Recusa extends Error {}
  const agora = new Date();
  const lojasR = await nomesDasLojas(db, t.origin_establishment_id, t.destination_establishment_id);
  try {
    await db.$transaction(async (tx) => {
      const feito = await liquidar(
        tx,
        t,
        "aguardando_gestor",
        decididos,
        porProduto,
        ator,
        agora,
        t.received_by_user_id ?? ator.id,
        l.data,
      );
      if (!feito) throw new Recusa();
      await registrarNoHistorico(tx, ator, {
        action: "transferencia.resolver",
        establishment_id: t.destination_establishment_id,
        target_type: "transferencia",
        target_id: id,
        summary: `Resolveu a diferença da transferência da ${lojasR.origem} para a ${lojasR.destino}: ${
          l.data.resolution === "perda_no_caminho" ? "perda no caminho" : "não foi enviada"
        } (${l.data.reason})`,
      });
    });
  } catch (err) {
    if (err instanceof Recusa) {
      return fail("TRANSFER_NOT_AWAITING", "Essa transferência não está aguardando o gestor.", 409);
    }
    throw err;
  }
  const v = await viewDe(db, id);
  return v ? ok({ ...v, replayed: false }) : NAO_ACHADO("Transferência");
}

export async function cancelarTransferenciaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
): Promise<ActionResult<TransferView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "cancelar uma transferência");
  if (neg) return neg;
  const visiveis = await lojasDoAtor(db, ator);
  const t = await db.stockTransfer.findFirst({ where: { id } });
  if (!t || !visivel(visiveis, t)) return NAO_ACHADO("Transferência");
  // Q130: quem enviou, o Gestor da origem, o Gerente geral ou o Dono.
  const papel = await papelDoEmporio(db, ator);
  if (t.sent_by_user_id !== ator.id && !pode(papel, "gestor_da_loja", t.origin_establishment_id)) {
    return fail(
      "FORBIDDEN",
      "Só quem enviou, o gestor da loja de origem, o gerente geral ou o dono podem cancelar a transferência.",
      403,
    );
  }
  if (t.status !== "em_transito") return NAO_EM_TRANSITO();
  const motivo = String(input?.reason ?? "").trim();
  if (!motivo) return fail("VALIDATION_ERROR", "Diga o motivo do cancelamento.", 422, "reason");

  class Recusa extends Error {}
  const agora = new Date();
  const lojasC = await nomesDasLojas(db, t.origin_establishment_id, t.destination_establishment_id);
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
      await registrarNoHistorico(tx, ator, {
        action: "transferencia.cancelar",
        establishment_id: t.origin_establishment_id,
        target_type: "transferencia",
        target_id: id,
        summary: `Cancelou a transferência da ${lojasC.origem} para a ${lojasC.destino}: ${motivo}`,
      });
    });
  } catch (err) {
    if (err instanceof Recusa) return NAO_EM_TRANSITO();
    throw err;
  }
  return lerTransferenciaAction(db, ator, id);
}
