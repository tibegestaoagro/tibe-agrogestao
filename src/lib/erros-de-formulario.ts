/**
 * As duas decisoes de formulario que o componente NAO deve tomar.
 *
 * Elas vivem aqui por testabilidade: este repositorio nao tem runner de DOM,
 * entao regra escrita dentro do JSX e regra sem prova. A fase 1 mostrou o
 * preco disso, quando a medicao de 2026-08-20 achou os 27 paineis de escrita
 * sem `<form>` de verdade, defeito que nenhuma suite pegava.
 *
 * Prova: `scripts/m46-erros-de-formulario.test.ts`.
 */

/** Aviso de ultimo recurso: servidor recusou, mas nao explicou. */
const SEM_MENSAGEM = "Não foi possível salvar. Tente de novo.";

/**
 * Qual campo focar depois de uma validacao que reprovou.
 *
 * A ordem que vale e a da TELA, nao a de insercao no objeto de erros. O
 * produtor le de cima para baixo: mandar o foco para o terceiro campo quando o
 * primeiro tambem esta errado o faz corrigir fora de ordem e descobrir o de
 * cima so no submit seguinte.
 *
 * Devolve `null` quando nao ha nada a focar, inclusive quando o unico erro
 * pertence a um campo que esta tela nao mostra: focar um elemento inexistente
 * deixa o painel com o foco no nada e fecha o teclado no celular.
 */
export function primeiroInvalido<K extends string>(
  erros: Partial<Record<K, string>>,
  ordem: readonly K[],
): K | null {
  for (const chave of ordem) {
    const mensagem = erros[chave];
    // String vazia nao e erro: acontece quando a mensagem vem de uma variavel
    // que ainda nao foi preenchida.
    if (typeof mensagem === "string" && mensagem.length > 0) return chave;
  }
  return null;
}

/**
 * Onde a recusa do servidor deve aparecer na tela.
 *
 * Com `field` conhecido, ela vira erro daquele campo e NAO se repete no
 * rodape: a mesma frase em dois lugares faz o produtor procurar dois
 * problemas. Sem `field`, ou com um campo que esta tela nao mostra, ela fica
 * no rodape.
 *
 * O que nunca acontece e a mensagem sumir. Erro que desaparece e pior que erro
 * no lugar errado, porque nao sobra nada para ler.
 */
export function aplicarErroDoServidor<K extends string>(
  res: { code: string; message: string; field?: string },
  ordem: readonly K[],
): { erros: Partial<Record<K, string>>; global: string | null } {
  const mensagem = res.message?.trim() ? res.message : SEM_MENSAGEM;
  const campo = res.field as K | undefined;

  if (campo && ordem.includes(campo) && mensagem !== SEM_MENSAGEM) {
    return {
      erros: { [campo]: mensagem } as Partial<Record<K, string>>,
      global: null,
    };
  }

  // Campo desconhecido, ausente, ou recusa sem texto: rodape.
  return { erros: {}, global: mensagem };
}
