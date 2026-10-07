import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import {
  appendToBuffer,
  flushBuffer,
  clearBuffer,
  BUFFER_WINDOW_SECONDS,
} from "@/lib/actions/whatsapp-buffer";
import { getRedisConnection } from "@/lib/redis";

exigirBancoLocal();


/**
 * Testes do buffer de mensagens picadas (2026-07-30).
 * O que importa aqui é a regra de corrida: só a ÚLTIMA execução responde, e as
 * anteriores morrem em silêncio. Sem isso, o produtor que escreve em 3 pedaços
 * recebe 3 respostas.
 * Roda: `npm run test:m20`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("💬 Buffer de mensagens picadas\n");

  const phone = `5522${Date.now().toString().slice(-9)}`;
  const outro = `5521${Date.now().toString().slice(-9)}`;

  try {
    await clearBuffer(phone);
    await clearBuffer(outro);

    assert(BUFFER_WINDOW_SECONDS === 12, `janela de ${BUFFER_WINDOW_SECONDS}s conforme decidido`);

    // ── caso central: 3 fragmentos, só o último responde ──────────────
    const t1 = await appendToBuffer(phone, "oi");
    const t2 = await appendToBuffer(phone, "tudo bom?");
    const t3 = await appendToBuffer(phone, "me diz minhas contas a pagar");
    assert(t1.token < t2.token && t2.token < t3.token, "cada fragmento recebe um token crescente");

    const f1 = await flushBuffer(phone, t1.token);
    assert(!f1.ready, "o PRIMEIRO fragmento não responde (chegou mensagem depois dele)");
    const f2 = await flushBuffer(phone, t2.token);
    assert(!f2.ready, "o fragmento do meio também não responde");

    const f3 = await flushBuffer(phone, t3.token);
    assert(f3.ready, "só o ÚLTIMO fragmento responde");
    assert(f3.parts === 3, `o texto concatenado traz os 3 pedaços (obtido: ${f3.parts})`);
    assert(
      f3.message_text.includes("oi") &&
        f3.message_text.includes("tudo bom") &&
        f3.message_text.includes("contas a pagar"),
      "nenhum pedaço é perdido na concatenação",
    );
    assert(!f3.message_text.includes(".."), "não gera pontuação duplicada ao juntar");

    // ── retry do mesmo token depois do flush (dívida 3.1, revisão do Codex) ──
    // Até 07/10 o segundo flush do mesmo token voltava vazio. Com o limite de
    // tempo da conexão, um flush que estourasse depois de apagar a lista fazia
    // o retry do n8n achar nada, e a mensagem do produtor sumia. Agora o retry
    // recebe o MESMO texto; processar duas vezes é barrado pela idempotência
    // por wamid do turno e do execute-action.
    const retry = await flushBuffer(phone, t3.token);
    assert(retry.ready && retry.parts === 3 && retry.message_text === f3.message_text, "o retry do mesmo token recebe o mesmo texto, nada se perde");

    // ── e a conversa seguinte não herda o consumo da anterior ─────────
    const depois = await appendToBuffer(phone, "outra pergunta");
    assert(depois.token > t3.token, "o token da mensagem seguinte não se repete (seq não é zerado no consumo)");
    const fDepois = await flushBuffer(phone, depois.token);
    assert(fDepois.ready && fDepois.parts === 1 && fDepois.message_text === "outra pergunta", "a mensagem seguinte sai sozinha, sem os pedaços já consumidos");

    // ── mensagem única continua funcionando ───────────────────────────
    const s1 = await appendToBuffer(phone, "quantos animais eu tenho?");
    const sf = await flushBuffer(phone, s1.token);
    assert(sf.ready && sf.parts === 1, "mensagem única passa direto, sem penalidade");
    assert(sf.message_text === "quantos animais eu tenho?", "texto da mensagem única fica intacto");

    // ── isolamento entre telefones ────────────────────────────────────
    const a = await appendToBuffer(phone, "mensagem do telefone A");
    const b = await appendToBuffer(outro, "mensagem do telefone B");
    const fa = await flushBuffer(phone, a.token);
    const fb = await flushBuffer(outro, b.token);
    assert(fa.ready && fa.message_text === "mensagem do telefone A", "buffer do telefone A não vaza");
    assert(fb.ready && fb.message_text === "mensagem do telefone B", "buffer do telefone B não vaza");

    // ── token inventado nunca responde ────────────────────────────────
    await appendToBuffer(phone, "teste");
    const forjado = await flushBuffer(phone, 999999);
    assert(!forjado.ready, "token que não corresponde ao último nunca libera resposta");

    // ── mensagem vazia (ex: áudio não transcrito) não polui ───────────
    await clearBuffer(phone);
    const v1 = await appendToBuffer(phone, "");
    const vf = await flushBuffer(phone, v1.token);
    assert(vf.ready && vf.parts === 0, "mensagem vazia não vira pedaço no texto");
  } finally {
    await clearBuffer(phone).catch(() => {});
    await clearBuffer(outro).catch(() => {});
    getRedisConnection().disconnect();
  }

  console.log("");
  if (failures === 0) console.log("✅ Buffer: 0 falhas.");
  else console.error(`❌ Buffer: ${failures} falha(s).`);
}

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch((err) => {
    console.error("❌ Erro inesperado:", err);
    process.exit(1);
  });
