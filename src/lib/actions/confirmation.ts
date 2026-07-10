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

export function detectConfirmation(text?: string | null): "yes" | "no" | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (YES_WORDS.some((w) => t === w || t.startsWith(`${w} `))) return "yes";
  if (NO_WORDS.some((w) => t === w || t.startsWith(`${w} `))) return "no";
  return null;
}
