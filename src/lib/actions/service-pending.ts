import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O serviço contratado que ficou esperando resposta (Módulo 33, fase 2, §32).
 *
 * ✅ Nove linhas de configuração porque a dívida 3.2 foi paga na fase 33.1.
 * Antes da extração, este arquivo teria as mesmas ~90 linhas de Redis das
 * outras sete cópias, e seria a NONA.
 */

export type GestoServico = "diaria" | "empreito";

/** O campo que o assistente perguntou e está esperando. */
export type CampoServico =
  | "servico"
  | "valor"
  | "quantidade"
  | "pessoas"
  | "quem"
  /** Não é campo: é o serviço inteiro esperando um "sim". */
  | "confirmacao";

export type ServicoPendente = PedidoBase<CampoServico> & {
  /** Qual das duas conversas está aberta. */
  gesto: GestoServico;
};

const store = criarStoreDePendencia<CampoServico, ServicoPendente>({
  prefixo: "servico-pending",
  /**
   * O nome alternativo que o classificador usa para o mesmo campo: ele não
   * carrega de volta qual era a pergunta, então responde com o nome mais
   * natural.
   */
  atalho: (campo) => {
    if (campo === "servico") return "description";
    if (campo === "valor") return "amount";
    if (campo === "quantidade") return "quantity";
    if (campo === "pessoas") return "worker_count";
    if (campo === "quem") return "contact_name";
    return campo;
  },
});

export const savePendingService = store.salvar;
export const loadPendingService = store.carregar;
export const clearPendingService = store.limpar;
export const aplicarRespostaServico = store.aplicarResposta;
