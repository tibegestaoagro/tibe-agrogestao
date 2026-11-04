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

  const subtotal = Math.round(v.items.reduce((t, i) => t + i.total, 0) * 100) / 100;
  const pago = v.payments.reduce((t, p) => t + p.amount, 0);
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
    cliente,
    itens: v.items.map((i) => ({
      produto: `${i.product_name} (${i.presentation_name})`,
      quantidade: numeroBr(i.quantity),
      preco: i.unit_price,
      total: i.total,
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
