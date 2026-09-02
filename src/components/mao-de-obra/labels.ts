import type {
  PayFrequency,
  WorkerEntryKind,
  WorkerStatus,
  WorkerType,
} from "@/generated/prisma/client";

/**
 * Os rótulos em português da Mão de Obra.
 *
 * Todos `Record` completos de propósito: valor novo no enum quebra a compilação
 * até ganhar rótulo. É a mesma trava que fez `laticinio` ser pego em
 * `contact-labels.ts`, e a mesma que o `Record<RelatedModule, string>` de
 * `related-modules.ts` já cobrava depois de "maquinas" ter faltado num dos
 * dois lugares no Módulo 26.
 */

export const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  fixo: "Fixo",
  eventual: "Eventual",
};

export const WORKER_STATUS_LABELS: Record<WorkerStatus, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
};

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  mensal: "Mensal",
  quinzenal: "Quinzenal",
  semanal: "Semanal",
  diaria: "Diária",
  outra: "Outra",
};

/** Como cada frequência é dita numa frase, e não como rótulo de campo. */
export const PAY_FREQUENCY_FRASE: Record<PayFrequency, string> = {
  mensal: "por mês",
  quinzenal: "por quinzena",
  semanal: "por semana",
  diaria: "por dia",
  outra: "por período",
};

export const WORKER_ENTRY_KIND_LABELS: Record<WorkerEntryKind, string> = {
  pagamento: "Pagamento",
  adiantamento: "Adiantamento",
  gratificacao: "Gratificação",
  beneficio: "Benefício",
  outro: "Outro",
};

/** As dez funções do §6. Sugestão na tela: `role` continua texto livre. */
export const FUNCOES_SUGERIDAS = [
  "Vaqueiro",
  "Trabalhador rural",
  "Tratorista",
  "Ordenhador",
  "Gerente",
  "Caseiro",
  "Auxiliar de fazenda",
  "Campeiro",
  "Serviços gerais",
  "Outro",
];

export const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
