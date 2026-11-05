import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, type ActionResult } from "@/lib/actions/types";
import type { Ator } from "@/lib/actions/emporio-catalogo";
import { lerVendaAction } from "@/lib/actions/emporio-vendas";
import { lerEstabelecimentoAction } from "@/lib/actions/emporio-catalogo";
import { lerConfiguracoesAction, type EmporioSettingsView } from "@/lib/actions/emporio-configuracoes";
import { lerOrcamentoAction } from "@/lib/actions/emporio-orcamentos";
import { formatarCep, formatarDocumento } from "@/lib/contatos/cadastro";
import { formatarNumero } from "@/lib/emporio/numeracao";
import { FORMA_ROTULO } from "@/app/(dashboard)/emporio/_components/venda-rotulos";
import { numeroBr } from "@/app/(dashboard)/emporio/_components/formato";

/**
 * Meu Empório, entregas 1 e 4: os dados do papel da venda e do orçamento (A4 e bobina). Só
 * compõe leituras que já respeitam o vínculo de loja; nada é gravado.
 */

export type ImpressoVenda = {
  /** O mesmo papel serve à venda e ao orçamento; o orçamento não tem pagamento, troco nem caixa. */
  tipo: "venda" | "orcamento";
  numero: string;
  emitida_em: string;
  cancelada: boolean;
  loja: {
    nome: string;
    documento: string | null;
    endereco: string | null;
    telefone: string | null;
    whatsapp: string | null;
  };
  tem_logo: boolean;
  logo_updated_at: string | null;
  cliente: { nome: string; documento: string | null; telefone: string | null; endereco: string | null } | null;
  itens: { produto: string; quantidade: string; preco: number; total: number }[];
  subtotal: number;
  desconto: number;
  total: number;
  pagamentos: { forma: string; valor: number }[];
  troco: number | null;
  vendedor: string | null;
  /** `Caixa N (Nome de quem registrou)`; nulo quando a venda não tem turno. */
  caixa: string | null;
  rodape: string | null;
  largura_bobina: 80 | 58;
  /** Orçamento: `dd/mm/aaaa`, o último dia de validade. Nulo na venda. */
  validade: string | null;
  /** Venda faturada de um orçamento: o número dele (6 dígitos). Nulo nos demais. */
  orcamento_origem: string | null;
  /** Orçamento faturado: o número da venda ativa que o faturou (6 dígitos). Nulo nos demais. */
  faturado_na_venda: string | null;
};

/** Junta só as partes preenchidas; tudo vazio vira null (nunca string vazia). */
function linha(partes: (string | null | undefined)[], separador = ", "): string | null {
  const cheias = partes.map((p) => (p ?? "").trim()).filter((p) => p.length > 0);
  return cheias.length > 0 ? cheias.join(separador) : null;
}

const vazioParaNull = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

/** A loja, as configurações e o cliente (nulo no Consumidor final): iguais nos dois papéis. */
async function lerLojaEClienteDoPapel(
  db: TenantPrismaClient,
  ator: Ator,
  establishmentId: string,
  contactId: string | null,
): Promise<
  ActionResult<{ loja: ImpressoVenda["loja"]; cfg: EmporioSettingsView; cliente: ImpressoVenda["cliente"] }>
> {
  const loja = await lerEstabelecimentoAction(db, ator, establishmentId);
  if (!loja.ok) return loja;
  const cfg = await lerConfiguracoesAction(db, ator);
  if (!cfg.ok) return cfg;
  const l = loja.data;

  const contato = contactId
    ? await db.contact.findFirst({
        where: { id: contactId },
        select: {
          name: true,
          system_key: true,
          document: true,
          phone: true,
          city: true,
          address_zip: true,
          address_street: true,
          address_number: true,
          address_complement: true,
          address_district: true,
          address_state: true,
        },
      })
    : null;
  const cliente =
    contato && contato.system_key !== "consumidor_final"
      ? {
          nome: contato.name,
          documento: vazioParaNull(formatarDocumento(contato.document)),
          telefone: vazioParaNull(contato.phone),
          endereco: linha([
            linha([contato.address_street, contato.address_number], ", "),
            contato.address_complement,
            contato.address_district,
            contato.city,
            contato.address_state,
            vazioParaNull(formatarCep(contato.address_zip)),
          ]),
        }
      : null;

  return ok({
    loja: {
      nome: l.name,
      documento: vazioParaNull(formatarDocumento(l.document)),
      endereco: linha([l.address, l.city, l.state, vazioParaNull(formatarCep(l.zip))]),
      telefone: vazioParaNull(l.phone),
      whatsapp: vazioParaNull(l.whatsapp),
    },
    cfg: cfg.data,
    cliente,
  });
}

/**
 * O item com desconto sai no preço sugerido, para o papel fechar: soma(linhas) = subtotal
 * e subtotal - desconto = total. Os demais seguem no praticado. A linha é o total praticado
 * mais o desconto do item, arredondado como a venda o calculou (Q85): arredondar o
 * sugerido x quantidade erraria 1 centavo no granel fracionado.
 */
function itensNoPrecoSugerido(
  linhas: { produto: string; quantity: number; unit_price: number; suggested_price: number | null; total: number }[],
): { itens: ImpressoVenda["itens"]; subtotal: number } {
  const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
  const itens = linhas.map((i) => {
    const comDesconto = i.suggested_price != null && i.unit_price < i.suggested_price;
    const preco = comDesconto ? (i.suggested_price as number) : i.unit_price;
    const total = comDesconto
      ? (centavos(i.total) + centavos((preco - i.unit_price) * i.quantity)) / 100
      : i.total;
    return { produto: i.produto, quantidade: numeroBr(i.quantity), preco, total };
  });
  const subtotal = Math.round(itens.reduce((t, x) => t + Math.round(x.total * 100), 0)) / 100;
  return { itens, subtotal };
}

export async function lerImpressoDaVendaAction(
  db: TenantPrismaClient,
  ator: Ator,
  saleId: string,
): Promise<ActionResult<ImpressoVenda>> {
  const venda = await lerVendaAction(db, ator, saleId);
  if (!venda.ok) return venda;
  const v = venda.data;
  const base = await lerLojaEClienteDoPapel(db, ator, v.establishment_id, v.contact_id);
  if (!base.ok) return base;
  const { loja, cfg, cliente } = base.data;

  const turno = v.cash_session_id
    ? await db.cashSession.findFirst({
        where: { id: v.cash_session_id },
        select: { cash_register: { select: { number: true } } },
      })
    : null;
  const caixa = turno ? `Caixa ${turno.cash_register.number} (${v.sold_by_name ?? "sem nome"})` : null;

  const { itens, subtotal } = itensNoPrecoSugerido(
    v.items.map((i) => ({
      produto: `${i.product_name} (${i.presentation_name})`,
      quantity: i.quantity,
      unit_price: i.unit_price,
      suggested_price: i.suggested_price,
      total: i.total,
    })),
  );
  const pago = v.payments.reduce((t, p) => t + p.amount, 0);
  // So e nao nulo se a soma dos pagamentos passar do total; hoje o dinheiro e gravado sem o valor entregue, entao fica null.
  const troco = Math.round((pago - v.net_amount) * 100) / 100;

  return ok({
    tipo: "venda",
    numero: formatarNumero(v.number),
    emitida_em: v.sold_at,
    cancelada: v.status === "cancelada",
    loja,
    tem_logo: cfg.has_logo,
    logo_updated_at: cfg.logo_updated_at,
    cliente,
    itens,
    subtotal,
    desconto: v.discount_amount,
    total: v.net_amount,
    pagamentos: v.payments.map((p) => ({ forma: FORMA_ROTULO[p.kind] ?? p.kind, valor: p.amount })),
    troco: troco > 0 ? troco : null,
    vendedor: v.seller_name,
    caixa,
    rodape: cfg.sale_footer,
    largura_bobina: cfg.receipt_width,
    validade: null,
    orcamento_origem: v.quote?.numero ?? null,
    faturado_na_venda: null,
  });
}

/**
 * O papel do orçamento: itens no preço sugerido, desconto e total como no orçamento; sem
 * pagamento, troco nem caixa. A leitura do orçamento já recusa quem não alcança a loja (404).
 */
export async function lerImpressoDoOrcamentoAction(
  db: TenantPrismaClient,
  ator: Ator,
  quoteId: string,
): Promise<ActionResult<ImpressoVenda>> {
  const orc = await lerOrcamentoAction(db, ator, quoteId);
  if (!orc.ok) return orc;
  const q = orc.data;
  const base = await lerLojaEClienteDoPapel(db, ator, q.establishment_id, q.contact.id);
  if (!base.ok) return base;
  const { loja, cfg, cliente } = base.data;

  const { itens, subtotal } = itensNoPrecoSugerido(
    q.items.map((i) => ({
      produto: `${i.produto} (${i.apresentacao})`,
      quantity: i.quantity,
      unit_price: i.preco_orcado,
      suggested_price: i.preco_sugerido,
      total: i.total,
    })),
  );
  const [ano, mes, dia] = q.valid_until.split("-");

  return ok({
    tipo: "orcamento",
    numero: q.numero,
    emitida_em: q.created_at,
    cancelada: false,
    loja,
    tem_logo: cfg.has_logo,
    logo_updated_at: cfg.logo_updated_at,
    cliente,
    itens,
    subtotal,
    desconto: q.discount_amount,
    total: q.net_amount,
    pagamentos: [],
    troco: null,
    vendedor: q.seller_name,
    caixa: null,
    rodape: cfg.quote_footer,
    largura_bobina: cfg.receipt_width,
    validade: `${dia}/${mes}/${ano}`,
    orcamento_origem: null,
    faturado_na_venda: q.situacao === "faturado" && q.sale ? q.sale.numero : null,
  });
}
