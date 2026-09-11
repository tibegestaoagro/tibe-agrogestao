import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { isStockUnit, descreverQuantidade, recusaPorFracao } from "@/lib/stock/units";
import { normalizarTermo } from "@/lib/actions/whatsapp-handlers/shared";
import type { ShoppingItemStatus, ShoppingPriority, ShoppingPurpose } from "@/generated/prisma/enums";

/**
 * Minha Lista de Compra (Módulo 36).
 *
 * ⚠️ **Nada aqui toca estoque ou financeiro**, e isso é o módulo inteiro
 * (§19.1 e §19.2). Anotar "preciso comprar sal" é uma necessidade escrita no
 * papel, não uma compra: não aumenta saldo, não cria despesa, não cria conta a
 * pagar. O dinheiro só entra quando o produtor confirma que comprou, e aí quem
 * registra é Negociações, pela mesma porta de sempre (§12).
 *
 * Se alguma função deste arquivo passar a importar `createLinkedEntry` ou
 * `recordStockMovement`, o desenho saiu do trilho.
 *
 * **Não existe entidade "lista"**: "a lista" é a consulta dos pendentes.
 */

export type ItemInput = {
  description: string;
  product_id?: string | null;
  quantity?: number | null;
  unit?: string | null;
  property_id?: string | null;
  category_id?: string | null;
  purpose?: ShoppingPurpose | null;
  priority?: ShoppingPriority | null;
  place?: string | null;
  notes?: string | null;
};

type ItemGravado = {
  id: string;
  description: string;
  status: string;
  priority: string;
};

function limpar(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Confere produto, fazenda e categoria antes de gravar.
 *
 * Os três são opcionais, mas quando vêm precisam existir NESTE tenant: o
 * client é escopado, então um id de outro tenant simplesmente não é
 * encontrado, e a recusa é a mesma de um id inventado.
 */
async function conferirVinculos(
  db: TenantPrismaClient,
  input: Pick<ItemInput, "product_id" | "property_id" | "category_id">,
): Promise<{ code: string; message: string; field: string } | null> {
  if (input.product_id) {
    const produto = await db.product.findFirst({
      where: { id: input.product_id, archived_at: null },
      select: { id: true },
    });
    if (!produto) {
      return { code: "NOT_FOUND", message: "Produto não encontrado", field: "product_id" };
    }
  }
  if (input.property_id) {
    const fazenda = await db.property.findFirst({
      where: { id: input.property_id, archived_at: null },
      select: { id: true },
    });
    if (!fazenda) {
      return { code: "NOT_FOUND", message: "Fazenda não encontrada", field: "property_id" };
    }
  }
  if (input.category_id) {
    const categoria = await db.productCategory.findFirst({
      where: { id: input.category_id, archived_at: null },
      select: { id: true },
    });
    if (!categoria) {
      return { code: "NOT_FOUND", message: "Categoria não encontrada", field: "category_id" };
    }
  }
  return null;
}

/** A quantidade e a unidade, quando vierem, precisam fazer sentido juntas. */
function conferirQuantidade(
  input: Pick<ItemInput, "quantity" | "unit" | "description">,
): { code: string; message: string; field: string } | null {
  if (input.unit && !isStockUnit(input.unit)) {
    return { code: "UNIDADE_INVALIDA", message: "Unidade desconhecida", field: "unit" };
  }
  if (input.quantity == null) return null;
  if (!(input.quantity > 0)) {
    return {
      code: "VALIDATION_ERROR",
      message: "A quantidade precisa ser maior que zero",
      field: "quantity",
    };
  }
  // "2,5 frascos de vermífugo" na lista de compra é o mesmo erro que no
  // estoque, e a frase já existe pronta lá.
  if (input.unit) {
    const recusa = recusaPorFracao(input.description.trim(), input.quantity, input.unit);
    if (recusa) return { code: "QUANTIDADE_FRACIONADA", message: recusa, field: "quantity" };
  }
  return null;
}

/**
 * Os pendentes parecidos com o que está sendo anotado (§19.7).
 *
 * Casa por produto quando os dois têm produto, e por descrição normalizada
 * quando não têm. A comparação é sem acento e sem caixa, porque o produtor
 * dita "sal" hoje e "Sal" amanhã.
 */
export async function pendentesParecidos(
  db: TenantPrismaClient,
  input: Pick<ItemInput, "description" | "product_id">,
) {
  const pendentes = await db.shoppingItem.findMany({
    where: { status: "pendente" },
    select: {
      id: true,
      description: true,
      product_id: true,
      quantity: true,
      unit: true,
    },
  });
  const alvo = normalizarTermo(input.description);
  return pendentes.filter((p) => {
    if (input.product_id && p.product_id) return p.product_id === input.product_id;
    const dele = normalizarTermo(p.description);
    return dele === alvo || dele.includes(alvo) || alvo.includes(dele);
  });
}

/** "10 sacas de sal mineral", ou só "arame" quando não há quantidade. */
function descrever(item: { description: string; quantity: unknown; unit: string | null }): string {
  const quantidade = decToNum(item.quantity);
  if (quantidade == null || !item.unit) return item.description;
  return `${descreverQuantidade(quantidade, item.unit)} de ${item.description}`;
}

/**
 * Anota um item (§4).
 *
 * ⚠️ **A duplicata AVISA, nunca recusa de verdade** (§19.7). Comprar sal duas
 * vezes na mesma semana é normal, e o documento pede "deseja adicionar mais?",
 * não "já existe". Quem já respondeu que sim repete a chamada com
 * `permitirDuplicata`.
 */
export async function criarItemAction(
  db: TenantPrismaClient,
  input: ItemInput,
  opts?: { created_by_user_id?: string | null; permitirDuplicata?: boolean },
): Promise<ActionResult<ItemGravado>> {
  const description = limpar(input.description);
  if (!description) {
    return fail("VALIDATION_ERROR", "Diga o que precisa comprar", 422, "description");
  }

  const quantidadeRuim = conferirQuantidade({ ...input, description });
  if (quantidadeRuim) {
    return fail(quantidadeRuim.code, quantidadeRuim.message, 422, quantidadeRuim.field);
  }

  const vinculoRuim = await conferirVinculos(db, input);
  if (vinculoRuim) {
    return fail(vinculoRuim.code, vinculoRuim.message, 404, vinculoRuim.field);
  }

  if (!opts?.permitirDuplicata) {
    const parecidos = await pendentesParecidos(db, { description, product_id: input.product_id });
    if (parecidos.length > 0) {
      const lista = parecidos.map(descrever).join(", ");
      return fail(
        "ITEM_JA_NA_LISTA",
        `Você já tem ${lista} na sua lista. Quer adicionar mais assim mesmo?`,
        409,
        "description",
      );
    }
  }

  const criado = await db.shoppingItem.create({
    data: scoped({
      description,
      product_id: input.product_id ?? null,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      property_id: input.property_id ?? null,
      category_id: input.category_id ?? null,
      purpose: input.purpose ?? null,
      priority: input.priority ?? "normal",
      place: limpar(input.place),
      notes: limpar(input.notes),
      created_by_user_id: opts?.created_by_user_id ?? null,
    }),
  });

  return ok({
    id: criado.id,
    description: criado.description,
    status: criado.status,
    priority: criado.priority,
  });
}

/**
 * A lista (§10, §20).
 *
 * Pendentes por padrão, urgentes primeiro, e dentro de cada grupo o mais
 * antigo em cima: o que está esperando há mais tempo é o que costuma ser
 * esquecido.
 */
export async function listarItensAction(
  db: TenantPrismaClient,
  opts?: {
    status?: ShoppingItemStatus;
    property_id?: string;
    priority?: ShoppingPriority;
    place?: string;
    purpose?: ShoppingPurpose;
  },
) {
  return db.shoppingItem.findMany({
    where: {
      status: opts?.status ?? "pendente",
      ...(opts?.property_id ? { property_id: opts.property_id } : {}),
      ...(opts?.priority ? { priority: opts.priority } : {}),
      ...(opts?.place ? { place: opts.place } : {}),
      ...(opts?.purpose ? { purpose: opts.purpose } : {}),
    },
    include: {
      product: { select: { name: true, unit: true } },
      property: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ priority: "desc" }, { created_at: "asc" }],
  });
}

/**
 * Edita um item (§5: "a quantidade poderá ser informada posteriormente").
 *
 * Só item PENDENTE é editável. Um item já comprado virou histórico, e mexer
 * nele reescreveria o passado sem que nada na tela avisasse.
 */
export async function atualizarItemAction(
  db: TenantPrismaClient,
  id: string,
  input: Partial<ItemInput>,
): Promise<ActionResult<ItemGravado>> {
  const item = await db.shoppingItem.findFirst({ where: { id } });
  if (!item) return fail("NOT_FOUND", "Item não encontrado", 404);
  if (item.status !== "pendente") {
    return fail("NOT_EDITABLE", "Este item já saiu da lista e não pode ser alterado", 422);
  }

  const description =
    input.description === undefined ? item.description : limpar(input.description);
  if (!description) {
    return fail("VALIDATION_ERROR", "Diga o que precisa comprar", 422, "description");
  }

  const quantidade = input.quantity === undefined ? decToNum(item.quantity) : input.quantity;
  const unidade = input.unit === undefined ? item.unit : input.unit;
  const quantidadeRuim = conferirQuantidade({ description, quantity: quantidade, unit: unidade });
  if (quantidadeRuim) {
    return fail(quantidadeRuim.code, quantidadeRuim.message, 422, quantidadeRuim.field);
  }

  const vinculoRuim = await conferirVinculos(db, {
    product_id: input.product_id ?? undefined,
    property_id: input.property_id ?? undefined,
    category_id: input.category_id ?? undefined,
  });
  if (vinculoRuim) {
    return fail(vinculoRuim.code, vinculoRuim.message, 404, vinculoRuim.field);
  }

  const atualizado = await db.shoppingItem.update({
    where: { id },
    data: {
      description,
      ...(input.product_id !== undefined ? { product_id: input.product_id } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.property_id !== undefined ? { property_id: input.property_id } : {}),
      ...(input.category_id !== undefined ? { category_id: input.category_id } : {}),
      ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      ...(input.priority !== undefined && input.priority !== null
        ? { priority: input.priority }
        : {}),
      ...(input.place !== undefined ? { place: limpar(input.place) } : {}),
      ...(input.notes !== undefined ? { notes: limpar(input.notes) } : {}),
    },
  });

  return ok({
    id: atualizado.id,
    description: atualizado.description,
    status: atualizado.status,
    priority: atualizado.priority,
  });
}

/**
 * Tira o item da lista, num dos dois sentidos do §11 e do §18.
 *
 * `comprado` é a opção 1 do §11, "apenas concluir": o produtor comprou e não
 * quer registrar a operação. **Não gera nada** (§19.1, §19.2). Quem quiser a
 * opção 2 passa pelo caminho do §12, que é outra função.
 *
 * `removido` é a desistência. Nenhum dos dois APAGA (§19.6): o item sai dos
 * pendentes e vira histórico.
 */
async function sairDaLista(
  db: TenantPrismaClient,
  id: string,
  status: "comprado" | "removido",
): Promise<ActionResult<ItemGravado>> {
  const item = await db.shoppingItem.findFirst({ where: { id } });
  if (!item) return fail("NOT_FOUND", "Item não encontrado", 404);
  if (item.status !== "pendente") {
    return fail("ITEM_JA_RESOLVIDO", "Este item já saiu da lista", 422);
  }

  const atualizado = await db.shoppingItem.update({
    where: { id },
    data: { status, resolved_at: new Date() },
  });

  return ok({
    id: atualizado.id,
    description: atualizado.description,
    status: atualizado.status,
    priority: atualizado.priority,
  });
}

export const concluirItemAction = (db: TenantPrismaClient, id: string) =>
  sairDaLista(db, id, "comprado");

export const removerItemAction = (db: TenantPrismaClient, id: string) =>
  sairDaLista(db, id, "removido");

/**
 * §14: "Adicionar novamente 10 sacas de sal mineral à lista?".
 *
 * Cria um item NOVO com os mesmos dados, e não mexe no antigo: o histórico do
 * §18 continua contando quantas vezes aquilo foi comprado. Repetir um item
 * ainda pendente não faz sentido, e é o caso que a duplicata do §19.7 já
 * cobre.
 */
export async function repetirItemAction(
  db: TenantPrismaClient,
  id: string,
  opts?: { created_by_user_id?: string | null },
): Promise<ActionResult<ItemGravado>> {
  const item = await db.shoppingItem.findFirst({ where: { id } });
  if (!item) return fail("NOT_FOUND", "Item não encontrado", 404);
  if (item.status === "pendente") {
    return fail("ITEM_AINDA_PENDENTE", "Este item ainda está na sua lista", 422);
  }

  const novo = await db.shoppingItem.create({
    data: scoped({
      description: item.description,
      product_id: item.product_id,
      quantity: item.quantity,
      unit: item.unit,
      property_id: item.property_id,
      category_id: item.category_id,
      purpose: item.purpose,
      priority: item.priority,
      place: item.place,
      notes: item.notes,
      created_by_user_id: opts?.created_by_user_id ?? null,
    }),
  });

  return ok({
    id: novo.id,
    description: novo.description,
    status: novo.status,
    priority: novo.priority,
  });
}
