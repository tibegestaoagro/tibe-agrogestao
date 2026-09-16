import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O recebimento (Fase 5, Task 3) que ficou esperando resposta: quem pagou,
 * qual conta (quando há mais de uma em aberto) e a confirmação da baixa.
 *
 * Mesmo mecanismo dos outros dez domínios, mora em `pending-store.ts`. Aqui
 * só o vocabulário: `contato` é quem pagou, `escolha` é o número da conta na
 * lista numerada (§ "duas ou mais contas" do brief), `valor` é o que o
 * produtor disse ter pago (guardado de novo quando ele diz um valor maior
 * que o saldo, para a resposta seguinte substituir só esse campo).
 */

export type CampoRecebimento = "contato" | "escolha" | "valor" | "confirmacao";

export type RecebimentoPendente = PedidoBase<CampoRecebimento>;

const store = criarStoreDePendencia<CampoRecebimento>({
  prefixo: "recebimento-pending",
  atalho: (campo) => {
    if (campo === "contato") return "nome";
    if (campo === "valor") return "amount";
    return campo;
  },
});

export const savePendingRecebimento = store.salvar;
export const loadPendingRecebimento = store.carregar;
export const clearPendingRecebimento = store.limpar;
export const aplicarRespostaRecebimento = store.aplicarResposta;
