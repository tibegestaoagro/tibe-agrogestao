import type { prisma as PrismaBase } from "@/lib/prisma";
import { VIGENCIA_DESDE_SEMPRE } from "@/lib/emporio/cartao";

/**
 * Apoio dos cenarios e das suites do Meu Emporio: a taxa de cartao da loja na
 * tabela nova (CardAcquirer + CardFeeRate). Roda no client base, fora de
 * sessao, como os cenarios. Nao e suite.
 */

const NOME_ADQUIRENTE = "Maquininha";

type Cliente = Pick<typeof PrismaBase, "cardAcquirer" | "cardFeeRate">;

export async function adquirenteDeCenario(prisma: Cliente, tenant_id: string, user_id?: string) {
  const achada = await prisma.cardAcquirer.findFirst({ where: { tenant_id, name: NOME_ADQUIRENTE } });
  if (achada) return achada;
  return prisma.cardAcquirer.create({ data: { tenant_id, name: NOME_ADQUIRENTE, updated_by_user_id: user_id ?? null } });
}

export async function taxaPadraoDeCenario(
  prisma: Cliente,
  p: {
    tenant_id: string;
    establishment_id: string;
    kind: "debito" | "credito_vista" | "credito_parcelado";
    fee_pct: number;
    days: number;
    bank_account_id: string;
    user_id?: string;
  },
) {
  const adq = await adquirenteDeCenario(prisma, p.tenant_id, p.user_id);
  const installments_from = p.kind === "credito_parcelado" ? 2 : 1;
  const installments_to = p.kind === "credito_parcelado" ? 12 : 1;
  const existente = await prisma.cardFeeRate.findFirst({
    where: {
      tenant_id: p.tenant_id,
      establishment_id: p.establishment_id,
      acquirer_id: adq.id,
      kind: p.kind,
      brand: "qualquer",
      installments_from,
      installments_to,
      valid_to: null,
    },
  });
  const dados = { fee_pct: p.fee_pct, days: p.days, bank_account_id: p.bank_account_id, fee_fixed: 0 };
  if (existente) return prisma.cardFeeRate.update({ where: { id: existente.id }, data: dados });
  return prisma.cardFeeRate.create({
    data: {
      tenant_id: p.tenant_id,
      establishment_id: p.establishment_id,
      acquirer_id: adq.id,
      brand: "qualquer",
      kind: p.kind,
      installments_from,
      installments_to,
      ...dados,
      valid_from: new Date(VIGENCIA_DESDE_SEMPRE),
      valid_to: null,
      updated_by_user_id: p.user_id ?? null,
    },
  });
}

export async function limparTaxasDeCenario(prisma: Cliente, p: { tenant_id: string; establishment_ids: string[] }) {
  await prisma.cardFeeRate.deleteMany({ where: { tenant_id: p.tenant_id, establishment_id: { in: p.establishment_ids } } });
  const adq = await prisma.cardAcquirer.findFirst({ where: { tenant_id: p.tenant_id, name: NOME_ADQUIRENTE } });
  if (adq && (await prisma.cardFeeRate.count({ where: { acquirer_id: adq.id } })) === 0) {
    await prisma.cardAcquirer.delete({ where: { id: adq.id } });
  }
}
