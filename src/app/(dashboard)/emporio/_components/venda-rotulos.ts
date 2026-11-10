/**
 * Rótulos em português da venda e do caixa. Sem estado e sem "use client", de
 * propósito: as páginas de servidor também os leem, e um valor importado de um
 * módulo client chega ao servidor como referência, não como objeto.
 */

import { RATEIO_ROTULO_SERVIDOR } from "@/lib/emporio/rateio";

/** Forma de pagamento da venda, como o balcão e o detalhe da venda a chamam. */
export const FORMA_ROTULO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  fiado: "Fiado",
  debito: "Débito",
  credito_vista: "Crédito",
  credito_parcelado: "Parcelado",
  cheque: "Cheque",
  boleto: "Boleto",
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

/** Situação do boleto (`EmporioBoletoStatus`); "vencido" é o aberto que passou do vencimento. */
export const BOLETO_SITUACAO_ROTULO: Record<string, string> = {
  aberto: "Em aberto",
  vencido: "Vencido",
  pago: "Pago",
  no_fiado: "No fiado",
  cancelado: "Cancelado",
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
  boleto_pago: "Boleto pago",
  estorno_cartao: "Estorno de cartão",
  pagamento_despesa: "Pagamento de despesa",
  sangria: "Sangria",
  malote: "Malote",
  reforco: "Reforço de troco",
  entrega_gerencia: "Entrega ao gerente",
  pagamento_compra: "Pagamento de compra",
};

/** Cálculo de uma regra do "Vendeu, Pagou" (`VariableExpenseKind`). */
export const TIPO_REGRA_ROTULO: Record<string, string> = {
  percentual: "% do valor da venda",
  fixo_por_venda: "Valor fixo por venda",
  por_unidade: "Valor por unidade vendida",
  embalagem: "Embalagem do estoque",
};

/** Como o rateio de uma despesa fixa é dividido: a mesma lista do servidor (módulo puro), sem duplicar. */
export const RATEIO_ROTULO = RATEIO_ROTULO_SERVIDOR;
