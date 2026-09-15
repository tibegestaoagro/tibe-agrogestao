import type { IntencaoDef } from "./tipos";

/**
 * Leite (Módulo 32): produção do dia e contagem de vacas em lactação.
 * Handler: whatsapp-handlers/leite.ts. Nenhuma mexe no rebanho: "em lactação"
 * é condição, não categoria. Exemplos do documento do cliente "Área Leite"
 * (§36), citados no catálogo docs/agents/agente-whatsapp/catalogo-leite-servicos.md.
 *
 * Nas três de lactação, quem decide é o VERBO, não o número: "estou com 32" é
 * total, "entraram 4" soma, "sequei 3" subtrai.
 */

const FAZENDA = { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda, se ele citou" } as const;
const DATA = { nome: "data", tipo: "data", descricao: "o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse" } as const;
const LOTE = { nome: "lote", tipo: "texto", descricao: "o lote leiteiro, se ele citou um" } as const;

export const INTENCOES_LEITE: IntencaoDef[] = [
  {
    intent: "registrar_producao_leite",
    dominio: "leite",
    descricao: "o produtor conta quantos litros de leite tirou, no dia ou por ordenha",
    campos: [
      { nome: "litros", tipo: "numero", descricao: "o total de litros, só o número, como o produtor falou (480); vazio quando ele separou por ordenha" },
      { nome: "manha", tipo: "numero", descricao: "litros da ordenha da manhã, só o número (300)" },
      { nome: "tarde", tipo: "numero", descricao: "litros da ordenha da tarde, só o número (180)" },
      { nome: "noite", tipo: "numero", descricao: "litros da ordenha da noite, só o número" },
      FAZENDA,
      DATA,
      LOTE,
    ],
    exemplos: ["Tirei 480 litros hoje. (Área Leite §36)", "Tirei 300 litros de manhã e 180 à tarde. (Área Leite §36)"],
    vizinhas:
      "registrar_combustivel_servico e registrar_uso_estoque também falam em litros, mas de diesel ou insumo; guardar no tanque ou vender leite não é produção",
  },
  {
    intent: "definir_vacas_em_lactacao",
    dominio: "leite",
    descricao: "o produtor diz quantas vacas estão dando leite agora, no total",
    campos: [
      { nome: "quantidade", tipo: "numero", descricao: "o TOTAL de vacas dando leite, só o número (32; 0 quando não tem nenhuma)" },
      FAZENDA,
      DATA,
      LOTE,
    ],
    exemplos: ["Estou com 32 vacas dando leite. (Área Leite §36)", "não tenho mais nenhuma vaca em lactação"],
    vizinhas:
      'registrar_entrada_lactacao quando "entraram" vacas no leite; registrar_saida_lactacao quando secou; registrar_movimentacao_rebanho quando fala de vacas na fazenda, sem "dando leite" ou "em lactação"',
  },
  {
    intent: "registrar_entrada_lactacao",
    dominio: "leite",
    descricao: "o produtor conta que mais vacas começaram a dar leite",
    campos: [
      { nome: "quantidade", tipo: "numero", descricao: "quantas vacas ENTRARAM no leite, só o número (4)" },
      FAZENDA,
      DATA,
      LOTE,
    ],
    exemplos: ["Entraram mais 4 vacas no leite. (Área Leite §36)", "pariram e entraram no leite mais 2"],
    vizinhas:
      "definir_vacas_em_lactacao quando ele diz o total; registrar_movimentacao_rebanho quando nasceram ou chegaram animais na fazenda",
  },
  {
    intent: "registrar_saida_lactacao",
    dominio: "leite",
    descricao: "o produtor conta que secou vacas, que pararam de dar leite",
    campos: [
      { nome: "quantidade", tipo: "numero", descricao: "quantas vacas SECARAM ou saíram do leite, só o número (3)" },
      FAZENDA,
      DATA,
      LOTE,
    ],
    exemplos: ["Sequei 3 vacas. (Área Leite §36)", "saíram 2 vacas da lactação"],
    vizinhas:
      "registrar_movimentacao_rebanho ou registrar_negocio_gado quando a vaca morreu ou foi vendida: secar não tira do rebanho",
  },
];
