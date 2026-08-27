import type {
  HerdMovementType,
  HerdOwner,
  HerdSituation,
  HerdStayType,
} from "@/generated/prisma/client";

/**
 * As regras de cada tipo de estadia, como TABELA.
 *
 * Elas vêm escritas do complemento do Rebanho, uma por fluxo, e valem para
 * todo caminho de escrita, inclusive os que ainda não existem. Espalhá-las em
 * `if` dentro da action significaria testá-las só pelo caminho que a action
 * expõe, e é justamente nos encerramentos que a spec do Módulo 30 diz morarem
 * os piores bugs.
 *
 * Módulo puro: nenhum import de runtime, nenhum I/O, e por isso serve tanto à
 * action quanto a uma tela. Prova em `scripts/m47-estadias.test.ts`.
 *
 * `import type` é apagado na compilação, então o Prisma não entra no bundle do
 * navegador. Mesma armadilha já documentada para `@/lib/permissions`.
 */

type RegraDaEstadia = {
  /** Onde as cabeças ficam enquanto a estadia dura. */
  situacao: HerdSituation;
  /** De quem elas são enquanto a estadia dura. */
  dono: HerdOwner;
  /** O movimento que abre a estadia. */
  envio: HerdMovementType;
  /** Tudo que pode tirar cabeças de lá. Nada fora desta lista passa. */
  encerramentos: HerdMovementType[];
};

const REGRAS: Record<HerdStayType, RegraDaEstadia> = {
  /**
   * "Os animais continuam pertencendo ao produtor, mas ficam temporariamente
   * em outra propriedade. Permitir o retorno total ou parcial."
   */
  pasto_terceiro: {
    situacao: "pasto_terceiro",
    dono: "proprio",
    envio: "envio_pasto_terceiro",
    encerramentos: ["retorno_estadia", "venda", "morte"],
  },

  /**
   * "Manter os animais no rebanho próprio; permitir retorno, venda direta ou
   * morte."
   */
  boitel: {
    situacao: "boitel",
    dono: "proprio",
    envio: "envio_boitel",
    encerramentos: ["retorno_estadia", "venda", "morte"],
  },

  /**
   * Leilão e feira. Nasce aqui sem uso: o fluxo é a missão 3 do Módulo 31,
   * porque remessa num módulo e encerramento em outro seria o registro
   * partido em dois. A regra fica pronta para quando ele chegar.
   */
  evento: {
    situacao: "evento",
    dono: "proprio",
    envio: "envio_evento",
    encerramentos: ["retorno_estadia", "venda", "morte"],
  },

  /**
   * "Os animais estão fisicamente na fazenda, mas não pertencem ao produtor."
   * Por isso `presente` e `terceiro`: eles ocupam o pasto e não entram no
   * rebanho. Vender não está na lista, e não é esquecimento: o produtor não
   * pode vender o que não é dele.
   */
  terceiro_na_fazenda: {
    situacao: "presente",
    dono: "terceiro",
    envio: "entrada_terceiro",
    encerramentos: ["saida_terceiro"],
  },

  /**
   * "Enquanto o desaparecimento estiver em aberto, o animal deverá aparecer
   * separadamente no resumo e NÃO PODERÁ ser vendido, transferido ou
   * movimentado." Os encerramentos possíveis são exatamente três: encontrado,
   * morte confirmada e perda confirmada.
   */
  desaparecimento: {
    situacao: "desaparecido",
    dono: "proprio",
    envio: "desaparecimento",
    encerramentos: ["retorno_estadia", "morte", "perda_confirmada"],
  },
};

export function situacaoDaEstadia(type: HerdStayType): HerdSituation {
  return REGRAS[type].situacao;
}

export function donoDaEstadia(type: HerdStayType): HerdOwner {
  return REGRAS[type].dono;
}

export function tipoDeEnvio(type: HerdStayType): HerdMovementType {
  return REGRAS[type].envio;
}

export function encerramentosPermitidos(type: HerdStayType): HerdMovementType[] {
  return [...REGRAS[type].encerramentos];
}

/**
 * A pergunta que a action faz antes de gravar qualquer saída de uma estadia.
 * Lista fechada de propósito: um tipo de movimento novo não passa a ser
 * permitido só por existir.
 */
export function permiteEncerramento(
  type: HerdStayType,
  movimento: HerdMovementType,
): boolean {
  return REGRAS[type].encerramentos.includes(movimento);
}
