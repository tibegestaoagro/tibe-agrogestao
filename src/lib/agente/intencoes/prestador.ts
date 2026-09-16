import type { IntencaoDef } from "./tipos";

/**
 * Prestador de serviço (Módulo 2): ordem de serviço no catálogo de serviços e
 * clientes, e consulta do que o cliente deve. Handler:
 * whatsapp-handlers/prestador.ts. Cliente e serviço precisam existir no
 * cadastro; a quantidade é lida com `num`, que lê o número brasileiro ("1.500" é 1500).
 */

export const INTENCOES_PRESTADOR: IntencaoDef[] = [
  {
    intent: "cadastrar_servico_ordem",
    dominio: "prestador",
    descricao:
      "o prestador NOMEIA um serviço do seu catálogo que fez para um cliente cadastrado, sem citar máquina nem preço e sem contar o avanço de um serviço em andamento; quantos hectares, horas ou diárias foram continua sendo esta",
    campos: [
      { nome: "client_name", tipo: "texto", descricao: "o nome do cliente, como ele falou (João)" },
      { nome: "service_name", tipo: "texto", descricao: "o serviço do catálogo, como ele falou (diária de trator, gradagem)" },
      { nome: "quantity", tipo: "numero", descricao: "quantas unidades, só o número, como o produtor falou (2); vazio conta 1" },
    ],
    exemplos: ["fiz duas aplicações de herbicida pra Chácara Bela Vista", "rodei uma subsolagem pra Granja Aurora"],
    vizinhas:
      "registrar_servico_prestado quando ele cita a máquina ou o preço; registrar_producao_servico quando ele só diz o quanto avançou num serviço em andamento, sem nomear o serviço; iniciar_servico e encerrar_servico quando ele só começou ou terminou um serviço já registrado; consultar_cliente quando pergunta o que o cliente deve",
  },
  {
    intent: "consultar_cliente",
    dominio: "prestador",
    descricao: "o prestador pergunta quanto um cliente já pagou ou ainda deve",
    campos: [{ nome: "client_name", tipo: "texto", descricao: "o nome do cliente, como ele falou (João)" }],
    exemplos: ["a Chácara Bela Vista ainda tem alguma coisa em aberto comigo?", "quanto a Granja Aurora me deve"],
    vizinhas:
      "resumo com contas a receber quando pergunta de todos os clientes; consultar_saldo quando é o saldo do mês da fazenda, não a conta de um cliente",
  },
];
