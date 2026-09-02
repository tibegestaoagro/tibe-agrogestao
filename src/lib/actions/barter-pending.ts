import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * A permuta que ficou esperando uma resposta (Módulo 31, missão 4).
 *
 * Mesmo mecanismo e mesmos motivos de `event-pending.ts`,
 * `negotiation-pending.ts` e `herd-pending.ts`: o pedido guardado manda sobre a
 * reconstrução do classificador, da mensagem seguinte entra SÓ o campo
 * perguntado, e um "sim" sem nada guardado não escreve nada.
 *
 * SEM ESTA ÂNCORA o handler estaria repetindo um defeito já pago em produção:
 * em 2026-08-18, no estoque, o "sim" executou o que o classificador remontou,
 * mostrando 10 sacas e gravando 100. O guia do n8n manda o LLM remontar os
 * parâmetros pelo histórico, e `auxiliary_data` é só SAÍDA: não há por onde
 * receber de volta o que foi mostrado.
 *
 * Chave PRÓPRIA: uma permuta e uma compra de gado são duas conversas
 * diferentes, e dividir a chave faria um "sim" de uma executar a outra.
 *
 * ✅ Este arquivo era a QUINTA cópia do mecanismo, e o aviso que ele carregava
 * ("mexer em quatro módulos validados em produção no meio desta missão é o
 * risco que a própria nota alertava") virou dívida paga em 02/09, numa frente
 * própria, com as seis suítes rodadas antes e depois. O Redis agora mora em
 * `pending-store.ts`.
 */

/** O campo que o assistente perguntou e está esperando. */
export type CampoPermuta =
  | "entregue"
  | "recebido"
  | "diferenca"
  | "fazenda"
  | "pasto"
  /** Não é campo: é a permuta inteira esperando um "sim". */
  | "confirmacao";

export type PermutaPendente = PedidoBase<CampoPermuta>;

const store = criarStoreDePendencia<CampoPermuta>({
  prefixo: "permuta-pending",
  /**
   * O nome alternativo que o classificador usa para o mesmo campo: ele não
   * carrega de volta qual era a pergunta, então responde com o nome mais
   * natural.
   */
  atalho: (campo) => {
    if (campo === "entregue") return "entreguei";
    if (campo === "recebido") return "recebi";
    if (campo === "diferenca") return "valor";
    if (campo === "fazenda") return "property";
    if (campo === "pasto") return "pasture";
    return campo;
  },
});

export const savePendingBarter = store.salvar;
export const loadPendingBarter = store.carregar;
export const clearPendingBarter = store.limpar;
export const aplicarRespostaPermuta = store.aplicarResposta;
