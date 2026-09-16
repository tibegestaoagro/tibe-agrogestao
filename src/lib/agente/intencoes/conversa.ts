import type { IntencaoDef } from "./tipos";

/**
 * `ajuda` e `resumo` (spec 2026-07-28): as duas intenções utilitárias que não
 * cadastram nada. `ajuda` devolve texto fixo de como usar um recurso;
 * `resumo` é o funil de até 2 perguntas que termina em dado real (mesmas
 * queries do dashboard). Handlers: whatsapp-handlers/ajuda.ts e resumo.ts.
 */
export const INTENCOES_CONVERSA: IntencaoDef[] = [
  {
    intent: "ajuda",
    dominio: "conversa",
    descricao: "o produtor pergunta como usar um recurso do Tibé, ou o que o assistente faz",
    campos: [
      {
        nome: "topic",
        tipo: "texto",
        descricao:
          "o recurso sobre o qual quer saber (ex.: registrar_peso, consultar_saldo); vazio mostra o menu geral",
      },
    ],
    exemplos: ["o que você faz?", "como eu registro uma vacina?"],
    vizinhas:
      "resumo quando o produtor quer VER o que já está cadastrado, não aprender a usar; consultar_meu_dia quando pergunta o que tem para fazer",
  },
  {
    intent: "resumo",
    dominio: "conversa",
    descricao:
      "o produtor pede uma visão geral de uma área (rebanho, lavoura, prestador, financeiro) ou a relação do que tem a pagar ou a receber",
    campos: [
      {
        nome: "scope",
        tipo: "texto",
        descricao:
          "a área ou o nível pedido (rebanho, lavoura, prestador, financeiro; ou clientes, agendamentos, ordens_a_faturar, contas_a_pagar, contas_a_receber); vazio pergunta qual área",
      },
    ],
    exemplos: ["como está o rebanho?", "quero ver o resumo financeiro", "me lista o que está em aberto pra receber"],
    vizinhas:
      "consultar_saldo quando pede só o saldo do mês; consultar_meu_dia quando pergunta o que tem para fazer hoje; ajuda quando pergunta como usar, não o que já está cadastrado",
  },
];
