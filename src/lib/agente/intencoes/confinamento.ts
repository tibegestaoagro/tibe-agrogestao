import type { IntencaoDef } from "./tipos";

/**
 * Confinamento e boitel (Módulo 30, fase 3): entrada, envio a boitel,
 * alimentação do lote e saída (retorno ao pasto, venda ou morte). Handler:
 * whatsapp-handlers/confinamento.ts. Exemplos com § vêm do documento do
 * cliente "Área Funcional Confinamento" (§26).
 */

const CATEGORIA =
  "a categoria como o produtor falou (garrote, boi, novilha, machos de 13 a 24 meses); não complete sexo nem idade que ele não disse";

export const INTENCOES_CONFINAMENTO: IntencaoDef[] = [
  {
    intent: "registrar_entrada_confinamento",
    dominio: "confinamento",
    descricao: "o produtor conta que colocou animais no confinamento próprio",
    campos: [
      { nome: "categoria", tipo: "texto", descricao: CATEGORIA },
      { nome: "quantidade", tipo: "numero", descricao: "só o número de cabeças, como o produtor falou (30)" },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda de onde saem, se ele citou" },
      { nome: "confinamento", tipo: "texto", descricao: "o nome do confinamento, se ele citou um" },
      { nome: "pasto", tipo: "texto", descricao: "o pasto de onde os animais saíram, se ele citou" },
      { nome: "data", tipo: "data", descricao: "o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse" },
    ],
    exemplos: ["Coloquei 30 garrotes no confinamento hoje. (§26)", "botei 15 bois no confinamento da sede ontem"],
    vizinhas:
      "registrar_envio_boitel quando os animais vão para boitel de terceiro; registrar_movimentacao_rebanho quando só mudam de pasto",
  },
  {
    intent: "registrar_envio_boitel",
    dominio: "confinamento",
    descricao: "o produtor conta que mandou animais para um boitel (confinamento de terceiro)",
    campos: [
      { nome: "categoria", tipo: "texto", descricao: CATEGORIA },
      { nome: "quantidade", tipo: "numero", descricao: "só o número de cabeças, como o produtor falou (40)" },
      { nome: "fazenda", tipo: "texto", descricao: "o nome da fazenda de onde saem, se ele citou" },
      { nome: "confinamento", tipo: "texto", descricao: 'o nome do boitel ("Boitel Boa Engorda")' },
      { nome: "pasto", tipo: "texto", descricao: "o pasto de onde os animais saíram, se ele citou" },
      { nome: "data", tipo: "data", descricao: "o dia, como o produtor falou (hoje, ontem, dia 10); vazio se não disse" },
    ],
    exemplos: ["Mandei 40 bois para o Boitel Boa Engorda. (§26)", "enviei 25 garrotes pro boitel ontem"],
    vizinhas:
      "registrar_entrada_confinamento quando o confinamento é do próprio produtor; registrar_negocio_gado quando os animais foram vendidos",
  },
  {
    intent: "registrar_alimentacao_confinamento",
    dominio: "confinamento",
    descricao: "o produtor conta que usou ração ou outro insumo para tratar o lote do confinamento ou do boitel",
    campos: [
      { nome: "produto", tipo: "texto", descricao: "o insumo, do jeito que o produtor falou (ração, sal mineral, silagem)" },
      { nome: "quantidade", tipo: "numero", descricao: "só o número, como o produtor falou (5, 1.200); a unidade fica fora" },
      { nome: "confinamento", tipo: "texto", descricao: "o nome do confinamento ou boitel, se ele citou um" },
    ],
    exemplos: ["Usei 5 sacas de ração no confinamento. (§26)", "tratei o lote do boitel com 300 kg de silagem"],
    vizinhas:
      "registrar_uso_estoque quando o uso não cita confinamento nem boitel; registrar_negocio_produto quando comprou o insumo",
  },
  {
    intent: "encerrar_confinamento",
    dominio: "confinamento",
    descricao: "o produtor conta que tirou animais do confinamento ou do boitel: voltaram ao pasto, foram vendidos ou morreram",
    campos: [
      { nome: "confinamento", tipo: "texto", descricao: "o nome do confinamento ou boitel, se ele citou um" },
      { nome: "quantidade", tipo: "numero", descricao: "só o número de cabeças que saíram, como o produtor falou (10)" },
      { nome: "tipo", tipo: "texto", descricao: "venda quando vendeu, morte quando morreram; vazio quando voltaram ao pasto" },
      { nome: "valor", tipo: "numero", descricao: "na venda: o valor total, só o número, como o produtor falou (100 mil)" },
      { nome: "destino", tipo: "texto", descricao: 'no retorno: o pasto para onde foram ("para o Pasto da Sede")' },
    ],
    exemplos: [
      "Tirei 10 bois do confinamento e mandei para o Pasto da Sede. (§26)",
      "Vendi 20 bois que estavam no confinamento por 100 mil. (§26)",
      "morreram 2 bois no boitel",
    ],
    vizinhas:
      "registrar_negocio_gado quando a venda não cita confinamento nem boitel; registrar_movimentacao_rebanho quando a morte não cita confinamento nem boitel",
  },
];
