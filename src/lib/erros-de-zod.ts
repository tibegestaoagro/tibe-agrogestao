import { z } from "zod";

/**
 * A recusa do Zod dita em portugues, e ancorada no campo certo.
 *
 * Achado na validacao ao vivo da onda 2 (2026-08-29): cadastrar maquina com
 * custo negativo mostrava ao produtor **"Too small: expected number to be
 * >=0"**, e editar a fazenda mostrava **"Too small: expected string to have
 * >=1 characters"**, que nem era sobre o campo que ele tinha mexido. As duas
 * frases sao o texto default do Zod, em ingles, e chegavam inteiras na tela
 * porque as 71 rotas do produto faziam a mesma linha:
 *
 *     return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
 *
 * Dois defeitos numa linha so: o texto e do Zod, e o `field` nao atravessa,
 * entao a recusa cai no rodape do painel em vez de embaixo do campo. Este
 * modulo resolve os dois.
 *
 * ## Por que um mapa de erro, e nao um tradutor na saida
 *
 * O Zod ja aceita mensagem propria no schema (`z.number().positive("Tamanho
 * deve ser maior que zero")`), e varias rotas escreveram a delas. Traduzir na
 * saida obrigaria a adivinhar se a frase veio do autor ou do default, o que
 * nao da para saber olhando o texto. Com `z.config({ customError })` a ordem
 * ja e a certa: mensagem do schema vence, e o mapa so responde quando o autor
 * nao escreveu nada.
 *
 * ## Por que nao `z.locales.pt()`
 *
 * O Zod 4 tem locale pt embutido, e ele foi testado: devolve "Muito pequeno:
 * esperado que number fosse >=0". E portugues, mas e portugues de compilador,
 * e ainda diz "number" em ingles. Quem le e um produtor no curral. As frases
 * daqui falam do que ele fez, nao do tipo que o parser esperava.
 */

/** O nome do campo como a API o chama, que e o que o painel casa com `field`. */
function campoDoCaminho(caminho: PropertyKey[]): string | undefined {
  if (caminho.length === 0) return undefined;
  // Caminho aninhado (`produtos.0.quantity`) nao casa com campo nenhum do
  // painel, e `aplicarErroDoServidor` manda o desconhecido para o rodape. E o
  // comportamento certo: nao existe um campo unico para focar.
  return caminho.map(String).join(".");
}

/**
 * A frase que o produtor le quando o autor do schema nao escreveu uma.
 *
 * `undefined` devolve o assunto ao Zod, que cai no default. Nenhum caminho
 * daqui devolve `undefined` hoje, mas a assinatura mantem essa saida aberta.
 */
function mensagemEmPortugues(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case "invalid_type":
      // Campo que nem veio no corpo e campo que o produtor deixou em branco.
      return issue.input === undefined || issue.input === null
        ? "Campo obrigatório."
        : "Valor inválido para este campo.";

    case "too_small": {
      const minimo = Number(issue.minimum);
      if (issue.origin === "number") {
        if (minimo === 0) {
          return issue.inclusive
            ? "Não pode ser negativo."
            : "Precisa ser maior que zero.";
        }
        return issue.inclusive
          ? `Precisa ser ${minimo} ou mais.`
          : `Precisa ser maior que ${minimo}.`;
      }
      if (issue.origin === "string") {
        return minimo <= 1
          ? "Campo obrigatório."
          : `Precisa ter pelo menos ${minimo} caracteres.`;
      }
      if (issue.origin === "array") {
        return minimo <= 1
          ? "Escolha pelo menos um item."
          : `Escolha pelo menos ${minimo} itens.`;
      }
      return "Valor abaixo do mínimo aceito.";
    }

    case "too_big": {
      const maximo = Number(issue.maximum);
      if (issue.origin === "number") {
        return issue.inclusive
          ? `Precisa ser ${maximo} ou menos.`
          : `Precisa ser menor que ${maximo}.`;
      }
      if (issue.origin === "string") {
        return `Use no máximo ${maximo} caracteres.`;
      }
      if (issue.origin === "array") {
        return `Escolha no máximo ${maximo} itens.`;
      }
      return "Valor acima do máximo aceito.";
    }

    case "invalid_format":
      // `format` cobre email, url, uuid, datetime e os demais checks de texto.
      switch ((issue as { format?: string }).format) {
        case "email":
          return "Email inválido.";
        case "url":
          return "Endereço de site inválido.";
        case "datetime":
        case "date":
          return "Data inválida.";
        default:
          return "Formato inválido.";
      }

    case "invalid_value":
    case "invalid_union":
      return "Escolha uma das opções disponíveis.";

    case "invalid_key":
    case "unrecognized_keys":
      return "Campo desconhecido no envio.";

    case "not_multiple_of":
      return "Valor não permitido para este campo.";

    default:
      return "Valor inválido para este campo.";
  }
}

/**
 * Liga as mensagens em portugues, uma vez por processo.
 *
 * Chamado no topo de `src/lib/api.ts`, que toda rota importa: o mapa fica de
 * pe antes de qualquer `safeParse` rodar, porque import e avaliado no carregar
 * do modulo, e o handler so roda depois.
 */
export function instalarMensagensDeZodEmPortugues() {
  z.config({ customError: (issue) => mensagemEmPortugues(issue) });
}

/** O que `parsed.error` vira na resposta: codigo, frase e o campo recusado. */
export function recusaDeZod(error: z.ZodError): {
  code: string;
  message: string;
  status: number;
  field?: string;
} {
  const issue = error.issues[0];
  return {
    code: "VALIDATION_ERROR",
    message: issue.message,
    status: 422,
    field: campoDoCaminho(issue.path),
  };
}
