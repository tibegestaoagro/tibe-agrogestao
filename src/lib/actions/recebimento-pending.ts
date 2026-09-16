import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O recebimento (Fase 5, Task 3) que ficou esperando resposta: quem pagou,
 * qual pessoa (quando o nome casa mais de uma, G2), qual conta (quando há
 * mais de uma em aberto) e a confirmação da baixa.
 *
 * Mesmo mecanismo dos outros dez domínios, mora em `pending-store.ts`. Aqui
 * só o vocabulário: `contato` é quem pagou, `quem` é o número da pessoa
 * escolhida quando o nome casou mais de um cliente/contato (a lista fica em
 * `parameters.candidatos`), `escolha` é o número da conta na lista numerada
 * (§ "duas ou mais contas" do brief), `valor` é o que o produtor disse ter
 * pago (guardado de novo quando ele diz um valor maior que o saldo, para a
 * resposta seguinte substituir só esse campo).
 *
 * G1 (achado do juiz, 2026-09-16): assim que uma conta específica é
 * escolhida, `parameters.entry_id` e `parameters.contato_resolvido` também
 * ficam guardados, e passam a mandar em TODO turno seguinte (correção de
 * valor, ou o "sim"). Sem isso, o "sim" reconsultava a lista de contas em
 * aberto, e uma conta nova do mesmo contato nascida entre a pergunta e a
 * confirmação deslocava o índice: o produtor confirmava a conta MOSTRADA e o
 * sistema quitava outra.
 */

export type CampoRecebimento = "contato" | "quem" | "escolha" | "valor" | "confirmacao";

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
