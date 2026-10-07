// Módulo sem dependência de servidor: a tarja do painel é client component e
// não pode importar `billing-access.ts`, que arrasta o Prisma.

/** A frase que o tenant arquivado lê, na tela, na API e no WhatsApp (dívida 3.2). */
export const MENSAGEM_ARQUIVADO =
  "Esta conta do Tibé está arquivada. Para reativar, fale com o suporte do Tibé.";
