import type { IntencaoDef } from "./tipos";

/**
 * Mão de obra fixa (Módulo 33): cadastro, pagamento e adiantamento.
 * Handler: whatsapp-handlers/mao-de-obra.ts. Exemplos do documento do
 * cliente "Área Mão de Obra" (§32), citados no catálogo
 * docs/agents/agente-whatsapp/catalogo-leite-servicos.md.
 */

const NOME_DA_EQUIPE = { nome: "nome", tipo: "texto", descricao: "o nome do trabalhador, como o produtor falou (João)" } as const;

export const INTENCOES_MAO_DE_OBRA: IntencaoDef[] = [
  {
    intent: "registrar_trabalhador",
    dominio: "mao_de_obra",
    descricao: "o produtor conta que tem um trabalhador fixo, o que ele faz e quanto ganha",
    campos: [
      NOME_DA_EQUIPE,
      { nome: "funcao", tipo: "texto", descricao: "o que ele faz na fazenda (vaqueiro, tratorista, caseiro)" },
      { nome: "valor", tipo: "numero", descricao: "quanto ganha, só o número, como o produtor falou (2.500)" },
      { nome: "frequencia", tipo: "texto", descricao: "de quanto em quanto recebe: mensal, quinzenal, semanal ou diaria" },
    ],
    exemplos: ["João é meu vaqueiro e ganha 2.500 por mês. (Área Mão de Obra §32)", "o Zé é tratorista, ganha 800 por semana"],
    vizinhas:
      "registrar_diaria quando alguém trabalhou por dia num serviço, sem ser da equipe fixa; registrar_pagamento_trabalhador quando ele pagou",
  },
  {
    intent: "registrar_pagamento_trabalhador",
    dominio: "mao_de_obra",
    descricao: "o produtor conta que pagou o salário de alguém da equipe fixa",
    campos: [
      NOME_DA_EQUIPE,
      { nome: "valor", tipo: "numero", descricao: "quanto pagou, só o número, como o produtor falou (2.500); vazio usa o valor previsto" },
    ],
    exemplos: ["Paguei o João hoje. (Área Mão de Obra §32)", "paguei 2.500 pro João"],
    vizinhas:
      'registrar_adiantamento quando é "adiantado" ou "vale"; registrar_lancamento_financeiro quando pagou uma conta ou alguém de fora da equipe',
  },
  {
    intent: "registrar_adiantamento",
    dominio: "mao_de_obra",
    descricao: "o produtor conta que adiantou dinheiro para alguém da equipe fixa, fora do pagamento",
    campos: [
      NOME_DA_EQUIPE,
      { nome: "valor", tipo: "numero", descricao: "quanto adiantou, só o número, como o produtor falou (500)" },
    ],
    exemplos: ["Dei 500 reais adiantado para o João. (Área Mão de Obra §32)", "o Zé pegou um vale de 200"],
    vizinhas: "registrar_pagamento_trabalhador quando é o pagamento do mês, sem ser adiantado",
  },
  {
    intent: "agendar_pagamento_trabalhador",
    dominio: "mao_de_obra",
    descricao: "o produtor diz que VAI pagar alguém da equipe numa data futura, sem ter pago ainda",
    campos: [
      NOME_DA_EQUIPE,
      { nome: "data", tipo: "data", descricao: "quando vai pagar, como ele falou (dia 10, sexta, 20/10)" },
      { nome: "valor", tipo: "numero", descricao: "quanto vai pagar, só o número; vazio usa o valor previsto do trabalhador" },
    ],
    exemplos: ["vou pagar o Pedro dia 10", "o pagamento do João fica pra sexta"],
    vizinhas:
      "registrar_pagamento_trabalhador quando ele JÁ pagou; registrar_adiantamento quando é vale ou adiantado",
  },
];
