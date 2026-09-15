import type { IntencaoDef } from "./tipos";

/**
 * Calculadora (Módulo 37, §40): contas de planejamento que não gravam nada.
 * Handler: whatsapp-handlers/calculadora.ts. Exemplos do documento do
 * cliente (docs/modulo-calculadora/, §40), citados no catálogo
 * docs/agents/agente-whatsapp/catalogo-estoque-dia.md.
 *
 * O handler não guarda pendente: pergunta só o que falta, e a resposta
 * seguinte precisa trazer de novo o que já foi dito.
 */

export const INTENCOES_CALCULADORAS: IntencaoDef[] = [
  {
    intent: "calcular_cerca",
    dominio: "calculadoras",
    descricao: "o produtor quer saber quanto material precisa para fazer uma cerca",
    campos: [
      { nome: "comprimento", tipo: "numero", descricao: "o tamanho da cerca em metros, só o número, como o produtor falou (1.000)" },
      { nome: "fios", tipo: "numero", descricao: "quantos fios de arame, só o número (5)" },
      { nome: "espacamento", tipo: "numero", descricao: "a distância entre os mourões em metros, só o número (4); vazio se não disse" },
      { nome: "metros_por_rolo", tipo: "numero", descricao: "quantos metros tem o rolo de arame, só o número (500); vazio se não disse" },
    ],
    exemplos: ["Vou fazer 1.000 metros de cerca com 5 fios. (§40)", "quanto arame preciso para 300 metros de cerca de 4 fios, mourão a cada 3 metros?"],
    vizinhas: "adicionar_item_lista quando quer anotar para comprar o arame",
  },
  {
    intent: "calcular_sementes",
    dominio: "calculadoras",
    descricao: "o produtor quer saber quanta semente precisa para plantar uma área",
    campos: [
      { nome: "area", tipo: "numero", descricao: "a área em hectares, só o número (20)" },
      { nome: "variedade", tipo: "texto", descricao: 'só o nome da variedade, sem "capim" (mombaça, marandu, massai)' },
      { nome: "taxa", tipo: "numero", descricao: "quilos de semente por hectare, só o número (12); vazio se não disse" },
      { nome: "peso_saca", tipo: "numero", descricao: "quantos quilos tem a saca de semente, só o número (10); vazio se não disse" },
    ],
    exemplos: ["Quantas sacas de Mombaça preciso para 20 hectares? (§40)", "quanto de semente de marandu para 15 hectares a 10 kg por hectare?"],
    vizinhas: "calcular_sal e calcular_racao são contas de trato, não de plantio",
  },
  {
    intent: "calcular_sal",
    dominio: "calculadoras",
    descricao: "o produtor quer saber quanto sal mineral os animais vão comer num período",
    campos: [
      { nome: "animais", tipo: "numero", descricao: "quantos animais, só o número (100)" },
      { nome: "dias", tipo: "numero", descricao: "o período em dias, só o número (30; um mês vira 30)" },
      { nome: "consumo", tipo: "numero", descricao: "gramas de sal por animal por dia, só o número (100); vazio se não disse" },
      { nome: "peso", tipo: "numero", descricao: "o peso médio dos animais em kg, só o número (450); vazio se não disse" },
      { nome: "peso_saca", tipo: "numero", descricao: "quantos quilos tem a saca de sal, só o número (25); vazio se não disse" },
    ],
    exemplos: ["Quanto de sal 100 bois comem em um mês? (§40)", "quanto sal mineral 50 vacas gastam em 15 dias?"],
    vizinhas: "consultar_estoque quando pergunta quanto sal TEM; registrar_uso_estoque quando conta que usou",
  },
  {
    intent: "calcular_racao",
    dominio: "calculadoras",
    descricao: "o produtor quer saber quanto de cada ingrediente vai numa mistura de ração",
    campos: [
      {
        nome: "ingredientes",
        tipo: "lista",
        descricao: "um item por ingrediente da receita",
        itens: [
          { nome: "nome", tipo: "texto", descricao: "o ingrediente (milho, soja, núcleo)" },
          { nome: "percentual", tipo: "numero", descricao: "a porcentagem na receita, só o número (65)" },
        ],
      },
      { nome: "quantidade", tipo: "numero", descricao: "quantos quilos da mistura quer fazer, só o número (500)" },
    ],
    exemplos: ["Quero fazer 500 kg daquela ração de 65% milho, 29% soja e 6% núcleo. (§40)", "como faço 1.000 kg de ração com 70% milho e 30% farelo de soja?"],
    vizinhas:
      "registrar_alimentacao_confinamento quando conta que tratou o lote; adicionar_item_lista quando quer anotar os ingredientes para comprar",
  },
];
