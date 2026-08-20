import { apiError } from "@/lib/api";
import { log, resumirErro, type ContextoDeLog } from "@/lib/log";

/**
 * Garante que TODA rota devolva o envelope de erro do contrato.
 *
 * O problema que isto resolve: das 113 rotas do projeto, 107 não tinham
 * `try`. Qualquer exceção não prevista (violação de constraint do Prisma,
 * timeout, um `undefined` inesperado) saía como erro padrão do Next, e não
 * como `{ error: { code, message } }`. Para o aplicativo, que faz parse do
 * envelope, isso é uma classe inteira de falha não modelada: ele recebe HTML
 * onde esperava JSON.
 *
 * Uso, no fim do arquivo de rota:
 *
 *   async function GETHandler(request: Request) { ... }
 *   export const GET = withApi(GETHandler);
 *
 * Isto NÃO substitui tratamento de erro esperado. Erro previsto continua
 * sendo devolvido pela própria rota, com o código certo. O wrapper é a rede
 * embaixo, para o que ninguém previu.
 */

/**
 * `redirect()` e `notFound()` do Next sinalizam por exceção com `digest`, e o
 * framework depende de ela subir até ele. Engolir isso transformaria um
 * redirecionamento legítimo num 500.
 */
function ehControleDeFluxoDoNext(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string";
}

/**
 * Traduz os erros do Prisma que têm significado de negócio claro. Sem isto,
 * um brinco repetido viraria 500 em vez de 409, e o aplicativo não teria como
 * distinguir "falhou por culpa do usuário" de "o servidor quebrou".
 *
 * A mensagem devolvida é sempre nossa, nunca a do Prisma: a dele cita nome de
 * coluna e, dependendo da operação, valor de campo.
 */
function traduzirErroConhecido(e: unknown): { code: string; message: string; status: number } | null {
  const codigo = (e as { code?: unknown } | null)?.code;
  if (typeof codigo !== "string") return null;

  switch (codigo) {
    case "P2002":
      return {
        code: "DUPLICATE",
        message: "Já existe um registro com esse valor.",
        status: 409,
      };
    case "P2025":
      return {
        code: "NOT_FOUND",
        message: "Recurso não encontrado.",
        status: 404,
      };
    case "P2003":
      return {
        code: "RELATED_NOT_FOUND",
        message: "Um dos registros relacionados não existe.",
        status: 422,
      };
    case "P2034":
      // Conflito de transação serializável que sobreviveu às tentativas de
      // `runSerializableTenantTransaction`. Repetir costuma resolver.
      return {
        code: "CONFLICT",
        message: "Conflito ao gravar. Tente novamente.",
        status: 409,
      };
    default:
      return null;
  }
}

/** Identificador curto para casar o que o cliente viu com o que foi registrado. */
function novoRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function contextoDaRequisicao(args: unknown[]): Pick<ContextoDeLog, "route" | "method"> {
  const req = args[0];
  if (!(req instanceof Request)) return {};
  try {
    return { route: new URL(req.url).pathname, method: req.method };
  } catch {
    return { method: req.method };
  }
}

export function withApi<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (ehControleDeFluxoDoNext(e)) throw e;

      const request_id = novoRequestId();
      const base = contextoDaRequisicao(args);
      const conhecido = traduzirErroConhecido(e);

      if (conhecido) {
        // Erro de negócio disfarçado de exceção: vale registrar, mas como
        // aviso, porque o servidor está funcionando como deveria.
        log.warn("rota devolveu erro conhecido", {
          ...base,
          request_id,
          code: conhecido.code,
          status: conhecido.status,
        });
        return apiError(conhecido.code, conhecido.message, conhecido.status);
      }

      log.error("excecao nao tratada em rota", {
        ...base,
        request_id,
        code: typeof (e as { code?: unknown })?.code === "string"
          ? ((e as { code: string }).code)
          : undefined,
        status: 500,
      });
      // A pilha vai numa segunda linha para não inflar o evento principal, e
      // por ser o campo mais volumoso.
      console.error(JSON.stringify({ level: "error", msg: "detalhe", request_id, err: resumirErro(e) }));

      return apiError(
        "INTERNAL_ERROR",
        `Erro interno. Se precisar de suporte, informe o código ${request_id}.`,
        500,
      );
    }
  };
}
