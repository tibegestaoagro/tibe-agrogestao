import type { IntencaoDef } from "./tipos";

/**
 * Leilão, feira e evento (Módulo 31, missão 3) e permuta (missão 4).
 * Handlers: whatsapp-handlers/evento.ts e permuta.ts. O exemplo com § vem do
 * documento do cliente "Área Negociações" (§18.5).
 *
 * Remessa e encerramento leem as quantidades com `num` (Number cru): "10",
 * não "10 bois". Na permuta, cada lado é texto livre que o handler desmonta:
 * "20 bois" (número na frente) vira animais; máquina ou produto do estoque é
 * mandado para o painel, na v1.
 */

export const INTENCOES_EVENTOS_E_PERMUTA: IntencaoDef[] = [
  {
    intent: "registrar_remessa_evento",
    dominio: "eventos_e_permuta",
    descricao: "o produtor conta que mandou animais para um leilão, feira ou evento, antes de saber o resultado",
    campos: [
      { nome: "evento", tipo: "texto", descricao: 'o nome do leilão, feira ou evento ("Leilão da Expoagro")' },
      {
        nome: "categoria",
        tipo: "texto",
        descricao: "a categoria como o produtor falou (boi, novilha, fêmeas de 13 a 24 meses); não complete sexo nem idade que ele não disse",
      },
      { nome: "quantidade", tipo: "numero", descricao: "só o número de cabeças, como o produtor falou, sem a palavra cabeças (20)" },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda de onde saem, se ele citou" },
      { nome: "tipo_evento", tipo: "texto", descricao: "leilão, feira ou exposição, se ele disse" },
      { nome: "municipio", tipo: "texto", descricao: "a cidade do evento, se ele disse" },
      { nome: "organizador", tipo: "texto", descricao: "a leiloeira ou quem organiza, se ele disse" },
      { nome: "observacao", tipo: "texto", descricao: "outro detalhe que ele pediu para anotar" },
    ],
    exemplos: ["mandei 20 bois para o Leilão da Expoagro", "levei 15 novilhas na feira de Uberaba"],
    vizinhas:
      "encerrar_remessa_evento quando o evento já terminou e ele conta quantos venderam; registrar_negocio_gado quando a venda já aconteceu fora de evento",
  },
  {
    intent: "encerrar_remessa_evento",
    dominio: "eventos_e_permuta",
    descricao: "o produtor conta o resultado do leilão ou evento: quantos animais venderam, por quanto, e quantos voltaram",
    campos: [
      { nome: "evento", tipo: "texto", descricao: "o nome do leilão ou evento, se ele citou" },
      { nome: "vendidos", tipo: "numero", descricao: "só o número de cabeças vendidas, como o produtor falou (12; 0 se nenhuma vendeu)" },
      { nome: "retornados", tipo: "numero", descricao: "só o número de cabeças que voltaram, como o produtor falou; vazio se não disse" },
      { nome: "valor", tipo: "numero", descricao: "o valor total das vendas, só o número, como o produtor falou (60 mil)" },
    ],
    exemplos: ["no leilão da Expoagro vendi 12 por 60 mil e voltaram 8", "acabou a feira, não vendeu nenhum, voltaram todos"],
    vizinhas: "registrar_remessa_evento quando ele está MANDANDO os animais; registrar_negocio_gado quando a venda não foi em evento",
  },
  {
    intent: "registrar_permuta",
    dominio: "eventos_e_permuta",
    descricao: "o produtor conta que trocou alguma coisa com alguém (animais por outro bem), com ou sem diferença em dinheiro",
    campos: [
      { nome: "entregue", tipo: "texto", descricao: 'o que ele deu, como falou; animais com a quantidade em algarismo na frente ("20 bois"), outra coisa como ele disse' },
      { nome: "recebido", tipo: "texto", descricao: 'o que ele recebeu, como falou; animais com a quantidade em algarismo na frente ("15 novilhas"), outra coisa como ele disse ("um trator")' },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda, se ele citou" },
      { nome: "diferenca_paga", tipo: "numero", descricao: "quando ele pagou a diferença: só o número, como o produtor falou (30 mil)" },
      { nome: "diferenca_recebida", tipo: "numero", descricao: "quando ele recebeu a diferença: só o número, como o produtor falou (5 mil)" },
      { nome: "pasto", tipo: "texto", descricao: "o pasto de onde saem os animais entregues, se ele citou" },
      { nome: "contato", tipo: "texto", descricao: "com quem ele trocou, se disse" },
      { nome: "observacao", tipo: "texto", descricao: "outro detalhe que ele pediu para anotar" },
    ],
    exemplos: [
      "Troquei 20 bois por um trator e paguei mais 30 mil. (Negociações §18.5)",
      "troquei 10 bois por 15 novilhas com o Zé",
    ],
    vizinhas: "registrar_negocio_gado quando foi compra ou venda por dinheiro, sem troca",
  },
];
