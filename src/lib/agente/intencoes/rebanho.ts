import type { IntencaoDef } from "./tipos";

/**
 * Rebanho (Módulos 30 e 31): consulta e movimentação por categoria no
 * livro-razão, negócio de gado, e o cadastro por brinco (peso, vacina,
 * previsão de vacina). Handlers: whatsapp-handlers/herd.ts (consulta e
 * movimentação), negociacao.ts (compra e venda) e rebanho.ts (brinco).
 * Exemplos com § vêm do documento do cliente "TIBÉ, Área Rebanho" (§13) e
 * "Área Negociações" (§18).
 *
 * Compra e venda de gado são SEMPRE `registrar_negocio_gado`: o roteador
 * converte uma movimentação com tipo compra ou venda (`desempatarIntencao`),
 * e a descrição daqui não oferece esses dois tipos para não abrir o caminho.
 */

/** A categoria como o produtor falou; o handler pergunta a faixa quando o termo serve a mais de uma. */
const CATEGORIA =
  "a categoria como o produtor falou (bezerro, bezerra, vaca, boi, novilha, garrote, fêmeas de 13 a 24 meses); não complete sexo nem idade que ele não disse";

const QUANTIDADE_DE_CABECAS = "só o número de cabeças, em algarismo, como o produtor falou (20, 4; duas vira 2)";

export const INTENCOES_REBANHO: IntencaoDef[] = [
  {
    intent: "consultar_rebanho",
    dominio: "rebanho",
    descricao: "o produtor pergunta quantos animais tem, no total ou de uma categoria",
    campos: [
      { nome: "categoria", tipo: "texto", descricao: `${CATEGORIA}; vazio quando pergunta o total` },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda, se ele citou uma; vazio conta todas" },
    ],
    exemplos: ["Quantos animais tenho?", "Quantas fêmeas de 13 a 24 meses eu tenho?"],
    vizinhas:
      "consultar_animal quando cita um brinco; resumo quando pede a visão geral da área; consultar_saldo quando pergunta de dinheiro",
  },
  {
    intent: "consultar_animal",
    dominio: "rebanho",
    descricao: "o produtor pergunta os dados de um animal pelo número do brinco",
    campos: [{ nome: "ear_tag", tipo: "texto", descricao: "o número ou código do brinco, como o produtor falou" }],
    exemplos: ["como está o brinco 1234?", "me mostra o animal 0457"],
    vizinhas: "consultar_rebanho quando pergunta quantidade por categoria, sem brinco",
  },
  {
    intent: "registrar_movimentacao_rebanho",
    dominio: "rebanho",
    descricao:
      "o produtor conta que tem, que nasceu, que morreu ou que passou animais de pasto, de fazenda ou de categoria, sem compra nem venda",
    campos: [
      {
        nome: "movement_type",
        tipo: "texto",
        descricao:
          'sai do VERBO: "tenho" = saldo_inicial; "nasceu" = nascimento; "morreu" = morte; "passe" para outro pasto = transferencia_pasto, para outra fazenda = transferencia_fazenda, para outra idade ou categoria = mudanca_categoria; "ajuste" ou correção de contagem = ajuste',
      },
      {
        nome: "itens",
        tipo: "lista",
        descricao: 'um item por categoria dita ("4 machos e 3 fêmeas" são dois itens)',
        itens: [
          { nome: "categoria", tipo: "texto", descricao: CATEGORIA },
          { nome: "quantidade", tipo: "numero", descricao: QUANTIDADE_DE_CABECAS },
        ],
      },
      {
        nome: "sentido",
        tipo: "texto",
        descricao: "só no ajuste: entrada quando aumenta o rebanho, saida quando diminui; vazio se ele não disse",
      },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda, se ele citou uma" },
      { nome: "pasto_origem", tipo: "texto", descricao: 'o pasto onde os animais estão ou estavam ("no Pasto da Baixada", "do Pasto da Sede")' },
      { nome: "pasto_destino", tipo: "texto", descricao: 'na transferência de pasto: o pasto para onde vão ("para o Pasto da Baixada")' },
      {
        nome: "categoria_destino",
        tipo: "texto",
        descricao: 'na mudança de categoria: a categoria ou faixa nova, como ele falou ("de 8 a 12 meses")',
      },
      { nome: "fazenda_destino", tipo: "texto", descricao: "na transferência de fazenda: a fazenda para onde vão" },
      { nome: "data", tipo: "data", descricao: "o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse" },
    ],
    exemplos: [
      "Tenho 18 bezerros de até 7 meses. (§13.3)",
      "Nasceram 4 machos e 3 fêmeas hoje. (§13.4)",
      "Morreram duas vacas no Pasto da Baixada. (§13.5)",
      "Passe 10 bezerras para a categoria de 8 a 12 meses. (§13.6)",
      "Passe 20 novilhas do Pasto da Sede para o Pasto da Baixada. (§13.7)",
    ],
    vizinhas:
      "registrar_negocio_gado sempre que houver compra ou venda, com ou sem valor; registrar_entrada_confinamento e registrar_envio_boitel quando os animais vão para confinamento ou boitel",
  },
  {
    intent: "registrar_negocio_gado",
    dominio: "rebanho",
    descricao: "o produtor conta que comprou ou vendeu animais, com ou sem o valor",
    campos: [
      { nome: "tipo", tipo: "texto", descricao: "compra quando ele comprou, venda quando vendeu" },
      {
        nome: "itens",
        tipo: "lista",
        descricao: "um item por categoria negociada",
        itens: [
          { nome: "categoria", tipo: "texto", descricao: CATEGORIA },
          { nome: "quantidade", tipo: "numero", descricao: QUANTIDADE_DE_CABECAS },
        ],
      },
      { nome: "valor", tipo: "numero", descricao: "o valor total do negócio, só o número, como o produtor falou (60 mil, 48.000)" },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda, se ele citou uma" },
      { nome: "pasto", tipo: "texto", descricao: "o pasto de onde saem (venda) ou para onde vão (compra), se ele citou" },
      { nome: "contato", tipo: "texto", descricao: 'quem vendeu ou comprou ("do João", "para o frigorífico")' },
      { nome: "data", tipo: "data", descricao: "o dia do negócio, como o produtor falou (hoje, ontem); vazio se não disse" },
      { nome: "vencimento", tipo: "data", descricao: 'quando vai pagar ou receber, como ele falou ("para pagar dia 10"); vazio se não disse' },
      { nome: "parcelas", tipo: "numero", descricao: 'em quantas vezes, só o número (3 para "em 3x"); vazio se não parcelou' },
      { nome: "pago", tipo: "sim_nao", descricao: 'sim quando ele diz que já pagou ou já recebeu ("à vista", "paguei"); vazio se não disse' },
      {
        nome: "custos",
        tipo: "lista",
        descricao: "custos extras do negócio que ele citou (frete, comissão, taxa de leilão, guia, exames, vacinas, pedágio)",
        itens: [
          { nome: "descricao", tipo: "texto", descricao: "o nome do custo (Frete, Comissão)" },
          { nome: "valor", tipo: "numero", descricao: "só o número, como o produtor falou (2 mil, 350)" },
        ],
      },
    ],
    exemplos: [
      "Comprei 20 bezerros do João por 60 mil para pagar dia 10. (Negociações §18.1)",
      "Vendi 12 vacas para o frigorífico por 48 mil. (Negociações §18.2)",
      "comprei 10 novilhas",
    ],
    vizinhas:
      "encerrar_confinamento quando a venda cita confinamento ou boitel; registrar_negocio_produto quando o que foi comprado é insumo (sal, ração); registrar_permuta quando foi troca",
  },
  {
    intent: "cadastrar_animal",
    dominio: "rebanho",
    descricao: "o produtor quer cadastrar um animal individual, com brinco, raça e sexo",
    campos: [
      { nome: "ear_tag", tipo: "texto", descricao: "o número ou código do brinco" },
      { nome: "breed", tipo: "texto", descricao: "a raça (Nelore, Angus, Girolando)" },
      { nome: "sex", tipo: "texto", descricao: "male para macho, female para fêmea; vazio se não disse" },
      { nome: "category", tipo: "texto", descricao: CATEGORIA },
      { nome: "property_name", tipo: "texto", descricao: "o nome da fazenda, se ele citou uma" },
    ],
    exemplos: ["cadastra o brinco 1234, Nelore, macho", "quero cadastrar uma vaca Girolando brinco 0457"],
    vizinhas:
      "registrar_movimentacao_rebanho quando fala de quantidade por categoria sem brinco (\"tenho 20 vacas\"); registrar_negocio_gado quando comprou",
  },
  {
    intent: "registrar_peso",
    dominio: "rebanho",
    descricao: "o produtor informa o peso de um animal pelo brinco",
    campos: [
      { nome: "ear_tag", tipo: "texto", descricao: "o número ou código do brinco" },
      { nome: "weight", tipo: "numero", descricao: "só o número em kg, como o produtor falou, sem a unidade (480; 480,5)" },
    ],
    exemplos: ["o brinco 1234 pesou 480 kg", "pesei o 0457, deu 320 quilos"],
    vizinhas: "consultar_animal quando pergunta o peso em vez de informar",
  },
  {
    intent: "registrar_vacina",
    dominio: "rebanho",
    descricao: "o produtor conta que vacinou um animal, pelo brinco",
    campos: [
      { nome: "ear_tag", tipo: "texto", descricao: "o número ou código do brinco" },
      { nome: "vaccine_name", tipo: "texto", descricao: "o nome da vacina (aftosa, brucelose, raiva)" },
      { nome: "cost", tipo: "numero", descricao: "o custo, só o número, como o produtor falou (35; 35,50); vazio se não disse" },
    ],
    exemplos: ["vacinei o brinco 1234 contra aftosa", "apliquei brucelose no 0457, custou 35 reais"],
    vizinhas: "registrar_previsao_vacina quando a vacina é FUTURA e ele informa quanto vai custar",
  },
  {
    intent: "registrar_previsao_vacina",
    dominio: "rebanho",
    descricao: "o produtor informa quanto vai custar uma vacina que ainda vai ser aplicada num animal",
    campos: [
      { nome: "ear_tag", tipo: "texto", descricao: "o número ou código do brinco" },
      { nome: "vaccine_name", tipo: "texto", descricao: "o nome da vacina" },
      { nome: "cost", tipo: "numero", descricao: "o valor previsto, só o número, como o produtor falou (80; 80,50)" },
      {
        nome: "due_date",
        tipo: "data",
        descricao: "a data prevista como o produtor falou (dia 20, 20/10), só quando ele disse a data; vazio usa o próximo vencimento calculado",
      },
    ],
    exemplos: ["a próxima aftosa do brinco 1234 vai custar 80 reais", "previsão de brucelose do 0457, 45 reais, em 2026-10-20"],
    vizinhas: "registrar_vacina quando a vacina JÁ foi aplicada",
  },
];
