import { getRedisConnection } from "@/lib/redis";
import { toBrazilPhoneDigits } from "@/lib/phone";

/**
 * Buffer de mensagens picadas (2026-07-30).
 *
 * O produtor rural escreve como se estivesse conversando: "oi", "tudo bom?",
 * "me diz uma coisa". Sem buffer, cada fragmento vira uma execução do n8n
 * completa (classificação por LLM + resposta), o que soa robótico e paga uma
 * chamada de LLM por pedaço.
 *
 * A janela vive aqui, e não em nós do n8n, por três motivos: o Redis já está
 * configurado no Tibé (o n8n não tem essa credencial), a regra fica versionada
 * e testável no repositório, e é coerente com o resto do projeto, onde o n8n é
 * orquestrador fino e a lógica mora nas actions.
 *
 * Mecânica: cada mensagem entra na lista e incrementa um contador. Depois de
 * esperar, o n8n pergunta se o token dele ainda é o último. Se não for, chegou
 * mensagem nova no meio e aquela execução **morre em silêncio**: só a última
 * processa o texto inteiro concatenado. É o contador, e não um timestamp, que
 * decide o vencedor: comparar horários daria empate em mensagens simultâneas.
 */

export const BUFFER_WINDOW_SECONDS = 12;
const TTL_SECONDS = 300; // folga sobre a janela: lixo de conversa abandonada expira sozinho
const MAX_MESSAGES = 20; // trava contra flood: não acumula conversa inteira

function keys(phone: string) {
  const digits = toBrazilPhoneDigits(phone);
  return {
    list: `tibe:wa-buffer:${digits}`,
    seq: `tibe:wa-buffer-seq:${digits}`,
  };
}

/** Guarda a mensagem e devolve o token desta execução. */
export async function appendToBuffer(
  phone: string,
  messageText: string,
): Promise<{ token: number; window_seconds: number }> {
  const redis = getRedisConnection();
  const k = keys(phone);

  const token = await redis.incr(k.seq);
  await redis.expire(k.seq, TTL_SECONDS);
  if (messageText.trim().length > 0) {
    await redis.rpush(k.list, messageText.trim());
    await redis.ltrim(k.list, -MAX_MESSAGES, -1);
    await redis.expire(k.list, TTL_SECONDS);
  }

  return { token, window_seconds: BUFFER_WINDOW_SECONDS };
}

/**
 * Só a execução que carrega o último token processa. As demais recebem
 * `ready: false` e devem encerrar sem responder nada.
 */
export async function flushBuffer(
  phone: string,
  token: number,
): Promise<{ ready: boolean; message_text: string; parts: number }> {
  const redis = getRedisConnection();
  const k = keys(phone);

  const current = Number((await redis.get(k.seq)) ?? 0);
  if (current !== token) {
    return { ready: false, message_text: "", parts: 0 };
  }

  const parts = await redis.lrange(k.list, 0, -1);
  await redis.del(k.list);
  await redis.del(k.seq);

  return {
    ready: true,
    // Ponto final entre os fragmentos: sem isso "oi" + "tudo bom" viram
    // "oitudo bom" e a classificação piora.
    message_text: parts.join(". ").replace(/\.\s*\./g, "."),
    parts: parts.length,
  };
}

/** Usado pelos testes para não deixar resíduo entre execuções. */
export async function clearBuffer(phone: string): Promise<void> {
  const redis = getRedisConnection();
  const k = keys(phone);
  await redis.del(k.list);
  await redis.del(k.seq);
}
