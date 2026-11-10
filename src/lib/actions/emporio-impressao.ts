import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, type ActionResult } from "@/lib/actions/types";
import type { Ator } from "@/lib/actions/emporio-catalogo";
import { lerVendaAction } from "@/lib/actions/emporio-vendas";
import { lerEstabelecimentoAction } from "@/lib/actions/emporio-catalogo";
import { lerConfiguracoesAction, type EmporioSettingsView } from "@/lib/actions/emporio-configuracoes";
import { lerOrcamentoAction } from "@/lib/actions/emporio-orcamentos";
import type { OrigemDaVenda } from "@/lib/emporio/frete";
import { CONSUMIDOR_FINAL, formatarCep, formatarDocumento } from "@/lib/contatos/cadastro";
import { ehConsumidorFinal } from "@/lib/emporio/cliente-cadastro";
import { formatarNumero } from "@/lib/emporio/numeracao";
import { pesoTotal } from "@/lib/emporio/peso";
import { ROTULO_DA_BANDEIRA, type Bandeira } from "@/lib/emporio/cartao";
import { FORMA_ROTULO } from "@/app/(dashboard)/emporio/_components/venda-rotulos";
import { numeroBr } from "@/app/(dashboard)/emporio/_components/formato";
import { enderecoDasColunas, linhaDoEndereco, type PedidoParaEntregaColunas } from "@/lib/emporio/pedido-para-entrega";

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
  itens: { produto: string; quantidade: string; peso_kg: number | null; preco: number; total: number }[];
  /** Q291: soma dos pesos; nulo quando nenhum item tem peso (o papel não mostra a linha). */
  peso_total_kg: number | null;
  itens_sem_peso: number;
  subtotal: number;
  desconto: number;
  /** Frete cobrado do cliente (Q244); 0 sem frete e no orçamento. */
  frete: number;
  /** Itens mais frete: o que o cliente paga. */
  total: number;
  origem: OrigemDaVenda;
  /** `bandeira` e `adquirente` só nos pagamentos de cartão com a tabela de taxas (Q254). */
  pagamentos: { forma: string; valor: number; bandeira: string | null; adquirente: string | null }[];
  troco: number | null;
  vendedor: string | null;
  /** A observação digitada no balcão ou no orçamento; nula quando vazia. */
  observacoes: string | null;
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
  /** D8: o pedido é para entrega (a cópia gravada no pedido, nunca o cadastro de agora). */
  pedido_para_entrega: boolean;
  /** Uma linha, só quando o pedido é para entrega. */
  endereco_de_entrega: string | null;
};

/** O romaneio: a lista de separação da venda. Sem nenhum valor em dinheiro (D7). */
export type RomaneioView = {
  numero: string;
  emitida_em: string;
  situacao: "ativa" | "cancelada" | "trocada" | "devolvida";
  orcamento_origem: string | null;
  loja: ImpressoVenda["loja"];
  tem_logo: boolean;
  logo_updated_at: string | null;
  cliente: { nome: string; telefone: string | null; documento: string | null };
  pedido_para_entrega: boolean;
  endereco_de_entrega: string | null;
  itens: { produto: string; apresentacao: string; quantidade: string; peso_kg: number | null }[];
  /** Q291: soma dos pesos; nulo quando nenhum item tem peso. */
  peso_total_kg: number | null;
  itens_sem_peso: number;
  linhas: number;
  observacoes: string | null;
  vendedor: string | null;
  caixa: string | null;
  largura_bobina: 80 | 58;
};

const enderecoDoPedido = (p: PedidoParaEntregaColunas): string | null => linhaDoEndereco(enderecoDasColunas(p));

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
  customerId: string | null,
): Promise<
  ActionResult<{ loja: ImpressoVenda["loja"]; cfg: EmporioSettingsView; cliente: ImpressoVenda["cliente"] }>
> {
  const loja = await lerEstabelecimentoAction(db, ator, establishmentId);
  if (!loja.ok) return loja;
  const cfg = await lerConfiguracoesAction(db, ator);
  if (!cfg.ok) return cfg;
  const l = loja.data;

  const contato = customerId
    ? await db.emporioCustomer.findFirst({
        where: { id: customerId },
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
    contato && !ehConsumidorFinal(contato)
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
  linhas: {
    produto: string;
    quantity: number;
    unit_price: number;
    suggested_price: number | null;
    total: number;
    peso_kg: number | null;
  }[],
): { itens: ImpressoVenda["itens"]; subtotal: number } {
  const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
  const itens = linhas.map((i) => {
    const comDesconto = i.suggested_price != null && i.unit_price < i.suggested_price;
    const preco = comDesconto ? (i.suggested_price as number) : i.unit_price;
    const total = comDesconto
      ? (centavos(i.total) + centavos((preco - i.unit_price) * i.quantity)) / 100
      : i.total;
    return { produto: i.produto, quantidade: numeroBr(i.quantity), peso_kg: i.peso_kg, preco, total };
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
  const base = await lerLojaEClienteDoPapel(db, ator, v.establishment_id, v.customer_id);
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
      peso_kg: i.weight_kg,
    })),
  );
  const pesos = pesoTotal(itens.map((i) => i.peso_kg));
  const pago = v.payments.reduce((t, p) => t + p.amount, 0);
  // So e nao nulo se a soma dos pagamentos passar do total; hoje o dinheiro e gravado sem o valor entregue, entao fica null.
  const troco = Math.round((pago - v.total_amount) * 100) / 100;

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
    peso_total_kg: pesos.total_kg,
    itens_sem_peso: pesos.sem_peso,
    subtotal,
    desconto: v.discount_amount,
    frete: v.freight_amount,
    total: v.total_amount,
    origem: v.origin,
    pagamentos: v.payments.map((p) => ({
      forma: formaNoPapel(p),
      valor: p.amount,
      bandeira: p.brand ? (ROTULO_DA_BANDEIRA[p.brand as Bandeira] ?? null) : null,
      adquirente: p.acquirer_name,
    })),
    troco: troco > 0 ? troco : null,
    vendedor: v.seller_name,
    observacoes: v.notes?.trim() || null,
    caixa,
    rodape: cfg.sale_footer,
    largura_bobina: cfg.receipt_width,
    validade: null,
    orcamento_origem: v.quote?.numero ?? null,
    faturado_na_venda: null,
    pedido_para_entrega: v.for_delivery,
    endereco_de_entrega: enderecoDoPedido(colunasDe(v)),
  });
}

/**
 * A forma de pagamento como sai no papel. O boleto (Q278) e o titular do cheque (Q284) vão na
 * própria linha, porque o papel só tem a forma e o valor. O rótulo do boleto é local: o mapa da tela não o tem.
 */
function formaNoPapel(p: {
  kind: string;
  check: { holder_name: string } | null;
  boleto: { due_on: string; number: string | null } | null;
}): string {
  if (p.kind === "boleto") {
    const vence = p.boleto ? `, vence ${p.boleto.due_on.slice(0, 10).split("-").reverse().join("/")}` : "";
    const numero = p.boleto?.number ? `, nº ${p.boleto.number}` : "";
    return `Boleto${vence}${numero}`;
  }
  const rotulo = FORMA_ROTULO[p.kind] ?? p.kind;
  return p.kind === "cheque" && p.check?.holder_name ? `${rotulo}, em nome de ${p.check.holder_name}` : rotulo;
}

/** A visão traz o endereço já montado; a regra da linha pede as colunas. */
function colunasDe(p: {
  for_delivery: boolean;
  delivery_address_kind: PedidoParaEntregaColunas["delivery_address_kind"];
  delivery_address: { zip: string | null; street: string | null; number: string | null; complement: string | null; district: string | null; city: string | null; state: string | null } | null;
}): PedidoParaEntregaColunas {
  const e = p.delivery_address;
  return {
    for_delivery: p.for_delivery,
    delivery_address_kind: p.delivery_address_kind,
    delivery_zip: e?.zip ?? null, delivery_street: e?.street ?? null, delivery_number: e?.number ?? null,
    delivery_complement: e?.complement ?? null, delivery_district: e?.district ?? null,
    delivery_city: e?.city ?? null, delivery_state: e?.state ?? null,
  };
}

/**
 * O romaneio da venda: o que separar e entregar, sem preço, desconto nem pagamento. A leitura
 * da venda já recusa quem não alcança a loja (404).
 */
export async function lerRomaneioDaVendaAction(
  db: TenantPrismaClient,
  ator: Ator,
  saleId: string,
): Promise<ActionResult<RomaneioView>> {
  const venda = await lerVendaAction(db, ator, saleId);
  if (!venda.ok) return venda;
  const v = venda.data;
  const base = await lerLojaEClienteDoPapel(db, ator, v.establishment_id, v.customer_id);
  if (!base.ok) return base;
  const { loja, cfg, cliente } = base.data;

  const turno = v.cash_session_id
    ? await db.cashSession.findFirst({
        where: { id: v.cash_session_id },
        select: { cash_register: { select: { number: true } } },
      })
    : null;
  const situacao: RomaneioView["situacao"] =
    v.status === "cancelada"
      ? "cancelada"
      : v.returns.some((r) => r.exchange_sale_id)
        ? "trocada"
        : v.returns.length > 0
          ? "devolvida"
          : "ativa";

  return ok({
    numero: formatarNumero(v.number),
    emitida_em: v.sold_at,
    situacao,
    orcamento_origem: v.quote?.numero ?? null,
    loja,
    tem_logo: cfg.has_logo,
    logo_updated_at: cfg.logo_updated_at,
    cliente: cliente
      ? { nome: cliente.nome, telefone: cliente.telefone, documento: cliente.documento }
      : { nome: CONSUMIDOR_FINAL.name, telefone: null, documento: null },
    pedido_para_entrega: v.for_delivery,
    endereco_de_entrega: enderecoDoPedido(colunasDe(v)),
    itens: v.items.map((i) => ({
      produto: i.product_name,
      apresentacao: i.presentation_name,
      quantidade: numeroBr(i.quantity),
      peso_kg: i.weight_kg,
    })),
    peso_total_kg: v.total_weight_kg,
    itens_sem_peso: v.items_without_weight,
    linhas: v.items.length,
    observacoes: v.notes,
    vendedor: v.seller_name,
    caixa: turno ? `Caixa ${turno.cash_register.number} (${v.sold_by_name ?? "sem nome"})` : null,
    largura_bobina: cfg.receipt_width,
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
  const base = await lerLojaEClienteDoPapel(db, ator, q.establishment_id, q.customer.id);
  if (!base.ok) return base;
  const { loja, cfg, cliente } = base.data;

  const { itens, subtotal } = itensNoPrecoSugerido(
    q.items.map((i) => ({
      produto: `${i.produto} (${i.apresentacao})`,
      quantity: i.quantity,
      unit_price: i.preco_orcado,
      suggested_price: i.preco_sugerido,
      total: i.total,
      peso_kg: i.peso_kg,
    })),
  );
  const pesos = pesoTotal(itens.map((i) => i.peso_kg));
  const [ano, mes, dia] = q.valid_until.split("-");

  return ok({
    tipo: "orcamento",
    numero: q.numero,
    emitida_em: q.created_at,
    cancelada: q.situacao === "cancelado",
    loja,
    tem_logo: cfg.has_logo,
    logo_updated_at: cfg.logo_updated_at,
    cliente,
    itens,
    peso_total_kg: pesos.total_kg,
    itens_sem_peso: pesos.sem_peso,
    subtotal,
    desconto: q.discount_amount,
    frete: 0,
    total: q.net_amount,
    origem: "balcao",
    pagamentos: [],
    troco: null,
    vendedor: q.seller_name,
    observacoes: q.notes?.trim() || null,
    caixa: null,
    rodape: cfg.quote_footer,
    largura_bobina: cfg.receipt_width,
    validade: `${dia}/${mes}/${ano}`,
    orcamento_origem: null,
    faturado_na_venda: q.situacao === "faturado" && q.sale ? q.sale.numero : null,
    pedido_para_entrega: q.for_delivery,
    endereco_de_entrega: enderecoDoPedido(colunasDe(q)),
  });
}
