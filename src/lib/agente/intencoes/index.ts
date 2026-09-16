import type { Intent } from "@/lib/whatsapp-intents";
import type { Dominio, IntencaoDef } from "./tipos";
import { INTENCOES_REBANHO } from "./rebanho";
import { INTENCOES_CONFINAMENTO } from "./confinamento";
import { INTENCOES_EVENTOS_E_PERMUTA } from "./eventos_e_permuta";
import { INTENCOES_ESTOQUE } from "./estoque";
import { INTENCOES_LISTA_DE_COMPRA } from "./lista_de_compra";
import { INTENCOES_LEITE } from "./leite";
import { INTENCOES_MAO_DE_OBRA } from "./mao_de_obra";
import { INTENCOES_SERVICOS } from "./servicos";
import { INTENCOES_FINANCEIRO } from "./financeiro";
import { INTENCOES_DIA } from "./dia";
import { INTENCOES_CALCULADORAS } from "./calculadoras";
import { INTENCOES_PRESTADOR } from "./prestador";
import { INTENCOES_CONVERSA } from "./conversa";

export { DOMINIOS, type Dominio, type IntencaoDef, type CampoDef } from "./tipos";

export const DESCRICAO_DOS_DOMINIOS: Record<Dominio, string> = {
  rebanho: "animais da fazenda: quantos tem, nasceu, morreu, mudou de pasto ou de categoria, comprou ou vendeu gado, cadastro por brinco, peso, vacina",
  confinamento: "animais no confinamento ou no boitel: entrada (inclusive contada pelo lugar de onde eles saíram: pasto, fazenda, lote do leite), envio ao boitel, saída, venda ou morte no confinamento, e todo trato (ração, sal, silagem) de lote que cite confinamento, boitel ou lote",
  eventos_e_permuta: "gado mandado para leilão, feira ou evento e o resultado dele; troca de animais por outra coisa (permuta)",
  estoque: "insumos e produtos (sal, ração, vermífugo, adubo, diesel): compra ou venda COM quantidade (sem quantidade, o item comprado é da lista de compra), uso na fazenda fora de confinamento e de serviço, contagem, quanto tem",
  lista_de_compra: "lista do que precisa comprar: anotar, ver, tirar, e contar que comprou um item que estava anotado (o item vem com artigo e sem quantidade: \"comprei o arame\", mesmo quando ele diz quanto pagou)",
  leite: "produção de leite do dia e quantas vacas estão dando leite (entrou, secou, total)",
  mao_de_obra: "trabalhador FIXO da fazenda, o que tem salário: cadastro, pagamento já feito, pagamento que ele AINDA VAI fazer numa data (\"vou pagar o Pedro dia 10\"), adiantamento; quem ele contratou para um serviço, por diária ou por valor fechado, não é daqui",
  servicos: "serviço com máquina ou empreita, e o andamento dele: gente de fora paga por diária; alguém que ele contratou por um valor fechado; serviço prestado a cliente citando a máquina ou o preço; e o que acontece num serviço já registrado (começou, terminou, gastou combustível nele, ou avançou: \"fiz MAIS tanto\", \"avancei\", \"já fiz tanto hoje\"), mesmo sem máquina e sem preço",
  financeiro: "dinheiro: despesa ou receita avulsa, recibo, saldo do mês, relatório em PDF de QUALQUER área (financeiro, rebanho, lavoura, prestador), e também o dinheiro que um CLIENTE pagou ou ainda deve, quando ele cita a pessoa pelo nome (\"o João me pagou\", \"o João já pagou?\", \"quanto a Santa Fe ainda deve\"). O que ele PAGA a alguém da equipe fixa é mão de obra, mesmo dizendo o valor (\"paguei 2.500 pro Zé\")",
  dia: "agenda: o que tem para hoje, amanhã ou na semana, e criar lembrete ou tarefa",
  calculadoras: "contas de planejamento sem gravar nada: cerca, sementes, sal mineral, ração; perguntar COMO se pede uma dessas contas é conversa, não a conta",
  prestador: "para quem presta serviço, duas coisas só: o serviço do catálogo que ele NOMEIA e fez para um cliente, sem citar máquina nem preço (quantos hectares, horas ou diárias, sozinho, continua aqui); e o CADASTRO de um cliente, quem ele é e o que já contratou. Dinheiro que o cliente pagou ou ainda deve é FINANCEIRO, não daqui. Começar, terminar ou avançar (\"fiz MAIS tanto\") num serviço já registrado não é daqui, nem o que ele PAGA a quem trabalhou para ele",
  conversa: "pergunta de como usar o Tibé, e pedido de visão geral de uma área (rebanho, lavoura, prestador, financeiro) ou da relação inteira de contas a pagar ou a receber, SEM citar pessoa. Assim que ele nomeia alguém (\"o João já pagou?\") ou pergunta quem está devendo, é financeiro",
};

/** Todas as intenções, de todos os domínios, na ordem de `DOMINIOS`. */
export const INTENCOES: IntencaoDef[] = [
  ...INTENCOES_REBANHO,
  ...INTENCOES_CONFINAMENTO,
  ...INTENCOES_EVENTOS_E_PERMUTA,
  ...INTENCOES_ESTOQUE,
  ...INTENCOES_LISTA_DE_COMPRA,
  ...INTENCOES_LEITE,
  ...INTENCOES_MAO_DE_OBRA,
  ...INTENCOES_SERVICOS,
  ...INTENCOES_FINANCEIRO,
  ...INTENCOES_DIA,
  ...INTENCOES_CALCULADORAS,
  ...INTENCOES_PRESTADOR,
  ...INTENCOES_CONVERSA,
];

export function intencoesDoDominio(d: Dominio): IntencaoDef[] {
  return INTENCOES.filter((i) => i.dominio === d);
}

export function buscarIntencao(intent: string): IntencaoDef | null {
  return INTENCOES.find((i) => i.intent === intent) ?? null;
}

/**
 * Fora do registro: as duas legadas que o agente não emite mais (decisão 8 da
 * spec), `consultar_cliente` (decisão de produto de 16/09: as duas perguntas
 * de "quanto o cliente me deve" viravam intenções diferentes e o
 * classificador errava entre elas; `consultar_recebimento` passou a responder
 * as duas coisas, ver `whatsapp-handlers/financeiro.ts`), e `ambigua`, que
 * não tem extração (sai pronta da etapa de domínio).
 */
export const INTENCOES_FORA_DO_CLASSIFICADOR: readonly Intent[] = [
  "registrar_lote_animal",
  "registrar_movimento",
  "consultar_cliente",
  "ambigua",
];
