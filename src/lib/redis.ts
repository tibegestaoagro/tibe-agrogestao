import IORedis from "ioredis";

/**
 * Client Redis singleton (Redis Cloud) para leitura e escrita CURTAS: os
 * pedidos pendentes do agente, o cursor da conversa, o buffer e a caixa de
 * saída do WhatsApp, o rate limit e os locks dos jobs. O BullMQ NÃO usa esta
 * conexão: ele monta a dele com `getRedisConnectionOptions()`, abaixo.
 *
 * Dívida 3.1: com `maxRetriesPerRequest: null` (a exigência do BullMQ, que não
 * vale aqui), um Redis fora do ar deixava o comando na fila para sempre, e o
 * `await` nunca resolvia nem rejeitava: nenhum try/catch pega promessa
 * pendurada. Na Vercel, a rota estourava o tempo e o n8n reenviava.
 *
 * - `commandTimeout`: o ioredis arma o limite ANTES de pôr o comando na fila
 *   offline (`sendCommand`, v5.11), então ele vale também para o comando que
 *   espera a reconexão. É ele que transforma "pendurado" em erro.
 * - A fila offline continua LIGADA de propósito: desligada, todo comando
 *   disparado enquanto a conexão ainda abre seria recusado, e isso acontece a
 *   cada partida a frio da função na Vercel.
 * - `connectTimeout`: o padrão é 10 s por tentativa, mais que o limite inteiro.
 * - `maxRetriesPerRequest` finito é a reserva para quando a conexão cai e volta.
 */
const LIMITE_DO_COMANDO_MS = 2000;

const globalForRedis = globalThis as unknown as { redisConnection?: IORedis };

export function getRedisConnection(): IORedis {
  if (!globalForRedis.redisConnection) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL não definida. Configure o .env (veja .env.example).");
    }
    globalForRedis.redisConnection = new IORedis(url, {
      commandTimeout: LIMITE_DO_COMANDO_MS,
      connectTimeout: LIMITE_DO_COMANDO_MS,
      maxRetriesPerRequest: 3,
    });
  }
  return globalForRedis.redisConnection;
}

/**
 * Opções de conexão "cruas" (host/porta/senha), não uma instância de `ioredis`.
 * O BullMQ empacota sua própria cópia de `ioredis` internamente; passar a
 * instância de `getRedisConnection()` direto para `new Queue()` causa conflito
 * de tipos (duas classes `Redis` estruturalmente iguais mas nominalmente
 * diferentes). Usado só pelo BullMQ: mantém conexões separadas, o que é
 * aceitável para o volume de uso (job diário).
 */
export function getRedisConnectionOptions() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não definida. Configure o .env (veja .env.example).");
  }
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    ...(u.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
