import type {
  ServiceJobStatus,
  ServicePricing,
  WorkerLogKind,
} from "@/generated/prisma/client";

/**
 * Os rótulos em português dos serviços e das anotações.
 *
 * Todos `Record` completos de propósito: valor novo no enum quebra a
 * compilação até ganhar rótulo. É a trava que pegou `laticinio` em
 * `contact-labels.ts`, e a mesma que o `Record<RelatedModule, string>` de
 * `related-modules.ts` cobrava depois de "maquinas" ter faltado no Módulo 26.
 */

export const PRICING_LABELS: Record<ServicePricing, string> = {
  hora: "Por hora",
  hectare: "Por hectare",
  dia: "Por diária",
  viagem: "Por viagem",
  tonelada: "Por tonelada",
  metro: "Por metro",
  quilometro: "Por quilômetro",
  cabeca: "Por cabeça",
  fechado: "Valor fechado",
};

/** A unidade, para o eco do campo de quantidade e para a linha da tabela. */
export const PRICING_UNIDADE: Record<ServicePricing, string> = {
  hora: "horas",
  hectare: "hectares",
  dia: "diárias",
  viagem: "viagens",
  tonelada: "toneladas",
  metro: "metros",
  quilometro: "quilômetros",
  cabeca: "cabeças",
  fechado: "",
};

export const SERVICE_STATUS_LABELS: Record<ServiceJobStatus, string> = {
  agendado: "Agendado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const WORKER_LOG_KIND_LABELS: Record<WorkerLogKind, string> = {
  atividade: "Atividade",
  falta: "Falta",
  folga: "Folga",
  ferias: "Férias",
  afastamento: "Afastamento",
};

/** Os 19 serviços do §20. Sugestão na tela: a descrição continua texto livre. */
export const SERVICOS_SUGERIDOS = [
  "Construção de cerca",
  "Reforma de cerca",
  "Roçada",
  "Gradagem",
  "Aração",
  "Plantio",
  "Adubação",
  "Calagem",
  "Colheita",
  "Silagem",
  "Transporte",
  "Manutenção de máquina",
  "Serviço veterinário",
  "Vacinação",
  "Inseminação",
  "Construção",
  "Eletricista",
  "Limpeza",
  "Outros",
];

export const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export const quantidadeBr = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
