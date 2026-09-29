import type { TenantPrismaClient } from "@/lib/prisma";
import type { AppUserRole } from "@/types/next-auth";
import type { ProfileType } from "@/lib/tenant-context";
import type { ActionResult } from "@/lib/actions/types";
import type { Intent } from "@/lib/whatsapp-intents";
import { lerNumeroBr } from "@/lib/numero-br";
import { saudacaoEmSaoPaulo } from "@/lib/dia-calendario";

/**
 * Tipos e helpers compartilhados pelos handlers de intenção do agente
 * WhatsApp (spec 3.5). Cada intenção vive em seu próprio módulo, agrupado
 * por domínio, em src/lib/actions/whatsapp-handlers/*: routeIntent(), em
 * whatsapp-router.ts, só checa permissão/perfil e despacha.
 */

/**
 * As intenções que GRAVAM sem pedir "sim": o uso de estoque (§10.3, o gesto
 * mais frequente e que não mexe em dinheiro) e os quatro registros de rebanho
 * que só descrevem um fato do animal (cadastro, peso, vacina e a previsão
 * dela). Nenhum dos cinco recebe `confirmed` no handler.
 *
 * ⚠️ **A lista nasceu com o uso de estoque só, e a catraca da seção 1c da
 * `m68` achou os outros quatro no mesmo dia.** A versão incompleta fazia a
 * guarda do turno parecer mais forte do que era.
 *
 * Existe como lista exportada, e não como comparação solta dentro de cada
 * arquivo, porque DOIS lugares distantes precisam concordar sobre ela: o
 * handler do estoque, que decide se `confirmed` quer dizer alguma coisa, e o
 * turno, que decide se pode empurrar uma mensagem duvidosa para dentro de um
 * campo pendente. Quando os dois duplicavam a regra, o turno abriu um caminho
 * de gravação sem confirmação que a revisão da Fase 4 reproduziu em banco:
 * "usei 2 sacas" / "Qual produto?" / "nem precisei do sal afinal" gravava o
 * uso. Handler novo que não confirmar entra AQUI, e as duas pontas andam
 * juntas.
 */
export const INTENCOES_QUE_GRAVAM_SEM_CONFIRMAR: readonly Intent[] = [
  "registrar_uso_estoque",
  "cadastrar_animal",
  "registrar_peso",
  "registrar_vacina",
  "registrar_previsao_vacina",
];

export type RouterResult = {
  reply_text: string;
  requires_confirmation: boolean;
  auxiliary_data: Record<string, unknown> | null;
  report_url: string | null;
  /** Uso interno (log), não faz parte do contrato de resposta HTTP. */
  action_taken: string;
  /**
   * A intenção depois dos desvios de `routeIntent` (venda do confinamento,
   * pendente de estoque...). Quando um fluxo ativo (cadastro assistido)
   * consome a mensagem, continua sendo a intenção da mensagem, não a do fluxo.
   */
  intent_final?: Intent;
};

/** Contexto passado a todo handler de intenção: mesmo formato para todos. */
export type HandlerCtx = {
  db: TenantPrismaClient;
  tenant_id: string;
  role: AppUserRole;
  activeProfiles: ProfileType[];
  parameters: Record<string, unknown>;
  /** true quando o N8N/usuário confirmou explicitamente a ação pendente. */
  confirmed: boolean;
  /** true quando o usuário recusou explicitamente ("não", "cancela"...). */
  explicitNo: boolean;
  /**
   * Quem mandou a mensagem. Opcional porque nem toda chamada interna resolve
   * usuário. Usado por handlers que guardam estado de conversa por pessoa,
   * como o pendente de rebanho (Módulo 30 §14).
   */
  user_id?: string;
};

export type Handler = (ctx: HandlerCtx) => Promise<RouterResult>;

export function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

/**
 * Era `Number()` cru, e "1.500" virava 1,5 no peso, na vacina, na remessa de
 * evento e na lista. O classificador repassa o número como o produtor falou.
 */
export function num(v: unknown): number | null {
  return lerNumeroBr(v);
}

export function ask(text: string, auxiliary: Record<string, unknown> | null = null): RouterResult {
  return {
    reply_text: text,
    requires_confirmation: false,
    auxiliary_data: auxiliary,
    report_url: null,
    action_taken: "clarification_requested",
  };
}

export function failReply(
  intent: string,
  result: Extract<ActionResult<unknown>, { ok: false }>,
): RouterResult {
  return {
    reply_text: `⚠️ ${result.message}`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:falhou:${result.code}`,
  };
}

/**
 * Fluxo de confirmação sim/não (spec 3.6) compartilhado pelas intenções que
 * pedem confirmação antes de executar. Devolve um RouterResult quando a
 * ação deve parar aqui (cancelada ou aguardando "sim"); devolve `null`
 * quando `confirmed` já é true e o chamador deve seguir com a ação de
 * verdade.
 */
export function confirmFlow(params: {
  intent: string;
  explicitNo: boolean;
  confirmed: boolean;
  question: string;
  auxiliary: Record<string, unknown>;
  cancelledText?: string;
}): RouterResult | null {
  if (params.explicitNo) {
    return {
      reply_text: params.cancelledText ?? "Ação cancelada.",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${params.intent}:cancelado`,
    };
  }
  if (!params.confirmed) {
    return {
      reply_text: params.question,
      requires_confirmation: true,
      auxiliary_data: params.auxiliary,
      report_url: null,
      action_taken: `${params.intent}:aguardando_confirmacao`,
    };
  }
  return null;
}

/**
 * Minúsculas, sem acento e sem espaço repetido, para comparar o que o produtor
 * ditou com o que está cadastrado.
 *
 * ⚠️ Existem cinco cópias locais disto (`confinamento`, `estoque`, `leite`,
 * `mao-de-obra`, `servico`). Esta é a versão compartilhada, e as outras devem
 * migrar para cá **quando o arquivo delas for aberto por outro motivo**: mexer
 * em cinco handlers estáveis só para unificar um helper é risco sem retorno.
 */
/**
 * A frase de quem não trouxe demanda nenhuma: pergunta o que a pessoa quer, em
 * vez de dizer que não entendeu. Decisão do usuário em 29/09/2026, depois de
 * ler a conversa real do canário: "se não for nada referente a alguma demanda,
 * ele só deve perguntar como posso ajudar".
 */
export const COMO_POSSO_AJUDAR =
  "Como posso ajudar? Posso cadastrar o que você precisar ou te contar o que já está cadastrado. Se quiser ver tudo o que eu faço, é só perguntar 'o que você faz?'.";

/** Nome que não é nome de gente: saudar "Bom dia, Owner" é pior que não saudar. */
const NOMES_GENERICOS = ["owner", "admin", "administrador", "usuario", "user", "proprietario", "dono", "teste", "test"];

/**
 * O primeiro nome, para a saudação. Devolve `null` quando não há nome, quando
 * ele é rótulo de sistema ("Owner Da Mata", que é o que o seed cria) ou quando
 * não parece nome (número, uma letra só).
 */
export function primeiroNome(nome: string | null | undefined): string | null {
  const bruto = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (bruto.length < 2) return null;
  if (!/^[\p{L}][\p{L}'-]*$/u.test(bruto)) return null;
  if (NOMES_GENERICOS.includes(normalizarTermo(bruto))) return null;
  return bruto.charAt(0).toUpperCase() + bruto.slice(1);
}

/**
 * A resposta a um cumprimento: saudação pela hora de Brasília, o primeiro nome
 * quando existe, e a pergunta. "Bom dia, Max! Como posso ajudar?"
 */
export function respostaDeCumprimento(nome: string | null | undefined, agora = new Date()): string {
  const primeiro = primeiroNome(nome);
  const saudacao = saudacaoEmSaoPaulo(agora);
  return primeiro ? `${saudacao}, ${primeiro}! Como posso ajudar?` : `${saudacao}! Como posso ajudar?`;
}

/**
 * Cumprimento puro ("bom dia", "oi", "boa tarde tudo bem?").
 *
 * Achado em uso real, 29/09/2026: a PRIMEIRA mensagem que qualquer pessoa manda
 * caía em "Não entendi", e foi assim que o canário da Fase 7 começou, duas
 * vezes, com produtores diferentes.
 *
 * Quem decide o texto é o roteador, no ramo `ambigua`, e NÃO o classificador:
 * mexer no prompt desloca a distribuição inteira e pede rodada de avaliação
 * (`docs/agents/agente-whatsapp/avaliacao-fase-5.md`), enquanto esta guarda só
 * troca a frase de uma mensagem que o modelo já disse não ter assunto.
 *
 * O turno também consulta esta função para NÃO deixar um cumprimento virar
 * resposta de campo pendente: "bom dia" nunca é a categoria do animal.
 *
 * A leitura é do texto INTEIRO, nunca por "contém": "bom dia, comprei 20
 * bezerros" tem assunto, e uma saudação engoliria o pedido. Por isso são duas
 * condições, e as duas precisam valer: NENHUMA palavra de fora do vocabulário
 * de cumprimento, e pelo menos uma saudação de verdade ali dentro.
 *
 * ⚠️ A primeira versão desta função comparava a frase inteira contra uma lista
 * fechada, e "Oi, bom dia" (duas saudações numa) não estava nela: a correção
 * falhou na primeira mensagem real, minutos depois do deploy. Lista fechada de
 * frase não cobre combinação; vocabulário mais núcleo cobre.
 */
const PALAVRAS_DE_CUMPRIMENTO: ReadonlySet<string> = new Set([
  "oi",
  "ola",
  "opa",
  "alo",
  "ei",
  "eai",
  "e",
  "ai",
  "ae",
  "salve",
  "fala",
  "ta",
  "bom",
  "boa",
  "dia",
  "dias",
  "tarde",
  "noite",
  "tudo",
  "bem",
  "beleza",
  "blz",
  "como",
  "vai",
  "voce",
  "vc",
  // O nome do assistente: "Oi Tibe", "Dia tibé", "Tudo bem tibe" são a forma
  // mais comum de chamar alguém pelo nome antes de pedir qualquer coisa.
  "tibe",
]);

/**
 * Sem uma destas, a frase é só palavra solta ("bom", "tudo") e não cumprimenta
 * ninguém. "dia", "tarde" e "noite" sozinhos entram porque é assim que muita
 * gente abre a conversa; acompanhados de qualquer outra palavra ("dia 10",
 * "tarde de ontem") eles caem fora pela regra do vocabulário, que é o que
 * protege a resposta a uma pergunta de data.
 */
const NUCLEO_DE_CUMPRIMENTO =
  /\b(oi|ola|opa|alo|ei|eai|e ai|salve|fala|ta ai|ta ae|dia|dias|tarde|noite|bom dia|boa tarde|boa noite|tudo bem|tudo bom|como vai)\b/;

export function ehSoCumprimento(texto: string | null | undefined): boolean {
  if (!texto) return false;
  // Pontuação e emoji fora: "bom dia!!" e "Bom dia 👋" são o mesmo cumprimento.
  const limpo = normalizarTermo(texto)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo || !NUCLEO_DE_CUMPRIMENTO.test(limpo)) return false;
  // Teto de palavras: frase longa que começa com saudação tem assunto depois.
  const palavras = limpo.split(" ");
  if (palavras.length > 8) return false;
  return palavras.every((p) => PALAVRAS_DE_CUMPRIMENTO.has(p));
}

export function normalizarTermo(termo: string): string {
  // Filtro por código numérico, não regex de caractere combinante: o próprio
  // caractere é invisível no editor e some numa cópia distraída (armadilha que
  // este projeto já pagou para aprender).
  const semAcento = Array.from(termo.toLowerCase().normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
  return semAcento.replace(/\s+/g, " ").trim();
}
