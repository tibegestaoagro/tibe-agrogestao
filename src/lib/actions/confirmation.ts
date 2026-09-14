/**
 * Interpretação de respostas de confirmação em texto livre (spec 3.6).
 * Usado como camada de segurança independente do LLM do N8N: mesmo que o N8N
 * já classifique a confirmação, o Tibé também sabe interpretar "sim"/"não" a
 * partir do texto bruto da mensagem, se fornecido.
 */
const YES_WORDS = [
  "sim", "s", "confirmo", "confirmado", "confirma", "isso mesmo", "isso",
  "correto", "pode", "ok", "beleza", "positivo", "certo",
];
/**
 * As formas de recusar que o produtor usa de verdade.
 *
 * "deixa pra lá" e "esquece" não estavam aqui, embora o cadastro assistido já
 * as reconhecesse na sua própria lista (`whatsapp-flow-bridge.CANCEL_WORDS`) e
 * embora dois comentários deste módulo AFIRMASSEM que "deixa pra lá" cancelava.
 * Não cancelava: a confirmação voltava igual, e a saída que sobrava era dizer
 * "ok", que executava. Duas listas para a mesma intenção divergem, e foi o que
 * aconteceu.
 *
 * "para" e "parar" saíram da lista: são preposição no português do produtor
 * ("para o João", "para amanhã"), não recusa, e estavam classificando frase
 * nova como "não" sem o usuário nunca ter recusado nada.
 */
const NO_WORDS = [
  "não", "nao", "n", "cancela", "cancelar", "cancelado", "errado", "negativo",
  "deixa pra la", "deixa pra lá", "deixa quieto", "esquece", "esquecer",
  "melhor nao", "melhor não", "nao quero", "não quero",
];
/** Palavra de recusa em QUALQUER posição: desempata "pode cancelar" e "isso aí não é". */
const NEGACAO_SOLTA = new Set(["não", "nao", "cancela", "cancelar", "errado", "esquece"]);
const MAX_PALAVRAS_SIM = 5;
const MAX_PALAVRAS_NAO = 6;

/**
 * A PONTUAÇÃO É TIRADA ANTES DE COMPARAR.
 *
 * A versão anterior casava a palavra nua ou seguida de espaço, e por isso
 * "Não, deixa pra lá", "Não!", "não." e "sim, pode" devolviam `null`: nem sim
 * nem não. O produtor recusava, o assistente repetia a mesma confirmação, e a
 * saída que sobrava era dizer "ok" -- que EXECUTAVA o que ele tinha acabado de
 * recusar. Um revisor independente reproduziu o diálogo inteiro.
 *
 * Vale para todo o agente, não só para o estoque. O estoque é só onde doeu
 * primeiro, porque é o primeiro módulo com um gesto que escreve SEM
 * confirmação (o uso, §10.3): ali um "não" perdido custa uma gravação, não
 * apenas uma pergunta repetida.
 *
 * REGRA ESTRITA (2026-09-14): a versão anterior casava a lista inteira contra
 * qualquer prefixo, então "pode lançar 500 de diesel" virava "yes" (começa com
 * "pode") e "para o João" virava "no" (começava com "para"). Nas duas, o texto
 * não era confirmação nenhuma: era o produtor descrevendo outra coisa. Agora
 * "sim" só vale para mensagem curta, sem dígito e sem negação solta, e "não"
 * só vale para mensagem curta que começa por recusa; fora disso o handler
 * pergunta de novo em vez de adivinhar.
 */
export function detectConfirmation(text?: string | null): "yes" | "no" | null {
  if (!text) return null;
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  const palavras = t.split(" ");
  const comeca = (lista: string[]) => lista.some((w) => t === w || t.startsWith(`${w} `));
  const temDigito = /\d/.test(t);
  const temNegacao = palavras.some((p) => NEGACAO_SOLTA.has(p));

  if (comeca(NO_WORDS) && palavras.length <= MAX_PALAVRAS_NAO && !temDigito) return "no";
  if (comeca(YES_WORDS) && !temNegacao && !temDigito && palavras.length <= MAX_PALAVRAS_SIM) return "yes";
  return null;
}
