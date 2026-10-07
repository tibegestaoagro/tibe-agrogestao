/**
 * Redis fora do ar não pendura quem espera por ele (dívida 3.1, 2026-10-07).
 *
 * Até aqui a conexão compartilhada (`src/lib/redis.ts`) usava
 * `maxRetriesPerRequest: null`: com o servidor inacessível, o comando ficava na
 * fila para sempre e o `await` nunca resolvia. Nenhum try/catch pega isso.
 *
 * Prova, nos dois sentidos:
 *   1. LADO VIVO: o primeiro comando, disparado logo depois de criar a conexão
 *      (a partida a frio da Vercel), funciona. É o que a fila offline ligada
 *      garante; desligá-la quebraria exatamente isto.
 *   2. LADO MORTO: com o Redis inacessível, `get` rejeita em poucos segundos,
 *      e o cursor e o store de pendências do agente devolvem "sem dado" no
 *      mesmo prazo, em vez de pendurar o turno.
 *
 * Não lê o `.env`: o REDIS_URL de lá é o de PRODUÇÃO. O lado vivo usa o Redis
 * local (`tibe-redis`, porta 56379), e o morto uma porta onde nada escuta.
 */

const REDIS_LOCAL = "redis://127.0.0.1:56379";
const REDIS_MORTO = "redis://127.0.0.1:1";
const PRAZO_MS = 4000;

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) {
    console.log(`  ✅ ${nome}`);
  } else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function cronometrar<T>(promessa: Promise<T>): Promise<{ ms: number; valor?: T; erro?: unknown }> {
  const inicio = Date.now();
  try {
    const valor = await promessa;
    return { ms: Date.now() - inicio, valor };
  } catch (erro) {
    return { ms: Date.now() - inicio, erro };
  }
}

function esquecerConexao() {
  const global = globalThis as unknown as { redisConnection?: { disconnect(): void } };
  global.redisConnection?.disconnect();
  global.redisConnection = undefined;
}

async function main() {
  console.log("🧱 M72: Redis fora do ar não pendura (dívida 3.1)");
  const { getRedisConnection } = await import("@/lib/redis");

  console.log("\n1. Lado vivo: o primeiro comando de uma conexão nova funciona");
  process.env.REDIS_URL = REDIS_LOCAL;
  esquecerConexao();
  const chave = `tibe:m72:${Date.now()}`;
  const escrita = await cronometrar(getRedisConnection().set(chave, "ok", "EX", 30));
  check("o set disparado na criação da conexão grava", escrita.valor === "OK", String(escrita.erro ?? escrita.valor));
  const leitura = await cronometrar(getRedisConnection().get(chave));
  check("e o get lê de volta", leitura.valor === "ok", String(leitura.erro ?? leitura.valor));
  await getRedisConnection().del(chave);

  console.log("\n2. Lado morto: nada espera para sempre");
  process.env.REDIS_URL = REDIS_MORTO;
  esquecerConexao();

  const get = await cronometrar(getRedisConnection().get("qualquer"));
  check(`get rejeita em menos de ${PRAZO_MS} ms`, get.erro !== undefined && get.ms < PRAZO_MS, `${get.ms} ms, ${String(get.erro ?? get.valor)}`);

  const { carregarCursor } = await import("@/lib/agente/cursor");
  const cursor = await cronometrar(carregarCursor("tenant-m72", "user-m72"));
  check(`o cursor do agente devolve null em menos de ${PRAZO_MS} ms`, cursor.valor === null && cursor.ms < PRAZO_MS, `${cursor.ms} ms`);

  const { criarStoreDePendencia } = await import("@/lib/actions/pending-store");
  const store = criarStoreDePendencia<"campo">({ prefixo: "m72-pending" });
  const pendente = await cronometrar(store.carregar("tenant-m72", "user-m72"));
  check(`o pendente do agente devolve null em menos de ${PRAZO_MS} ms`, pendente.valor === null && pendente.ms < PRAZO_MS, `${pendente.ms} ms`);

  // 3. Revisão do Codex: o limite REJEITA a promessa, mas o comando executa
  // quando o Redis volta. Quem escreve precisa ser seguro com o resultado
  // incerto. `CLIENT PAUSE` reproduz isso de verdade: o Redis segura os
  // comandos mais que o limite e os executa quando a pausa acaba.
  console.log("\n3. Escrita que executa DEPOIS de o limite rejeitar");
  esquecerConexao();
  process.env.REDIS_URL = REDIS_LOCAL;
  const { default: IORedis } = await import("ioredis");
  const admin = new IORedis(REDIS_LOCAL);
  const { adquirirLock } = await import("@/lib/redis");
  const { checkLoginRateLimit } = await import("@/lib/rate-limit");
  await getRedisConnection().ping();

  const chaveLock = `tibe:m72:lock:${Date.now()}`;
  const quem = `m72-${Date.now()}`;
  await admin.call("CLIENT", "PAUSE", "3000", "ALL");
  const [lock, tentativa] = await Promise.allSettled([
    adquirirLock(chaveLock, 600),
    checkLoginRateLimit("m72", quem, { windowSeconds: 600, maxAttempts: 5 }),
  ]);
  check("o lock rejeita enquanto o Redis está parado", lock.status === "rejected");
  check("o rate limit rejeita enquanto o Redis está parado", tentativa.status === "rejected");
  await new Promise((r) => setTimeout(r, 4000));

  check(
    "o SET do lock executou depois, e o 'apague se for meu' atrás dele não deixou o dia preso",
    (await admin.exists(chaveLock)) === 0,
    `exists=${await admin.exists(chaveLock)}`,
  );
  const chaveTentativa = `tibe:login-attempts:m72:${quem}`;
  const prazo = await admin.ttl(chaveTentativa);
  check(
    "o INCR do rate limit executou depois, e a chave tem prazo (não bloqueia para sempre)",
    prazo > 0,
    `ttl=${prazo}, valor=${await admin.get(chaveTentativa)}`,
  );

  await admin.set(`${chaveTentativa}:sem-prazo`, "9");
  await checkLoginRateLimit("m72", `${quem}:sem-prazo`, { windowSeconds: 600, maxAttempts: 5 });
  check("chave que já estava sem prazo ganha prazo na próxima tentativa", (await admin.ttl(`${chaveTentativa}:sem-prazo`)) > 0);

  await admin.del(chaveTentativa, `${chaveTentativa}:sem-prazo`);

  // 4. Segunda rodada do Codex: o flush do buffer de mensagens picadas lia,
  // apagava em passos separados, e o retry depois de um DEL atrasado achava a
  // lista vazia. A mensagem do produtor sumia.
  const { appendToBuffer, flushBuffer, clearBuffer } = await import("@/lib/actions/whatsapp-buffer");
  const telefone = "5511999720072";
  await clearBuffer(telefone);
  await appendToBuffer(telefone, "vendi 10 bois");
  const ultimo = await appendToBuffer(telefone, "por 50 mil");
  // WRITE, e não ALL: a leitura passa e só a escrita atrasa, que é o caso do
  // defeito (o GET e o LRANGE respondiam, o DEL estourava o limite e executava depois).
  await admin.call("CLIENT", "PAUSE", "3000", "WRITE");
  const primeiro = await Promise.allSettled([flushBuffer(telefone, ultimo.token)]);
  check("o flush rejeita enquanto o Redis está parado", primeiro[0].status === "rejected");
  await new Promise((r) => setTimeout(r, 4000));
  const retry = await flushBuffer(telefone, ultimo.token);
  check(
    "o retry depois do consumo atrasado recupera a mensagem inteira",
    retry.ready && retry.parts === 2 && retry.message_text.includes("50 mil"),
    JSON.stringify(retry),
  );
  await clearBuffer(telefone);
  admin.disconnect();
  esquecerConexao();
  console.log(falhas === 0 ? "\n✅ M72: 0 falhas." : `\n❌ M72: ${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
