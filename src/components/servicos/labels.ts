import type {
  ServiceCostKind,
  ServiceDirection,
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

/**
 * A direção, do ponto de vista do produtor que lê a tela.
 *
 * "Contratei" e "Prestei", não "contratado" e "prestado": na ficha de um
 * contato as duas linhas aparecem lado a lado, e o particípio sozinho não diz
 * de quem foi a máquina. O verbo diz.
 */
export const SERVICE_DIRECTION_LABELS: Record<ServiceDirection, string> = {
  contratado: "Contratei",
  prestado: "Prestei",
};

export const SERVICE_STATUS_LABELS: Record<ServiceJobStatus, string> = {
  agendado: "Agendado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/**
 * As dez naturezas de custo do §21 a §24 (Módulo 34, fase 2). `Record`
 * completo de propósito: valor novo no enum quebra a compilação até ganhar
 * rótulo, a mesma trava que pegou `laticinio` em `contact-labels.ts`.
 */
export const SERVICE_COST_KIND_LABELS: Record<ServiceCostKind, string> = {
  combustivel: "Combustível",
  mao_de_obra: "Mão de obra",
  pedagio: "Pedágio",
  alimentacao: "Alimentação",
  transporte: "Transporte",
  manutencao: "Manutenção",
  pecas: "Peças",
  lubrificantes: "Lubrificantes",
  comissao: "Comissão",
  outro: "Outros",
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

/**
 * Os 21 serviços mecanizados do §5 do documento de Máquinas, sugeridos quando
 * a direção é `prestado`.
 *
 * Lista PRÓPRIA, e não a de cima: "Reforma de cerca" e "Serviço veterinário"
 * não se fazem com trator, e "Terraplanagem" e "Ensilagem" não estão entre os
 * 19 do §20. Oferecer a lista errada faria o produtor digitar tudo à mão
 * justamente na tela nova.
 *
 * ⚠️ Cópia deliberada do `SERVICOS_MECANIZADOS` de `actions/service-jobs.ts`:
 * aquele arquivo importa o Prisma, e importá-lo daqui arrastaria o client do
 * banco para dentro do bundle do navegador. É o mesmo motivo de
 * `SERVICOS_SUGERIDOS` já viver duplicado aqui.
 */
export const SERVICOS_MECANIZADOS = [
  "Gradagem",
  "Aração",
  "Subsolagem",
  "Nivelamento",
  "Plantio",
  "Semeadura",
  "Roçada",
  "Pulverização",
  "Adubação",
  "Aplicação de calcário",
  "Distribuição de fertilizante",
  "Colheita",
  "Ensilagem",
  "Corte de forragem",
  "Transporte",
  "Limpeza de área",
  "Abertura de estrada",
  "Manutenção de estrada",
  "Escavação",
  "Terraplanagem",
  "Outro",
];

export const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export const quantidadeBr = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
