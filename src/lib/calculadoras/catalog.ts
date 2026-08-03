/**
 * Catálogo das 12 ferramentas da "Calculadora Pecuária" (Onda 3, agente C2).
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

export type Calculadora = {
  href: string;
  title: string;
  description: string;
  icon: IconKey;
};

export const CALCULADORAS: Calculadora[] = [
  { href: "/calculadoras/cerca", title: "Cerca", description: "Mourões e arame necessários para uma cerca.", icon: "fence" },
  {
    href: "/calculadoras/pastagem",
    title: "Pastagem",
    description: "Capacidade de suporte da pastagem e área necessária para o rebanho.",
    icon: "sprout",
  },
  {
    href: "/calculadoras/compra-venda-gado",
    title: "Compra e venda de gado (simulação)",
    description: "Simulação de arrobas e margem: não integra com o rebanho real.",
    icon: "beef",
  },
  {
    href: "/calculadoras/lotacao",
    title: "Lotação",
    description: "Taxa de lotação atual (UA/ha) do rebanho numa área.",
    icon: "container",
  },
  {
    href: "/calculadoras/sal-mineral",
    title: "Sal mineral",
    description: "Consumo estimado de sal mineral por animal e por período.",
    icon: "package",
  },
  {
    href: "/calculadoras/racao",
    title: "Ração / volumoso",
    description: "Necessidade diária de matéria seca e de alimento in natura.",
    icon: "wheat",
  },
  { href: "/calculadoras/agua", title: "Água", description: "Consumo estimado de água do rebanho.", icon: "droplet" },
  {
    href: "/calculadoras/cocho",
    title: "Cocho (sal mineral)",
    description: "Comprimento de cocho necessário para o rebanho.",
    icon: "box",
  },
  {
    href: "/calculadoras/adubacao",
    title: "Adubação",
    description: "Converte uma dose recomendada de nutriente em quantidade de adubo a comprar.",
    icon: "leaf",
  },
  {
    href: "/calculadoras/calagem",
    title: "Calagem",
    description: "Necessidade de calcário pelo método da saturação por bases.",
    icon: "mountain",
  },
  {
    href: "/calculadoras/mao-de-obra",
    title: "Mão de obra",
    description: "Quantos funcionários são necessários, a partir da capacidade da sua operação.",
    icon: "user",
  },
  {
    href: "/calculadoras/maquinas-combustivel",
    title: "Máquinas e combustível",
    description: "Total de combustível e custo, a partir do consumo da sua máquina.",
    icon: "tractor",
  },
];
