import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarEstabelecimentosAction, type Ator } from "@/lib/actions/emporio-catalogo";

export type LojaDeEtiqueta = { id: string; name: string };

export type ItemDeEtiqueta = {
  id: string;
  produto: string;
  apresentacao: string;
  barcode: string | null;
  /** Preço por loja (só as lojas da pessoa); ausente ou nulo = sem preço. */
  precos: Record<string, number>;
};

/**
 * As lojas em que a pessoa tem a chave `cadastrar_produto`: é o limite da tela
 * de etiquetas e da página de impressão (a mesma conta nos dois lugares).
 */
export async function lojasDeEtiqueta(
  db: TenantPrismaClient,
  user: Ator,
): Promise<LojaDeEtiqueta[]> {
  const papel = await papelDoEmporio(db, user);
  const res = await listarEstabelecimentosAction(db, user);
  if (!res.ok) return [];
  return res.data
    .filter((l) => pode(papel, "chave:cadastrar_produto", l.id))
    .map((l) => ({ id: l.id, name: l.name }));
}

/**
 * Apresentações ativas de produtos ativos, com o preço em cada uma das lojas
 * dadas. `ids` restringe às apresentações pedidas (a página de impressão).
 */
export async function itensDeEtiqueta(
  db: TenantPrismaClient,
  lojaIds: string[],
  ids?: string[],
): Promise<ItemDeEtiqueta[]> {
  const apresentacoes = await db.productPresentation.findMany({
    where: {
      archived_at: null,
      emporio_product: { archived_at: null },
      ...(ids ? { id: { in: ids } } : {}),
    },
    select: {
      id: true,
      name: true,
      barcode: true,
      emporio_product: { select: { product: { select: { name: true } } } },
    },
  });
  const tabela = await db.presentationPrice.findMany({
    where: {
      establishment_id: { in: lojaIds },
      price: { not: null },
      presentation_id: { in: apresentacoes.map((a) => a.id) },
    },
    select: { presentation_id: true, establishment_id: true, price: true },
  });
  const precos = new Map<string, Record<string, number>>();
  for (const p of tabela) {
    const v = decToNum(p.price);
    if (v === null) continue;
    const m = precos.get(p.presentation_id) ?? {};
    m[p.establishment_id] = v;
    precos.set(p.presentation_id, m);
  }
  return apresentacoes
    .map((a) => ({
      id: a.id,
      produto: a.emporio_product.product.name,
      apresentacao: a.name,
      barcode: a.barcode,
      precos: precos.get(a.id) ?? {},
    }))
    .sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR") || a.apresentacao.localeCompare(b.apresentacao, "pt-BR"));
}
