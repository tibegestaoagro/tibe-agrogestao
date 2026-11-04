import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, type ActionResult } from "@/lib/actions/types";
import type { Ator } from "@/lib/actions/emporio-catalogo";
import { lerVendaAction } from "@/lib/actions/emporio-vendas";
import { lerEstabelecimentoAction } from "@/lib/actions/emporio-catalogo";
import { lerConfiguracoesAction } from "@/lib/actions/emporio-configuracoes";
import { formatarCep, formatarDocumento } from "@/lib/contatos/cadastro";
import { formatarNumero } from "@/lib/emporio/numeracao";
import { FORMA_ROTULO } from "@/app/(dashboard)/emporio/_components/venda-rotulos";
import { numeroBr } from "@/app/(dashboard)/emporio/_components/formato";

/**
 * Meu Empório, entrega 1: os dados do papel da venda (A4 e bobina). Só compõe
 * leituras que já respeitam o vínculo de loja; nada é gravado.
 */

export type ImpressoVenda = {
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
  registrada_por: string | null;
  rodape: string | null;
  largura_bobina: 80 | 58;
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

export async function lerImpressoDaVendaAction(
  db: TenantPrismaClient,
  ator: Ator,
  saleId: string,
): Promise<ActionResult<ImpressoVenda>> {
  const venda = await lerVendaAction(db, ator, saleId);
  if (!venda.ok) return venda;
  const v = venda.data;
  const loja = await lerEstabelecimentoAction(db, ator, v.establishment_id);
  if (!loja.ok) return loja;
  const cfg = await lerConfiguracoesAction(db, ator);
  if (!cfg.ok) return cfg;
  const l = loja.data;

  const contato = v.contact_id
    ? await db.contact.findFirst({
        where: { id: v.contact_id },
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

  const vendedor = v.sold_by_user_id
    ? await db.user.findFirst({ where: { id: v.sold_by_user_id }, select: { name: true } })
    : null;

  // O item com desconto sai no preço sugerido, para o papel fechar: soma(linhas) = subtotal
  // e subtotal - desconto = total. Os demais seguem no praticado. A linha é o total praticado
  // mais o desconto do item, arredondado como a venda o calculou (Q85): arredondar o
  // sugerido x quantidade erraria 1 centavo no granel fracionado.
  const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
  const itens = v.items.map((i) => {
    const comDesconto = i.suggested_price != null && i.unit_price < i.suggested_price;
    const preco = comDesconto ? (i.suggested_price as number) : i.unit_price;
    const total = comDesconto
      ? (centavos(i.total) + centavos((preco - i.unit_price) * i.quantity)) / 100
      : i.total;
    return { i, preco, total };
  });
  const subtotal = Math.round(itens.reduce((t, x) => t + Math.round(x.total * 100), 0)) / 100;
  const pago = v.payments.reduce((t, p) => t + p.amount, 0);
  // So e nao nulo se a soma dos pagamentos passar do total; hoje o dinheiro e gravado sem o valor entregue, entao fica null.
  const troco = Math.round((pago - v.net_amount) * 100) / 100;

  return ok({
    numero: formatarNumero(v.number),
    emitida_em: v.sold_at,
    cancelada: v.status === "cancelada",
    loja: {
      nome: l.name,
      documento: vazioParaNull(formatarDocumento(l.document)),
      endereco: linha([l.address, l.city, l.state, vazioParaNull(formatarCep(l.zip))]),
      telefone: vazioParaNull(l.phone),
      whatsapp: vazioParaNull(l.whatsapp),
    },
    tem_logo: cfg.data.has_logo,
    logo_updated_at: cfg.data.logo_updated_at,
    cliente,
    itens: itens.map(({ i, preco, total }) => ({
      produto: `${i.product_name} (${i.presentation_name})`,
      quantidade: numeroBr(i.quantity),
      preco,
      total,
    })),
    subtotal,
    desconto: v.discount_amount,
    total: v.net_amount,
    pagamentos: v.payments.map((p) => ({ forma: FORMA_ROTULO[p.kind] ?? p.kind, valor: p.amount })),
    troco: troco > 0 ? troco : null,
    registrada_por: vendedor?.name ?? null,
    rodape: cfg.data.sale_footer,
    largura_bobina: cfg.data.receipt_width,
  });
}
