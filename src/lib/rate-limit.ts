import { getRedisConnection } from "@/lib/redis";

/**
 * Rate limit simples (fixed window, INCR+EXPIRE no Redis) contra força bruta
 * de senha nos dois logins (tenant e plataforma) e, desde 2026-07-29, contra
 * abuso do fluxo de recuperação de senha. Chave por identificador lógico
 * (email, ou rid do PasswordResetCode): não por IP, para não exigir plumbing
 * do Request através do callback `authorize()` do NextAuth.
 */

const DEFAULT_WINDOW_SECONDS = 15 * 60;
const DEFAULT_MAX_ATTEMPTS = 10;

function keyFor(scope: string, identifier: string): string {
  return `tibe:login-attempts:${scope}:${identifier.trim().toLowerCase()}`;
}

/**
 * true = liberado, false = limite excedido para a janela atual. `opts`
 * sobrescreve o padrão (10 tentativas/15min, usado pelos 2 logins) — ex:
 * pedido de código de recuperação usa uma janela mais restritiva de
 * propósito (evitar spam de envio, que tem custo real no WhatsApp).
 */
export async function checkLoginRateLimit(
  scope: string,
  identifier: string,
  opts?: { windowSeconds?: number; maxAttempts?: number },
): Promise<boolean> {
  const windowSeconds = opts?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const redis = getRedisConnection();
  const key = keyFor(scope, identifier);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count <= maxAttempts;
}

/** Zera o contador após login bem-sucedido, para não penalizar tentativas válidas subsequentes. */
export async function resetLoginRateLimit(scope: string, identifier: string): Promise<void> {
  await getRedisConnection().del(keyFor(scope, identifier));
}
