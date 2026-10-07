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

/**
 * Quanto tempo o resultado de um consumo fica guardado para o retry do mesmo
 * token. MENOR que `TTL_SECONDS` de propósito: o contador `seq` expira 300 s
 * depois da última mensagem, e só quando ele expira os tokens recomeçam do 1.
 * Com o consumo guardado por menos tempo que isso, um token novo nunca casa
 * com o consumo de uma conversa anterior.
 */
const CONSUMO_TTL_SECONDS = 120;

function keys(phone: string) {
  const digits = toBrazilPhoneDigits(phone);
  return {
    list: `tibe:wa-buffer:${digits}`,
    seq: `tibe:wa-buffer-seq:${digits}`,
    consumido: (token: number) => `tibe:wa-buffer-consumido:${digits}:${token}`,
  };
}

/**
 * Confere o token, lê os pedaços, guarda o que consumiu e apaga a lista, num
 * passo só (dívida 3.1, revisão do Codex). Em passos separados, um `DEL` que
 * estourasse o limite de tempo da conexão ainda executava depois: a rota
 * devolvia erro, o retry encontrava a lista vazia, e a mensagem do produtor
 * sumia. Agora o retry com o mesmo token recebe o mesmo texto guardado.
 *
 * `seq` NÃO é apagado: é ele que impede um token de se repetir dentro da
 * janela do consumo guardado. E o prazo dele é RENOVADO no mesmo passo
 * (`TTL_SECONDS`, maior que `CONSUMO_TTL_SECONDS`): sem isso, um flush
 * atrasado perto do fim do prazo do `seq` deixava o consumo sobreviver ao
 * contador, e o token 1 de uma conversa nova devolvia o texto velho (terceira
 * rodada do Codex).
 */
const CONSUMIR = `
local ja = redis.call("GET", KEYS[3])
if ja then return {1, ja} end
local atual = tonumber(redis.call("GET", KEYS[1]) or "0")
if atual ~= tonumber(ARGV[1]) then return {0, ""} end
local partes = redis.call("LRANGE", KEYS[2], 0, -1)
local junto = cjson.encode(partes)
redis.call("SET", KEYS[3], junto, "EX", ARGV[2])
redis.call("EXPIRE", KEYS[1], ARGV[3])
redis.call("DEL", KEYS[2])
return {1, junto}
`;

/**
 * Contador, pedaço e prazos num passo só (dívida 3.1, quarta rodada do Codex).
 * Em passos separados, um INCR que estourasse o limite de tempo abandonava o
 * RPUSH: o contador avançava e o pedaço nunca entrava.
 */
const ACRESCENTAR = `
local token = redis.call("INCR", KEYS[1])
redis.call("EXPIRE", KEYS[1], ARGV[2])
if ARGV[1] ~= "" then
  redis.call("RPUSH", KEYS[2], ARGV[1])
  redis.call("LTRIM", KEYS[2], -tonumber(ARGV[3]), -1)
  redis.call("EXPIRE", KEYS[2], ARGV[2])
end
return token
`;

/**
 * Guarda a mensagem e devolve o token desta execução.
 *
 * ponytail: não é idempotente por mensagem. Se o script atrasar além do limite
 * de tempo e o n8n reenviar, o atrasado executa depois do retry, avança o
 * contador, e o flush do retry sai `ready: false`. Fechar isso exige o id da
 * mensagem no corpo (dívida 5.10, que depende de o n8n mandar o
 * `provider_message_id`).
 */
export async function appendToBuffer(
  phone: string,
  messageText: string,
): Promise<{ token: number; window_seconds: number }> {
  const k = keys(phone);
  const token = Number(
    await getRedisConnection().eval(ACRESCENTAR, 2, k.seq, k.list, messageText.trim(), TTL_SECONDS, MAX_MESSAGES),
  );
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

  const [pronto, junto] = (await redis.eval(
    CONSUMIR,
    3,
    k.seq,
    k.list,
    k.consumido(token),
    token,
    CONSUMO_TTL_SECONDS,
    TTL_SECONDS,
  )) as [
    number,
    string,
  ];
  if (pronto !== 1) {
    return { ready: false, message_text: "", parts: 0 };
  }
  // `cjson` codifica a lista vazia como objeto (`{}`), não como `[]`.
  const lido: unknown = JSON.parse(junto);
  const parts = Array.isArray(lido) ? lido.map(String) : [];

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
  // Zerar o `seq` faz os tokens recomeçarem do 1: o consumo guardado de um
  // token antigo não pode responder pelo novo.
  const consumidos = await redis.keys(`tibe:wa-buffer-consumido:${toBrazilPhoneDigits(phone)}:*`);
  if (consumidos.length > 0) await redis.del(...consumidos);
}
