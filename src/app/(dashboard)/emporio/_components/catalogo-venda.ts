import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import type { PrecosVenda, ProdutoVenda } from "./venda-estado";

/**
 * O que a tela de venda precisa saber do catálogo: produtos com apresentação
 * ativa, o preço sugerido de cada apresentação em cada loja, e os clientes.
 * Roda no servidor (leitura direta pelo client escopado, como as outras
 * páginas do Empório); o resultado desce por prop para o formulário.
 */
export async function carregarCatalogoDeVenda(
  db: TenantPrismaClient,
  lojaIds: string[],
): Promise<{ produtos: ProdutoVenda[]; precos: PrecosVenda; contatos: { id: string; name: string }[] }> {
  const [linhas, tabela, contatos] = await Promise.all([
    db.emporioProduct.findMany({
      where: { archived_at: null },
      select: {
        id: true,
        base_unit: true,
        product: { select: { name: true } },
        presentations: {
          where: { archived_at: null },
          select: { id: true, name: true, base_qty: true, is_sealed_package: true },
          orderBy: { name: "asc" },
        },
      },
    }),
    db.presentationPrice.findMany({
      where: { establishment_id: { in: lojaIds }, price: { not: null } },
      select: { presentation_id: true, establishment_id: true, price: true },
    }),
    db.contact.findMany({ where: { archived_at: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const produtos = linhas
    .map((p) => ({
      id: p.id,
      name: p.product.name,
      base_unit: p.base_unit,
      apresentacoes: p.presentations.map((a) => ({
        id: a.id,
        name: a.name,
        base_qty: decToNum(a.base_qty) ?? 0,
        lacrada: a.is_sealed_package,
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const precos: PrecosVenda = {};
  for (const p of tabela) {
    const valor = decToNum(p.price);
    if (valor === null) continue;
    (precos[p.presentation_id] ??= {})[p.establishment_id] = valor;
  }
  return { produtos, precos, contatos };
}
