import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { delegates } from "@/lib/prisma-delegates";
import { exigir } from "@/lib/emporio/papel";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { custoMedio } from "@/lib/emporio/custo-medio";
import { formatarNumero, proximoNumero } from "@/lib/emporio/numeracao";
import { hojeEmBrasilia, somarDias } from "@/lib/emporio/cartao";
import { dinheiro, itens as frasItens, registrarNoHistorico } from "@/lib/emporio/historico";
import { precificarItens, precoQueVale, resolverVendedor, type VendaItemInput } from "@/lib/emporio/precificar";
import { CONSUMIDOR_FINAL, cadastroIncompleto } from "@/lib/contatos/cadastro";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { acharLojaParaEscrita, lerMovimentos } from "@/lib/actions/emporio-estoque";

/**
 * Meu Empório, entrega 4: o orçamento. Salvar não mexe em estoque, caixa nem
 * financeiro: grava o preço e o desconto do momento, pela mesma regra da venda
 * (`precificar.ts`), para um cliente identificado. A situação (aberto, vencido,
 * faturado) é derivada na leitura, nunca gravada. Validação em TypeScript puro,
 * porque o agente do WhatsApp chama sem passar pelo Zod da rota.
 */

const NAO_ACHADO = () => fail("NOT_FOUND", "Orçamento não encontrado.", 404);
const CLIENTE_OBRIGATORIO = () =>
  fail("QUOTE_CUSTOMER_REQUIRED", "O orçamento precisa de um cliente com nome, documento e telefone.", 422, "contact_id");
const CLIENTE_INCOMPLETO = () =>
  fail(
    "QUOTE_CUSTOMER_INCOMPLETE",
    "Complete o cadastro do cliente (nome, documento e telefone) antes de salvar o orçamento.",
    422,
    "contact_id",
  );

const VALIDADE_PADRAO = 7;

const arred3 = (n: number) => Math.round(Number((n * 1000).toPrecision(14))) / 1000;
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

async function lojaVisivel(db: TenantPrismaClient, ator: Ator, lojaId: string): Promise<boolean> {
  const v = await lojasDoAtor(db, ator);
  return !v || v.has(lojaId);
}

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
  /** O preço da apresentação na loja hoje; nulo sem preço. */
  preco_hoje: number | null;
  /** O preço-base que valeria ao faturar hoje (`precoQueVale`). */
  preco_que_vale: number | null;
  mudou: boolean;
  /** Saldo da loja na unidade-base, a soma das movimentações. */
  saldo_base: number;
  /** A quantidade do item, na unidade-base, passa do saldo. */
  falta: boolean;
  total: number;
};

export type OrcamentoView = {
  id: string;
  number: number;
  /** `number` com 6 dígitos, como sai no papel. */
  numero: string;
  establishment_id: string;
  loja: string;
  contact: { id: string; name: string; phone: string | null; document: string | null };
  seller_user_id: string | null;
  seller_name: string | null;
  created_by_name: string | null;
  created_at: string;
  /** AAAA-MM-DD: vale até o fim deste dia em Brasília. */
  valid_until: string;
  situacao: "aberto" | "vencido" | "faturado";
  /** A venda ativa que faturou o orçamento. */
  sale: { id: string; numero: string } | null;
  /** Todas as vendas que saíram dele, canceladas inclusive. */
  vendas: { id: string; numero: string; status: string }[];
  net_amount: number;
  discount_amount: number;
  notes: string | null;
  items: OrcamentoItemView[];
};

const INCLUDE_ORCAMENTO = {
  establishment: { select: { name: true } },
  contact: { select: { id: true, name: true, phone: true, document: true } },
  sale: { select: { id: true, number: true } },
  sales: { select: { id: true, number: true, status: true }, orderBy: { created_at: "asc" } },
  items: {
    include: {
      emporio_product: { select: { product_id: true, product: { select: { name: true } } } },
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
    ...new Set(linhas.flatMap((l) => [l.seller_user_id, l.created_by_user_id]).filter((x): x is string => !!x)),
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
    movsPorChave.set(k, [...(movsPorChave.get(k) ?? []), m]);
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
    const situacao: OrcamentoView["situacao"] = q.sale_id ? "faturado" : vencido ? "vencido" : "aberto";
    const items: OrcamentoItemView[] = q.items.map((i) => {
      const quantity = decToNum(i.quantity) ?? 0;
      const orcado = decToNum(i.unit_price) ?? 0;
      const hojePreco = precoHoje.get(`${q.establishment_id}|${i.presentation_id}`) ?? null;
      const vale = precoQueVale(centavos(orcado), hojePreco === null ? null : centavos(hojePreco), vencido);
      const precoQueValeHoje = vale === null ? null : vale / 100;
      const saldo = saldoDe(q.establishment_id, i.emporio_product.product_id);
      const baseQty = arred3(quantity * (decToNum(i.presentation.base_qty) ?? 0));
      return {
        presentation_id: i.presentation_id,
        emporio_product_id: i.emporio_product_id,
        produto: i.emporio_product.product.name,
        apresentacao: i.presentation.name,
        quantity,
        preco_orcado: orcado,
        preco_hoje: hojePreco,
        preco_que_vale: precoQueValeHoje,
        mudou: precoQueValeHoje !== orcado,
        saldo_base: saldo,
        falta: baseQty > saldo,
        total: decToNum(i.total) ?? 0,
      };
    });
    return {
      id: q.id,
      number: q.number,
      numero: formatarNumero(q.number),
      establishment_id: q.establishment_id,
      loja: q.establishment.name,
      contact: { id: q.contact.id, name: q.contact.name, phone: q.contact.phone, document: q.contact.document },
      seller_user_id: q.seller_user_id,
      seller_name: q.seller_user_id ? (nomeDoUsuario.get(q.seller_user_id) ?? null) : null,
      created_by_name: q.created_by_user_id ? (nomeDoUsuario.get(q.created_by_user_id) ?? null) : null,
      created_at: q.created_at.toISOString(),
      valid_until: q.valid_until.toISOString().slice(0, 10),
      situacao,
      sale: q.sale ? { id: q.sale.id, numero: formatarNumero(q.sale.number) } : null,
      vendas: q.sales.map((s) => ({ id: s.id, numero: formatarNumero(s.number), status: s.status })),
      net_amount: decToNum(q.net_amount) ?? 0,
      discount_amount: decToNum(q.discount_amount) ?? 0,
      notes: q.notes,
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
  const neg = await exigir(db, ator, "vendedor_da_loja", "ver um orçamento");
  if (neg) return neg;
  const limpo = typeof id === "string" ? id.trim() : "";
  if (!limpo) return NAO_ACHADO();
  const v = await orcamentoVisivel(db, ator, limpo);
  return v ? ok(v) : NAO_ACHADO();
}

// ---------------------------------------------------------------------------
// Salvar
// ---------------------------------------------------------------------------

export type OrcamentoInput = {
  operation_key: string;
  establishment_id: string;
  contact_id?: string | null;
  items: VendaItemInput[];
  /** Quem atendeu: obrigatório para o Caixa, como na venda (Q168, Q169). */
  seller_user_id?: string | null;
  notes?: string | null;
};

export async function salvarOrcamentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: OrcamentoInput,
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
  const lojaExtra = await db.establishment.findFirst({
    where: { id: loja.data.id },
    select: { max_discount_pct: true },
  });

  const vendedor = await resolverVendedor(db, ator, loja.data.id, input.seller_user_id);
  if (!vendedor.ok) return vendedor;

  // O cliente: identificado e com cadastro completo; o Consumidor final não serve.
  if (input.contact_id == null || input.contact_id === "") return CLIENTE_OBRIGATORIO();
  const cliente = await db.contact.findFirst({
    where: { id: String(input.contact_id) },
    select: { id: true, name: true, person_kind: true, document: true, phone: true, system_key: true, archived_at: true },
  });
  if (!cliente || cliente.archived_at) return fail("VALIDATION_ERROR", "Escolha um cliente ativo.", 422, "contact_id");
  if (cliente.system_key === CONSUMIDOR_FINAL.system_key) return CLIENTE_OBRIGATORIO();
  if (cadastroIncompleto(cliente)) return CLIENTE_INCOMPLETO();

  if (!Array.isArray(input.items) || input.items.length === 0) {
    return fail("VALIDATION_ERROR", "Inclua ao menos um item no orçamento.", 422, "items");
  }
  const precificados = await precificarItens(
    db,
    ator,
    { id: loja.data.id, max_discount_pct: lojaExtra?.max_discount_pct ?? null },
    input.items,
  );
  if (!precificados.ok) return precificados;
  const p = precificados.data;

  const config = await db.emporioSettings.findFirst({ select: { quote_validity_days: true } });
  const validUntil = somarDias(hojeEmBrasilia(), config?.quote_validity_days ?? VALIDADE_PADRAO);
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const numero = await proximoNumero(tx, "orcamento");
      const orcamento = await tx.emporioQuote.create({
        data: scoped({
          establishment_id: loja.data.id,
          operation_key: chave,
          number: numero,
          contact_id: cliente.id,
          seller_user_id: vendedor.data,
          created_by_user_id: ator.id,
          valid_until: validUntil,
          net_amount: p.total_cent / 100,
          discount_amount: p.desconto_cent / 100,
          discount_authorized_by_user_id: p.autorizou,
          notes,
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
        summary: `Salvou o orçamento nº ${formatarNumero(numero)} de ${dinheiro(p.total_cent / 100)} para ${cliente.name} na ${loja.data.name} (${frasItens(p.itens.length)})`,
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
