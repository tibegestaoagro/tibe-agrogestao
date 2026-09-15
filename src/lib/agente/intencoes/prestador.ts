import type { IntencaoDef } from "./tipos";

/**
 * Prestador de serviço (Módulo 2): ordem de serviço no catálogo de serviços e
 * clientes, e consulta do que o cliente deve. Handler:
 * whatsapp-handlers/prestador.ts. Cliente e serviço precisam existir no
 * cadastro; a quantidade é lida com `num` (Number cru, "1.500" vira 1,5).
 */

export const INTENCOES_PRESTADOR: IntencaoDef[] = [
  {
    intent: "cadastrar_servico_ordem",
    dominio: "prestador",
    descricao: "o prestador conta um serviço do seu catálogo que fez para um cliente cadastrado",
    campos: [
      { nome: "client_name", tipo: "texto", descricao: "o nome do cliente, como ele falou (João)" },
      { nome: "service_name", tipo: "texto", descricao: "o serviço do catálogo, como ele falou (diária de trator, gradagem)" },
      { nome: "quantity", tipo: "numero", descricao: "quantas unidades, só o número, como o produtor falou (2); vazio conta 1" },
    ],
    exemplos: ["fiz uma diária de trator pro cliente João", "fiz 3 horas de gradagem para o Pedro"],
    vizinhas:
      "registrar_servico_prestado é o mesmo gesto no perfil fazenda, com máquina; consultar_cliente quando pergunta o que o cliente deve",
  },
  {
    intent: "consultar_cliente",
    dominio: "prestador",
    descricao: "o prestador pergunta quanto um cliente já pagou ou ainda deve",
    campos: [{ nome: "client_name", tipo: "texto", descricao: "o nome do cliente, como ele falou (João)" }],
    exemplos: ["quanto o João me deve", "quanto o cliente Pedro já me pagou?"],
    vizinhas: "resumo com contas a receber quando pergunta de todos os clientes; consultar_saldo quando é o saldo do mês",
  },
];
