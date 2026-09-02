import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O pedido de mão de obra que ficou esperando resposta (Módulo 33, §32).
 *
 * ✅ ESTE ARQUIVO TEM 40 LINHAS PORQUE A DÍVIDA 3.2 FOI PAGA. Antes da
 * extração de 02/09 ele teria as mesmas ~90 linhas de Redis das outras sete
 * cópias, e seria a oitava. O mecanismo mora em `pending-store.ts`; aqui fica
 * só o vocabulário deste domínio.
 */

export type GestoMaoDeObra = "cadastro" | "pagamento" | "adiantamento";

/** O campo que o assistente perguntou e está esperando. */
export type CampoMaoDeObra =
  | "nome"
  | "funcao"
  | "valor"
  | "frequencia"
  /** Não é campo: é o pedido inteiro esperando um "sim". */
  | "confirmacao";

export type MaoDeObraPendente = PedidoBase<CampoMaoDeObra> & {
  /** Qual das três conversas está aberta. */
  gesto: GestoMaoDeObra;
};

const store = criarStoreDePendencia<CampoMaoDeObra, MaoDeObraPendente>({
  prefixo: "mao-de-obra-pending",
  /**
   * O nome alternativo que o classificador usa para o mesmo campo: ele não
   * carrega de volta qual era a pergunta, então responde com o nome mais
   * natural.
   */
  atalho: (campo) => {
    if (campo === "nome") return "name";
    if (campo === "funcao") return "role";
    if (campo === "valor") return "amount";
    if (campo === "frequencia") return "pay_frequency";
    return campo;
  },
});

export const savePendingWorker = store.salvar;
export const loadPendingWorker = store.carregar;
export const clearPendingWorker = store.limpar;
export const aplicarRespostaMaoDeObra = store.aplicarResposta;
