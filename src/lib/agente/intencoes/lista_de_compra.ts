import type { IntencaoDef } from "./tipos";

/**
 * Minha Lista de Compra (Módulo 36, §17): anotar, ver, tirar e riscar o que
 * foi comprado. Handler: whatsapp-handlers/lista-de-compra.ts. Exemplos do
 * documento do cliente (docs/modulo-lista-de-compras/, §17), citados no
 * catálogo docs/agents/agente-whatsapp/catalogo-estoque-dia.md.
 *
 * A quantidade da lista é lida com `num` (Number cru): "2.000" vira 2. A
 * unidade só vale se for um id de STOCK_UNITS; outra coisa é descartada.
 */

const UNIDADE =
  "a unidade, só se ele disse, e só uma destas palavras: saca, quilograma, litro, unidade, frasco, caixa, pacote, rolo, tonelada, metro, outro";

export const INTENCOES_LISTA_DE_COMPRA: IntencaoDef[] = [
  {
    intent: "adicionar_item_lista",
    dominio: "lista_de_compra",
    descricao: "o produtor pede para anotar na Lista de Compra algo que precisa comprar",
    campos: [
      { nome: "descricao", tipo: "texto", descricao: "com UM item só: o que comprar, sem a quantidade (sal, arame)" },
      { nome: "quantidade", tipo: "numero", descricao: "com UM item só: só o número, em algarismos e sem ponto de milhar (10, 2000); vazio se não disse" },
      { nome: "unidade", tipo: "texto", descricao: `com UM item só: ${UNIDADE}` },
      { nome: "urgente", tipo: "sim_nao", descricao: "com UM item só: sim quando ele diz que é urgente; vazio se não disse" },
      {
        nome: "itens",
        tipo: "lista",
        descricao: "só quando ele cita DOIS ou mais itens, um por coisa; com um item só, deixe vazio e use os campos acima",
        itens: [
          { nome: "descricao", tipo: "texto", descricao: "o que comprar, sem a quantidade" },
          { nome: "quantidade", tipo: "numero", descricao: "só o número, em algarismos e sem ponto de milhar (2; uma vira 1)" },
          { nome: "unidade", tipo: "texto", descricao: UNIDADE },
        ],
      },
    ],
    exemplos: [
      "Coloca 10 sacas de sal na minha lista.",
      "Preciso comprar arame.",
      "Coloca na lista 2 rolos de arame, 5 litros de óleo e uma correia para o trator.",
    ],
    vizinhas:
      'criar_tarefa quando é lembrete com dia ("me lembra de comprar sal na quinta"); registrar_negocio_produto quando ele JÁ comprou',
  },
  {
    intent: "consultar_lista_compra",
    dominio: "lista_de_compra",
    descricao: "o produtor pergunta o que está anotado para comprar",
    campos: [],
    exemplos: ["O que tenho para comprar?", "me mostra a lista de compra"],
    vizinhas: "consultar_estoque quando pergunta o que está acabando no estoque; consultar_meu_dia quando pergunta a agenda",
  },
  {
    intent: "remover_item_lista",
    dominio: "lista_de_compra",
    descricao: "o produtor pede para tirar um item da Lista de Compra sem ter comprado",
    campos: [{ nome: "descricao", tipo: "texto", descricao: "o item a tirar, como ele falou (arame)" }],
    exemplos: ["Tira o arame da lista.", "não precisa mais do sal, pode tirar da lista"],
    vizinhas: "comprei_item_lista quando sai da lista porque ele COMPROU",
  },
  {
    intent: "comprei_item_lista",
    dominio: "lista_de_compra",
    descricao: "o produtor conta que comprou um item que estava na Lista de Compra",
    campos: [
      { nome: "descricao", tipo: "texto", descricao: "o item da lista que ele comprou, como falou (sal)" },
      { nome: "valor", tipo: "numero", descricao: "quanto pagou no total, só o número, como o produtor falou (1800); vazio se não disse" },
      { nome: "pago", tipo: "sim_nao", descricao: "não quando ele comprou a prazo; vazio se não disse" },
    ],
    exemplos: ["Comprei o sal.", "comprei o sal por 1800"],
    vizinhas:
      'registrar_negocio_produto quando a compra traz produto com quantidade e não fala da lista ("comprei 10 sacas de sal do Zé por 1200")',
  },
];
