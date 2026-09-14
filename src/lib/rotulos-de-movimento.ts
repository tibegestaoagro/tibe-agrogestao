import type {
  HerdMovementType,
  MilkMovementType,
  StockMovementType,
} from "@/generated/prisma/enums";

/**
 * Como cada movimentação aparece para o produtor, na língua dele.
 *
 * Os dois primeiros mapas moravam dentro das páginas de Rebanho e de Estoque.
 * Saíram de lá no Módulo 38, quando o histórico do dia (§53) precisou dos
 * mesmos rótulos: copiar criaria dois mapas do mesmo enum, e eles divergiriam
 * no dia em que um tipo novo entrasse só num deles. Uma página do Next não
 * pode exportar constante, então o lugar compartilhado é este.
 *
 * ⚠️ **As chaves são o ENUM, e não `string`.** Com `Record<string, string>`, um
 * tipo novo no schema passa pelo `tsc` e aparece na tela com o nome cru
 * (`envio_boitel`, `permuta_saida`), que é nome de coluna de banco na frente
 * do produtor. O mapa do estoque era `Record<string>` até esta mudança.
 */

/**
 * ⚠️ TODO valor de `HerdMovementType` precisa estar aqui. As oito linhas das
 * fases 2 e 3 ficaram faltando desde que nasceram e só apareceram na validação
 * ao vivo da missão 4. O `npm run check` (conferência 9) reprova a ausência, e
 * lê ESTE arquivo.
 */
export const ROTULO_REBANHO: Record<HerdMovementType, string> = {
  saldo_inicial: "Saldo inicial",
  nascimento: "Nascimento",
  compra: "Compra",
  venda: "Venda",
  morte: "Morte",
  transferencia_pasto: "Mudança de pasto",
  transferencia_fazenda: "Mudança de fazenda",
  mudanca_categoria: "Mudança de categoria",
  ajuste: "Ajuste",
  envio_evento: "Envio para leilão ou feira",
  envio_pasto_terceiro: "Envio para pasto de terceiro",
  envio_boitel: "Envio para boitel",
  envio_confinamento: "Envio para confinamento",
  retorno_estadia: "Retorno para a fazenda",
  entrada_terceiro: "Entrada de animal de terceiro",
  saida_terceiro: "Devolução ao dono",
  desaparecimento: "Desaparecimento",
  perda_confirmada: "Perda confirmada",
  permuta_saida: "Permuta (entregue)",
  permuta_entrada: "Permuta (recebido)",
};

/** Em primeira pessoa de propósito: a tela do Estoque fala "Comprei", "Usei". */
export const ROTULO_ESTOQUE: Record<StockMovementType, string> = {
  compra: "Comprei",
  venda: "Vendi",
  utilizacao: "Usei",
  ajuste: "Corrigi",
  permuta_entrada: "Entrou por permuta",
  permuta_saida: "Saiu por permuta",
};

export const ROTULO_LEITE: Record<MilkMovementType, string> = {
  entrada_producao: "Produção",
  entrada_terceiro: "Leite recebido de terceiro",
  transferencia: "Leite transferido",
  saida: "Saída de leite",
  ajuste: "Ajuste de leite",
};
