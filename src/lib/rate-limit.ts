import { getRedisConnection } from "@/lib/redis";

/**
 * Rate limit simples (fixed window, INCR+EXPIRE no Redis) contra força bruta
 * de senha nos dois logins (tenant e plataforma). Chave por email normalizado
 * — não por IP, para não exigir plumbing do Request através do callback
 * `authorize()` do NextAuth.
 */

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 10;

function keyFor(scope: string, identifier: string): string {
  return `tibe:login-attempts:${scope}:${identifier.trim().toLowerCase()}`;
}

/** true = liberado, false = limite excedido para a janela atual. */
export async function checkLoginRateLimit(scope: string, identifier: string): Promise<boolean> {
  const redis = getRedisConnection();
  const key = keyFor(scope, identifier);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
  return count <= MAX_ATTEMPTS;
}

/** Zera o contador após login bem-sucedido, para não penalizar tentativas válidas subsequentes. */
export async function resetLoginRateLimit(scope: string, identifier: string): Promise<void> {
  await getRedisConnection().del(keyFor(scope, identifier));
}
