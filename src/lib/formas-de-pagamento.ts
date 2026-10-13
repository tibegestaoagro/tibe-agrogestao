/**
 * As formas de pagamento do §13 do documento de Negociações, com o rótulo que
 * o produtor lê. Espelha o enum `PaymentMethod` do Prisma; módulo puro, para
 * a tela importar sem arrastar Prisma para o navegador.
 *
 * "Parcelamento" e "compensação em permuta", que o §13 também lista, não são
 * forma: o primeiro são as parcelas do negócio, o segundo é a própria permuta.
 */
export const FORMAS_DE_PAGAMENTO = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "PIX" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "cheque", rotulo: "Cheque" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number]["valor"];

export const VALORES_DE_FORMA = FORMAS_DE_PAGAMENTO.map((f) => f.valor) as [FormaDePagamento, ...FormaDePagamento[]];

export const ROTULO_DA_FORMA: Record<string, string> = Object.fromEntries(
  FORMAS_DE_PAGAMENTO.map((f) => [f.valor, f.rotulo]),
);

/**
 * Lê a forma do jeito que o produtor fala ("no pix", "em dinheiro", "cartão
 * de crédito"). Para o parâmetro do agente do WhatsApp: o que não reconhece
 * vira `null`, e o negócio entra sem forma, nunca com uma inventada.
 */
export function lerFormaDePagamento(texto: unknown): FormaDePagamento | null {
  if (typeof texto !== "string") return null;
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/\bpix\b/.test(t)) return "pix";
  if (/dinheiro|especie/.test(t)) return "dinheiro";
  if (/transferencia|\bted\b|\bdoc\b/.test(t)) return "transferencia";
  if (/boleto/.test(t)) return "boleto";
  if (/cheque/.test(t)) return "cheque";
  if (/cartao|credito|debito/.test(t)) return "cartao";
  return null;
}
