import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O pedido de rebanho que ficou esperando uma resposta (Módulo 30, §14).
 *
 * O mecanismo (Redis, TTL, "só o campo perguntado entra") mora em
 * `pending-store.ts` desde 02/09, quando as sete cópias viraram uma. O que
 * sobrou aqui é o vocabulário DESTE domínio: quais campos podem ficar
 * pendentes, e por que nome o classificador os chama.
 */

/**
 * O campo que o assistente perguntou e está esperando.
 *
 * `movement_type` entra na lista porque o classificador erra o TIPO com
 * frequência (herda "nascimento" de uma conversa anterior). Quando o tipo
 * conflita com a categoria de forma impossível, perguntar o tipo é melhor do
 * que recusar: a informação que falta é uma só.
 */
export type CampoPendente =
  | "movement_type"
  | "categoria"
  | "categoria_destino"
  | "fazenda"
  | "pasto"
  /**
   * Não é um campo: é o pedido inteiro esperando um "sim". Guardado pelo mesmo
   * mecanismo porque o problema é o mesmo. Em 2026-08-10 um "sim" gravou 18
   * animais que o produtor nunca pediu: ele mandou VENDER 100, o assistente
   * respondeu "você tem 18", e o classificador montou um pedido novo com o 18
   * que leu na própria resposta. Com o pedido guardado, o "sim" executa o que
   * foi MOSTRADO, e um "sim" sem nada guardado não escreve nada.
   */
  | "confirmacao";

export type PedidoPendente = PedidoBase<CampoPendente>;

export { MAX_TENTATIVAS } from "@/lib/actions/pending-store";

const store = criarStoreDePendencia<CampoPendente>({
  prefixo: "herd-pending",
  /**
   * ⚠️ Só texto conta como resposta, e isto é o comportamento ANTERIOR à
   * extração, preservado de propósito. Os campos deste domínio são todos
   * textuais (tipo, categoria, fazenda, pasto), então na prática a diferença
   * quase não aparece; mudar para aceitar número seria decisão sobre o caminho
   * do WhatsApp, com banco de provas, não faxina de refatoração.
   */
  aceitaNumero: false,
  /**
   * Nome alternativo que o classificador às vezes usa para o mesmo campo.
   *
   * `categoria_destino` aceita `categoria` porque, para o modelo, a resposta a
   * "São machos ou fêmeas?" é só "uma categoria": ele não carrega de volta que
   * a pergunta era sobre o DESTINO. Sem isso, a resposta não casava, o pedido
   * guardado era descartado e a reconstrução do LLM punha a mesma categoria nas
   * duas pontas, gerando "transferir de Fêmea 25-36 para Fêmea 25-36".
   */
  atalho: (campo) => {
    if (campo === "categoria") return "category";
    if (campo === "categoria_destino") return "categoria";
    if (campo === "fazenda") return "property";
    if (campo === "pasto") return "pasto_origem";
    if (campo === "movement_type") return "tipo";
    return campo;
  },
});

/** A chave deste domínio. Lida por `stock-pending.ts` para desempatar por data. */
export const chaveDoRebanho = store.chave;

export const savePendingHerd = store.salvar;
export const loadPendingHerd = store.carregar;
export const clearPendingHerd = store.limpar;
export const aplicarResposta = store.aplicarResposta;
