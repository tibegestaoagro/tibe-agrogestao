import type { ContactType } from "@/generated/prisma/client";

/**
 * O rótulo de cada tipo de contato, em português.
 *
 * `Record` completo de propósito, pela mesma razão de `TIPOS_COMPLETOS` em
 * `src/lib/actions/contacts.ts`: tipo novo no enum quebra a compilação até
 * ganhar rótulo. Foi assim que `laticinio`, `queijaria` e `mercado` ficaram
 * três semanas invisíveis para a API depois de entrarem no schema.
 */
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  particular: "Particular",
  fazendeiro: "Fazendeiro",
  comerciante_gado: "Comerciante de gado",
  frigorifico: "Frigorífico",
  leilao: "Leilão",
  feira_evento: "Feira ou evento",
  cooperativa: "Cooperativa",
  loja_fornecedor: "Loja ou fornecedor",
  prestador_servico: "Prestador de serviço",
  laticinio: "Laticínio",
  queijaria: "Queijaria",
  mercado: "Mercado",
  outro: "Outro",
};

/**
 * Os tipos de negociação, para o histórico do contato.
 *
 * Mesmo motivo do `Record` acima: o Módulo 31 e a fase 3 do 32 já
 * acrescentaram valores a `NegotiationType` depois de a tela existir.
 */
export const NEGOTIATION_TYPE_LABELS: Record<string, string> = {
  compra_gado: "Compra de gado",
  venda_gado: "Venda de gado",
  compra_produto: "Compra de produto",
  venda_produto: "Venda de produto",
  permuta: "Permuta",
  evento: "Remessa para evento",
  venda_leite: "Venda de leite",
};
