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
  debito: "Débito",
  credito_vista: "Crédito",
  credito_parcelado: "Parcelado",
  cheque: "Cheque",
  troca: "Valor da troca",
};

/** As três formas de cartão que têm taxa cadastrada por loja (`CardKind`). */
export const CARTAO_ROTULO: Record<string, string> = {
  debito: "Débito",
  credito_vista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
};

/** Situação do cheque (`EmporioCheckStatus`), como a pessoa do balcão a chama. */
export const CHEQUE_SITUACAO_ROTULO: Record<string, string> = {
  recebido: "Na carteira",
  depositado: "Depositado",
  compensado: "Compensado",
  devolvido: "Devolvido pelo banco",
  devolvido_ao_cliente: "Devolvido ao cliente",
};

/** Origem de um movimento de caixa (`CashMovementOrigin`). */
export const ORIGEM_CAIXA_ROTULO: Record<string, string> = {
  venda: "Venda",
  recebimento_fiado: "Recebimento de fiado",
  cancelamento_venda: "Venda cancelada",
  devolucao: "Devolução",
  implantacao: "Saldo inicial",
  transferencia: "Transferência entre caixas",
  conferencia: "Ajuste de conferência",
  cheque_compensado: "Cheque compensado",
  estorno_cartao: "Estorno de cartão",
};
