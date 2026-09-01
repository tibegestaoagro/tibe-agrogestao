import type {
  MilkChargeType,
  MilkDestination,
  MilkMovementType,
  MilkSiteType,
} from "@/generated/prisma/client";

/**
 * Rótulos em português dos enums da fase 2 da Área Leite.
 *
 * `Record<Enum, string>` e NÃO `Record<string, string>`: quando o enum cresce,
 * o `Record<string, ...>` continua compilando e a tela passa a mostrar o nome
 * cru do valor novo. Ver
 * docs/conhecimento/record-string-e-onde-o-enum-cresce-sem-avisar.md.
 */

export const TIPO_LOCAL_LABEL: Record<MilkSiteType, string> = {
  proprio: "Tanque próprio",
  terceiro: "Ponto de coleta",
};

export const MOVIMENTO_LEITE_LABEL: Record<MilkMovementType, string> = {
  entrada_producao: "Entrada da produção",
  entrada_terceiro: "Recebido de terceiro",
  transferencia: "Enviado ao ponto de coleta",
  saida: "Retirada",
  ajuste: "Ajuste",
};

export const DESTINO_LABEL: Record<MilkDestination, string> = {
  venda: "Venda",
  laticinio: "Laticínio",
  cooperativa: "Cooperativa",
  ponto_coleta: "Ponto de coleta",
  fabricacao_propria: "Fabricação própria",
  alimentacao_bezerros: "Alimentação de bezerros",
  consumo: "Consumo",
  descarte: "Descarte",
  doacao: "Doação",
  outro: "Outro",
};

export const COBRANCA_LEITE_LABEL: Record<MilkChargeType, string> = {
  por_litro: "Por litro",
  por_produtor: "Por produtor",
  por_coleta: "Por coleta",
  mensal: "Mensal",
  fixo: "Valor fixo",
  outro: "Outro",
};

/** A ordem em que os destinos aparecem no seletor, do mais comum ao menos. */
export const DESTINOS: MilkDestination[] = [
  "laticinio",
  "cooperativa",
  "venda",
  "ponto_coleta",
  "fabricacao_propria",
  "alimentacao_bezerros",
  "consumo",
  "descarte",
  "doacao",
  "outro",
];

export const FORMAS_DE_COBRANCA: MilkChargeType[] = [
  "por_litro",
  "por_produtor",
  "por_coleta",
  "mensal",
  "fixo",
  "outro",
];
