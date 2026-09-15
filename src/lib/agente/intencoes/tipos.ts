import type { Intent } from "@/lib/whatsapp-intents";

export const DOMINIOS = [
  "rebanho", "confinamento", "eventos_e_permuta", "estoque", "lista_de_compra", "leite",
  "mao_de_obra", "servicos", "financeiro", "dia", "calculadoras", "prestador", "conversa",
] as const;
export type Dominio = (typeof DOMINIOS)[number];

/** Tipo que o modelo devolve; a interpretação fina fica com os parsers do handler. */
export type TipoDeCampo = "texto" | "numero" | "data" | "sim_nao" | "lista";

export type CampoDef = {
  /** Nome EXATO que o handler lê (o primeiro, se o handler aceita apelidos). */
  nome: string;
  tipo: TipoDeCampo;
  descricao: string;
  /** Para `lista`: campos de cada item (ex.: itens de rebanho com categoria e quantidade). */
  itens?: CampoDef[];
};

export type IntencaoDef = {
  intent: Intent;
  dominio: Dominio;
  /** Uma frase: o gesto do produtor, não o que o sistema faz. */
  descricao: string;
  campos: CampoDef[];
  /** Frases reais de produtor, com a origem na spec ou no documento do cliente quando houver. */
  exemplos: string[];
  /** Intenções com que é confundida, e o que distingue, em uma frase. */
  vizinhas?: string;
};

export type DominioDef = { dominio: Dominio; descricao: string };
