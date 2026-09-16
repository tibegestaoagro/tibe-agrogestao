/**
 * Formato dos casos de avaliação (Fase 3 do agente do WhatsApp). Um caso é uma
 * mensagem isolada (com o pedido esperado do classificador) ou uma conversa de
 * vários passos (para casos que dependem de contexto, como confirmação).
 */
export const AUTORES = ["produtor", "adversarial", "audio", "conversa", "cliente"] as const;
export type Autor = (typeof AUTORES)[number];

export type ValorEsperado = string | number | boolean | Record<string, string | number | boolean>[];

export type PedidoEsperado = { intent: string; campos?: Record<string, ValorEsperado> };

/**
 * "literal": a frase do caso é (quase) a mesma do exemplo do registro de
 * intenções; "molde": segue o mesmo molde com nome ou número trocado. Um caso
 * marcado nunca entra na partição "final": mediria o modelo decorando o
 * próprio prompt, não generalização.
 */
export type CoincideComExemplo = "literal" | "molde";

export type CasoMensagem = {
  id: string;
  autor: Autor;
  tipo: "mensagem";
  texto: string;
  esperado: PedidoEsperado[];
  nota?: string;
  coincide_com_exemplo?: CoincideComExemplo;
};

/**
 * "nao": este passo não pode gravar nada; "pode": pede registro e o assistente
 * pode perguntar antes; "deve": confirmação explícita de algo que o assistente
 * acabou de mostrar.
 */
export type Gravacao = "nao" | "pode" | "deve";

export type PassoDeConversa = { texto: string; grava: Gravacao; nota?: string };

export type CasoConversa = {
  id: string;
  autor: Autor;
  tipo: "conversa";
  passos: PassoDeConversa[];
  nota?: string;
  coincide_com_exemplo?: CoincideComExemplo;
};

export type Caso = CasoMensagem | CasoConversa;
