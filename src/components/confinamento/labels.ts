/**
 * Rótulos do Confinamento, na língua do produtor (fase 3 do Módulo 30, spec
 * docs/superpowers/specs/2026-08-31-confinamento-fase-3-do-modulo-30.md).
 *
 * Compartilhados entre os formulários (opções de Select) e a leitura da
 * página (rótulo do valor cru do banco): um valor de enum sem entrada aqui
 * aparece cru na tela, do jeito que o §2 do documento do cliente proíbe.
 */

export const TIPO_SITE_LABEL: Record<string, string> = {
  proprio: "Confinamento próprio",
  boitel: "Boitel",
};

export const TIPO_ESTADIA_LABEL: Record<string, string> = {
  confinamento: "Confinamento próprio",
  boitel: "Boitel",
};

export const CHARGE_LABEL: Record<string, string> = {
  por_cabeca: "Por cabeça",
  por_mes: "Por mês",
  por_periodo: "Por período",
  fechado: "Valor fechado",
  por_dia: "Por dia",
  por_cabeca_dia: "Por cabeça/dia",
};

/** Os tipos de movimento que aparecem no feed de "últimas movimentações". */
export const MOVIMENTO_LABEL: Record<string, string> = {
  envio_confinamento: "Entrada no confinamento",
  envio_boitel: "Entrada no boitel",
  retorno_estadia: "Retorno para o pasto",
  venda: "Venda direto do confinamento",
  morte: "Morte",
};
