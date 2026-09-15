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
  confinamento: "animais no confinamento ou no boitel: entrada, envio ao boitel, trato e ração do lote, saída, venda ou morte no confinamento",
  eventos_e_permuta: "gado mandado para leilão, feira ou evento e o resultado dele; troca de animais por outra coisa (permuta)",
  estoque: "insumos e produtos (sal, ração, vermífugo, adubo, diesel): compra, venda, uso, contagem, quanto tem",
  lista_de_compra: "lista do que precisa comprar: anotar, ver, tirar, marcar que comprou",
  leite: "produção de leite do dia e quantas vacas estão dando leite (entrou, secou, total)",
  mao_de_obra: "trabalhador fixo da fazenda: cadastro, pagamento, adiantamento",
  servicos: "serviço com máquina ou empreita: diária de gente contratada, serviço contratado, serviço prestado para cliente, começar, produção, combustível e terminar o serviço",
  financeiro: "dinheiro solto: despesa ou receita avulsa, recibo, saldo do mês, relatório financeiro",
  dia: "agenda: o que tem para hoje, amanhã ou na semana, e criar lembrete ou tarefa",
  calculadoras: "contas de planejamento sem gravar nada: cerca, sementes, sal mineral, ração",
  prestador: "para quem presta serviço: ordem de serviço para cliente e dados de cliente",
  conversa: "pergunta de como usar o Tibé ou pedido de ver o que já está cadastrado",
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
 * Fora do registro: as duas legadas que o agente não emite mais (decisão 8 da spec) e `ambigua`, que
 * não tem extração (sai pronta da etapa de domínio).
 */
export const INTENCOES_FORA_DO_CLASSIFICADOR: readonly Intent[] = [
  "registrar_lote_animal",
  "registrar_movimento",
  "ambigua",
];
