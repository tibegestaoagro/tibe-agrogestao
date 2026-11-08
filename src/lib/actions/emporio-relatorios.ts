import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigirUma } from "@/lib/emporio/papel";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { valorDevolvidoDoItemCent } from "@/lib/actions/emporio-resultado";

/**
 * Meu Empório, entrega 3: o relatório de vendas por vendedor, por produto, os
 * produtos parados e o resumo por loja.
 *
 * Calculado na leitura, como o Resultado: nada é gravado. O período é de dias
 * de Brasília (UTC-3 fixo), os dois extremos inclusivos. A quantidade conta as
 * vendas concluídas, menos a venda nova da troca (não é atendimento novo); o
 * total soma o líquido das concluídas (a da troca inclusa) e desconta o
 * devolvido no período, que vai ao vendedor e à loja da venda ORIGINAL, mesmo
 * que ela seja de antes do período. Por isso o total pode ficar negativo.
 */

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const reais = (cent: number) => Math.round(cent) / 100;
const DIA_MS = 86_400_000;
const TRES_HORAS = 3 * 3_600_000;
const MAX_DIAS = 366;

export type RelatorioDeVendasInput = { from: string; to: string; establishment_id?: string };

export type RelatorioDeVendas = {
  periodo: { from: string; to: string };
  lojas: { id: string; name: string }[];
  por_vendedor: {
    seller_user_id: string | null;
    name: string;
    sales_count: number;
    total: number;
    average_ticket: number | null;
  }[];
  por_produto: { emporio_product_id: string; name: string; base_unit: string; quantity: number; total: number }[];
  parados: { emporio_product_id: string; name: string; establishment_id: string; establishment_name: string }[];
  por_loja: { establishment_id: string; name: string; sales_count: number; total: number; average_ticket: number | null }[];
};

/** "AAAA-MM-DD" -> meia-noite UTC do dia; `null` se não for um dia que existe. */
function lerDia(texto: unknown): number | null {
  if (typeof texto !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 2000 || ano > 2200) return null;
  const t = Date.UTC(ano, mes - 1, dia);
  const d = new Date(t);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return t;
}

type Soma = { count: number; cent: number };
const ticket = (s: Soma) => (s.count > 0 ? reais(Math.round(s.cent / s.count)) : null);

export async function relatorioDeVendasAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: RelatorioDeVendasInput,
): Promise<ActionResult<RelatorioDeVendas>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "ver os relatórios");
  if (neg) return neg;

  const de = lerDia(input?.from);
  if (de === null) return fail("VALIDATION_ERROR", "Informe a data inicial no formato AAAA-MM-DD.", 422, "from");
  const ate = lerDia(input?.to);
  if (ate === null) return fail("VALIDATION_ERROR", "Informe a data final no formato AAAA-MM-DD.", 422, "to");
  if (ate < de) return fail("VALIDATION_ERROR", "A data final não pode ser antes da inicial.", 422, "to");
  if ((ate - de) / DIA_MS + 1 > MAX_DIAS) return fail("VALIDATION_ERROR", "O período vai até 366 dias.", 422, "to");
  const janela = { gte: new Date(de + TRES_HORAS), lt: new Date(ate + DIA_MS + TRES_HORAS) };

  // As lojas do relatório: a pedida (mesmo arquivada), ou todas as não arquivadas que o ator vê.
  const visiveis = await lojasDoAtor(db, ator);
  const lojaId = typeof input?.establishment_id === "string" ? input.establishment_id.trim() : "";
  let lojas: { id: string; name: string }[];
  if (lojaId) {
    const loja = await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true, name: true } });
    if (!loja || (visiveis && !visiveis.has(lojaId))) {
      return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
    }
    lojas = [loja];
  } else {
    lojas = await db.establishment.findMany({
      where: { archived_at: null, ...(visiveis ? { id: { in: [...visiveis] } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
  const lojaIds = lojas.map((l) => l.id);
  const periodo = { from: String(input.from).trim(), to: String(input.to).trim() };
  if (lojaIds.length === 0) return ok({ periodo, lojas, por_vendedor: [], por_produto: [], parados: [], por_loja: [] });

  const vendas = await db.emporioSale.findMany({
    where: { establishment_id: { in: lojaIds }, status: "concluida", sold_at: janela },
    select: {
      establishment_id: true,
      seller_user_id: true,
      net_amount: true,
      exchange_return_id: true,
      items: { select: { emporio_product_id: true, base_qty: true, total: true } },
    },
  });
  const devolucoes = await db.emporioSaleReturn.findMany({
    where: { returned_at: janela, sale: { establishment_id: { in: lojaIds }, status: "concluida" } },
    select: {
      sale: { select: { establishment_id: true, seller_user_id: true } },
      items: {
        select: {
          quantity: true,
          base_qty: true,
          sale_item: { select: { emporio_product_id: true, quantity: true, total: true } },
        },
      },
    },
  });

  const porVendedor = new Map<string | null, Soma>();
  const porLoja = new Map<string, Soma>(lojaIds.map((id) => [id, { count: 0, cent: 0 }]));
  const porProduto = new Map<string, { qty: number; cent: number }>();
  const vendidoNaLoja = new Set<string>();
  const soma = <K>(m: Map<K, Soma>, k: K) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = { count: 0, cent: 0 }));
    return s;
  };
  const produto = (id: string) => {
    let p = porProduto.get(id);
    if (!p) porProduto.set(id, (p = { qty: 0, cent: 0 }));
    return p;
  };

  for (const v of vendas) {
    const cent = centavos(decToNum(v.net_amount) ?? 0);
    const conta = v.exchange_return_id ? 0 : 1;
    for (const s of [soma(porVendedor, v.seller_user_id), soma(porLoja, v.establishment_id)]) {
      s.count += conta;
      s.cent += cent;
    }
    for (const i of v.items) {
      const p = produto(i.emporio_product_id);
      p.qty += decToNum(i.base_qty) ?? 0;
      p.cent += centavos(decToNum(i.total) ?? 0);
      vendidoNaLoja.add(`${i.emporio_product_id}@${v.establishment_id}`);
    }
  }
  for (const d of devolucoes) {
    let devolvido = 0;
    for (const i of d.items) {
      const valor = valorDevolvidoDoItemCent(i);
      devolvido += valor;
      const p = produto(i.sale_item.emporio_product_id);
      p.qty -= decToNum(i.base_qty) ?? 0;
      p.cent -= valor;
    }
    soma(porVendedor, d.sale.seller_user_id).cent -= devolvido;
    soma(porLoja, d.sale.establishment_id).cent -= devolvido;
  }

  // Nomes: o vendedor desativado continua com o nome dele.
  const sellerIds = [...porVendedor.keys()].filter((id): id is string => id !== null);
  const usuarios =
    sellerIds.length === 0
      ? []
      : await db.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } });
  const nomeDe = new Map(usuarios.map((u) => [u.id, u.name]));
  const porNome = (a: { total: number; name: string }, b: { total: number; name: string }) =>
    b.total - a.total || a.name.localeCompare(b.name, "pt-BR");

  const por_vendedor = [...porVendedor.entries()]
    .map(([id, s]) => ({
      seller_user_id: id,
      name: id === null ? "Sem vendedor" : (nomeDe.get(id) ?? "Usuário removido"),
      sales_count: s.count,
      total: reais(s.cent),
      average_ticket: ticket(s),
    }))
    .sort(porNome);

  const por_loja = lojas
    .map((l) => {
      const s = porLoja.get(l.id) as Soma;
      return { establishment_id: l.id, name: l.name, sales_count: s.count, total: reais(s.cent), average_ticket: ticket(s) };
    })
    .sort(porNome);

  const produtos =
    porProduto.size === 0
      ? []
      : await db.emporioProduct.findMany({
          where: { id: { in: [...porProduto.keys()] } },
          select: { id: true, base_unit: true, product: { select: { name: true } } },
        });
  const por_produto = produtos
    .map((p) => {
      const a = porProduto.get(p.id) as { qty: number; cent: number };
      return {
        emporio_product_id: p.id,
        name: p.product.name,
        base_unit: p.base_unit,
        quantity: Math.round(a.qty * 1000) / 1000,
        total: reais(a.cent),
      };
    })
    .sort(porNome);

  // Parados: produto não arquivado com preço numa apresentação ativa da loja, e nada vendido nela no período.
  const precos = await db.presentationPrice.findMany({
    where: {
      establishment_id: { in: lojaIds },
      price: { not: null },
      presentation: { archived_at: null, emporio_product: { archived_at: null } },
    },
    select: {
      establishment_id: true,
      presentation: { select: { emporio_product: { select: { id: true, product: { select: { name: true } } } } } },
    },
  });
  const nomeDaLoja = new Map(lojas.map((l) => [l.id, l.name]));
  const parados = new Map<string, RelatorioDeVendas["parados"][number]>();
  for (const p of precos) {
    const prod = p.presentation.emporio_product;
    const chave = `${prod.id}@${p.establishment_id}`;
    if (vendidoNaLoja.has(chave) || parados.has(chave)) continue;
    parados.set(chave, {
      emporio_product_id: prod.id,
      name: prod.product.name,
      establishment_id: p.establishment_id,
      establishment_name: nomeDaLoja.get(p.establishment_id) ?? "",
    });
  }

  return ok({
    periodo,
    lojas,
    por_vendedor,
    por_produto,
    parados: [...parados.values()].sort(
      (a, b) =>
        a.establishment_name.localeCompare(b.establishment_name, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"),
    ),
    por_loja,
  });
}
