/**
 * Log estruturado.
 *
 * Antes disto, o projeto inteiro tinha DOIS `console.*` em cerca de 38 mil
 * linhas: quando algo quebrava em produção, não havia rastro nenhum para
 * consultar, e o defeito só aparecia pelo relato de quem estava no campo.
 *
 * Uma linha de JSON por evento, porque é assim que a Vercel (e qualquer
 * coletor depois dela) consegue filtrar por campo em vez de por texto. Sem
 * dependência nova: `console` já escreve no lugar certo nas funções.
 *
 * REGRA DE PRIVACIDADE, não negociável: nunca registre aqui o conteúdo da
 * mensagem do produtor, corpo de requisição, token, senha ou credencial. O
 * que se registra é o suficiente para achar o problema (rota, tenant, código
 * do erro, identificador da requisição), nunca o dado do cliente.
 */

type Nivel = "info" | "warn" | "error";

/** Campos que dão para correlacionar um evento com o resto do sistema. */
export type ContextoDeLog = {
  request_id?: string;
  tenant_id?: string;
  user_id?: string;
  route?: string;
  method?: string;
  /** Intenção do agente WhatsApp, quando o evento vem daquele caminho. */
  intent?: string;
  /** Código estável do erro, quando houver (ex: P2002 do Prisma). */
  code?: string;
  status?: number;
  duration_ms?: number;
};

function escrever(nivel: Nivel, mensagem: string, contexto: ContextoDeLog = {}) {
  const linha = JSON.stringify({
    level: nivel,
    msg: mensagem,
    // Sem `Date.now()` fixo em variável de módulo: o horário é o do evento.
    ts: new Date().toISOString(),
    ...contexto,
  });

  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
}

export const log = {
  info: (mensagem: string, contexto?: ContextoDeLog) => escrever("info", mensagem, contexto),
  warn: (mensagem: string, contexto?: ContextoDeLog) => escrever("warn", mensagem, contexto),
  error: (mensagem: string, contexto?: ContextoDeLog) => escrever("error", mensagem, contexto),
};

/**
 * Resumo de um erro seguro para registrar: nome, mensagem e pilha, sem o
 * objeto inteiro. Erro do Prisma costuma carregar `meta` com nome de coluna e,
 * dependendo da operação, valor de campo, então `meta` fica de fora de
 * propósito.
 */
export function resumirErro(e: unknown): { name: string; message: string; stack?: string } {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  return { name: "NaoErro", message: String(e) };
}
