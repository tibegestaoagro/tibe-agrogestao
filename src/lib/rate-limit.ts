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
 * sobrescreve o padrão (10 tentativas/15min, usado pelos 2 logins): ex:
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
  const key = keyFor(scope, identifier);
  // Num passo só (dívida 3.1, revisão do Codex): com o limite de tempo da
  // conexão, o INCR podia executar e a promessa rejeitar, pulando o EXPIRE.
  // A chave ficava sem prazo e bloqueava o login daquela pessoa para sempre.
  // O script também devolve o prazo a uma chave que já esteja sem ele.
  const count = Number(await getRedisConnection().eval(INCREMENTAR_COM_PRAZO, 1, key, windowSeconds));
  return count <= maxAttempts;
}

const INCREMENTAR_COM_PRAZO = `local c = redis.call("INCR", KEYS[1]) if redis.call("TTL", KEYS[1]) < 0 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end return c`;

/** Zera o contador após login bem-sucedido, para não penalizar tentativas válidas subsequentes. */
export async function resetLoginRateLimit(scope: string, identifier: string): Promise<void> {
  await getRedisConnection().del(keyFor(scope, identifier));
}
