import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O pedido de leite que ficou esperando uma resposta (Área Leite, §36).
 *
 * Mesmo mecanismo e mesmos motivos de `confinamento-pending.ts`,
 * `event-pending.ts` e `barter-pending.ts`: o pedido guardado manda sobre a
 * reconstrução do classificador, da mensagem seguinte entra SÓ o campo
 * perguntado, e um "sim" sem nada guardado não escreve nada.
 *
 * SEM ESTA ÂNCORA o handler repetiria o defeito já pago em produção em
 * 2026-08-18: o "sim" executando o que o classificador remontou, não o que foi
 * mostrado. O §36 mostra o TIBÉ confirmando em todas as conversas do leite,
 * então todas passam por aqui.
 *
 * ✅ A "duplicação deliberada" que este arquivo anunciava foi extraída em 02/09
 * para `pending-store.ts`. Aqui ficou o vocabulário deste domínio.
 */

/**
 * A lactação guarda o gesto EXATO (definir, entrada, saída), não a família.
 * Com um "lactacao" só, o "sim" à pergunta "atualizar para 32 vacas?" chegando
 * como `registrar_entrada_lactacao` gravava uma ENTRADA de 32 vacas.
 */
export type GestoLeite = "producao" | "definir" | "entrada" | "saida";

/** O campo que o assistente perguntou e está esperando. */
export type CampoLeite =
  | "litros"
  | "quantidade"
  | "fazenda"
  | "lote"
  | "data"
  /** Não é campo: é o pedido inteiro esperando um "sim". */
  | "confirmacao";

export type LeitePendente = PedidoBase<CampoLeite> & {
  /** Qual das quatro conversas está aberta. */
  gesto: GestoLeite;
};

const store = criarStoreDePendencia<CampoLeite, LeitePendente>({
  prefixo: "leite-pending",
  /**
   * O nome alternativo que o classificador usa para o mesmo campo: ele não
   * carrega de volta qual era a pergunta, então responde com o nome mais
   * natural.
   */
  atalho: (campo) => {
    if (campo === "litros") return "liters";
    if (campo === "quantidade") return "quantity";
    if (campo === "fazenda") return "property";
    if (campo === "lote") return "group";
    if (campo === "data") return "date";
    return campo;
  },
});

export const savePendingMilk = store.salvar;
export const loadPendingMilk = store.carregar;
export const clearPendingMilk = store.limpar;
export const aplicarRespostaLeite = store.aplicarResposta;
