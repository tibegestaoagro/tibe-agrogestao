import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { isStockUnit, descreverQuantidade, recusaPorFracao } from "@/lib/stock/units";
import { normalizarTermo } from "@/lib/actions/whatsapp-handlers/shared";
import { createProduct } from "@/lib/actions/products";
import { createProductNegotiation } from "@/lib/actions/product-negotiations";
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

/**
 * O que as actions de escrita devolvem.
 *
 * ⚠️ **É o item INTEIRO, e não uma projeção com quatro campos.** A `m63`,
 * escrita às cegas, mostrou a assimetria: o GET devolvia o recurso completo e
 * o POST devolvia `id`, `description`, `status` e `priority`, obrigando quem
 * consome a buscar de novo para saber a quantidade que acabou de gravar.
 */
type ItemGravado = {
  id: string;
  description: string;
  product_id: string | null;
  quantity: number | null;
  unit: string | null;
  property_id: string | null;
  category_id: string | null;
  purpose: string | null;
  priority: string;
  place: string | null;
  notes: string | null;
  status: string;
  negotiation_id: string | null;
};

/** Um lugar só para montar a resposta, em vez de repetir os treze campos. */
function comoItemGravado(item: {
  id: string;
  description: string;
  product_id: string | null;
  quantity: unknown;
  unit: string | null;
  property_id: string | null;
  category_id: string | null;
  purpose: string | null;
  priority: string;
  place: string | null;
  notes: string | null;
  status: string;
  negotiation_id: string | null;
}): ItemGravado {
  return {
    id: item.id,
    description: item.description,
    product_id: item.product_id,
    quantity: decToNum(item.quantity),
    unit: item.unit,
    property_id: item.property_id,
    category_id: item.category_id,
    purpose: item.purpose,
    priority: item.priority,
    place: item.place,
    notes: item.notes,
    status: item.status,
    negotiation_id: item.negotiation_id,
  };
}

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
 *
 * ⚠️ **O `includes` nos dois sentidos é largo de propósito.** "Sal mineral"
 * casa com "Sal mineral do alerta", e é isso que se quer: o produtor escreveu
 * a mesma coisa de dois jeitos. O preço é algum falso parecido, e ele é barato
 * porque isto AVISA, não recusa: quem quiser mesmo duas linhas responde que
 * sim. Estreitar para igualdade exata deixaria passar justamente o caso comum.
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

  return ok(comoItemGravado(criado));
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

  return ok(comoItemGravado(atualizado));
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

  return ok(comoItemGravado(atualizado));
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

  return ok(comoItemGravado(novo));
}

/**
 * §11 opção 2 e §12: o item vira COMPRA.
 *
 * ⚠️ **Este é o único ponto do módulo que mexe em dinheiro e estoque**, e ele
 * não faz isso sozinho: delega inteiro para Negociações, a mesma porta que o
 * painel e o WhatsApp já usam (decisão 12). Um caminho próprio aqui criaria
 * uma segunda forma de criar despesa e movimentar estoque, que é como nasce o
 * lançamento duplicado.
 *
 * **O que já se sabe não se pergunta de novo** (§12): produto, quantidade,
 * unidade e fazenda saem do item; falta o valor, e a forma de pagamento.
 *
 * ⚠️ **Item sem produto não vira compra sozinho.** A negociação exige um
 * `Product`, porque é ele que tem saldo, unidade e catálogo. "Comprar arame"
 * é uma anotação legítima (§5) e vira compra assim que o produtor disser QUAL
 * produto é: escolhendo um existente, ou criando na hora com `novo_produto`.
 * Isto não é burocracia, é a fronteira entre a folha de papel e o estoque.
 */
export async function registrarCompraDoItemAction(
  db: TenantPrismaClient,
  itemId: string,
  input: {
    amount: number;
    product_id?: string | null;
    novo_produto?: { name?: string | null; unit: string; category_id: string } | null;
    quantity?: number | null;
    property_id?: string | null;
    contact_id?: string | null;
    contact_name?: string | null;
    occurred_at?: Date | null;
    pago?: boolean;
    due_date?: Date | null;
    notes?: string | null;
    recorded_by_user_id?: string | null;
  },
): Promise<ActionResult<{ item_id: string; negotiation_id: string; product_id: string }>> {
  const item = await db.shoppingItem.findFirst({ where: { id: itemId } });
  if (!item) return fail("NOT_FOUND", "Item não encontrado", 404);
  if (item.status !== "pendente") {
    return fail("ITEM_JA_RESOLVIDO", "Este item já saiu da lista", 422);
  }

  if (!(input.amount > 0)) {
    return fail("VALIDATION_ERROR", "Informe quanto você pagou", 422, "amount");
  }

  const property_id = input.property_id ?? item.property_id;
  if (!property_id) {
    return fail("FAZENDA_NECESSARIA", "Diga para qual fazenda foi a compra", 422, "property_id");
  }

  const quantidade = input.quantity ?? decToNum(item.quantity);
  if (quantidade == null || !(quantidade > 0)) {
    return fail("QUANTIDADE_NECESSARIA", "Quanto você comprou?", 422, "quantity");
  }

  let product_id = input.product_id ?? item.product_id;
  if (!product_id) {
    if (!input.novo_produto) {
      return fail(
        "PRODUTO_NECESSARIO",
        `Para registrar a compra eu preciso saber qual produto é "${item.description}". Escolha um do seu estoque ou cadastre este.`,
        422,
        "product_id",
      );
    }
    const criado = await createProduct(db, {
      name: limpar(input.novo_produto.name) ?? item.description,
      unit: input.novo_produto.unit,
      category_id: input.novo_produto.category_id,
    });
    if (!criado.ok) return fail(criado.code, criado.message, criado.status, criado.field);
    product_id = criado.data.id;
  }

  const negociacao = await createProductNegotiation(
    db,
    {
      type: "compra_produto",
      property_id,
      itens: [{ product_id, quantity: quantidade }],
      amount: input.amount,
      contact_id: input.contact_id ?? null,
      contact_name: input.contact_name ?? null,
      occurred_at: input.occurred_at ?? null,
      pago: input.pago,
      due_date: input.due_date ?? null,
      notes: input.notes ?? null,
      recorded_by_user_id: input.recorded_by_user_id ?? null,
    },
    {
      // Dentro da MESMA transação: ou a compra entra e o item sai da lista, ou
      // nenhum dos dois. Concluir depois deixaria a janela em que o produtor vê
      // na lista algo que ele já comprou.
      aposCriar: async (tx, negotiationId) => {
        await tx.shoppingItem.update({
          where: { id: itemId },
          data: {
            status: "comprado",
            resolved_at: new Date(),
            negotiation_id: negotiationId,
            product_id,
            quantity: quantidade,
            property_id,
          },
        });
      },
    },
  );
  if (!negociacao.ok) {
    return fail(negociacao.code, negociacao.message, negociacao.status, negociacao.field);
  }

  return ok({ item_id: itemId, negotiation_id: negociacao.data.id, product_id });
}

/**
 * §13: o alerta de estoque baixo vira item da lista.
 *
 * O alerta `low_stock` já sabe qual produto acabou, e o `related_id` dele é
 * `<product_id>:<semana ISO>`. Daqui sai tudo o que o item precisa: o produto,
 * a unidade e a categoria vêm do próprio cadastro.
 *
 * ⚠️ **Nunca adiciona sozinho** (§13, explícito: "o sistema não deverá
 * adicionar automaticamente sem confirmação"). Esta função só roda quando o
 * produtor clica, e é por isso que ela não vive dentro da geração de alertas.
 *
 * ⚠️ **O alerta compara o TOTAL do tenant, não o saldo por fazenda** (decisão
 * 27 do grill). Um produto zerado na Fazenda A com 50 sacas na B não avisa, e
 * o item que nasce daqui também não escolhe fazenda: quem souber para onde vai
 * preenche depois.
 *
 * Dispensa o alerta junto, porque a decisão foi tomada. Se o saldo continuar
 * baixo, o cron avisa de novo na semana seguinte: a chave de deduplicação
 * inclui a semana.
 */
export async function adicionarItemDoAlertaAction(
  db: TenantPrismaClient,
  alertId: string,
  opts?: { created_by_user_id?: string | null; permitirDuplicata?: boolean },
): Promise<ActionResult<ItemGravado>> {
  const alerta = await db.alert.findFirst({ where: { id: alertId } });
  if (!alerta) return fail("NOT_FOUND", "Alerta não encontrado", 404);
  if (alerta.alert_type !== "low_stock") {
    return fail("ALERTA_SEM_PRODUTO", "Este alerta não é de estoque baixo", 422);
  }

  const productId = (alerta.related_id ?? "").split(":")[0];
  const produto = productId
    ? await db.product.findFirst({
        where: { id: productId, archived_at: null },
        select: { id: true, name: true, unit: true, category_id: true },
      })
    : null;
  if (!produto) {
    return fail("NOT_FOUND", "O produto deste alerta não existe mais", 404, "product_id");
  }

  const criado = await criarItemAction(
    db,
    {
      description: produto.name,
      product_id: produto.id,
      /*
       * ⚠️ **Só passa a unidade quando ela está no vocabulário.** Achado na
       * validação ao vivo de 11/09: um produto gravado com "kg" em vez de
       * "quilograma" (script antigo, e nada impede um cadastro herdado assim)
       * fazia o botão do alerta recusar com "Unidade desconhecida", e o
       * produtor clicava sem nada acontecer. A unidade veio do CADASTRO, não
       * do produtor: recusar o item por causa dela é punir quem não digitou
       * nada. Sem unidade, o item nasce igual e funciona.
       */
      unit: isStockUnit(produto.unit) ? produto.unit : null,
      category_id: produto.category_id,
    },
    opts,
  );
  if (!criado.ok) return criado;

  await db.alert.update({ where: { id: alertId }, data: { status: "dismissed" } });
  return criado;
}
