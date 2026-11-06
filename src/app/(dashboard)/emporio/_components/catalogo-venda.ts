import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { garantirConsumidorFinal } from "@/lib/actions/emporio-clientes";
import { faltaNoCadastro } from "@/lib/emporio/cliente-cadastro";
import type { ContatoDeVenda, PrecosVenda, ProdutoVenda } from "./venda-estado";

/**
 * O que a tela de venda precisa saber do catálogo: produtos com apresentação
 * ativa, o preço sugerido de cada apresentação em cada loja, e os clientes do
 * Empório (`EmporioCustomer`).
 * Roda no servidor (leitura direta pelo client escopado, como as outras
 * páginas do Empório); o resultado desce por prop para o formulário.
 */
export async function carregarCatalogoDeVenda(
  db: TenantPrismaClient,
  lojaIds: string[],
): Promise<{ produtos: ProdutoVenda[]; precos: PrecosVenda; contatos: ContatoDeVenda[] }> {
  // Garante o Consumidor final antes de listar: conta nova ainda não tem o cliente fixo.
  const consumidorFinal = await garantirConsumidorFinal(db);
  const [linhas, tabela, contatosDb] = await Promise.all([
    db.emporioProduct.findMany({
      where: { archived_at: null },
      select: {
        id: true,
        base_unit: true,
        manufacturer: true,
        internal_code: true,
        product: { select: { name: true, brand: true } },
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
    db.emporioCustomer.findMany({
      where: { archived_at: null, system_key: null },
      select: {
        id: true, name: true, person_kind: true, document: true, phone: true, address_zip: true, address_street: true,
        address_number: true, address_complement: true, address_district: true, city: true, address_state: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const contatos: ContatoDeVenda[] = [
    { id: consumidorFinal.id, name: consumidorFinal.name, incomplete: false, consumidor_final: true },
    ...contatosDb.map((c) => ({ id: c.id, name: c.name, incomplete: faltaNoCadastro(c) !== null, consumidor_final: false })),
  ];

  const produtos = linhas
    .map((p) => ({
      id: p.id,
      name: p.product.name,
      brand: p.product.brand,
      manufacturer: p.manufacturer,
      internal_code: p.internal_code,
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
