import { criarStoreDePendencia, type PedidoBase } from "@/lib/actions/pending-store";

/**
 * A consulta do rebanho que perguntou a categoria (dívida 5.7, 07/10/2026).
 *
 * Consulta não grava nada, mas pergunta: "novilha" pede a idade, e um termo
 * desconhecido pede o sexo e a idade. Sem pendente, a resposta ("13 a 24
 * meses") não tinha pergunta aberta a que se ligar, era classificada do zero
 * e perdia a novilha e a fazenda ditas antes. Guarda só isso: a fazenda e as
 * candidatas oferecidas.
 */

export type CampoConsulta = "categoria";

export type ConsultaPendente = PedidoBase<CampoConsulta>;

const store = criarStoreDePendencia<CampoConsulta>({
  prefixo: "consulta-pending",
  atalho: () => "category",
});

export const savePendingConsulta = store.salvar;
export const loadPendingConsulta = store.carregar;
export const clearPendingConsulta = store.limpar;
