import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O pedido de confinamento que ficou esperando uma resposta (Módulo 30, fase
 * 3, §26). Mesmo mecanismo e mesmos motivos de `event-pending.ts` e
 * `barter-pending.ts`: o pedido guardado manda sobre a reconstrução do
 * classificador, da mensagem seguinte entra SÓ o campo perguntado, e um "sim"
 * sem nada guardado não escreve nada.
 *
 * SEM ESTA ÂNCORA o handler repetiria o defeito já pago em produção em
 * 2026-08-18: o "sim" executando o que o classificador remontou, não o que foi
 * mostrado.
 *
 * Chave ÚNICA por pessoa, como em `event-pending.ts`: quatro gestos possíveis
 * (entrada em confinamento, envio a boitel, alimentação, saída), e cada handler
 * confere `gesto` antes de usar o que está guardado, para o "sim" de uma
 * conversa não executar a de outra.
 *
 * ✅ Este arquivo foi a SÉTIMA cópia do mecanismo, modelada linha a linha em
 * `event-pending.ts`, e é a que fez a dívida ser paga: quando o Confinamento
 * chegou, a nota que pedia extração no TERCEIRO caso já tinha sido ignorada
 * quatro vezes. O Redis mora em `pending-store.ts` desde 02/09.
 */

export type GestoConfinamento = "entrada_confinamento" | "entrada_boitel" | "alimentacao" | "saida";

/** O campo que o assistente perguntou e está esperando. */
export type CampoConfinamento =
  | "categoria"
  | "quantidade"
  | "fazenda"
  | "confinamento"
  | "pasto"
  | "data"
  | "produto"
  | "valor"
  /** Não é campo: é o pedido inteiro esperando um "sim". */
  | "confirmacao";

export type ConfinamentoPendente = PedidoBase<CampoConfinamento> & {
  /** Qual das quatro conversas está aberta. */
  gesto: GestoConfinamento;
  /**
   * O valor que a PRÓPRIA pergunta sugeriu, quando ela sugeriu algum
   * ("Você tem 40 em Pasto da Baixada. Registro por lá?").
   *
   * Existe porque sem ele um "sim" a essa pergunta jogava a conversa fora: o
   * handler via `aguardando: "pasto"` em vez de `"confirmacao"` e respondia
   * "Não tenho nenhuma entrada esperando confirmação", perdendo a categoria e
   * a quantidade que o produtor já tinha dado.
   *
   * É o nome do pasto, não o id, porque é assim que `resolverPasto` resolve:
   * aceitar a sugestão é preencher `parameters.pasto` e seguir pelo mesmo
   * caminho de quem digitou o nome.
   */
  sugestao_pasto?: string | null;
};

const store = criarStoreDePendencia<CampoConfinamento, ConfinamentoPendente>({
  prefixo: "confinamento-pending",
  /**
   * O nome alternativo que o classificador usa para o mesmo campo: ele não
   * carrega de volta qual era a pergunta, então responde com o nome mais
   * natural.
   */
  atalho: (campo) => {
    if (campo === "categoria") return "category";
    if (campo === "fazenda") return "property";
    if (campo === "quantidade") return "quantity";
    if (campo === "produto") return "product";
    if (campo === "pasto") return "pasture";
    if (campo === "data") return "date";
    if (campo === "valor") return "amount";
    return campo;
  },
});

export const savePendingConfinement = store.salvar;
export const loadPendingConfinement = store.carregar;
export const clearPendingConfinement = store.limpar;
export const aplicarRespostaConfinamento = store.aplicarResposta;
