/**
 * Rótulos do Confinamento, na língua do produtor (fase 3 do Módulo 30, spec
 * docs/superpowers/specs/2026-08-31-confinamento-fase-3-do-modulo-30.md).
 *
 * Compartilhados entre os formulários (opções de Select) e a leitura da
 * página (rótulo do valor cru do banco): um valor de enum sem entrada aqui
 * aparece cru na tela, do jeito que o §2 do documento do cliente proíbe.
 *
 * Só os TIPOS do Prisma entram aqui, e eles somem na compilação: nada do
 * runtime do Prisma vai para o bundle do cliente por causa deste import.
 */

import type {
  ConfinementSiteType,
  HerdChargeType,
  HerdMovementType,
  HerdStayType,
} from "@/generated/prisma/enums";

export const TIPO_SITE_LABEL: Record<ConfinementSiteType, string> = {
  proprio: "Confinamento próprio",
  boitel: "Boitel",
};

/**
 * `Partial`, e de propósito: só os dois tipos de estadia que esta tela mostra.
 * Os outros quatro (`pasto_terceiro`, `evento`, `terceiro_na_fazenda`,
 * `desaparecimento`) nunca chegam aqui, e listá-los seria rótulo morto. O
 * tipo da CHAVE continua valendo, então um valor que não existe no enum é
 * erro de compilação.
 */
export const TIPO_ESTADIA_LABEL: Partial<Record<HerdStayType, string>> = {
  confinamento: "Confinamento próprio",
  boitel: "Boitel",
};

/**
 * ⚠️ Exaustivo, ao contrário dos dois de cima, porque o Select do formulário
 * é montado com `Object.entries(CHARGE_LABEL)`: o que está aqui é o que o
 * produtor pode escolher. Enquanto era `Record<string, string>`, a lista
 * ficou completa e a do SERVIDOR (`HERD_CHARGE_TYPES`) não, então a tela
 * oferecia seis formas e a rota recusava duas com 422.
 */
export const CHARGE_LABEL: Record<HerdChargeType, string> = {
  por_cabeca: "Por cabeça",
  por_mes: "Por mês",
  por_periodo: "Por período",
  fechado: "Valor fechado",
  por_dia: "Por dia",
  por_cabeca_dia: "Por cabeça/dia",
};

/**
 * Os tipos de movimento que aparecem no feed de "últimas movimentações".
 * `Partial` pelo mesmo motivo do `TIPO_ESTADIA_LABEL`: o feed desta tela só
 * mostra estes cinco. A tela de Rebanho, que mostra TODOS, usa um mapa
 * exaustivo (`TIPO_LABEL`, em `rebanho/page.tsx`).
 */
export const MOVIMENTO_LABEL: Partial<Record<HerdMovementType, string>> = {
  envio_confinamento: "Entrada no confinamento",
  envio_boitel: "Entrada no boitel",
  retorno_estadia: "Retorno para o pasto",
  venda: "Venda direto do confinamento",
  morte: "Morte",
};
