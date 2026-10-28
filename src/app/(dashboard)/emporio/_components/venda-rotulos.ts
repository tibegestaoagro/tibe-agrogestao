/**
 * Rótulos em português da venda e do caixa. Sem estado e sem "use client", de
 * propósito: as páginas de servidor também os leem, e um valor importado de um
 * módulo client chega ao servidor como referência, não como objeto.
 */

/** Forma de pagamento da venda, como o balcão e o detalhe da venda a chamam. */
export const FORMA_ROTULO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  fiado: "Fiado",
  troca: "Valor da troca",
};

/** Origem de um movimento de caixa (`CashMovementOrigin`). */
export const ORIGEM_CAIXA_ROTULO: Record<string, string> = {
  venda: "Venda",
  recebimento_fiado: "Recebimento de fiado",
  cancelamento_venda: "Venda cancelada",
  devolucao: "Devolução",
  implantacao: "Saldo inicial",
};
