import type { IntencaoDef } from "./tipos";

/**
 * Meu Dia (Módulos 27 e 38): três consultas e a criação de tarefa. As três
 * consultas leem a mesma fonte da tela (lerItensDoDia + classificar) e não
 * têm parâmetro, confirmação ou pendente. `criar_tarefa` é a única de
 * escrita do domínio (decisão 38.3: concluir/alterar por frase fica fora).
 * Handlers: whatsapp-handlers/meu-dia.ts e tarefas.ts.
 */
export const INTENCOES_DIA: IntencaoDef[] = [
  {
    intent: "criar_tarefa",
    dominio: "dia",
    descricao: "o produtor pede um lembrete ou anota algo para fazer, com ou sem dia",
    campos: [
      { nome: "title", tipo: "texto", descricao: "o que precisa ser feito, nas palavras do produtor" },
      { nome: "due_date", tipo: "data", descricao: "o dia, como o produtor falou (amanhã, quinta, dia 10); vazio se não disse" },
    ],
    exemplos: ["me lembra de comprar sal na quinta", "anota aí consertar a porteira"],
    vizinhas: "adicionar_item_lista quando é algo para COMPRAR; consultar_meu_dia quando pergunta o que tem",
  },
  {
    intent: "consultar_meu_dia",
    dominio: "dia",
    descricao: "o produtor pergunta o que tem para hoje: tarefas, contas, vacinas e o que está atrasado",
    campos: [],
    exemplos: ["o que tenho para hoje?", "bom dia, o que tenho hoje"],
    vizinhas: "resumo (visão por área) e consultar_lista_compra (o que falta comprar) não olham a agenda do dia",
  },
  {
    intent: "consultar_amanha",
    dominio: "dia",
    descricao: "o produtor pergunta o que tem marcado para amanhã",
    campos: [],
    exemplos: ["o que tenho amanhã?", "e amanhã?"],
    vizinhas: "consultar_semana quando pergunta pelos próximos dias; criar_tarefa quando é um lembrete novo (\"me lembra amanhã de...\")",
  },
  {
    intent: "consultar_semana",
    dominio: "dia",
    descricao: "o produtor pergunta o que tem marcado para os próximos 7 dias",
    campos: [],
    exemplos: ["o que tenho essa semana?", "o que tenho para essa semana"],
    vizinhas: "resumo com contas_a_pagar responde o vencimento do MÊS, não da semana",
  },
];
