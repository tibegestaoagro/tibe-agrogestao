import { getRedisConnection } from "@/lib/redis";

/**
 * Caixa de saída do WhatsApp (2026-08-13): registra em Redis toda mensagem
 * que o Tibé manda pelo provider, para que ela possa ser LIDA de volta.
 *
 * Por que isso existe: até aqui, a única forma de saber o que o agente
 * respondeu era o usuário abrir o WhatsApp e mandar um print. Isso tornava
 * cada rodada de teste dependente de uma pessoa disponível, e é o motivo de
 * vários defeitos de conversa (pergunta repetida, "cancela" que não
 * cancelava, gravação fantasma) só terem aparecido depois de várias idas e
 * vindas. Com a resposta legível por programa, o fluxo REAL de produção pode
 * ser exercitado de ponta a ponta sem ninguém no circuito.
 *
 * Deliberadamente NÃO é uma cópia do fluxo: o que se lê aqui é a saída do
 * mesmo `sendWhatsAppMessage` que atende o n8n de produção. Um banco de
 * provas que copia o fluxo testa a cópia, não o sistema.
 *
 * Dado efêmero, mesma categoria do buffer de mensagens picadas e do pedido
 * pendente do rebanho: TTL curto e lista limitada, porque isto é rastro de
 * conversa recente, não histórico. Histórico de conversa quem guarda é
 * `AgentConversationLog`, no Postgres.
 */

const TTL_SEGUNDOS = 15 * 60;
const MAXIMO_POR_TELEFONE = 20;

export type MensagemEnviada = {
  text: string;
  at: string;
};

function chave(phone: string): string {
  return `tibe:wa-outbox:${phone.replace(/\D/g, "")}`;
}

/**
 * Registra uma mensagem enviada. Nunca lança: uma falha de Redis não pode
 * derrubar o envio de uma mensagem a um produtor de verdade, que é o que
 * realmente importa nesta função.
 */
export async function recordOutbound(to: string, text: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    const item: MensagemEnviada = { text, at: new Date().toISOString() };
    const k = chave(to);
    await redis.lpush(k, JSON.stringify(item));
    await redis.ltrim(k, 0, MAXIMO_POR_TELEFONE - 1);
    await redis.expire(k, TTL_SEGUNDOS);
  } catch {
    // silêncio proposital: ver comentário acima
  }
}

/**
 * Lê as mensagens enviadas para um telefone, da mais recente para a mais
 * antiga. Entradas corrompidas são descartadas em vez de quebrar a leitura:
 * a caixa de saída é diagnóstico, e diagnóstico que quebra não diagnostica.
 */
export async function readOutbound(phone: string, limit = MAXIMO_POR_TELEFONE): Promise<MensagemEnviada[]> {
  const redis = getRedisConnection();
  const brutas = await redis.lrange(chave(phone), 0, limit - 1);
  const saida: MensagemEnviada[] = [];
  for (const bruta of brutas) {
    try {
      const item = JSON.parse(bruta) as MensagemEnviada;
      if (typeof item?.text === "string") saida.push(item);
    } catch {
      // entrada corrompida: ignora
    }
  }
  return saida;
}

/** Esvazia a caixa de um telefone (usado entre casos de teste). */
export async function clearOutbound(phone: string): Promise<void> {
  const redis = getRedisConnection();
  await redis.del(chave(phone));
}
