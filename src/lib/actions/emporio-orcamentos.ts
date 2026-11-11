import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { delegates } from "@/lib/prisma-delegates";
import { exigir, exigirUma } from "@/lib/emporio/papel";
import { runSerializableTenantTransaction, type TenantTransactionClient } from "@/lib/financial";
import { custoMedio } from "@/lib/emporio/custo-medio";
import { formatarNumero, proximoNumero } from "@/lib/emporio/numeracao";
import { hojeEmBrasilia, somarDias } from "@/lib/emporio/cartao";
import { dinheiro, itens as frasItens, registrarNoHistorico } from "@/lib/emporio/historico";
import {
  arred3,
  centavos,
  precificarItens,
  precoDeReferencia,
  precoQueVale,
  resolverVendedor,
  type VendaItemInput,
} from "@/lib/emporio/precificar";
import { faltaNoCadastro, type EnderecoDoPedido } from "@/lib/emporio/cliente-cadastro";
import {
  enderecoDasColunas,
  resolverPedidoParaEntrega,
  type EscolhaDoEndereco,
  type PedidoParaEntregaInput,
} from "@/lib/emporio/pedido-para-entrega";
import { lojaVisivel, lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { acharLojaParaEscrita, lerMovimentos } from "@/lib/actions/emporio-estoque";
import { resolverFranqueadoDoCredito } from "@/lib/actions/emporio-vendas";
import { normalizarTermo } from "@/lib/actions/whatsapp-handlers/shared";
import { pesoDoItemKg } from "@/lib/emporio/peso";

/**
 * Meu Empório, entrega 4: o orçamento. Salvar não mexe em estoque, caixa nem
 * financeiro: grava o preço e o desconto do momento, pela mesma regra da venda
 * (`precificar.ts`), para um cliente do Empório (o Consumidor final serve). A situação (aberto, vencido,
 * faturado) é derivada na leitura, nunca gravada. Validação em TypeScript puro,
 * porque o agente do WhatsApp chama sem passar pelo Zod da rota.
 */

const NAO_ACHADO = () => fail("NOT_FOUND", "Orçamento não encontrado.", 404);
const CLIENTE_OBRIGATORIO = () =>
  fail(
    "QUOTE_CUSTOMER_REQUIRED",
    "Escolha o cliente do orçamento. Quem não quer se identificar entra como Consumidor final.",
    422,
    "customer_id",
  );
const CLIENTE_INCOMPLETO = (falta: string) =>
  fail("QUOTE_CUSTOMER_INCOMPLETE", `Complete o cadastro do cliente antes de salvar o orçamento. ${falta}`, 422, "customer_id");

const VALIDADE_PADRAO = 7;

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

/** Derivada, nunca gravada: faturado, senão vencido (passou do dia de `valid_until` em Brasília), senão aberto. */
function situacaoDe(
  q: { sale_id: string | null; canceled_at: Date | null; valid_until: Date },
  hojeMs: number,
): "aberto" | "vencido" | "faturado" | "cancelado" {
  if (q.canceled_at) return "cancelado";
  return q.sale_id ? "faturado" : hojeMs > q.valid_until.getTime() ? "vencido" : "aberto";
}

const QUOTE_CANCELED = (frase = "Este orçamento foi cancelado.") => fail("QUOTE_CANCELED", frase, 409);
const QUOTE_ALREADY_INVOICED = (numeroDaVenda: string) =>
  fail("QUOTE_ALREADY_INVOICED", `Este orçamento já foi faturado na venda nº ${numeroDaVenda}.`, 409);

const dataBr = (iso: string): string => iso.split("-").reverse().join("/");

// ---------------------------------------------------------------------------
// Visão
// ---------------------------------------------------------------------------

export type OrcamentoItemView = {
  presentation_id: string;
  emporio_product_id: string;
  produto: string;
  apresentacao: string;
  quantity: number;
  /** O preço unitário do orçamento (o praticado, já com o desconto). */
  preco_orcado: number;
  /** O preço cadastrado na loja quando se orçou (o preço sugerido); nulo sem preço. */
  preco_sugerido: number | null;
  /** O preço da apresentação na loja hoje; nulo sem preço. */
  preco_hoje: number | null;
  /** O preço que valeria ao faturar hoje (`precoQueVale`): o que o balcão cobra. */
  preco_que_vale: number | null;
  /** A referência do desconto ao faturar hoje (`precoDeReferencia`): o `suggested_price` da venda. */
  preco_de_referencia: number | null;
  mudou: boolean;
  /** Saldo da loja na unidade-base, a soma das movimentações. */
  saldo_base: number;
  /** A quantidade do item, na unidade-base, passa do saldo. */
  falta: boolean;
  /** Q291: peso do item em quilos (só o papel o mostra); nulo sem conteúdo em quilograma. */
  peso_kg: number | null;
  total: number;
};

export type OrcamentoView = {
  id: string;
  number: number;
  /** `number` com 6 dígitos, como sai no papel. */
  numero: string;
  establishment_id: string;
  loja: string;
  /** O cliente do Empório (`EmporioCustomer`); antes da Frente 1, `contact`. */
  customer: { id: string; name: string; phone: string | null; document: string | null; incomplete: boolean };
  seller_user_id: string | null;
  seller_name: string | null;
  created_by_name: string | null;
  created_at: string;
  /** AAAA-MM-DD: vale até o fim deste dia em Brasília. */
  valid_until: string;
  situacao: "aberto" | "vencido" | "faturado" | "cancelado";
  /** O cancelamento (Q287): quando, quem e por quê; nulos se não foi cancelado. */
  canceled_at: string | null;
  canceled_by: { id: string; name: string } | null;
  canceled_reason: string | null;
  /** O orçamento de origem, quando este nasceu de "novo orçamento a partir deste" (Q286). */
  based_on: { id: string; number: string } | null;
  /** Os orçamentos feitos a partir deste. */
  derived: { id: string; number: string }[];
  /** A venda ativa que faturou o orçamento. */
  sale: { id: string; numero: string } | null;
  /** Todas as vendas que saíram dele, canceladas inclusive. */
  vendas: { id: string; numero: string; status: string }[];
  net_amount: number;
  /** Q309: o franqueado e o crédito dele, cobrado a mais do cliente. Interno: o impresso rateia o crédito nos itens. */
  franchisee_id: string | null;
  franchisee_name: string | null;
  franchisee_credit: number;
  /** `net_amount + franchisee_credit`: o que o cliente paga pelo orçado (o frete não entra no orçamento). */
  total_amount: number;
  discount_amount: number;
  notes: string | null;
  /** O pedido para entrega: a marca, a escolha e a cópia do endereço (nulos na retirada). */
  for_delivery: boolean;
  delivery_address_kind: EscolhaDoEndereco | null;
  delivery_address: EnderecoDoPedido | null;
  items: OrcamentoItemView[];
};

const INCLUDE_ORCAMENTO = {
  establishment: { select: { name: true } },
  customer: true,
  franchisee: { select: { name: true } },
  sale: { select: { id: true, number: true } },
  sales: { select: { id: true, number: true, status: true }, orderBy: { created_at: "asc" } },
  based_on: { select: { id: true, number: true } },
  derived: { select: { id: true, number: true }, orderBy: { number: "asc" } },
  items: {
    include: {
      emporio_product: {
        select: { product_id: true, base_unit: true, content_qty: true, content_unit: true, product: { select: { name: true } } },
      },
      presentation: { select: { name: true, base_qty: true } },
    },
    orderBy: { id: "asc" },
  },
} as const;

type OrcamentoRow = Awaited<ReturnType<typeof buscarOrcamentos>>[number];

async function buscarOrcamentos(db: TenantPrismaClient, where: Record<string, unknown>, take?: number) {
  return db.emporioQuote.findMany({
    where,
    include: INCLUDE_ORCAMENTO,
    orderBy: { created_at: "desc" },
    ...(take ? { take } : {}),
  });
}

/** Monta a visão de vários orçamentos com poucas consultas (nomes, preços de hoje e saldos). */
async function montarOrcamentos(db: TenantPrismaClient, linhas: OrcamentoRow[]): Promise<OrcamentoView[]> {
  if (linhas.length === 0) return [];

  const idsDeUsuario = [
    ...new Set(linhas.flatMap((l) => [l.seller_user_id, l.created_by_user_id, l.canceled_by_user_id]).filter((x): x is string => !!x)),
  ];
  const usuarios =
    idsDeUsuario.length > 0
      ? await db.user.findMany({ where: { id: { in: idsDeUsuario } }, select: { id: true, name: true } })
      : [];
  const nomeDoUsuario = new Map(usuarios.map((u) => [u.id, u.name]));

  const lojaIds = [...new Set(linhas.map((l) => l.establishment_id))];
  const apresentacaoIds = [...new Set(linhas.flatMap((l) => l.items.map((i) => i.presentation_id)))];
  const precos = await db.presentationPrice.findMany({
    where: { establishment_id: { in: lojaIds }, presentation_id: { in: apresentacaoIds } },
    select: { establishment_id: true, presentation_id: true, price: true },
  });
  const precoHoje = new Map(precos.map((p) => [`${p.establishment_id}|${p.presentation_id}`, decToNum(p.price)]));

  // O saldo é a soma das movimentações (invariante 2), pela mesma conta da venda.
  const productIds = [...new Set(linhas.flatMap((l) => l.items.map((i) => i.emporio_product.product_id)))];
  const movs = await lerMovimentos(delegates(db), lojaIds, productIds);
  const movsPorChave = new Map<string, typeof movs>();
  for (const m of movs) {
    const k = `${m.establishment_id}|${m.product_id}`;
    const grupo = movsPorChave.get(k);
    if (grupo) grupo.push(m);
    else movsPorChave.set(k, [m]);
  }
  const saldos = new Map<string, number>();
  const saldoDe = (lojaId: string, productId: string): number => {
    const k = `${lojaId}|${productId}`;
    if (!saldos.has(k)) saldos.set(k, arred3(custoMedio(movsPorChave.get(k) ?? []).saldo));
    return saldos.get(k) as number;
  };

  const hoje = hojeEmBrasilia().getTime();

  return linhas.map((q) => {
    const vencido = hoje > q.valid_until.getTime();
    const situacao = situacaoDe(q, hoje);
    const items: OrcamentoItemView[] = q.items.map((i) => {
      const quantity = decToNum(i.quantity) ?? 0;
      const orcado = decToNum(i.unit_price) ?? 0;
      const hojePreco = precoHoje.get(`${q.establishment_id}|${i.presentation_id}`) ?? null;
      const hojeCent = hojePreco === null ? null : centavos(hojePreco);
      const sugerido = decToNum(i.suggested_price);
      const vale = precoQueVale(centavos(orcado), hojeCent, vencido);
      const precoQueValeHoje = vale === null ? null : vale / 100;
      const referencia = precoDeReferencia(centavos(orcado), sugerido === null ? null : centavos(sugerido), hojeCent, vencido);
      const saldo = saldoDe(q.establishment_id, i.emporio_product.product_id);
      const baseQty = arred3(quantity * (decToNum(i.presentation.base_qty) ?? 0));
      return {
        presentation_id: i.presentation_id,
        emporio_product_id: i.emporio_product_id,
        produto: i.emporio_product.product.name,
        apresentacao: i.presentation.name,
        quantity,
        preco_orcado: orcado,
        preco_sugerido: sugerido,
        preco_hoje: hojePreco,
        preco_que_vale: precoQueValeHoje,
        preco_de_referencia: referencia === null ? null : referencia / 100,
        mudou: precoQueValeHoje !== orcado,
        saldo_base: saldo,
        falta: baseQty > saldo,
        peso_kg: pesoDoItemKg(
          {
            base_unit: i.emporio_product.base_unit,
            content_qty: decToNum(i.emporio_product.content_qty),
            content_unit: i.emporio_product.content_unit,
          },
          baseQty,
        ),
        total: decToNum(i.total) ?? 0,
      };
    });
    return {
      id: q.id,
      number: q.number,
      numero: formatarNumero(q.number),
      establishment_id: q.establishment_id,
      loja: q.establishment.name,
      customer: {
        id: q.customer?.id ?? "",
        name: q.customer?.name ?? "",
        phone: q.customer?.phone ?? null,
        document: q.customer?.document ?? null,
        // O cadastro pode ter mudado depois do orçamento: o balcão mostra o aviso de novo.
        incomplete: q.customer ? faltaNoCadastro(q.customer) !== null : false,
      },
      seller_user_id: q.seller_user_id,
      seller_name: q.seller_user_id ? (nomeDoUsuario.get(q.seller_user_id) ?? null) : null,
      created_by_name: q.created_by_user_id ? (nomeDoUsuario.get(q.created_by_user_id) ?? null) : null,
      created_at: q.created_at.toISOString(),
      valid_until: q.valid_until.toISOString().slice(0, 10),
      situacao,
      canceled_at: q.canceled_at ? q.canceled_at.toISOString() : null,
      canceled_by: q.canceled_by_user_id
        ? { id: q.canceled_by_user_id, name: nomeDoUsuario.get(q.canceled_by_user_id) ?? "" }
        : null,
      canceled_reason: q.canceled_reason,
      based_on: q.based_on ? { id: q.based_on.id, number: formatarNumero(q.based_on.number) } : null,
      derived: q.derived.map((d) => ({ id: d.id, number: formatarNumero(d.number) })),
      sale: q.sale ? { id: q.sale.id, numero: formatarNumero(q.sale.number) } : null,
      vendas: q.sales.map((s) => ({ id: s.id, numero: formatarNumero(s.number), status: s.status })),
      net_amount: decToNum(q.net_amount) ?? 0,
      franchisee_id: q.franchisee_id,
      franchisee_name: q.franchisee?.name ?? null,
      franchisee_credit: decToNum(q.franchisee_credit) ?? 0,
      total_amount: Math.round(((decToNum(q.net_amount) ?? 0) + (decToNum(q.franchisee_credit) ?? 0)) * 100) / 100,
      discount_amount: decToNum(q.discount_amount) ?? 0,
      notes: q.notes,
      for_delivery: q.for_delivery,
      delivery_address_kind: q.delivery_address_kind,
      delivery_address: enderecoDasColunas(q),
      items,
    };
  });
}

async function orcamentoVisivel(db: TenantPrismaClient, ator: Ator, id: string): Promise<OrcamentoView | null> {
  const [linha] = await buscarOrcamentos(db, { id });
  if (!linha || !(await lojaVisivel(db, ator, linha.establishment_id))) return null;
  const [v] = await montarOrcamentos(db, [linha]);
  return v ?? null;
}

export async function lerOrcamentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<OrcamentoView>> {
  const neg = await exigirUma(db, ator, ["vendedor_da_loja", "dinheiro"], "ver um orçamento");
  if (neg) return neg;
  const limpo = typeof id === "string" ? id.trim() : "";
  if (!limpo) return NAO_ACHADO();
  const v = await orcamentoVisivel(db, ator, limpo);
  return v ? ok(v) : NAO_ACHADO();
}

/** Pelo número impresso (o Caixa digita): o orçamento desta loja, com a visão completa. */
export async function buscarOrcamentoPorNumeroAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishmentId: string,
  numero: number,
): Promise<ActionResult<OrcamentoView>> {
  const neg = await exigirUma(db, ator, ["vendedor_da_loja", "dinheiro"], "buscar um orçamento");
  if (neg) return neg;
  const lojaId = typeof establishmentId === "string" ? establishmentId.trim() : "";
  if (!lojaId || !(await lojaVisivel(db, ator, lojaId))) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }
  if (typeof numero !== "number" || !Number.isInteger(numero) || numero <= 0 || numero > 2_147_483_647) {
    return fail("VALIDATION_ERROR", "Informe o número do orçamento.", 422, "number");
  }
  const [linha] = await buscarOrcamentos(db, { number: numero, establishment_id: lojaId }, 1);
  if (!linha) return fail("QUOTE_NOT_FOUND", "Orçamento não encontrado nesta loja.", 404, "number");
  const [v] = await montarOrcamentos(db, [linha]);
  return ok(v);
}

// ---------------------------------------------------------------------------
// Lista e busca
// ---------------------------------------------------------------------------

export type OrcamentoSituacaoFiltro = "acompanhamento" | "aberto" | "vencido" | "faturado" | "cancelado" | "todos";
const SITUACOES_DO_FILTRO: readonly string[] = ["acompanhamento", "aberto", "vencido", "faturado", "cancelado", "todos"];

export type OrcamentoLinha = {
  id: string;
  number: number;
  numero: string;
  loja: string;
  cliente: string;
  /** Como está no cadastro (pode ter máscara). */
  telefone: string | null;
  valor: number;
  criado_em: string;
  /** AAAA-MM-DD. */
  valid_until: string;
  situacao: "aberto" | "vencido" | "faturado" | "cancelado";
  /** O número da venda ativa que faturou o orçamento. */
  venda_numero: string | null;
  vendedor: string | null;
};

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * A lista de orçamentos das lojas do ator, mais novos primeiro, com busca `q`:
 * só dígitos (1 a 6) também casa o número; 3 ou mais dígitos casam o telefone e o
 * documento do cliente só pelos dígitos (o cadastro pode ter máscara); texto casa
 * o nome sem acento. Sem `situacao`, traz aberto e vencido (o que se acompanha).
 *
 * A comparação por dígitos é feita em memória sobre os clientes que têm orçamento
 * nas lojas e na situação pedidas (id, telefone e documento, nada mais), e não
 * por SQL cru: `$queryRaw` burlaria o escopo por tenant do client.
 */
export async function listarOrcamentosAction(
  db: TenantPrismaClient,
  ator: Ator,
  f: { establishment_id?: string; q?: string; situacao?: OrcamentoSituacaoFiltro; limit?: number } = {},
): Promise<ActionResult<OrcamentoLinha[]>> {
  const neg = await exigir(db, ator, "fora_do_caixa", "ver os orçamentos");
  if (neg) return neg;

  const situacao = f.situacao ?? "acompanhamento";
  if (!SITUACOES_DO_FILTRO.includes(situacao)) {
    return fail("VALIDATION_ERROR", "Escolha a situação: acompanhamento, aberto, vencido, faturado, cancelado ou todos.", 422, "situacao");
  }
  const visiveis = await lojasDoAtor(db, ator);
  const lojaPedida = typeof f.establishment_id === "string" ? f.establishment_id.trim() : "";
  if (lojaPedida && visiveis && !visiveis.has(lojaPedida)) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }

  const hoje = hojeEmBrasilia();
  const base: Record<string, unknown>[] = [];
  if (lojaPedida) base.push({ establishment_id: lojaPedida });
  else if (visiveis) base.push({ establishment_id: { in: [...visiveis] } });
  if (situacao === "faturado") base.push({ sale_id: { not: null } });
  else if (situacao === "cancelado") base.push({ canceled_at: { not: null } });
  else if (situacao !== "todos") base.push({ sale_id: null, canceled_at: null });
  if (situacao === "aberto") base.push({ valid_until: { gte: hoje } });
  if (situacao === "vencido") base.push({ valid_until: { lt: hoje } });

  const q = typeof f.q === "string" ? f.q.trim() : "";
  const filtros: Record<string, unknown>[] = [...base];
  if (q) {
    const temLetra = /\p{L}/u.test(q);
    if (!temLetra) {
      const digitos = soDigitos(q);
      const ou: Record<string, unknown>[] = [];
      if (/^\d{1,6}$/.test(q)) ou.push({ number: Number(q) });
      if (digitos.length >= 3) {
        const candidatos = await db.emporioCustomer.findMany({
          where: { quotes: { some: base.length > 0 ? { AND: base } : {} } },
          select: { id: true, phone: true, document: true },
        });
        const ids = candidatos
          .filter((c) => soDigitos(c.phone).includes(digitos) || soDigitos(c.document).includes(digitos))
          .map((c) => c.id);
        if (ids.length > 0) ou.push({ customer_id: { in: ids } });
      }
      if (ou.length === 0) return ok([]);
      filtros.push({ OR: ou });
    } else {
      const termo = normalizarTermo(q);
      if (!termo) return ok([]);
      filtros.push({ customer: { name_busca: { contains: termo } } });
    }
  }

  const limite = f.limit && f.limit > 0 ? Math.min(Math.floor(f.limit), 500) : 200;
  // Poucas consultas para a lista inteira, nunca uma por orçamento: as linhas com loja,
  // cliente e a venda, e os nomes dos vendedores de uma vez. Sem itens, preço de hoje
  // nem saldo: a lista não precisa deles.
  const linhas = await db.emporioQuote.findMany({
    where: filtros.length > 0 ? { AND: filtros } : {},
    include: {
      establishment: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      sale: { select: { number: true } },
    },
    orderBy: { created_at: "desc" },
    take: limite,
  });
  const idsDeVendedor = [...new Set(linhas.map((l) => l.seller_user_id).filter((x): x is string => !!x))];
  const usuarios =
    idsDeVendedor.length > 0
      ? await db.user.findMany({ where: { id: { in: idsDeVendedor } }, select: { id: true, name: true } })
      : [];
  const nomeDoUsuario = new Map(usuarios.map((u) => [u.id, u.name]));
  const hojeMs = hoje.getTime();
  return ok(
    linhas.map((l) => ({
      id: l.id,
      number: l.number,
      numero: formatarNumero(l.number),
      loja: l.establishment.name,
      cliente: l.customer?.name ?? "",
      telefone: l.customer?.phone ?? null,
      valor: decToNum(l.net_amount) ?? 0,
      criado_em: l.created_at.toISOString(),
      valid_until: l.valid_until.toISOString().slice(0, 10),
      situacao: situacaoDe(l, hojeMs),
      venda_numero: l.sale ? formatarNumero(l.sale.number) : null,
      vendedor: l.seller_user_id ? (nomeDoUsuario.get(l.seller_user_id) ?? null) : null,
    })),
  );
}

// ---------------------------------------------------------------------------
// Salvar
// ---------------------------------------------------------------------------

export type OrcamentoInput = PedidoParaEntregaInput & {
  operation_key: string;
  establishment_id: string;
  /** O cliente do Empório (`EmporioCustomer`); o Consumidor final serve. */
  customer_id?: string | null;
  items: VendaItemInput[];
  /** Quem atendeu: obrigatório para o Caixa, como na venda (Q168, Q169). */
  seller_user_id?: string | null;
  notes?: string | null;
  /** Q286: o orçamento de origem ("novo orçamento a partir deste"); precisa ser visível ao ator. */
  based_on_quote_id?: string | null;
  /** Q309: o franqueado e o crédito dele, digitados (ausentes valem sem crédito; ver `resolverFranqueadoDoCredito`). */
  franchisee_id?: string | null;
  franchisee_credit?: number | null;
};

/** O corpo do orçamento, o mesmo na criação e na edição (Q285): sem chave de operação nem loja. */
export type OrcamentoCorpo = Pick<
  OrcamentoInput,
  "customer_id" | "items" | "seller_user_id" | "notes" | "franchisee_id" | "franchisee_credit"
> &
  PedidoParaEntregaInput;

/**
 * As validações e o preço do orçamento, comuns a salvar e editar: vendedor, cliente
 * (cadastro completo), pedido para entrega, itens e desconto. Não grava nada.
 */
async function prepararCorpo(db: TenantPrismaClient, ator: Ator, loja: { id: string }, input: OrcamentoCorpo) {
  const lojaExtra = await db.establishment.findFirst({
    where: { id: loja.id },
    select: { max_discount_pct: true },
  });

  const vendedor = await resolverVendedor(db, ator, loja.id, input.seller_user_id);
  if (!vendedor.ok) return vendedor;

  // O cliente: o Consumidor final serve; os outros, com o cadastro completo para o tipo
  // (decisão de 06/11: o orçamento deixou de exigir o documento da PF).
  if (input.customer_id == null || input.customer_id === "") return CLIENTE_OBRIGATORIO();
  const cliente = await db.emporioCustomer.findFirst({ where: { id: String(input.customer_id) } });
  if (!cliente || cliente.archived_at) return fail("VALIDATION_ERROR", "Escolha um cliente ativo.", 422, "customer_id");
  const falta = faltaNoCadastro(cliente);
  if (falta) return CLIENTE_INCOMPLETO(falta.message);
  const entrega = resolverPedidoParaEntrega(cliente, input);
  if (!entrega.ok) return entrega;

  const franquia = await resolverFranqueadoDoCredito(db, input.franchisee_id, input.franchisee_credit);
  if (!franquia.ok) return franquia;

  if (!Array.isArray(input.items) || input.items.length === 0) {
    return fail("VALIDATION_ERROR", "Inclua ao menos um item no orçamento.", 422, "items");
  }
  const precificados = await precificarItens(
    db,
    ator,
    { id: loja.id, max_discount_pct: lojaExtra?.max_discount_pct ?? null },
    input.items,
  );
  if (!precificados.ok) return precificados;

  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;
  return ok({
    vendedor: vendedor.data,
    cliente,
    entrega: entrega.data,
    p: precificados.data,
    notes,
    franquia: { franchisee_id: franquia.data.franchisee_id, franchisee_credit: franquia.data.credit_cent / 100 },
  });
}

/** A frase do Histórico: vazia sem crédito. */
const fraseDoCredito = (credito: number): string => (credito > 0 ? `, crédito do franqueado ${dinheiro(credito)}` : "");

export async function salvarOrcamentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: OrcamentoInput,
  /**
   * O relógio interno: o cenário de demonstração grava um orçamento de um dia
   * passado (o vencido). Fora do `input`, a rota nunca o passa.
   */
  opts: { agora?: Date } = {},
): Promise<ActionResult<OrcamentoView & { replayed: boolean }>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "salvar um orçamento");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const resposta = async (id: string, replayed: boolean): Promise<ActionResult<OrcamentoView & { replayed: boolean }>> => {
    const v = await orcamentoVisivel(db, ator, id);
    return v ? ok({ ...v, replayed }) : NAO_ACHADO();
  };

  // Repetir a chave devolve o orçamento gravado, sem escrever nada.
  const repetido = await db.emporioQuote.findFirst({ where: { operation_key: chave }, select: { id: true } });
  if (repetido) return resposta(repetido.id, true);

  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;

  // Q286: a origem precisa ser um orçamento que o ator enxerga.
  let origem: { id: string; number: number } | null = null;
  let corpo: OrcamentoCorpo = input;
  const origemId = typeof input.based_on_quote_id === "string" ? input.based_on_quote_id.trim() : "";
  if (origemId) {
    const o = await db.emporioQuote.findFirst({
      where: { id: origemId },
      select: { id: true, number: true, establishment_id: true, franchisee_id: true, franchisee_credit: true },
    });
    if (!o || !(await lojaVisivel(db, ator, o.establishment_id))) {
      return fail("NOT_FOUND", "Orçamento de origem não encontrado.", 404, "based_on_quote_id");
    }
    origem = { id: o.id, number: o.number };
    // Q286, Q309: o novo orçamento copia o franqueado e o crédito da origem, salvo se o corpo os traz.
    if (input.franchisee_id === undefined && input.franchisee_credit === undefined) {
      corpo = { ...input, franchisee_id: o.franchisee_id, franchisee_credit: decToNum(o.franchisee_credit) ?? 0 };
    }
  }

  const prep = await prepararCorpo(db, ator, loja.data, corpo);
  if (!prep.ok) return prep;
  const { vendedor, cliente, entrega, p, notes, franquia } = prep.data;

  const config = await db.emporioSettings.findFirst({ select: { quote_validity_days: true } });
  const agora = opts.agora ?? new Date();
  const validUntil = somarDias(hojeEmBrasilia(agora), config?.quote_validity_days ?? VALIDADE_PADRAO);

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const numero = await proximoNumero(tx, "orcamento");
      const orcamento = await tx.emporioQuote.create({
        data: scoped({
          establishment_id: loja.data.id,
          operation_key: chave,
          number: numero,
          customer_id: cliente.id,
          seller_user_id: vendedor,
          created_by_user_id: ator.id,
          valid_until: validUntil,
          net_amount: p.total_cent / 100,
          discount_amount: p.desconto_cent / 100,
          discount_authorized_by_user_id: p.autorizou,
          notes,
          ...franquia,
          ...entrega,
          based_on_quote_id: origem?.id ?? null,
          created_at: agora,
        }),
      });
      await tx.emporioQuoteItem.createMany({
        data: p.itens.map((i) =>
          scoped({
            quote_id: orcamento.id,
            emporio_product_id: i.emporio_product_id,
            presentation_id: i.presentation_id,
            quantity: i.quantity,
            suggested_price: i.suggested_cent === null ? null : i.suggested_cent / 100,
            unit_price: i.unit_cent / 100,
            total: i.total_cent / 100,
          }),
        ),
      });
      await registrarNoHistorico(tx, ator, {
        action: "orcamento.criar",
        establishment_id: loja.data.id,
        target_type: "orcamento",
        target_id: orcamento.id,
        summary: `Salvou o orçamento nº ${formatarNumero(numero)} de ${dinheiro(p.total_cent / 100)} para ${cliente.name} na ${loja.data.name} (${frasItens(p.itens.length)})${entrega.for_delivery ? ", para entrega" : ""}${origem ? `, a partir do orçamento nº ${formatarNumero(origem.number)}` : ""}${fraseDoCredito(franquia.franchisee_credit)}`,
      });
      return orcamento.id;
    });
    return await resposta(id, false);
  } catch (err) {
    // A mesma chave em paralelo: a outra gravou enquanto esta corria.
    if (ehErroUnico(err)) {
      const igual = await db.emporioQuote.findFirst({ where: { operation_key: chave }, select: { id: true } });
      if (igual) return resposta(igual.id, true);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Editar e cancelar (Q285 a Q290)
// ---------------------------------------------------------------------------

/** Quem não pode mais mexer no orçamento: faturado ou cancelado. Aberto e vencido passam. */
function recusaDeOrcamentoFechado(v: OrcamentoView): ActionResult<never> | null {
  if (v.situacao === "cancelado") return QUOTE_CANCELED();
  if (v.situacao === "faturado") return QUOTE_ALREADY_INVOICED(v.sale?.numero ?? "");
  return null;
}

/** A corrida perdida: relê o orçamento e diz por que o `updateMany` guardado não pegou. */
async function recusaPorCorrida(
  tx: TenantTransactionClient,
  id: string,
): Promise<ActionResult<never>> {
  const atual = await tx.emporioQuote.findFirst({
    where: { id },
    select: { canceled_at: true, sale: { select: { number: true } } },
  });
  if (atual?.canceled_at) return QUOTE_CANCELED();
  if (atual?.sale) return QUOTE_ALREADY_INVOICED(formatarNumero(atual.sale.number));
  return NAO_ACHADO();
}

/**
 * Q285: editar o orçamento aberto ou vencido, no mesmo número. Regrava cliente, vendedor,
 * itens, desconto, observação e entrega pelas mesmas validações da criação; o preço
 * sugerido de cada item passa a ser o de hoje e a validade é renovada pela regra da Q177.
 * Sem chave de operação: o corpo inteiro regrava o estado, então repetir dá o mesmo.
 */
export async function editarOrcamentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: OrcamentoCorpo,
  opts: { agora?: Date } = {},
): Promise<ActionResult<OrcamentoView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "editar um orçamento");
  if (neg) return neg;
  const limpo = typeof id === "string" ? id.trim() : "";
  if (!limpo) return NAO_ACHADO();
  const antes = await orcamentoVisivel(db, ator, limpo);
  if (!antes) return NAO_ACHADO();
  const fechado = recusaDeOrcamentoFechado(antes);
  if (fechado) return fechado;

  const loja = await acharLojaParaEscrita(db, ator, antes.establishment_id);
  if (!loja.ok) return loja;
  const prep = await prepararCorpo(db, ator, loja.data, input);
  if (!prep.ok) return prep;
  const { vendedor, cliente, entrega, p, notes, franquia } = prep.data;

  const config = await db.emporioSettings.findFirst({ select: { quote_validity_days: true } });
  const agora = opts.agora ?? new Date();
  const validUntil = somarDias(hojeEmBrasilia(agora), config?.quote_validity_days ?? VALIDADE_PADRAO);
  const validadeDepois = validUntil.toISOString().slice(0, 10);

  const recusa = await runSerializableTenantTransaction(db, async (tx) => {
    const gravado = await tx.emporioQuote.updateMany({
      where: { id: limpo, sale_id: null, canceled_at: null },
      data: {
        customer_id: cliente.id,
        seller_user_id: vendedor,
        valid_until: validUntil,
        net_amount: p.total_cent / 100,
        discount_amount: p.desconto_cent / 100,
        discount_authorized_by_user_id: p.autorizou,
        notes,
        ...franquia,
        ...entrega,
      },
    });
    if (gravado.count === 0) return recusaPorCorrida(tx, limpo);
    await tx.emporioQuoteItem.deleteMany({ where: { quote_id: limpo } });
    await tx.emporioQuoteItem.createMany({
      data: p.itens.map((i) =>
        scoped({
          quote_id: limpo,
          emporio_product_id: i.emporio_product_id,
          presentation_id: i.presentation_id,
          quantity: i.quantity,
          suggested_price: i.suggested_cent === null ? null : i.suggested_cent / 100,
          unit_price: i.unit_cent / 100,
          total: i.total_cent / 100,
        }),
      ),
    });
    await registrarNoHistorico(tx, ator, {
      action: "orcamento.editar",
      establishment_id: antes.establishment_id,
      target_type: "orcamento",
      target_id: limpo,
      summary: `Editou o orçamento nº ${antes.numero}: ${frasItens(antes.items.length)} para ${frasItens(p.itens.length)}, total de ${dinheiro(antes.net_amount)} para ${dinheiro(p.total_cent / 100)}, validade de ${dataBr(antes.valid_until)} para ${dataBr(validadeDepois)}${fraseDoCredito(franquia.franchisee_credit)}`,
    });
    return null;
  });
  if (recusa) return recusa;

  const v = await orcamentoVisivel(db, ator, limpo);
  return v ? ok(v) : NAO_ACHADO();
}

/**
 * Q287: cancelar o orçamento aberto ou vencido, com motivo, de forma definitiva. O faturado
 * não se cancela (cancela-se a venda, que reabre o orçamento).
 */
export async function cancelarOrcamentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
  opts: { agora?: Date } = {},
): Promise<ActionResult<OrcamentoView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "cancelar um orçamento");
  if (neg) return neg;
  const limpo = typeof id === "string" ? id.trim() : "";
  if (!limpo) return NAO_ACHADO();
  const motivo = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!motivo) return fail("VALIDATION_ERROR", "Informe o motivo do cancelamento.", 422, "reason");

  const antes = await orcamentoVisivel(db, ator, limpo);
  if (!antes) return NAO_ACHADO();
  if (antes.situacao === "cancelado") return QUOTE_CANCELED("Este orçamento já foi cancelado.");
  if (antes.situacao === "faturado") return QUOTE_ALREADY_INVOICED(antes.sale?.numero ?? "");

  const agora = opts.agora ?? new Date();
  const recusa = await runSerializableTenantTransaction(db, async (tx) => {
    const gravado = await tx.emporioQuote.updateMany({
      where: { id: limpo, sale_id: null, canceled_at: null },
      data: { canceled_at: agora, canceled_by_user_id: ator.id, canceled_reason: motivo },
    });
    if (gravado.count === 0) return recusaPorCorrida(tx, limpo);
    await registrarNoHistorico(tx, ator, {
      action: "orcamento.cancelar",
      establishment_id: antes.establishment_id,
      target_type: "orcamento",
      target_id: limpo,
      summary: `Cancelou o orçamento nº ${antes.numero} de ${dinheiro(antes.net_amount)} (${antes.customer.name}). Motivo: ${motivo}`,
    });
    return null;
  });
  if (recusa) return recusa;

  const v = await orcamentoVisivel(db, ator, limpo);
  return v ? ok(v) : NAO_ACHADO();
}
