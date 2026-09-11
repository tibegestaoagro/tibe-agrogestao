/**
 * Catálogo das 22 ferramentas da "Calculadora Pecuária" (12 da Onda 3, mais as
 * dez do Módulo 37).
 * Fonte única: antes vivia hand-rolled dentro de `/calculadoras/page.tsx`;
 * extraído pra ser reusado também na grade embutida no dashboard (briefing
 * de layout, Fase 2) sem duplicar a lista (mesma lição de
 * `RelatedModule`/`MODULE_LABEL` já registrada no projeto).
 */
export type IconKey =
  | "fence"
  | "sprout"
  | "beef"
  | "container"
  | "package"
  | "wheat"
  | "droplet"
  | "box"
  | "leaf"
  | "mountain"
  | "user"
  | "tractor";

/**
 * Os cinco grupos do §47: a tela pergunta "o que voce quer calcular?" e
 * agrupa por necessidade, nao por ordem de criacao. Com 22 ferramentas, uma
 * lista corrida vira parede.
 */
export const GRUPOS = ["Pastagem", "Animais", "Alimentacao", "Estrutura", "Custos"] as const;

export type Grupo = (typeof GRUPOS)[number];

export type Calculadora = {
  href: string;
  title: string;
  description: string;
  icon: IconKey;
  grupo: Grupo;
};

export const CALCULADORAS: Calculadora[] = [
  { href: "/calculadoras/cerca", title: "Cerca", description: "Mourões e arame necessários para uma cerca.", grupo: "Estrutura", icon: "fence" },
  {
    href: "/calculadoras/pastagem",
    title: "Pastagem",
    description: "Capacidade de suporte da pastagem e área necessária para o rebanho.",
    grupo: "Pastagem", icon: "sprout",
  },
  {
    href: "/calculadoras/compra-venda-gado",
    title: "Compra e venda de gado (simulação)",
    description: "Simulação de arrobas e margem: não integra com o rebanho real.",
    grupo: "Animais", icon: "beef",
  },
  {
    href: "/calculadoras/lotacao",
    title: "Lotação",
    description: "Taxa de lotação atual (UA/ha) do rebanho numa área.",
    grupo: "Pastagem", icon: "container",
  },
  {
    href: "/calculadoras/sal-mineral",
    title: "Sal mineral",
    description: "Consumo estimado de sal mineral por animal e por período.",
    grupo: "Alimentacao", icon: "package",
  },
  {
    href: "/calculadoras/racao",
    title: "Ração / volumoso",
    description: "Necessidade diária de matéria seca e de alimento in natura.",
    grupo: "Alimentacao", icon: "wheat",
  },
  { href: "/calculadoras/agua", title: "Água", description: "Consumo estimado de água do rebanho.", grupo: "Animais", icon: "droplet" },
  {
    href: "/calculadoras/cocho",
    title: "Cocho (sal mineral)",
    description: "Comprimento de cocho necessário para o rebanho.",
    grupo: "Estrutura", icon: "box",
  },
  {
    href: "/calculadoras/adubacao",
    title: "Adubação",
    description: "Converte uma dose recomendada de nutriente em quantidade de adubo a comprar.",
    grupo: "Pastagem", icon: "leaf",
  },
  {
    href: "/calculadoras/calagem",
    title: "Calagem",
    description: "Necessidade de calcário pelo método da saturação por bases.",
    grupo: "Pastagem", icon: "mountain",
  },
  {
    href: "/calculadoras/mao-de-obra",
    title: "Mão de obra",
    description: "Quantos funcionários são necessários, a partir da capacidade da sua operação.",
    grupo: "Custos", icon: "user",
  },
  {
    href: "/calculadoras/maquinas-combustivel",
    title: "Máquinas e combustível",
    description: "Total de combustível e custo, a partir do consumo da sua máquina.",
    grupo: "Custos", icon: "tractor",
  },
  {
    href: "/calculadoras/sementes",
    title: "Sementes",
    description: "Quanta semente comprar para formar ou reformar uma pastagem, e quantas sacas isso dá.",
    grupo: "Pastagem",
    icon: "sprout",
  },
  {
    href: "/calculadoras/piquetes",
    title: "Piquetes",
    description: "Em quantos piquetes dividir a área para pastejo rotacionado.",
    grupo: "Pastagem",
    icon: "leaf",
  },
  {
    href: "/calculadoras/receitas",
    title: "Receitas e misturas",
    description: "Quanto de cada ingrediente entra na quantidade que você quer fazer.",
    grupo: "Alimentacao",
    icon: "wheat",
  },
  {
    href: "/calculadoras/reservatorio",
    title: "Reservatório de água",
    description: "Quanto armazenar para o rebanho aguentar os dias de reserva que você escolher.",
    grupo: "Estrutura",
    icon: "droplet",
  },
  {
    href: "/calculadoras/ganho-de-peso",
    title: "Ganho de peso",
    description: "Quantos dias faltam para o animal chegar ao peso que você quer.",
    grupo: "Animais",
    icon: "beef",
  },
  {
    href: "/calculadoras/custo-de-mao-de-obra",
    title: "Custo de mão de obra",
    description: "Quanto custa um serviço por diária, e quantos dias ele leva.",
    grupo: "Custos",
    icon: "user",
  },
  {
    href: "/calculadoras/custo-por-hectare",
    title: "Custo por hectare",
    description: "O custo de uma operação dividido pela área que ela cobriu.",
    grupo: "Custos",
    icon: "mountain",
  },
  {
    href: "/calculadoras/servico-terceirizado",
    title: "Serviço terceirizado",
    description: "Quanto sai o serviço contratado, na unidade em que o prestador cobra.",
    grupo: "Custos",
    icon: "tractor",
  },
  {
    href: "/calculadoras/valor-por-arroba",
    title: "Valor por arroba",
    description: "Quanto você está pagando por arroba num negócio de valor já fechado.",
    grupo: "Animais",
    icon: "beef",
  },
  {
    href: "/calculadoras/conversoes",
    title: "Conversões rurais",
    description: "Hectare, alqueire, arroba, saca, tonelada, litro e quilômetro.",
    grupo: "Custos",
    icon: "box",
  },
];
