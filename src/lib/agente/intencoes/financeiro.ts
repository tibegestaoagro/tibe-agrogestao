import type { IntencaoDef } from "./tipos";

/**
 * Financeiro solto (Módulos 4 e 35): despesa ou receita avulsa (também o
 * recibo por foto), saldo do mês e relatório. Handler:
 * whatsapp-handlers/financeiro.ts. Exemplos do catálogo
 * docs/agents/agente-whatsapp/catalogo-estoque-dia.md e do documento do
 * cliente "Área Financeiro" (§42 e §43).
 */

const PERIODO = {
  nome: "period",
  tipo: "texto",
  descricao: 'o mês, como o produtor falou ("agosto", "mês passado", "08/2026"); vazio usa o mês atual',
} as const;

export const INTENCOES_FINANCEIRO: IntencaoDef[] = [
  {
    intent: "registrar_lancamento_financeiro",
    dominio: "financeiro",
    descricao: "o produtor conta um gasto ou um dinheiro recebido avulso, que não é compra de insumo, gado nem pagamento da equipe",
    campos: [
      { nome: "amount", tipo: "numero", descricao: "o valor, só o número, como o produtor falou (450,50, 1.500, 2 mil)" },
      { nome: "tipo", tipo: "texto", descricao: "receita quando o dinheiro ENTROU (recebi); vazio quando é despesa" },
      { nome: "category", tipo: "texto", descricao: "a categoria, se ele disse ou se é óbvia (Combustíveis, Energia, Aluguel)" },
      { nome: "vendor", tipo: "texto", descricao: "de quem comprou ou com quem gastou (Posto XX), se ele disse" },
      { nome: "description", tipo: "texto", descricao: "o que foi, em poucas palavras (conta de luz, diesel)" },
    ],
    exemplos: ["gastei 50 reais com ração", "anota uma despesa de 500 reais com diesel", "Recebi 1.500 de aluguel. (Área Financeiro §42)"],
    vizinhas:
      "registrar_negocio_produto quando é insumo do estoque com quantidade; registrar_combustivel_servico quando o diesel é de um serviço para cliente em andamento; registrar_pagamento_trabalhador quando pagou alguém da equipe; consultar_saldo quando pergunta. O frete, a comissão, a diferença de troca ou o custo de uma vacina ditos junto com um negócio ou uma ação já contada são campos DAQUELA ação, nunca um lançamento à parte",
  },
  {
    intent: "consultar_saldo",
    dominio: "financeiro",
    descricao: "o produtor pergunta quanto entrou, quanto saiu ou qual o saldo de dinheiro de um mês",
    campos: [PERIODO],
    exemplos: ["qual meu saldo de junho", "Quanto gastei este mês? (Área Financeiro §43)"],
    vizinhas:
      "consultar_rebanho quando pergunta de animais; consultar_estoque quando é saldo de insumo; resumo com contas a pagar ou a receber quando pergunta o que tem para pagar",
  },
  {
    intent: "gerar_relatorio",
    dominio: "financeiro",
    descricao: "o produtor pede um relatório em PDF de uma área, que não precisa ser a financeira",
    campos: [
      { nome: "tipo", tipo: "texto", descricao: "financeiro, rebanho, lavoura ou prestador, conforme a área que ele pediu" },
      PERIODO,
    ],
    exemplos: [
      "me manda o relatório financeiro",
      "quero o relatório financeiro de agosto em PDF",
      "preciso do relatório do rebanho em PDF pro banco",
    ],
    vizinhas: "resumo quando quer ver na conversa, sem PDF; consultar_saldo quando quer só o saldo",
  },
];
