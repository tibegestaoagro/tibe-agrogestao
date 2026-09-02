import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * A remessa de evento que ficou esperando uma resposta (Módulo 31, missão 3).
 *
 * Mesmo mecanismo e mesmos motivos de `negotiation-pending.ts` e
 * `herd-pending.ts`: o pedido guardado manda sobre a reconstrução do
 * classificador, da mensagem seguinte entra SÓ o campo perguntado, e um "sim"
 * sem nada guardado não escreve nada.
 *
 * SEM ESTA ÂNCORA o handler estaria repetindo um defeito já pago em produção:
 * em 2026-08-18, no estoque, o "sim" executou o que o classificador remontou,
 * mostrando 10 sacas e gravando 100. O guia do n8n manda o LLM remontar os
 * parâmetros pelo histórico, e `auxiliary_data` é só SAÍDA: não há por onde
 * receber de volta o que foi mostrado.
 *
 * Chave PRÓPRIA, e não a de `negocio-pending`: um leilão e uma compra de gado
 * são duas conversas diferentes, e dividir a chave faria um "sim" de uma
 * executar a outra.
 *
 * ✅ A "duplicação deliberada" que este arquivo anunciava foi extraída em
 * 02/09 para `pending-store.ts`. Aqui ficou o vocabulário deste domínio.
 */

/** O campo que o assistente perguntou e está esperando. */
export type CampoRemessa =
  | "categoria"
  | "quantidade"
  | "evento"
  | "fazenda"
  | "vendidos"
  | "retornados"
  | "valor"
  /** Não é campo: é a remessa inteira esperando um "sim". */
  | "confirmacao";

export type RemessaPendente = PedidoBase<CampoRemessa> & {
  /** Qual das duas conversas está aberta: abrir a remessa ou encerrá-la. */
  gesto: "abrir" | "encerrar";
  /** A remessa sendo encerrada, quando o gesto é `encerrar`. */
  negotiation_id?: string;
};

const store = criarStoreDePendencia<CampoRemessa, RemessaPendente>({
  prefixo: "remessa-pending",
  /**
   * O nome alternativo que o classificador usa para o mesmo campo: ele não
   * carrega de volta qual era a pergunta, então responde com o nome mais
   * natural.
   */
  atalho: (campo) => {
    if (campo === "categoria") return "category";
    if (campo === "fazenda") return "property";
    if (campo === "quantidade") return "quantity";
    if (campo === "evento") return "event_name";
    if (campo === "valor") return "amount";
    return campo;
  },
});

export const savePendingEvent = store.salvar;
export const loadPendingEvent = store.carregar;
export const clearPendingEvent = store.limpar;
export const aplicarRespostaRemessa = store.aplicarResposta;
