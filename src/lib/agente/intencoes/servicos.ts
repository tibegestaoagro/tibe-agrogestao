import type { IntencaoDef } from "./tipos";

/**
 * Serviços com máquina e empreita (Módulo 33, fase 2, e §42 do documento de
 * Máquinas): diária e serviço contratados
 * (o dinheiro sai), serviço prestado para cliente (o dinheiro entra) e o
 * andamento dele (começar, produção, combustível, terminar). Handler:
 * whatsapp-handlers/servico.ts. Exemplos dos documentos do cliente "Área Mão
 * de Obra" (§32) e "Serviços com Máquinas" (§42), citados no catálogo
 * docs/agents/agente-whatsapp/catalogo-leite-servicos.md.
 *
 * As quatro do andamento acham o serviço só pelo nome do CLIENTE (`quem`).
 */

const FAZENDA = { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda, se ele citou" } as const;
const CLIENTE_DO_SERVICO = {
  nome: "quem",
  tipo: "texto",
  descricao: 'o nome do cliente para quem o serviço é feito ("do João"); vazio se não disse',
} as const;

export const INTENCOES_SERVICOS: IntencaoDef[] = [
  {
    intent: "registrar_diaria",
    dominio: "servicos",
    descricao: "o produtor conta que gente de FORA da equipe fixa trabalhou por dia num serviço, e quanto foi a diária",
    campos: [
      { nome: "servico", tipo: "texto", descricao: "o serviço feito (cerca, roçada, capina)" },
      { nome: "valor", tipo: "numero", descricao: "o valor de UMA diária, só o número, como o produtor falou (150)" },
      { nome: "quantidade", tipo: "numero", descricao: "quantos DIAS trabalharam, só o número (4)" },
      { nome: "pessoas", tipo: "numero", descricao: "quantas pessoas trabalharam, só o número (3); vazio se não disse" },
      { nome: "quem", tipo: "texto", descricao: "o nome de quem trabalhou, se ele disse" },
      FAZENDA,
    ],
    exemplos: ["Vieram 3 homens trabalhar na cerca por 4 dias, 150 a diária. (Área Mão de Obra §32)", "o Zé fez 2 dias de roçada a 120"],
    vizinhas:
      "registrar_servico_contratado quando o valor foi fechado; registrar_trabalhador quando é cadastro de fixo; registrar_servico_prestado quando o PRODUTOR trabalhou para alguém",
  },
  {
    intent: "registrar_servico_contratado",
    dominio: "servicos",
    descricao: "o produtor conta que contratou alguém para um serviço por um valor fechado",
    campos: [
      { nome: "servico", tipo: "texto", descricao: "o serviço feito (cerca, curral, limpeza de pasto)" },
      { nome: "valor", tipo: "numero", descricao: "o valor total combinado, só o número, como o produtor falou (6 mil)" },
      { nome: "quem", tipo: "texto", descricao: "quem fez o serviço (Pedro)" },
      FAZENDA,
    ],
    exemplos: ["O Pedro fez a cerca por 6 mil. (Área Mão de Obra §32)", "contratei o Tião para limpar o pasto por 3.500"],
    vizinhas:
      "registrar_diaria quando o preço é por dia; registrar_servico_prestado quando o dinheiro ENTRA; registrar_lancamento_financeiro quando só conta que pagou",
  },
  {
    intent: "registrar_servico_prestado",
    dominio: "servicos",
    descricao:
      "o produtor conta que fez ou vai fazer um serviço para um cliente citando a máquina, o preço ou a unidade de cobrança (hectare, hora, dia)",
    campos: [
      { nome: "servico", tipo: "texto", descricao: "o serviço (gradagem, roçada, colheita)" },
      { nome: "maquina", tipo: "texto", descricao: "a máquina usada, como ele falou (John Deere, Massey)" },
      {
        nome: "unidade",
        tipo: "texto",
        descricao: "como cobrou, numa palavra só: hora, hectare, dia, viagem, tonelada, metro, quilometro, cabeca ou fechado",
      },
      { nome: "valor", tipo: "numero", descricao: "o preço por unidade, ou o total quando fechado; só o número, como o produtor falou (180)" },
      { nome: "quantidade", tipo: "numero", descricao: "quantas unidades (hectares, horas, dias), só o número (20); vazio quando fechado" },
      { nome: "quem", tipo: "texto", descricao: "o cliente (João)" },
      {
        nome: "concluido",
        tipo: "sim_nao",
        descricao: 'sim quando ele diz que já fez; não quando ainda vai fazer ("vou gradear"); vazio se não disse',
      },
      { nome: "data", tipo: "data", descricao: "o dia do serviço, como o produtor falou (hoje, ontem, dia 10); vazio se não disse" },
      FAZENDA,
    ],
    exemplos: [
      "Amanhã vou gradear 20 hectares para o João a 180 reais o hectare. (Serviços com Máquinas §42)",
      "fiz 8 horas de ensilagem pro João Vizinho com a John Deere, a 250 a hora",
    ],
    vizinhas:
      "iniciar_servico, registrar_producao_servico e encerrar_servico quando o serviço já está registrado; cadastrar_servico_ordem quando ele conta o serviço feito para o cliente SEM máquina, preço nem unidade; criar_tarefa quando é só lembrete sem valor nem cliente",
  },
  {
    intent: "iniciar_servico",
    dominio: "servicos",
    descricao: 'o produtor conta que COMEÇOU ("comecei", "iniciei", "to começando") um serviço para cliente que já estava registrado',
    campos: [CLIENTE_DO_SERVICO],
    exemplos: ["Comecei a gradagem do João hoje. (Serviços com Máquinas §42)", "Comecei a roçada do Pedro hoje"],
    vizinhas:
      "registrar_servico_prestado quando o serviço é novo, com valor; cadastrar_servico_ordem quando ele conta um serviço NOVO feito para cliente, sem falar em começar; registrar_producao_servico quando já diz quanto fez",
  },
  {
    intent: "registrar_producao_servico",
    dominio: "servicos",
    descricao: "o produtor conta quanto avançou num serviço para cliente em andamento (hectares, horas)",
    campos: [
      CLIENTE_DO_SERVICO,
      { nome: "quantidade", tipo: "numero", descricao: "quanto foi feito, só o número, como o produtor falou (8)" },
    ],
    exemplos: ["Fiz 8 hectares hoje. (Serviços com Máquinas §42)", "hoje rendeu 5 horas no serviço do João"],
    vizinhas:
      "registrar_producao_leite quando são litros de leite; registrar_combustivel_servico quando é consumo; registrar_servico_prestado quando traz preço de serviço novo",
  },
  {
    intent: "registrar_combustivel_servico",
    dominio: "servicos",
    descricao: "o produtor conta que gastou diesel ou outro produto num serviço para cliente em andamento",
    campos: [
      CLIENTE_DO_SERVICO,
      { nome: "produto", tipo: "texto", descricao: "o combustível ou produto (diesel)" },
      { nome: "quantidade", tipo: "numero", descricao: "quanto gastou, só o número, como o produtor falou (60); a unidade fica fora" },
      { nome: "valor", tipo: "numero", descricao: "o custo total, só o número, como o produtor falou; vazio se não disse" },
    ],
    exemplos: ["Gastei 60 litros de diesel hoje nesse serviço. (Serviços com Máquinas §42)", "botei 40 litros de diesel na gradagem do João"],
    vizinhas:
      "registrar_uso_estoque quando o uso não cita um serviço nem o cliente dele; registrar_lancamento_financeiro quando é gasto em dinheiro solto",
  },
  {
    intent: "encerrar_servico",
    dominio: "servicos",
    descricao: 'o produtor conta que TERMINOU ("terminei", "acabei", "já terminei") um serviço para cliente em andamento',
    campos: [CLIENTE_DO_SERVICO],
    exemplos: ["Terminei o serviço do João. (Serviços com Máquinas §42)", "acabei a roçada do Pedro"],
    vizinhas:
      "registrar_producao_servico quando diz quanto fez; cadastrar_servico_ordem quando ele conta um serviço NOVO feito para cliente, sem falar em terminar; encerrar_confinamento e encerrar_remessa_evento encerram gado, não serviço",
  },
];
