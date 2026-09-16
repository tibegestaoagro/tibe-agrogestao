import type { IntencaoDef } from "./tipos";

/**
 * Estoque de insumos (Módulo 31, §9 e §10): compra ou venda, uso, contagem e
 * consulta. Handler: whatsapp-handlers/estoque.ts. Produto só do catálogo do
 * tenant (nunca é criado pela conversa). Exemplos com § vêm do documento do
 * cliente "Área Negociações"; os outros, do catálogo
 * docs/agents/agente-whatsapp/catalogo-estoque-dia.md.
 */

const PRODUTO = "o insumo, do jeito que o produtor falou (sal, sal mineral 60 P, ração, vermífugo, diesel)";

export const INTENCOES_ESTOQUE: IntencaoDef[] = [
  {
    intent: "registrar_negocio_produto",
    dominio: "estoque",
    descricao: "o produtor conta que comprou ou vendeu um insumo do estoque, com ou sem o valor",
    campos: [
      { nome: "tipo", tipo: "texto", descricao: "compra quando ele comprou, venda quando vendeu" },
      { nome: "produto", tipo: "texto", descricao: PRODUTO },
      { nome: "quantidade", tipo: "numero", descricao: "só o número, como o produtor falou (10, 2.000); a unidade fica fora" },
      { nome: "valor", tipo: "numero", descricao: "o valor TOTAL, só o número, como o produtor falou (1.800, 60 mil); nunca o preço por unidade" },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda, se ele citou" },
      { nome: "contato", tipo: "texto", descricao: 'de quem comprou ou para quem vendeu ("do Zé")' },
      { nome: "data", tipo: "data", descricao: "o dia do negócio, como o produtor falou (hoje, ontem); vazio se não disse" },
      { nome: "vencimento", tipo: "data", descricao: 'quando vai pagar ou receber, como ele falou ("para pagar dia 10"); vazio se não disse' },
      { nome: "parcelas", tipo: "numero", descricao: 'em quantas vezes, só o número (3 para "em 3 vezes"); vazio se não parcelou' },
      { nome: "pago", tipo: "sim_nao", descricao: 'sim quando ele diz que já pagou ("à vista", "paguei"); vazio se não disse' },
      {
        nome: "custos",
        tipo: "lista",
        descricao: "custos extras que ele citou (frete, carregamento, taxa)",
        itens: [
          { nome: "descricao", tipo: "texto", descricao: "o nome do custo (Frete)" },
          { nome: "valor", tipo: "numero", descricao: "só o número, como o produtor falou (200)" },
        ],
      },
    ],
    exemplos: [
      "Comprei 10 sacas de sal por 1.800 reais. (Negociações §18.3)",
      "Comprei 20 sacas de adubo. (Negociações §18.6)",
      "comprei 10 sacas de sal do Zé por 1200, para pagar dia 10",
    ],
    vizinhas:
      'registrar_negocio_gado quando o que foi negociado é animal; comprei_item_lista quando ele cita o item com artigo e SEM quantidade ("comprei o arame, deu 800"), mesmo dizendo o valor; registrar_uso_estoque quando ele não diz que comprou, porque abastecer, usar ou gastar tira do que já tem; registrar_lancamento_financeiro quando é gasto em dinheiro sem quantidade de insumo',
  },
  {
    intent: "registrar_uso_estoque",
    dominio: "estoque",
    descricao: "o produtor conta que usou, gastou ou abasteceu com uma quantidade de um insumo do estoque na fazenda",
    campos: [
      { nome: "produto", tipo: "texto", descricao: PRODUTO },
      { nome: "quantidade", tipo: "numero", descricao: "só o número, como o produtor falou (2, 2,5; uma vira 1); a unidade fica fora" },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda, se ele citou" },
      { nome: "data", tipo: "data", descricao: "o dia, como o produtor falou (hoje, ontem); vazio se não disse" },
      { nome: "finalidade", tipo: "texto", descricao: 'para que usou, se ele disse ("pro lote do curral")' },
    ],
    exemplos: ["Usei uma saca de sal. (Negociações §18.4)", "usei 2 sacas de sal mineral no lote do curral"],
    vizinhas:
      'registrar_combustivel_servico quando o uso cita um serviço ou o cliente dele ("no serviço do João"); registrar_lancamento_financeiro quando é despesa solta em dinheiro; registrar_alimentacao_confinamento quando o uso cita confinamento, boitel ou lote; ajustar_estoque quando ele diz quanto TEM, não quanto saiu',
  },
  {
    intent: "ajustar_estoque",
    dominio: "estoque",
    descricao: "o produtor contou o estoque e diz quanto existe de verdade de um insumo",
    campos: [
      { nome: "produto", tipo: "texto", descricao: PRODUTO },
      {
        nome: "saldo",
        tipo: "numero",
        descricao: 'o TOTAL que existe agora, só o número, como o produtor falou (8, 1.500); nunca a diferença ("faltaram 2")',
      },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda, se ele citou" },
      { nome: "motivo", tipo: "texto", descricao: "o motivo da correção, se ele disse" },
    ],
    exemplos: ["contei e tem só 6 sacas de sal", "O sistema mostra 9 sacas, mas existem 8. (Negociações §10.6)"],
    vizinhas: "registrar_uso_estoque quando diz quanto USOU; consultar_estoque quando pergunta quanto tem",
  },
  {
    intent: "consultar_estoque",
    dominio: "estoque",
    descricao: "o produtor pergunta quanto tem de um insumo, ou o que está acabando",
    campos: [{ nome: "produto", tipo: "texto", descricao: `${PRODUTO}; vazio quando pergunta o que está acabando` }],
    exemplos: ["Quanto tenho de sal?", "o que está acabando?"],
    vizinhas: "consultar_lista_compra quando pergunta o que tem para COMPRAR; consultar_rebanho quando pergunta de animais",
  },
];
