import type { Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { hasMinRole } from "@/lib/permissions";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { descreverQuantidade } from "@/lib/stock/units";
import { custoMedio } from "@/lib/emporio/custo-medio";
import { INCLUDE_PRODUTO, lacradoEfetivo, lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import {
  acharLojaParaEscrita,
  lerMovimentos,
  saldosPorEstado,
  validarSealed,
} from "@/lib/actions/emporio-estoque";

/**
 * Meu Empório, F2b: composição e produção feita na loja (Módulo 39, Q22, Q43,
 * Q72, Q77 a Q79).
 *
 * O saldo continua sendo a soma das movimentações (invariante 2): produzir
 * grava `producao_consumo` por componente e `producao_entrada` do produto, e
 * cancelar só marca `canceled_at`. Cadastrar a composição não mexe em estoque,
 * e a compra do produto pronto também não baixa ingrediente: só a produção
 * baixa (regra 1 da seção 5). A validação é em TypeScript puro, porque o
 * agente do WhatsApp chama estas funções sem passar pelo Zod da rota.
 */

const NEGADO_ADMIN = () => fail("FORBIDDEN", "Só o dono e o administrador podem fazer isso.", 403);
const NEGADO_OPERADOR = () => fail("FORBIDDEN", "Seu perfil só permite consultar o Empório.", 403);
const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);

const arred3 = (n: number) => Math.round(n * 1000) / 1000;
const arred4 = (n: number) => Math.round(n * 10000) / 10000;
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

/** Aborta a transação com uma recusa de negócio (o rollback desfaz o que já foi escrito). */
class AbortarProducao extends Error {
  constructor(public recusa: ActionResult<never>) {
    super("produção abortada");
  }
}

// ---------------------------------------------------------------------------
// Composição
// ---------------------------------------------------------------------------

export type ComposicaoItemView = {
  component_emporio_product_id: string;
  name: string;
  base_unit: string;
  quantity: number;
};

export type ComposicaoView = {
  emporio_product_id: string;
  reference_qty: number;
  yield_pct: number | null;
  items: ComposicaoItemView[];
};

async function viewDaComposicao(db: TenantPrismaClient, emporioProductId: string): Promise<ComposicaoView | null> {
  const c = await db.composition.findFirst({
    where: { emporio_product_id: emporioProductId },
    include: {
      items: { include: { component: { include: { product: { select: { name: true } } } } } },
    },
  });
  if (!c) return null;
  return {
    emporio_product_id: c.emporio_product_id,
    reference_qty: decToNum(c.reference_qty) ?? 0,
    yield_pct: decToNum(c.yield_pct),
    items: c.items
      .map((i) => ({
        component_emporio_product_id: i.component_emporio_product_id,
        name: i.component.product.name,
        base_unit: i.component.base_unit,
        quantity: decToNum(i.quantity) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

export async function lerComposicaoAction(
  db: TenantPrismaClient,
  _ator: Ator,
  emporio_product_id: string,
): Promise<ActionResult<ComposicaoView | null>> {
  const p = await db.emporioProduct.findFirst({ where: { id: emporio_product_id }, select: { id: true } });
  if (!p) return NAO_ACHADO("Produto");
  return ok(await viewDaComposicao(db, p.id));
}

export type ComposicaoInput = {
  reference_qty: number;
  yield_pct?: number | null;
  items: { component_emporio_product_id: string; quantity: number }[];
};

export async function definirComposicaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  emporio_product_id: string,
  input: ComposicaoInput,
): Promise<ActionResult<ComposicaoView>> {
  if (!hasMinRole(ator.role, "ADMIN")) return NEGADO_ADMIN();
  const produto = await db.emporioProduct.findFirst({ where: { id: emporio_product_id }, select: { id: true } });
  if (!produto) return NAO_ACHADO("Produto");

  const ref = input?.reference_qty;
  if (!numero(ref) || arred3(ref) <= 0) {
    return fail("VALIDATION_ERROR", "Informe para quanto rende a receita (maior que zero).", 422, "reference_qty");
  }
  let rendimento: number | null = null;
  if (input.yield_pct != null) {
    const y = input.yield_pct;
    if (!numero(y) || Math.round(y * 100) / 100 <= 0 || y > 100) {
      return fail("VALIDATION_ERROR", "O rendimento deve ficar acima de 0 e até 100%.", 422, "yield_pct");
    }
    rendimento = Math.round(y * 100) / 100;
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return fail("VALIDATION_ERROR", "Inclua ao menos um componente.", 422, "items");
  }

  const ids = new Set<string>();
  for (const it of input.items) {
    const id = it?.component_emporio_product_id;
    if (typeof id !== "string" || !id) {
      return fail("VALIDATION_ERROR", "Escolha o produto de cada componente.", 422, "items");
    }
    if (id === produto.id) {
      return fail("VALIDATION_ERROR", "Um produto não pode ser componente dele mesmo.", 422, "items");
    }
    if (ids.has(id)) {
      return fail("VALIDATION_ERROR", "O mesmo componente aparece mais de uma vez.", 422, "items");
    }
    ids.add(id);
    if (!numero(it.quantity) || arred3(it.quantity) <= 0) {
      return fail("VALIDATION_ERROR", "A quantidade de cada componente deve ser maior que zero.", 422, "items");
    }
  }

  const componentes = await db.emporioProduct.findMany({
    where: { id: { in: [...ids] } },
    include: { product: { select: { name: true } } },
  });
  const porId = new Map(componentes.map((c) => [c.id, c]));
  for (const it of input.items) {
    const c = porId.get(it.component_emporio_product_id);
    if (!c) return NAO_ACHADO("Componente", "items");
    if (c.archived_at) {
      return fail("VALIDATION_ERROR", `O componente "${c.product.name}" está arquivado.`, 422, "items");
    }
    if (c.base_unit === "unidade" && !Number.isInteger(arred3(it.quantity))) {
      return fail(
        "VALIDATION_ERROR",
        `"${c.product.name}" é contado por unidade e só aceita quantidade inteira.`,
        422,
        "items",
      );
    }
  }

  // Ciclo: algum componente leva de volta ao produto, por qualquer caminho (Q77).
  const arestas = await db.compositionItem.findMany({
    select: { component_emporio_product_id: true, composition: { select: { emporio_product_id: true } } },
  });
  const filhos = new Map<string, string[]>();
  for (const a of arestas) {
    const pai = a.composition.emporio_product_id;
    const lista = filhos.get(pai);
    if (lista) lista.push(a.component_emporio_product_id);
    else filhos.set(pai, [a.component_emporio_product_id]);
  }
  const visitados = new Set<string>();
  const pilha = [...ids];
  while (pilha.length > 0) {
    const atual = pilha.pop() as string;
    if (atual === produto.id) {
      return fail(
        "VALIDATION_ERROR",
        "Essa composição daria uma volta: um dos componentes já é feito com este produto.",
        422,
        "items",
      );
    }
    if (visitados.has(atual)) continue;
    visitados.add(atual);
    pilha.push(...(filhos.get(atual) ?? []));
  }

  await db.$transaction(async (tx) => {
    const c = await tx.composition.upsert({
      where: { emporio_product_id: produto.id },
      create: scoped({
        emporio_product_id: produto.id,
        reference_qty: arred3(ref),
        yield_pct: rendimento,
        updated_by_user_id: ator.id,
      }),
      update: { reference_qty: arred3(ref), yield_pct: rendimento, updated_by_user_id: ator.id },
    });
    await tx.compositionItem.deleteMany({ where: { composition_id: c.id } });
    await tx.compositionItem.createMany({
      data: input.items.map((i) =>
        scoped({
          composition_id: c.id,
          component_emporio_product_id: i.component_emporio_product_id,
          quantity: arred3(i.quantity),
        }),
      ),
    });
  });

  const v = await viewDaComposicao(db, produto.id);
  return v ? ok(v) : NAO_ACHADO("Composição");
}

// ---------------------------------------------------------------------------
// Leitura das produções
// ---------------------------------------------------------------------------

export type ProducaoSnapshotItem = {
  component_emporio_product_id: string;
  name: string;
  base_unit: string;
  quantity: number;
  consumed_qty: number;
};

export type ProducaoSnapshot = {
  reference_qty: number;
  yield_pct: number | null;
  items: ProducaoSnapshotItem[];
};

export type ProducaoView = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  emporio_product_id: string;
  product_name: string;
  base_unit: string;
  operation_key: string;
  produced_qty: number;
  unit_cost: number | null;
  estimated: boolean;
  composition_snapshot: ProducaoSnapshot;
  sealed: { presentation_id: string; name: string; packages: number }[];
  status: "ativa" | "cancelada";
  canceled_at: string | null;
  canceled_reason: string | null;
  created_at: string;
};

const INCLUDE_PRODUCAO = {
  establishment: { select: { name: true } },
  emporio_product: { include: { product: { select: { name: true } } } },
  stock_movements: {
    where: { movement_type: "producao_entrada", presentation_id: { not: null } },
    include: { presentation: { select: { name: true, base_qty: true } } },
  },
} as const;

type ProducaoRow = Awaited<ReturnType<typeof buscarProducoes>>[number];

async function buscarProducoes(db: TenantPrismaClient, where: Record<string, unknown>, take?: number) {
  return db.productionEntry.findMany({
    where,
    include: INCLUDE_PRODUCAO,
    orderBy: [{ created_at: "desc" }],
    ...(take ? { take } : {}),
  });
}

function viewDaProducao(p: ProducaoRow): ProducaoView {
  return {
    id: p.id,
    establishment_id: p.establishment_id,
    establishment_name: p.establishment.name,
    emporio_product_id: p.emporio_product_id,
    product_name: p.emporio_product.product.name,
    base_unit: p.emporio_product.base_unit,
    operation_key: p.operation_key,
    produced_qty: decToNum(p.produced_qty) ?? 0,
    unit_cost: decToNum(p.unit_cost),
    estimated: p.estimated,
    composition_snapshot: p.composition_snapshot as unknown as ProducaoSnapshot,
    sealed: p.stock_movements.map((m) => {
      const baseQtd = decToNum(m.presentation?.base_qty) ?? 0;
      return {
        presentation_id: m.presentation_id as string,
        name: m.presentation?.name ?? "",
        packages: baseQtd > 0 ? arred3((decToNum(m.quantity) ?? 0) / baseQtd) : 0,
      };
    }),
    status: p.canceled_at ? "cancelada" : "ativa",
    canceled_at: isoOrNull(p.canceled_at),
    canceled_reason: p.canceled_reason,
    created_at: p.created_at.toISOString(),
  };
}

async function viewPorId(db: TenantPrismaClient, id: string): Promise<ProducaoView | null> {
  const [p] = await buscarProducoes(db, { id });
  return p ? viewDaProducao(p) : null;
}

export async function listarProducoesAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: {
    establishment_id?: string;
    emporio_product_id?: string;
    status?: "ativa" | "cancelada";
    limit?: number;
  } = {},
): Promise<ActionResult<ProducaoView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const where: Record<string, unknown> = {
    ...(opts.establishment_id
      ? { establishment_id: opts.establishment_id }
      : visiveis
        ? { establishment_id: { in: [...visiveis] } }
        : {}),
    ...(opts.emporio_product_id ? { emporio_product_id: opts.emporio_product_id } : {}),
    ...(opts.status === "cancelada"
      ? { canceled_at: { not: null } }
      : opts.status === "ativa"
        ? { canceled_at: null }
        : {}),
  };
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 200;
  return ok((await buscarProducoes(db, where, limite)).map(viewDaProducao));
}

// ---------------------------------------------------------------------------
// Produzir
// ---------------------------------------------------------------------------

export type ProduzirInput = {
  operation_key: string;
  establishment_id: string;
  emporio_product_id: string;
  produced_qty: number;
  sealed?: { presentation_id: string; packages: number }[] | null;
};

export async function produzirAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ProduzirInput,
): Promise<ActionResult<ProducaoView & { replayed: boolean }>> {
  if (!hasMinRole(ator.role, "OPERADOR")) return NEGADO_OPERADOR();

  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  // Q70: repetir a chave devolve a produção gravada, sem escrever nada.
  const visiveis = await lojasDoAtor(db, ator);
  const repetida = await db.productionEntry.findFirst({ where: { operation_key: chave }, select: { id: true } });
  if (repetida) {
    const v = await viewPorId(db, repetida.id);
    if (v && (!visiveis || visiveis.has(v.establishment_id))) return ok({ ...v, replayed: true });
    return NAO_ACHADO("Produção");
  }

  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;

  if (typeof input.emporio_product_id !== "string" || !input.emporio_product_id) {
    return fail("VALIDATION_ERROR", "Escolha o produto.", 422, "emporio_product_id");
  }
  const produto = await db.emporioProduct.findFirst({
    where: { id: input.emporio_product_id },
    include: INCLUDE_PRODUTO,
  });
  if (!produto) return NAO_ACHADO("Produto", "emporio_product_id");
  if (produto.archived_at) {
    return fail("VALIDATION_ERROR", "Esse produto está arquivado.", 422, "emporio_product_id");
  }

  const produzido = numero(input.produced_qty) ? arred3(input.produced_qty) : 0;
  if (!(produzido > 0)) {
    return fail("VALIDATION_ERROR", "A quantidade produzida deve ser maior que zero.", 422, "produced_qty");
  }
  if (produto.base_unit === "unidade" && !Number.isInteger(produzido)) {
    return fail("VALIDATION_ERROR", "Produto vendido por unidade só aceita quantidade inteira.", 422, "produced_qty");
  }

  const comp = await db.composition.findFirst({
    where: { emporio_product_id: produto.id },
    include: { items: { include: { component: { include: { ...INCLUDE_PRODUTO } } } } },
  });
  if (!comp || comp.items.length === 0) {
    return fail(
      "COMPOSITION_REQUIRED",
      "Esse produto não tem composição. Cadastre a composição antes de registrar a produção.",
      422,
      "emporio_product_id",
    );
  }

  // Lacrado: o que entra fechado; o resto é avulso.
  const lacrado = validarSealed(produto, input.sealed, 1);
  if (!lacrado.ok) return lacrado;
  const base_qty = (a: { base_qty: unknown }) => decToNum(a.base_qty) ?? 0;
  const linhasLacradas = lacrado.data.map((l) => ({
    presentation: l.presentation,
    packages: l.packages,
    base: arred3(l.packages * base_qty(l.presentation)),
  }));
  const somaLacrada = arred3(linhasLacradas.reduce((s, l) => s + l.base, 0));
  if (somaLacrada > produzido) {
    return fail(
      "VALIDATION_ERROR",
      `As embalagens lacradas (${descreverQuantidade(somaLacrada, produto.base_unit)}) passam do total produzido (${descreverQuantidade(produzido, produto.base_unit)}).`,
      422,
      "sealed",
    );
  }
  const avulso = arred3(produzido - somaLacrada);

  // Q72: baixa de cada componente.
  const referencia = decToNum(comp.reference_qty) ?? 0;
  const rendimento = decToNum(comp.yield_pct);
  const fatorRendimento = (rendimento ?? 100) / 100;
  const baixas = comp.items.map((i) => {
    const quantity = decToNum(i.quantity) ?? 0;
    return { item: i, quantity, consumo: arred3((quantity * produzido) / referencia / fatorRendimento) };
  });
  for (const b of baixas) {
    const nome = b.item.component.product.name;
    if (b.item.component.archived_at) {
      return fail(
        "VALIDATION_ERROR",
        `O componente "${nome}" está arquivado. Atualize a composição.`,
        422,
        "emporio_product_id",
      );
    }
    if (!(b.consumo > 0)) {
      return fail("VALIDATION_ERROR", `A quantidade produzida é pequena demais para baixar "${nome}".`, 422, "produced_qty");
    }
    if (b.item.component.base_unit === "unidade" && !Number.isInteger(b.consumo)) {
      return fail(
        "VALIDATION_ERROR",
        `Essa produção baixaria ${b.consumo} unidades de "${nome}". Ajuste a quantidade produzida para dar número inteiro.`,
        422,
        "produced_qty",
      );
    }
  }

  const snapshotBase = {
    reference_qty: referencia,
    yield_pct: rendimento,
  };

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const faltas: string[] = [];
      let custoTotal = 0;
      let algumSemCusto = false;
      let estimado = false;
      const consumos: {
        product_id: string;
        estado: "avulso" | null;
        quantity: number;
        unit_cost: number | null;
      }[] = [];

      for (const b of baixas) {
        const comp1 = b.item.component;
        const nome = comp1.product.name;
        const movs = await lerMovimentos(tx, [loja.data.id], [comp1.product_id]);
        const resumo = custoMedio(movs);
        const separa = lacradoEfetivo(comp1);
        const disponivel = separa ? (saldosPorEstado(movs).get("avulso|-") ?? 0) : resumo.saldo;

        if (b.consumo > disponivel && !loja.data.allow_negative_stock) {
          const falta = arred3(b.consumo - disponivel);
          faltas.push(
            separa
              ? `"${nome}": faltam ${descreverQuantidade(falta, comp1.base_unit)} avulsos (há ${descreverQuantidade(disponivel, comp1.base_unit)} avulsos e a produção usa ${descreverQuantidade(b.consumo, comp1.base_unit)}). Conte o estoque ou abra embalagem antes de produzir`
              : `"${nome}": faltam ${descreverQuantidade(falta, comp1.base_unit)} (há ${descreverQuantidade(disponivel, comp1.base_unit)} e a produção usa ${descreverQuantidade(b.consumo, comp1.base_unit)})`,
          );
        }
        const medio = resumo.custo_medio === null ? null : arred4(resumo.custo_medio);
        if (medio === null) algumSemCusto = true;
        if (resumo.estimado) estimado = true;
        custoTotal += b.consumo * (resumo.custo_medio ?? 0);
        consumos.push({
          product_id: comp1.product_id,
          estado: separa ? "avulso" : null,
          quantity: b.consumo,
          unit_cost: medio,
        });
      }
      if (faltas.length > 0) {
        throw new AbortarProducao(
          fail("INSUFFICIENT_STOCK", `Falta estoque para produzir: ${faltas.join("; ")}.`, 409, "components"),
        );
      }

      const algumCusto = consumos.some((c) => c.unit_cost !== null);
      const custoUnitario = algumCusto ? arred4(custoTotal / produzido) : null;
      const marcaEstimado = estimado || algumSemCusto;

      const snapshot = {
        ...snapshotBase,
        items: baixas.map((b) => ({
          component_emporio_product_id: b.item.component_emporio_product_id,
          name: b.item.component.product.name,
          base_unit: b.item.component.base_unit,
          quantity: b.quantity,
          consumed_qty: b.consumo,
        })),
      };

      const entrada = await tx.productionEntry.create({
        data: scoped({
          establishment_id: loja.data.id,
          emporio_product_id: produto.id,
          operation_key: chave,
          produced_qty: produzido,
          composition_snapshot: snapshot as unknown as Prisma.InputJsonValue,
          unit_cost: custoUnitario,
          estimated: marcaEstimado,
          created_by_user_id: ator.id,
        }),
      });

      const agora = new Date();
      for (const c of consumos) {
        await tx.stockMovement.create({
          data: scoped({
            product_id: c.product_id,
            establishment_id: loja.data.id,
            property_id: null,
            movement_type: "producao_consumo" as const,
            quantity: c.quantity,
            occurred_at: agora,
            package_state: c.estado,
            presentation_id: null,
            unit_cost: c.unit_cost,
            production_id: entrada.id,
            recorded_by_user_id: ator.id,
          }),
        });
      }

      const separaProduto = lacradoEfetivo(produto);
      for (const l of linhasLacradas) {
        await tx.stockMovement.create({
          data: scoped({
            product_id: produto.product_id,
            establishment_id: loja.data.id,
            property_id: null,
            movement_type: "producao_entrada" as const,
            quantity: l.base,
            occurred_at: agora,
            package_state: "lacrado" as const,
            presentation_id: l.presentation.id,
            unit_cost: custoUnitario,
            production_id: entrada.id,
            recorded_by_user_id: ator.id,
          }),
        });
      }
      if (avulso > 0) {
        await tx.stockMovement.create({
          data: scoped({
            product_id: produto.product_id,
            establishment_id: loja.data.id,
            property_id: null,
            movement_type: "producao_entrada" as const,
            quantity: avulso,
            occurred_at: agora,
            package_state: separaProduto ? ("avulso" as const) : null,
            presentation_id: null,
            unit_cost: custoUnitario,
            production_id: entrada.id,
            recorded_by_user_id: ator.id,
          }),
        });
      }
      return entrada.id;
    });
    const v = await viewPorId(db, id);
    return v ? ok({ ...v, replayed: false }) : NAO_ACHADO("Produção");
  } catch (err) {
    if (err instanceof AbortarProducao) return err.recusa;
    if (ehErroUnico(err)) {
      // Duas requisições com a mesma chave ao mesmo tempo: a perdedora devolve a gravada.
      const igual = await db.productionEntry.findFirst({ where: { operation_key: chave }, select: { id: true } });
      const v = igual ? await viewPorId(db, igual.id) : null;
      if (v) return ok({ ...v, replayed: true });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cancelar
// ---------------------------------------------------------------------------

export async function cancelarProducaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
): Promise<ActionResult<ProducaoView>> {
  if (!hasMinRole(ator.role, "ADMIN")) return NEGADO_ADMIN();

  const visiveis = await lojasDoAtor(db, ator);
  const prod = await db.productionEntry.findFirst({
    where: { id },
    include: {
      establishment: { select: { allow_negative_stock: true } },
      emporio_product: { select: { product_id: true, base_unit: true } },
    },
  });
  if (!prod || (visiveis && !visiveis.has(prod.establishment_id))) return NAO_ACHADO("Produção");
  if (prod.canceled_at) return fail("ALREADY_CANCELED", "Essa produção já foi cancelada.", 409);
  const motivo = String(input?.reason ?? "").trim();
  if (!motivo) return fail("VALIDATION_ERROR", "Diga o motivo do cancelamento.", 422, "reason");

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const entradas = await tx.stockMovement.findMany({
        where: { production_id: id, movement_type: "producao_entrada", canceled_at: null },
        select: { quantity: true },
      });
      const entrou = arred3(entradas.reduce((s, m) => s + (decToNum(m.quantity) ?? 0), 0));
      const movs = await lerMovimentos(tx, [prod.establishment_id], [prod.emporio_product.product_id]);
      const saldo = custoMedio(movs).saldo;
      if (arred3(saldo - entrou) < 0 && !prod.establishment.allow_negative_stock) {
        throw new AbortarProducao(
          fail(
            "INSUFFICIENT_STOCK",
            `Parte do que foi produzido já saiu: há ${descreverQuantidade(saldo, prod.emporio_product.base_unit)} em estoque e o cancelamento tira ${descreverQuantidade(entrou, prod.emporio_product.base_unit)}.`,
            409,
          ),
        );
      }
      const agora = new Date();
      const r = await tx.productionEntry.updateMany({
        where: { id, canceled_at: null },
        data: { canceled_at: agora, canceled_by_user_id: ator.id, canceled_reason: motivo },
      });
      if (r.count === 0) {
        throw new AbortarProducao(fail("ALREADY_CANCELED", "Essa produção já foi cancelada.", 409));
      }
      await tx.stockMovement.updateMany({
        where: { production_id: id, canceled_at: null },
        data: { canceled_at: agora, canceled_reason: motivo },
      });
    });
  } catch (err) {
    if (err instanceof AbortarProducao) return err.recusa;
    throw err;
  }
  const v = await viewPorId(db, id);
  return v ? ok(v) : NAO_ACHADO("Produção");
}
