/**
 * Interpretação de respostas de confirmação em texto livre (spec 3.6).
 * Usado como camada de segurança independente do LLM do N8N: mesmo que o N8N
 * já classifique a confirmação, o Tibé também sabe interpretar "sim"/"não" a
 * partir do texto bruto da mensagem, se fornecido.
 */
const YES_WORDS = [
  "sim", "s", "confirmo", "confirmado", "confirma", "isso mesmo", "isso",
  "correto", "pode", "ok", "beleza", "positivo",
];
const NO_WORDS = [
  "não", "nao", "n", "cancela", "cancelar", "cancelado", "errado", "negativo",
];

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
 */
export function detectConfirmation(text?: string | null): "yes" | "no" | null {
  if (!text) return null;
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (YES_WORDS.some((w) => t === w || t.startsWith(`${w} `))) return "yes";
  if (NO_WORDS.some((w) => t === w || t.startsWith(`${w} `))) return "no";
  return null;
}
