import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * O lançamento financeiro pelo WhatsApp que ficou esperando confirmação
 * (Task 5 da Fase 1 do agente, achado da revisão de código).
 *
 * ⚠️ **Por que isto existe, e por que não bastava reler os parâmetros no
 * "sim".** O classificador do n8n não remonta os parâmetros literalmente
 * (`.claude/rules/whatsapp.md`): ele reconstrói os campos a partir da
 * confirmação impressa, e um campo pode sumir na volta. Sem o pendente, um
 * "tipo: receita" perdido no "sim" reescrevia a receita como despesa em
 * silêncio, porque o handler resolvia tudo de novo a partir da mensagem de
 * confirmação em vez do que foi de fato mostrado ao produtor.
 *
 * Só um campo: "confirmacao". Este handler não pergunta valor/categoria um a
 * um (a spec pede a frase inteira numa mensagem só); o pendente existe só
 * para o "sim" executar exatamente o que foi mostrado.
 */

export type CampoFinanceiro = "confirmacao";

export type PendenciaFinanceira = PedidoBase<CampoFinanceiro>;

const store = criarStoreDePendencia<CampoFinanceiro>({
  prefixo: "financeiro-pending",
  aceitaNumero: false,
});

export const savePendingFinance = store.salvar;
export const loadPendingFinance = store.carregar;
export const clearPendingFinance = store.limpar;
