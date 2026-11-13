import type { Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { delegates } from "@/lib/prisma-delegates";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir, recusarCaixa } from "@/lib/emporio/papel";
import { diferencas, registrarNoHistorico } from "@/lib/emporio/historico";
import { descreverQuantidade, findUnit } from "@/lib/stock/units";
import { custoMedio, deltaDaLoja, type MovimentoDeCusto, type OrigemCustoSugerido } from "@/lib/emporio/custo-medio";
import { camposDeCusto } from "@/lib/emporio/custos-da-loja";
import {
  INCLUDE_PRODUTO,
  lacradoEfetivo,
  lojasDoAtor,
  lojasDeEstoque,
  type Ator,
  type ProdutoRow,
} from "@/lib/actions/emporio-catalogo";

/**
 * Meu Empório, F2a: estoque das lojas (Módulo 39, Q60 a Q71).
 *
 * **O SALDO NUNCA É GRAVADO** (invariante 2). Cada função daqui lê as
 * movimentações não canceladas da loja e soma. Gravam-se movimentações, e o
 * `unit_cost` de cada uma como registro do momento (§23.4).
 *
 * Convenção de sinal, a mesma do estoque da fazenda: `quantity` é SEMPRE
 * positiva e na unidade-base. Implantação e compra somam, perda subtrai, e o
 * ajuste (contagem) é a diferença entre `corrected_balance` e
 * `previous_balance`, saldos do MESMO estado (lacrado de uma apresentação, ou
 * avulso). Toda movimentação daqui leva `establishment_id` e `property_id`
 * nulo (há um CHECK de exatamente um dos dois).
 *
 * A validação é em TypeScript puro, de propósito: o agente do WhatsApp chama
 * estas mesmas funções sem passar pelo Zod da rota.
 */

type Tx = Prisma.TransactionClient;
type EstadoEmbalagem = "lacrado" | "avulso";

export const MOTIVOS_DE_PERDA = ["vencido", "avaria", "furto", "consumo_proprio", "outro"] as const;
type MotivoDePerda = (typeof MOTIVOS_DE_PERDA)[number];

function ehMotivo(v: unknown): v is MotivoDePerda {
  return typeof v === "string" && (MOTIVOS_DE_PERDA as readonly string[]).includes(v);
}

const NAO_ACHADO = (o: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404);

const arred3 = (n: number) => Math.round(n * 1000) / 1000;
const arred4 = (n: number) => Math.round(n * 10000) / 10000;

function numero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------

export type SealedLine = {
  /** Q323: uma linha por TAMANHO. A apresentação fechada ativa mais antiga do tamanho. */
  presentation_id: string;
  /** Os nomes das ativas do tamanho, juntos com " / " (ordem de criação). */
  name: string;
  /** Todas as apresentações fechadas ativas do tamanho. */
  presentation_ids: string[];
  /** Embalagens fechadas (saldo na unidade-base dividido pelo tamanho). */
  packages: number;
  /** O mesmo saldo, na unidade-base. */
  base_qty: number;
};

export type StockLine = {
  establishment_id: string;
  establishment_name: string;
  emporio_product_id: string;
  product_name: string;
  base_unit: string;
  total_qty: number;
  /** O mesmo valor de `total_qty`: o saldo atual na loja. */
  stock_balance: number;
  loose_qty: number;
  sealed: SealedLine[];
  average_cost: number | null;
  /** O custo único do produto nesta loja, e de onde veio (Q297, Q299). */
  suggested_cost: number | null;
  suggested_cost_source: OrigemCustoSugerido | null;
  estimated: boolean;
  min_qty: number | null;
  max_qty: number | null;
  needs_restock: boolean;
  suggested_qty: number | null;
};

export type ConsolidatedLine = {
  emporio_product_id: string;
  product_name: string;
  base_unit: string;
  total_qty: number;
  loose_qty: number;
  sealed: SealedLine[];
  /** Média dos custos médios das lojas, ponderada pelo saldo de cada uma. */
  average_cost: number | null;
  estimated: boolean;
};

export type ProductStockView = {
  emporio_product_id: string;
  product_name: string;
  base_unit: string;
  stores: StockLine[];
  consolidated: ConsolidatedLine;
};

export type ShoppingItemView = {
  id: string;
  description: string;
  product_id: string | null;
  establishment_id: string | null;
  quantity: number | null;
  unit: string | null;
  status: string;
};

// ---------------------------------------------------------------------------
// Leitura: o saldo é a soma
// ---------------------------------------------------------------------------

type Loja = { id: string; name: string; allow_negative_stock: boolean; archived_at: Date | null };

type MovimentoLido = MovimentoDeCusto & {
  product_id: string;
  establishment_id: string | null;
  package_state: EstadoEmbalagem | null;
  presentation_id: string | null;
};

export async function lerMovimentos(c: Tx, lojaIds: string[], productIds: string[]): Promise<MovimentoLido[]> {
  if (lojaIds.length === 0 || productIds.length === 0) return [];
  const linhas = await c.stockMovement.findMany({
    where: {
      canceled_at: null,
      establishment_id: { in: lojaIds },
      product_id: { in: productIds },
    },
    select: {
      product_id: true,
      establishment_id: true,
      movement_type: true,
      quantity: true,
      previous_balance: true,
      corrected_balance: true,
      unit_cost: true,
      occurred_at: true,
      created_at: true,
      package_state: true,
      presentation_id: true,
    },
  });
  return linhas.map((l) => ({
    product_id: l.product_id,
    establishment_id: l.establishment_id,
    movement_type: l.movement_type,
    quantity: decToNum(l.quantity) ?? 0,
    previous_balance: decToNum(l.previous_balance),
    corrected_balance: decToNum(l.corrected_balance),
    unit_cost: decToNum(l.unit_cost),
    occurred_at: l.occurred_at,
    created_at: l.created_at,
    package_state: l.package_state,
    presentation_id: l.presentation_id,
  }));
}

type ApresentacaoRow = ProdutoRow["presentations"][number] & { created_at?: Date };

/**
 * Q323: embalagens fechadas do mesmo produto com o mesmo `base_qty` são a mesma
 * embalagem física. O saldo fechado é por TAMANHO: os movimentos seguem gravados
 * com o `presentation_id` que vieram, e é a leitura que soma por tamanho.
 * Mapa `presentation_id -> base_qty` do produto, com as arquivadas (movimento
 * antigo pode apontar para elas).
 */
export type TamanhosDoProduto = Map<string, number>;

export function tamanhosDe(p: Pick<ProdutoRow, "presentations">): TamanhosDoProduto {
  const mapa: TamanhosDoProduto = new Map();
  for (const ap of p.presentations) {
    const base = arred3(decToNum(ap.base_qty) ?? 0);
    if (ap.is_sealed_package && base > 0) mapa.set(ap.id, base);
  }
  return mapa;
}

const chaveDoTamanho = (base: number) => `lacrado|${arred3(base).toFixed(3)}`;

/**
 * Saldo por estado: chave `lacrado|<tamanho com 3 casas>` (Q323) ou `avulso|-`
 * (avulso e produto sem separação). Movimento cuja apresentação não é fechada
 * (desmarcada depois, ou de outro produto) cai em `lacrado|?<id>`, para o saldo
 * não sumir; `montarLinhas` mostra essa linha com o nome e as embalagens da
 * apresentação, quando ela é do produto.
 */
export function saldosPorEstado(movs: MovimentoLido[], tamanhos: TamanhosDoProduto): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const m of movs) {
    const chave = chaveDoEstado(m.presentation_id, tamanhos);
    mapa.set(chave, (mapa.get(chave) ?? 0) + deltaDaLoja(m));
  }
  for (const [k, v] of mapa) mapa.set(k, arred3(v));
  return mapa;
}

/** A apresentação só existe no lacrado (Q65), então ela basta para dizer o estado; o tamanho dela diz a chave (Q323). */
export function chaveDoEstado(presentationId: string | null, tamanhos: TamanhosDoProduto): string {
  if (!presentationId) return "avulso|-";
  const base = tamanhos.get(presentationId);
  return base === undefined ? `lacrado|?${presentationId}` : chaveDoTamanho(base);
}

export type TamanhoFechado = {
  base: number;
  chave: string;
  /** A apresentação fechada ATIVA mais antiga do tamanho (ou a arquivada mais antiga, se só houver arquivadas). */
  apresentacao: ApresentacaoRow;
  /** Todas as ativas do tamanho, da mais antiga para a mais nova. */
  ativas: ApresentacaoRow[];
};

/** Os tamanhos de embalagem fechada do produto, do menor para o maior (Q323). */
export function tamanhosFechados(p: Pick<ProdutoRow, "presentations">): TamanhoFechado[] {
  const porTamanho = new Map<number, ApresentacaoRow[]>();
  for (const ap of p.presentations as ApresentacaoRow[]) {
    const base = arred3(decToNum(ap.base_qty) ?? 0);
    if (!ap.is_sealed_package || base <= 0) continue;
    const lista = porTamanho.get(base);
    if (lista) lista.push(ap);
    else porTamanho.set(base, [ap]);
  }
  const maisAntiga = (a: ApresentacaoRow, b: ApresentacaoRow) =>
    (a.created_at?.getTime() ?? 0) - (b.created_at?.getTime() ?? 0);
  return [...porTamanho.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([base, lista]) => {
      const ordenadas = [...lista].sort(maisAntiga);
      const ativas = ordenadas.filter((x) => !x.archived_at);
      return { base, chave: chaveDoTamanho(base), apresentacao: ativas[0] ?? ordenadas[0], ativas };
    });
}

/**
 * Monta as linhas de saldo de cada loja para os produtos pedidos (todos, se não
 * houver filtro). Produto arquivado só aparece com saldo diferente de zero, ou
 * quando foi pedido pelo id.
 */
async function montarLinhas(
  c: Tx,
  lojas: Loja[],
  opts: { emporio_product_id?: string } = {},
): Promise<StockLine[]> {
  const produtos: ProdutoRow[] = await c.emporioProduct.findMany({
    where: opts.emporio_product_id ? { id: opts.emporio_product_id } : {},
    include: INCLUDE_PRODUTO,
  });
  if (produtos.length === 0 || lojas.length === 0) return [];

  const lojaIds = lojas.map((l) => l.id);
  const epIds = produtos.map((p) => p.id);
  const movs = await lerMovimentos(c, lojaIds, produtos.map((p) => p.product_id));
  const limites = await c.stockLimit.findMany({
    where: { establishment_id: { in: lojaIds }, emporio_product_id: { in: epIds } },
  });
  const itensPendentes = await c.emporioPurchaseItem.findMany({
    where: {
      emporio_product_id: { in: epIds },
      purchase: { received_at: null, canceled_at: null, establishment_id: { in: lojaIds } },
    },
    select: { emporio_product_id: true, base_quantity: true, purchase: { select: { establishment_id: true } } },
  });

  // F2b, regra 5 da seção 5: o que está em trânsito para a loja também conta como a caminho.
  const itensEmTransito = await c.stockTransferItem.findMany({
    where: {
      emporio_product_id: { in: epIds },
      transfer: { status: { in: ["em_transito", "aguardando_gestor"] }, destination_establishment_id: { in: lojaIds } },
    },
    select: {
      emporio_product_id: true,
      sent_qty: true,
      received_qty: true,
      transfer: { select: { destination_establishment_id: true } },
    },
  });

  const limitePorPar = new Map(limites.map((l) => [`${l.establishment_id}|${l.emporio_product_id}`, l]));
  const pendentePorPar = new Map<string, number>();
  for (const it of itensPendentes) {
    const k = `${it.purchase.establishment_id}|${it.emporio_product_id}`;
    pendentePorPar.set(k, (pendentePorPar.get(k) ?? 0) + (decToNum(it.base_quantity) ?? 0));
  }
  for (const it of itensEmTransito) {
    const k = `${it.transfer.destination_establishment_id}|${it.emporio_product_id}`;
    pendentePorPar.set(k, (pendentePorPar.get(k) ?? 0) + (decToNum(it.received_qty ?? it.sent_qty) ?? 0));
  }
  const movsPorPar = new Map<string, MovimentoLido[]>();
  const epPorProductId = new Map(produtos.map((p) => [p.product_id, p]));
  for (const m of movs) {
    const p = epPorProductId.get(m.product_id);
    if (!p || !m.establishment_id) continue;
    const k = `${m.establishment_id}|${p.id}`;
    const lista = movsPorPar.get(k);
    if (lista) lista.push(m);
    else movsPorPar.set(k, [m]);
  }

  const linhas: StockLine[] = [];
  for (const loja of lojas) {
    for (const p of produtos) {
      const k = `${loja.id}|${p.id}`;
      const dosMovs = movsPorPar.get(k) ?? [];
      const custo = custoMedio(dosMovs);
      if (p.archived_at && custo.saldo === 0 && !opts.emporio_product_id) continue;

      const porEstado = saldosPorEstado(dosMovs, tamanhosDe(p));
      const tamanhos = new Map(tamanhosFechados(p).map((t) => [t.chave, t]));
      let solto = 0;
      const lacrado: SealedLine[] = [];
      for (const [chave, base] of porEstado) {
        const [estado, resto] = chave.split("|");
        if (estado === "avulso") {
          solto += base;
          continue;
        }
        const t = tamanhos.get(chave);
        if (!t) {
          // Movimento de lacrado de uma apresentação que deixou de ser fechada (ou que não é do produto):
          // mantém o saldo visível. Quando a apresentação é do produto, a linha leva o nome e as
          // embalagens dela; `presentation_ids` fica vazio, então não aceita entrada nova.
          const orfaId = resto.slice(1);
          const orfa = p.presentations.find((x) => x.id === orfaId);
          const tamanhoOrfa = orfa ? (decToNum(orfa.base_qty) ?? 0) : 0;
          lacrado.push({
            presentation_id: orfaId,
            name: orfa?.name ?? "",
            presentation_ids: [],
            packages: tamanhoOrfa > 0 ? arred3(base / tamanhoOrfa) : 0,
            base_qty: base,
          });
          continue;
        }
        lacrado.push({
          presentation_id: t.apresentacao.id,
          name: (t.ativas.length > 0 ? t.ativas : [t.apresentacao]).map((x) => x.name).join(" / "),
          presentation_ids: t.ativas.map((x) => x.id),
          packages: arred3(base / t.base),
          base_qty: base,
        });
      }
      lacrado.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

      const limite = limitePorPar.get(k);
      const min = decToNum(limite?.min_qty);
      const max = decToNum(limite?.max_qty);
      const pendente = pendentePorPar.get(k) ?? 0;
      // Q297: com saldo zero ou negativo o médio sai nulo, e o custo do produto passa a ser a última compra.
      const novos = camposDeCusto(custo, decToNum(p.reference_cost));
      linhas.push({
        stock_balance: custo.saldo,
        suggested_cost: novos.suggested_cost,
        suggested_cost_source: novos.suggested_cost_source,
        establishment_id: loja.id,
        establishment_name: loja.name,
        emporio_product_id: p.id,
        product_name: p.product.name,
        base_unit: p.base_unit,
        total_qty: custo.saldo,
        loose_qty: arred3(solto),
        sealed: lacrado,
        average_cost: custo.saldo > 0 && custo.custo_medio !== null ? arred4(custo.custo_medio) : null,
        estimated: custo.estimado,
        min_qty: min,
        max_qty: max,
        needs_restock: min !== null && custo.saldo <= min,
        suggested_qty: max === null ? null : Math.max(0, arred3(max - (custo.saldo + pendente))),
      });
    }
  }
  linhas.sort(
    (a, b) =>
      a.establishment_name.localeCompare(b.establishment_name, "pt-BR") ||
      a.product_name.localeCompare(b.product_name, "pt-BR"),
  );
  return linhas;
}

function consolidar(linhas: StockLine[]): ConsolidatedLine[] {
  const porProduto = new Map<string, StockLine[]>();
  for (const l of linhas) {
    const lista = porProduto.get(l.emporio_product_id);
    if (lista) lista.push(l);
    else porProduto.set(l.emporio_product_id, [l]);
  }
  const saida: ConsolidatedLine[] = [];
  for (const lista of porProduto.values()) {
    const sealed = new Map<string, SealedLine>();
    let peso = 0;
    let soma = 0;
    for (const l of lista) {
      for (const s of l.sealed) {
        const atual = sealed.get(s.presentation_id);
        if (atual) {
          atual.packages = arred3(atual.packages + s.packages);
          atual.base_qty = arred3(atual.base_qty + s.base_qty);
        } else {
          sealed.set(s.presentation_id, { ...s });
        }
      }
      if (l.average_cost !== null && l.total_qty > 0) {
        peso += l.total_qty;
        soma += l.total_qty * l.average_cost;
      }
    }
    saida.push({
      emporio_product_id: lista[0].emporio_product_id,
      product_name: lista[0].product_name,
      base_unit: lista[0].base_unit,
      total_qty: arred3(lista.reduce((s, l) => s + l.total_qty, 0)),
      loose_qty: arred3(lista.reduce((s, l) => s + l.loose_qty, 0)),
      sealed: [...sealed.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      average_cost: peso > 0 ? arred4(soma / peso) : null,
      estimated: lista.some((l) => l.estimated),
    });
  }
  saida.sort((a, b) => a.product_name.localeCompare(b.product_name, "pt-BR"));
  return saida;
}

/** Lojas não arquivadas que o ator enxerga (vínculo, Q56). */
async function lojasVisiveis(
  db: TenantPrismaClient,
  ator: Ator,
  incluirArquivadas = false,
  paraEstoque = false,
): Promise<Loja[]> {
  const visiveis = paraEstoque ? await lojasDeEstoque(db, ator) : await lojasDoAtor(db, ator);
  return db.establishment.findMany({
    where: {
      ...(incluirArquivadas ? {} : { archived_at: null }),
      ...(visiveis ? { id: { in: [...visiveis] } } : {}),
    },
    select: { id: true, name: true, allow_negative_stock: true, archived_at: true },
    orderBy: { name: "asc" },
  });
}

/** Loja que o ator enxerga, ou 404 (fora do vínculo é 404, nunca 403: não revela que existe). */
async function acharLoja(
  db: TenantPrismaClient,
  ator: Ator,
  id: unknown,
  paraEstoque = false,
): Promise<ActionResult<Loja>> {
  if (typeof id !== "string" || !id) {
    return fail("VALIDATION_ERROR", "Escolha o estabelecimento.", 422, "establishment_id");
  }
  const visiveis = paraEstoque ? await lojasDeEstoque(db, ator) : await lojasDoAtor(db, ator);
  if (visiveis && !visiveis.has(id)) return NAO_ACHADO("Estabelecimento");
  const loja = await db.establishment.findFirst({
    where: { id },
    select: { id: true, name: true, allow_negative_stock: true, archived_at: true },
  });
  if (!loja) return NAO_ACHADO("Estabelecimento");
  return ok(loja);
}

/** Como `acharLoja`, mas para ESCREVER: loja arquivada não recebe movimentação. */
export async function acharLojaParaEscrita(
  db: TenantPrismaClient,
  ator: Ator,
  id: unknown,
): Promise<ActionResult<Loja>> {
  const r = await acharLoja(db, ator, id);
  if (!r.ok) return r;
  if (r.data.archived_at) {
    return fail("VALIDATION_ERROR", "Esse estabelecimento está arquivado.", 422, "establishment_id");
  }
  return r;
}

async function acharProduto(db: TenantPrismaClient, id: unknown): Promise<ActionResult<ProdutoRow>> {
  if (typeof id !== "string" || !id) {
    return fail("VALIDATION_ERROR", "Escolha o produto.", 422, "emporio_product_id");
  }
  const p = await db.emporioProduct.findFirst({ where: { id }, include: INCLUDE_PRODUTO });
  if (!p) return NAO_ACHADO("Produto");
  return ok(p);
}

// ---------------------------------------------------------------------------
// Leituras públicas
// ---------------------------------------------------------------------------

export async function saldoDaLojaAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishment_id: string,
): Promise<ActionResult<StockLine[]>> {
  const foraDoCaixa = await recusarCaixa(db, ator, "ver o estoque");
  if (foraDoCaixa) return foraDoCaixa;
  // Q128: o Gestor lê o estoque de qualquer loja.
  const loja = await acharLoja(db, ator, establishment_id, true);
  if (!loja.ok) return loja;
  return ok(await montarLinhas(delegates(db), [loja.data]));
}

export async function saldoDoProdutoAction(
  db: TenantPrismaClient,
  ator: Ator,
  emporio_product_id: string,
): Promise<ActionResult<ProductStockView>> {
  const foraDoCaixa = await recusarCaixa(db, ator, "ver o estoque");
  if (foraDoCaixa) return foraDoCaixa;
  const p = await acharProduto(db, emporio_product_id);
  if (!p.ok) return p;
  const lojas = await lojasVisiveis(db, ator, false, true);
  const stores = await montarLinhas(delegates(db), lojas, { emporio_product_id });
  const [consolidated] = consolidar(stores);
  return ok({
    emporio_product_id,
    product_name: p.data.product.name,
    base_unit: p.data.base_unit,
    stores,
    consolidated: consolidated ?? {
      emporio_product_id,
      product_name: p.data.product.name,
      base_unit: p.data.base_unit,
      total_qty: 0,
      loose_qty: 0,
      sealed: [],
      average_cost: null,
      estimated: false,
    },
  });
}

export async function estoqueConsolidadoAction(
  db: TenantPrismaClient,
  ator: Ator,
): Promise<ActionResult<ConsolidatedLine[]>> {
  const foraDoCaixa = await recusarCaixa(db, ator, "ver o estoque");
  if (foraDoCaixa) return foraDoCaixa;
  const lojas = await lojasVisiveis(db, ator, false, true);
  const linhas = await montarLinhas(delegates(db), lojas);
  return ok(consolidar(linhas));
}

export async function precisaReporAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string } = {},
): Promise<ActionResult<StockLine[]>> {
  const foraDoCaixa = await recusarCaixa(db, ator, "ver o estoque");
  if (foraDoCaixa) return foraDoCaixa;
  let lojas: Loja[];
  if (opts.establishment_id !== undefined && opts.establishment_id !== null) {
    const loja = await acharLoja(db, ator, opts.establishment_id);
    if (!loja.ok) return loja;
    lojas = [loja.data];
  } else {
    lojas = await lojasVisiveis(db, ator);
  }
  const linhas = await montarLinhas(delegates(db), lojas);
  return ok(linhas.filter((l) => l.needs_restock));
}

// ---------------------------------------------------------------------------
// Validação comum de quantidades
// ---------------------------------------------------------------------------

/** "2,5 unidades" não existe: produto de unidade-base `unidade` só aceita inteiro. */
function recusaFracao(baseUnit: string, n: number): string | null {
  if (baseUnit === "unidade" && !Number.isInteger(n)) {
    return "Produto vendido por unidade só aceita quantidade inteira.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Unidade que mudou no meio do caminho (conversão de saca para quilo, Q320)
// ---------------------------------------------------------------------------

const rotuloDaUnidade = (id: string): string =>
  id === "quilograma" ? "quilo" : (findUnit(id)?.label.toLowerCase() ?? id);

/** A recusa de uma quantidade montada numa unidade que o produto deixou de ter. */
export function recusaUnidadeMudou(nome: string, de: string, para: string): ActionResult<never> {
  return fail(
    "UNIT_CHANGED",
    `O produto ${nome} mudou de unidade agora (de ${rotuloDaUnidade(de)} para ${rotuloDaUnidade(para)}). Abra a tela de novo e refaça.`,
    409,
  );
}

/**
 * A tela diz em que unidade montou as quantidades (`base_unit`, opcional). Se o
 * produto já está em outra, recusa; sem o campo, nada se confere. Valor que não
 * é texto é recusa de validação.
 */
export function conferirUnidadeDaTela(
  p: { base_unit: string; product: { name: string } },
  informada: unknown,
): ActionResult<never> | null {
  if (informada === undefined || informada === null) return null;
  if (typeof informada !== "string") {
    return fail("VALIDATION_ERROR", "Informe a unidade como texto.", 422, "base_unit");
  }
  return informada === p.base_unit ? null : recusaUnidadeMudou(p.product.name, informada, p.base_unit);
}

export type UnidadePreparada = { id: string; nome: string; base_unit: string };

/**
 * Chamada DENTRO da transação serializável, antes de gravar: relê o `base_unit`
 * de cada produto e compara com o que foi lido na preparação. A conversão
 * (`converterUnidadeAction`) pode ter comitado no meio, ou o retry do
 * serializável rodar depois dela, e a quantidade antiga cairia na unidade nova.
 * Devolve a recusa (sem ter gravado nada), ou null se tudo confere.
 */
export async function recusaSeUnidadeMudou(
  tx: Tx,
  preparados: UnidadePreparada[],
): Promise<ActionResult<never> | null> {
  if (preparados.length === 0) return null;
  const atuais = await tx.emporioProduct.findMany({
    where: { id: { in: [...new Set(preparados.map((x) => x.id))] } },
    select: { id: true, base_unit: true },
  });
  const porId = new Map(atuais.map((a) => [a.id, a.base_unit]));
  for (const x of preparados) {
    const agora = porId.get(x.id);
    if (agora !== undefined && agora !== x.base_unit) return recusaUnidadeMudou(x.nome, x.base_unit, agora);
  }
  return null;
}

type SealedInput = { presentation_id: string; packages: number };
type SealedValido = { presentation: ProdutoRow["presentations"][number]; packages: number };

/**
 * Confere a lista de lacrado. Produto sem separação recusa qualquer item (Q31,
 * campo `sealed`); a apresentação precisa ser do produto, ativa e fechada;
 * embalagem é número inteiro.
 */
export function validarSealed(
  produto: ProdutoRow,
  sealed: unknown,
  minimo: number,
): ActionResult<SealedValido[]> {
  if (sealed === undefined || sealed === null) return ok([]);
  if (!Array.isArray(sealed)) {
    return fail("VALIDATION_ERROR", "Informe o lacrado como uma lista de apresentações.", 422, "sealed");
  }
  if (sealed.length === 0) return ok([]);
  if (!lacradoEfetivo(produto)) {
    return fail(
      "VALIDATION_ERROR",
      "Esse produto não separa lacrado de avulso. Informe só a quantidade avulsa.",
      422,
      "sealed",
    );
  }
  // Q324: o tamanho é a identidade da embalagem, então duas apresentações do mesmo tamanho são a mesma.
  const tamanhos = tamanhosDe(produto);
  const vistos = new Map<string, { id: string; name: string }>();
  const saida: SealedValido[] = [];
  for (const item of sealed as Partial<SealedInput>[]) {
    const ap = produto.presentations.find((x) => x.id === item?.presentation_id);
    if (!ap || ap.archived_at || !ap.is_sealed_package) {
      return fail("VALIDATION_ERROR", "Escolha uma apresentação fechada (embalagem lacrada) desse produto.", 422, "sealed");
    }
    const chave = chaveDoEstado(ap.id, tamanhos);
    const antes = vistos.get(chave);
    if (antes) {
      return fail(
        "VALIDATION_ERROR",
        antes.id === ap.id
          ? `A apresentação "${ap.name}" aparece mais de uma vez.`
          : `A mesma embalagem aparece duas vezes: ${antes.name} e ${ap.name} têm o mesmo tamanho.`,
        422,
        "sealed",
      );
    }
    vistos.set(chave, { id: ap.id, name: ap.name });
    const n = item?.packages;
    if (!numero(n) || !Number.isInteger(n) || n < minimo) {
      return fail(
        "VALIDATION_ERROR",
        minimo > 0
          ? `Informe quantas embalagens de "${ap.name}" (inteiro, maior que zero).`
          : `Informe quantas embalagens de "${ap.name}" (número inteiro, zero ou mais).`,
        422,
        "sealed",
      );
    }
    saida.push({ presentation: ap, packages: n });
  }
  return ok(saida);
}

function validarSoltoNaoNegativo(produto: ProdutoRow, v: unknown): ActionResult<number> {
  if (!numero(v) || v < 0) {
    return fail("VALIDATION_ERROR", "Informe a quantidade avulsa (zero ou mais).", 422, "loose_qty");
  }
  const fr = recusaFracao(produto.base_unit, v);
  if (fr) return fail("VALIDATION_ERROR", fr, 422, "loose_qty");
  return ok(arred3(v));
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

export type ImplantarInput = {
  establishment_id: string;
  emporio_product_id: string;
  sealed?: SealedInput[];
  loose_qty?: number;
  unit_cost?: number | null;
  /** A unidade em que a tela montou as quantidades; se o produto já mudou, 409 UNIT_CHANGED. */
  base_unit?: string;
};

export async function implantarEstoqueAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ImplantarInput,
): Promise<ActionResult<StockLine>> {
  const neg = await exigir(db, ator, "chave:estoque_inicial", "informar o estoque inicial");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  const produto = await acharProduto(db, input?.emporio_product_id);
  if (!produto.ok) return produto;
  const p = produto.data;
  const telaVelha = conferirUnidadeDaTela(p, input.base_unit);
  if (telaVelha) return telaVelha;

  const sealed = validarSealed(p, input.sealed, 1);
  if (!sealed.ok) return sealed;
  const solto = validarSoltoNaoNegativo(p, input.loose_qty ?? 0);
  if (!solto.ok) return solto;
  if (sealed.data.length === 0 && solto.data === 0) {
    return fail("VALIDATION_ERROR", "Informe a quantidade do estoque inicial.", 422, "loose_qty");
  }
  if (input.unit_cost != null && (!numero(input.unit_cost) || input.unit_cost < 0)) {
    return fail("VALIDATION_ERROR", "O custo não pode ser negativo.", 422, "unit_cost");
  }

  const tracked = lacradoEfetivo(p);
  const custo = input.unit_cost ?? null;
  const agora = new Date();

  let unidadeMudou: ActionResult<never> | null = null;
  const jaTem = await runSerializableTenantTransaction(db, async (tx) => {
    unidadeMudou = await recusaSeUnidadeMudou(tx, [{ id: p.id, nome: p.product.name, base_unit: p.base_unit }]);
    if (unidadeMudou) return false;
    const existe = await tx.stockMovement.findFirst({
      where: {
        establishment_id: loja.data.id,
        product_id: p.product_id,
        movement_type: "implantacao",
        canceled_at: null,
      },
      select: { id: true },
    });
    if (existe) return true;

    const dados: Prisma.StockMovementCreateManyInput[] = [];
    for (const s of sealed.data) {
      dados.push(
        scoped({
          product_id: p.product_id,
          establishment_id: loja.data.id,
          movement_type: "implantacao" as const,
          quantity: arred3(s.packages * (decToNum(s.presentation.base_qty) ?? 0)),
          occurred_at: agora,
          package_state: "lacrado" as const,
          presentation_id: s.presentation.id,
          unit_cost: custo,
          notes: "Estoque inicial",
          recorded_by_user_id: ator.id,
        }),
      );
    }
    if (solto.data > 0) {
      dados.push(
        scoped({
          product_id: p.product_id,
          establishment_id: loja.data.id,
          movement_type: "implantacao" as const,
          quantity: solto.data,
          occurred_at: agora,
          package_state: tracked ? ("avulso" as const) : null,
          unit_cost: custo,
          notes: "Estoque inicial",
          recorded_by_user_id: ator.id,
        }),
      );
    }
    await tx.stockMovement.createMany({ data: dados });
    const total = dados.reduce((soma, d) => soma + Number(d.quantity), 0);
    await registrarNoHistorico(tx, ator, {
      action: "estoque.implantar",
      establishment_id: loja.data.id,
      target_type: "produto",
      target_id: p.id,
      summary: `Informou o estoque inicial de ${p.product.name} na ${loja.data.name}: ${descreverQuantidade(arred3(total), p.base_unit)}`,
    });
    return false;
  });
  if (unidadeMudou) return unidadeMudou;
  if (jaTem) {
    return fail(
      "ALREADY_IMPLANTED",
      "Esse produto já tem estoque inicial nessa loja. Para corrigir, faça uma contagem.",
      409,
      "emporio_product_id",
    );
  }
  return saldoAtual(db, loja.data, p.id);
}

async function saldoAtual(db: TenantPrismaClient, loja: Loja, emporio_product_id: string): Promise<ActionResult<StockLine>> {
  const [linha] = await montarLinhas(delegates(db), [loja], { emporio_product_id });
  if (!linha) return NAO_ACHADO("Produto");
  return ok(linha);
}

export type ContagemInput = {
  establishment_id: string;
  emporio_product_id: string;
  sealed?: SealedInput[];
  loose_qty: number;
  reason: string;
  /** A unidade em que a tela montou as quantidades; se o produto já mudou, 409 UNIT_CHANGED. */
  base_unit?: string;
};

/**
 * Contagem física (Q31, Q66): grava UM ajuste por estado cujo saldo difere do
 * físico informado, com `previous_balance` e `corrected_balance` do estado e o
 * motivo em `notes`. Apresentação lacrada que não foi citada em `sealed` não é
 * tocada; para dizer que acabou, informe `packages: 0`. Nada mudou: nada é
 * gravado e a resposta é o saldo atual.
 */
export async function registrarContagemAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ContagemInput,
): Promise<ActionResult<StockLine>> {
  const neg = await exigir(db, ator, "chave:contagem", "fazer contagem");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  const produto = await acharProduto(db, input?.emporio_product_id);
  if (!produto.ok) return produto;
  const p = produto.data;
  const telaVelha = conferirUnidadeDaTela(p, input.base_unit);
  if (telaVelha) return telaVelha;

  const motivo = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!motivo) return fail("VALIDATION_ERROR", "Informe o motivo da contagem.", 422, "reason");
  const sealed = validarSealed(p, input.sealed, 0);
  if (!sealed.ok) return sealed;
  const solto = validarSoltoNaoNegativo(p, input.loose_qty);
  if (!solto.ok) return solto;

  const tracked = lacradoEfetivo(p);
  const agora = new Date();

  let unidadeMudou: ActionResult<never> | null = null;
  await runSerializableTenantTransaction(db, async (tx) => {
    unidadeMudou = await recusaSeUnidadeMudou(tx, [{ id: p.id, nome: p.product.name, base_unit: p.base_unit }]);
    if (unidadeMudou) return;
    const movs = await lerMovimentos(tx, [loja.data.id], [p.product_id]);
    const tamanhos = tamanhosDe(p);
    const atuais = saldosPorEstado(movs, tamanhos);
    const dados: Prisma.StockMovementCreateManyInput[] = [];

    // Q323: a contagem de um tamanho acerta o saldo do tamanho inteiro, qualquer que seja a apresentação citada.
    const alvo: { chave: string; fisico: number; estado: EstadoEmbalagem | null; presentation_id: string | null }[] = [
      { chave: chaveDoEstado(null, tamanhos), fisico: solto.data, estado: tracked ? "avulso" : null, presentation_id: null },
      ...sealed.data.map((s) => ({
        chave: chaveDoEstado(s.presentation.id, tamanhos),
        fisico: arred3(s.packages * (decToNum(s.presentation.base_qty) ?? 0)),
        estado: "lacrado" as const,
        presentation_id: s.presentation.id,
      })),
    ];
    for (const a of alvo) {
      const antes = atuais.get(a.chave) ?? 0;
      const diferenca = arred3(a.fisico - antes);
      if (diferenca === 0) continue;
      dados.push(
        scoped({
          product_id: p.product_id,
          establishment_id: loja.data.id,
          movement_type: "ajuste" as const,
          quantity: Math.abs(diferenca),
          occurred_at: agora,
          previous_balance: antes,
          corrected_balance: a.fisico,
          package_state: a.estado,
          presentation_id: a.presentation_id,
          notes: motivo,
          recorded_by_user_id: ator.id,
        }),
      );
    }
    if (dados.length > 0) {
      await tx.stockMovement.createMany({ data: dados });
      await registrarNoHistorico(tx, ator, {
        action: "estoque.contar",
        establishment_id: loja.data.id,
        target_type: "produto",
        target_id: p.id,
        summary: `Contou ${p.product.name} na ${loja.data.name} e ajustou o estoque: ${motivo}`,
        changes: dados.map((d) => ({
          campo: d.package_state === "lacrado" ? "Saldo lacrado" : "Saldo",
          antes: descreverQuantidade(Number(d.previous_balance), p.base_unit),
          depois: descreverQuantidade(Number(d.corrected_balance), p.base_unit),
        })),
      });
    }
  });
  if (unidadeMudou) return unidadeMudou;
  return saldoAtual(db, loja.data, p.id);
}

export type PerdaInput = {
  establishment_id: string;
  emporio_product_id: string;
  package_state?: EstadoEmbalagem | null;
  presentation_id?: string | null;
  /** Em embalagens quando lacrado (com `presentation_id`); na unidade-base quando avulso. */
  quantity: number;
  reason: string;
  notes?: string | null;
  /** A unidade em que a tela montou as quantidades; se o produto já mudou, 409 UNIT_CHANGED. */
  base_unit?: string;
};

export async function registrarPerdaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: PerdaInput,
): Promise<ActionResult<StockLine>> {
  const neg = await exigir(db, ator, "chave:perda", "registrar perda");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  const produto = await acharProduto(db, input?.emporio_product_id);
  if (!produto.ok) return produto;
  const p = produto.data;
  const telaVelha = conferirUnidadeDaTela(p, input.base_unit);
  if (telaVelha) return telaVelha;

  if (!ehMotivo(input.reason)) {
    return fail("VALIDATION_ERROR", "Escolha o motivo: vencido, avaria, furto, consumo próprio ou outro.", 422, "reason");
  }
  if (!numero(input.quantity) || input.quantity <= 0) {
    return fail("VALIDATION_ERROR", "A quantidade deve ser maior que zero.", 422, "quantity");
  }

  const tracked = lacradoEfetivo(p);
  const estadoPedido = input.package_state ?? null;
  if (estadoPedido !== null && estadoPedido !== "lacrado" && estadoPedido !== "avulso") {
    return fail("VALIDATION_ERROR", "O estado deve ser lacrado ou avulso.", 422, "package_state");
  }

  let estado: EstadoEmbalagem | null;
  let apresentacao: ProdutoRow["presentations"][number] | null = null;
  let base: number;

  if (!tracked) {
    if (estadoPedido === "lacrado") {
      return fail("VALIDATION_ERROR", "Esse produto não separa lacrado de avulso.", 422, "package_state");
    }
    if (input.presentation_id) {
      return fail("VALIDATION_ERROR", "Esse produto não separa lacrado de avulso.", 422, "presentation_id");
    }
    estado = null;
    base = input.quantity;
  } else if (estadoPedido === "lacrado" || (estadoPedido === null && input.presentation_id)) {
    estado = "lacrado";
    apresentacao = p.presentations.find((x) => x.id === input.presentation_id) ?? null;
    if (!apresentacao || apresentacao.archived_at || !apresentacao.is_sealed_package) {
      return fail("VALIDATION_ERROR", "Escolha a apresentação fechada que se perdeu.", 422, "presentation_id");
    }
    if (!Number.isInteger(input.quantity)) {
      return fail("VALIDATION_ERROR", "Embalagem lacrada se conta em número inteiro.", 422, "quantity");
    }
    base = arred3(input.quantity * (decToNum(apresentacao.base_qty) ?? 0));
  } else {
    estado = "avulso";
    if (input.presentation_id) {
      return fail("VALIDATION_ERROR", "Perda avulsa não leva apresentação.", 422, "presentation_id");
    }
    base = input.quantity;
  }
  if (estado !== "lacrado") {
    const fr = recusaFracao(p.base_unit, input.quantity);
    if (fr) return fail("VALIDATION_ERROR", fr, 422, "quantity");
  }
  base = arred3(base);
  if (base <= 0) {
    return fail("VALIDATION_ERROR", "A quantidade deve ser maior que zero.", 422, "quantity");
  }

  // Q323: a perda de lacrado confere o saldo do TAMANHO da apresentação.
  const tamanhos = tamanhosDe(p);
  const chave = chaveDoEstado(apresentacao?.id ?? null, tamanhos);
  let unidadeMudou: ActionResult<never> | null = null;
  const recusa = await runSerializableTenantTransaction(db, async (tx) => {
    unidadeMudou = await recusaSeUnidadeMudou(tx, [{ id: p.id, nome: p.product.name, base_unit: p.base_unit }]);
    if (unidadeMudou) return null;
    const movs = await lerMovimentos(tx, [loja.data.id], [p.product_id]);
    const saldo = saldosPorEstado(movs, tamanhos).get(chave) ?? 0;
    if (base > saldo && !loja.data.allow_negative_stock) {
      return { saldo };
    }
    const medio = custoMedio(movs).custo_medio;
    await tx.stockMovement.create({
      data: scoped({
        product_id: p.product_id,
        establishment_id: loja.data.id,
        movement_type: "perda" as const,
        quantity: base,
        occurred_at: new Date(),
        package_state: estado,
        presentation_id: apresentacao?.id ?? null,
        unit_cost: medio === null ? null : arred4(medio),
        loss_reason: input.reason as MotivoDePerda,
        notes: input.notes?.trim() || null,
        recorded_by_user_id: ator.id,
      }),
    });
    await registrarNoHistorico(tx, ator, {
      action: "estoque.perda",
      establishment_id: loja.data.id,
      target_type: "produto",
      target_id: p.id,
      summary: `Registrou perda de ${descreverQuantidade(base, p.base_unit)} de ${p.product.name} na ${loja.data.name} (${input.reason})`,
    });
    return null;
  });
  if (unidadeMudou) return unidadeMudou;
  if (recusa) {
    return fail(
      "INSUFFICIENT_STOCK",
      `Saldo insuficiente para essa perda: há ${descreverQuantidade(recusa.saldo, p.base_unit)} e a perda é de ${descreverQuantidade(base, p.base_unit)}.`,
      409,
      "quantity",
    );
  }
  return saldoAtual(db, loja.data, p.id);
}

export type LimitesInput = {
  establishment_id: string;
  emporio_product_id: string;
  min_qty: number | null;
  max_qty: number | null;
};

export async function definirLimitesAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: LimitesInput,
): Promise<ActionResult<StockLine>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "definir os limites de estoque");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  const produto = await acharProduto(db, input?.emporio_product_id);
  if (!produto.ok) return produto;
  const p = produto.data;

  const min = input.min_qty ?? null;
  const max = input.max_qty ?? null;
  for (const [campo, v, rotulo] of [
    ["min_qty", min, "O mínimo"],
    ["max_qty", max, "O máximo"],
  ] as const) {
    if (v === null) continue;
    if (!numero(v) || v < 0) {
      return fail("VALIDATION_ERROR", `${rotulo} não pode ser negativo.`, 422, campo);
    }
    const fr = recusaFracao(p.base_unit, v);
    if (fr) return fail("VALIDATION_ERROR", fr, 422, campo);
  }
  if (min !== null && max !== null && min > max) {
    return fail("VALIDATION_ERROR", "O mínimo não pode ser maior que o máximo.", 422, "max_qty");
  }

  const valores = {
    min_qty: min === null ? null : arred3(min),
    max_qty: max === null ? null : arred3(max),
    updated_by_user_id: ator.id,
  };
  const chaveLimite = {
    establishment_id_emporio_product_id: { establishment_id: loja.data.id, emporio_product_id: p.id },
  };
  const limiteAntes = await db.stockLimit.findUnique({ where: chaveLimite });
  await db.$transaction(async (tx) => {
    await tx.stockLimit.upsert({
      where: chaveLimite,
      create: scoped({ establishment_id: loja.data.id, emporio_product_id: p.id, ...valores }),
      update: valores,
    });
    await registrarNoHistorico(tx, ator, {
      action: "estoque.limites",
      establishment_id: loja.data.id,
      target_type: "produto",
      target_id: p.id,
      summary: `Definiu os limites de estoque de ${p.product.name} na ${loja.data.name}`,
      changes: diferencas(
        { min_qty: decToNum(limiteAntes?.min_qty), max_qty: decToNum(limiteAntes?.max_qty) },
        { min_qty: valores.min_qty, max_qty: valores.max_qty },
        { min_qty: "Mínimo", max_qty: "Máximo" },
      ),
    });
  });
  return saldoAtual(db, loja.data, p.id);
}

export type EncaminharInput = {
  establishment_id: string;
  emporio_product_id: string;
  quantity: number;
};

/**
 * "Encaminhar à Lista" (Q68): cria o item da Lista de Compra com a loja e a
 * quantidade na unidade-base. Nada de estoque nem de dinheiro se mexe aqui (a
 * Lista não toca estoque, Módulo 36). Se a loja já tem um item pendente desse
 * produto, recusa com 409 em vez de duplicar.
 */
export async function encaminharParaListaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: EncaminharInput,
): Promise<ActionResult<ShoppingItemView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "encaminhar à Lista de Compra");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  const produto = await acharProduto(db, input?.emporio_product_id);
  if (!produto.ok) return produto;
  const p = produto.data;

  if (!numero(input.quantity) || input.quantity <= 0) {
    return fail("VALIDATION_ERROR", "A quantidade deve ser maior que zero.", 422, "quantity");
  }
  const fr = recusaFracao(p.base_unit, input.quantity);
  if (fr) return fail("VALIDATION_ERROR", fr, 422, "quantity");

  const jaTem = await db.shoppingItem.findFirst({
    where: { product_id: p.product_id, establishment_id: loja.data.id, status: "pendente" },
    select: { id: true },
  });
  if (jaTem) {
    return fail(
      "ITEM_JA_NA_LISTA",
      `"${p.product.name}" já está na Lista para ${loja.data.name}.`,
      409,
      "emporio_product_id",
    );
  }

  const item = await db.$transaction(async (tx) => {
    const criado = await tx.shoppingItem.create({
      data: scoped({
        description: p.product.name,
        product_id: p.product_id,
        establishment_id: loja.data.id,
        quantity: arred3(input.quantity),
        unit: p.base_unit,
        created_by_user_id: ator.id,
      }),
    });
    await registrarNoHistorico(tx, ator, {
      action: "estoque.reposicao",
      establishment_id: loja.data.id,
      target_type: "produto",
      target_id: p.id,
      summary: `Mandou ${descreverQuantidade(arred3(input.quantity), p.base_unit)} de ${p.product.name} para a lista de compra da ${loja.data.name}`,
    });
    return criado;
  });
  return ok({
    id: item.id,
    description: item.description,
    product_id: item.product_id,
    establishment_id: item.establishment_id,
    quantity: decToNum(item.quantity),
    unit: item.unit,
    status: item.status,
  });
}
