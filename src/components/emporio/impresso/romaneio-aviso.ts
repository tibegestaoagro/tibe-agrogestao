import type { RomaneioView } from "@/lib/actions/emporio-impressao";

/** D7: o aviso do romaneio de uma venda que não está mais ativa. Nulo quando está. */
export function avisoDaSituacao(situacao: RomaneioView["situacao"]): string | null {
  switch (situacao) {
    case "cancelada":
      return "VENDA CANCELADA: NÃO SEPARAR";
    case "trocada":
      return "VENDA TROCADA: NÃO SEPARAR";
    case "devolvida":
      return "VENDA COM DEVOLUÇÃO: CONFIRA NA VENDA ANTES DE SEPARAR";
    default:
      return null;
  }
}
