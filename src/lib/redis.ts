import IORedis from "ioredis";

/**
 * Client Redis singleton (Redis Cloud). Usado pelo BullMQ (fila de alertas) e
 * por qualquer outro uso pontual de cache/lock. BullMQ exige
 * `maxRetriesPerRequest: null` na conexão usada por Queue/Worker.
 */
const globalForRedis = globalThis as unknown as { redisConnection?: IORedis };

export function getRedisConnection(): IORedis {
  if (!globalForRedis.redisConnection) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL não definida. Configure o .env (veja .env.example).");
    }
    globalForRedis.redisConnection = new IORedis(url, { maxRetriesPerRequest: null });
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
