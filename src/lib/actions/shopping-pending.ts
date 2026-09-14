import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O que a Lista de Compra perguntou e está esperando (Módulo 36, §17 e §19.7).
 *
 * ⚠️ **Por que isto existe, e por que não bastava ler os parâmetros da volta.**
 * A `m63`, escrita às cegas, pegou o defeito: "tira o arame da lista" seguido
 * de "sim" não removia nada, porque o handler exigia a descrição de novo, e na
 * confirmação o classificador não a remanda. Todos os outros nove domínios
 * deste projeto guardam o pedido; este nasceu sem, e a diferença só apareceu
 * quando alguém testou a conversa inteira, e não cada volta isolada.
 *
 * O pedido guardado MANDA sobre a reconstrução do classificador: da mensagem
 * seguinte aproveitamos só a resposta, e o alvo vem daqui.
 */

/** O que o assistente perguntou. Nos três casos, espera um sim ou não. */
export type CampoLista =
  /** "Tenho certeza que é para tirar este item?" */
  | "confirmacao_remocao"
  /** §19.7: "esse item já está na sua lista, quer anotar mais assim mesmo?" */
  | "confirmacao_duplicata"
  /** "Comprou X por R$ Y? Vou lançar a despesa e tirar da lista." */
  | "confirmacao_compra";

export type PedidoDeLista = PedidoBase<CampoLista>;

const store = criarStoreDePendencia<CampoLista>({
  prefixo: "lista-compra-pending",
  aceitaNumero: false,
});

export const savePendingLista = store.salvar;
export const loadPendingLista = store.carregar;
export const clearPendingLista = store.limpar;
