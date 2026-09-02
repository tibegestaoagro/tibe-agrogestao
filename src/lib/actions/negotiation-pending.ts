import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O negócio que ficou esperando uma resposta (Módulo 31, registro por
 * WhatsApp).
 *
 * Mesmo mecanismo e mesmos motivos de `herd-pending.ts`, que nasceu de três
 * defeitos reais em produção e cujas lições valem inteiras aqui: o pedido
 * guardado manda sobre a reconstrução do classificador, da mensagem seguinte
 * entra SÓ o campo perguntado, e um "sim" sem nada guardado não escreve nada.
 *
 * Um negócio erra mais caro que uma movimentação: uma linha grava animais no
 * rebanho E parcelas no financeiro de uma vez. Confirmação sem âncora aqui
 * seria assinatura em papel em branco com o rebanho junto.
 *
 * ✅ A duplicação que este arquivo anunciava FOI PAGA em 02/09. O comentário
 * anterior dizia, sobre as trinta linhas de Redis: "quando o terceiro domínio
 * precisar disto, aí sim vale extrair um store genérico; dois casos ainda são
 * coincidência, três são um padrão." Chegamos a SETE antes de a extração
 * acontecer, e o sexto e o sétimo (`leite` e `confinamento`) foram copiados
 * linha a linha de um dos anteriores. O mecanismo agora mora em
 * `pending-store.ts`; aqui ficou só o vocabulário deste domínio.
 */

/** O campo que o assistente perguntou e está esperando. */
export type CampoNegocio =
  | "tipo"
  | "categoria"
  | "quantidade"
  | "valor"
  | "fazenda"
  | "pasto"
  | "data"
  | "vencimento"
  | "parcelamento"
  /** A contradição "já paguei" + "vou parcelar". Responder LIMPA o lado oposto. */
  | "pagamento"
  /** Não é campo: é o negócio inteiro esperando um "sim". */
  | "confirmacao";

export type NegocioPendente = PedidoBase<CampoNegocio>;

export { MAX_TENTATIVAS } from "@/lib/actions/pending-store";

const store = criarStoreDePendencia<CampoNegocio>({
  prefixo: "negocio-pending",
  /**
   * Aceita número além de texto porque `quantidade` e `valor` chegam do
   * classificador como número, e exigir string descartaria a resposta certa.
   */
  aceitaNumero: true,
  /**
   * Nome alternativo que o classificador usa para o mesmo campo. Mesma
   * necessidade de `herd-pending.ts`: o modelo não carrega de volta qual era a
   * pergunta, então responde com o nome mais natural do campo.
   */
  atalho: (campo) => {
    if (campo === "categoria") return "category";
    if (campo === "fazenda") return "property";
    if (campo === "pasto") return "pasto_origem";
    if (campo === "data") return "date";
    if (campo === "vencimento") return "due_date";
    if (campo === "parcelamento") return "parcelas";
    if (campo === "pagamento") return "pago";
    if (campo === "valor") return "amount";
    if (campo === "quantidade") return "quantity";
    if (campo === "tipo") return "negotiation_type";
    return campo;
  },
});

/** A chave deste domínio. Lida por `stock-pending.ts` para desempatar por data. */
export const chaveDoNegocio = store.chave;

export const savePendingNegotiation = store.salvar;
export const loadPendingNegotiation = store.carregar;
export const clearPendingNegotiation = store.limpar;
export const aplicarRespostaNegocio = store.aplicarResposta;
