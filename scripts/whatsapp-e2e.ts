import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { readOutbound, clearOutbound } from "@/lib/whatsapp-outbox";
import { getRedisConnection } from "@/lib/redis";

/**
 * Banco de provas do agente WhatsApp (2026-08-13).
 *
 * Manda uma mensagem para o webhook do fluxo REAL de produção e devolve a
 * resposta que o agente daria ao produtor, lida da caixa de saída
 * (src/lib/whatsapp-outbox.ts). Serve para exercitar conversa inteira sem
 * depender de alguém com o celular na mão mandando print.
 *
 * O ponto do desenho: NÃO existe cópia do fluxo. A mensagem entra pelo mesmo
 * webhook que a Evolution usa, e passa pelo buffer, pelo classificador, pelo
 * execute-action e pelo humanizador de verdade. Um banco de provas que
 * duplica o classificador só prova que a cópia funciona, e é exatamente o
 * tipo de falso positivo que já custou caro neste projeto.
 *
 * O que ele NÃO cobre, e precisa continuar sendo testado no aparelho ao menos
 * uma vez por rodada: o transporte da Evolution (entrega de fato no celular),
 * áudio e foto de recibo (a mídia é buscada pelo message_id na Evolution, que
 * não existe numa mensagem simulada).
 *
 * Uso:
 *   npx tsx scripts/whatsapp-e2e.ts diga "Comprei 20 bezerros do Joao por 60 mil"
 *   npx tsx scripts/whatsapp-e2e.ts limpa
 *   npx tsx scripts/whatsapp-e2e.ts estado
 *   npx tsx scripts/whatsapp-e2e.ts roteiro caminho/do/roteiro.txt
 *
 * Configuração (.env):
 *   WA_TEST_PHONE   telefone do usuário de teste (só dígitos, com DDI)
 *   URL_N8N         base do n8n; o webhook é <base>/webhook/atendimento
 */

const TELEFONE = (process.env.WA_TEST_PHONE ?? "").replace(/\D/g, "");

// O buffer de mensagens picadas espera 12 segundos antes de responder, e
// depois disso ainda há duas chamadas de LLM (classificar e humanizar). 120
// segundos é folga generosa: se estourar, o problema é real, não lentidão.
const ESPERA_MAXIMA_MS = 120_000;
const INTERVALO_MS = 2_000;

function webhookUrl(): string {
  const bruta = process.env.URL_N8N ?? "";
  const base = bruta.replace(/\/home\/workflows\/?$/, "").replace(/\/+$/, "");
  if (!base) throw new Error("URL_N8N não definida no .env");
  return `${base}/webhook/atendimento`;
}

function exigirTelefone(): string {
  if (!TELEFONE) {
    throw new Error(
      "WA_TEST_PHONE não definida no .env. Use o telefone do usuário de teste, só dígitos, com DDI.",
    );
  }
  return TELEFONE;
}

/**
 * Confirma que o telefone pertence ao tenant de PROVAS, e não a um cliente.
 *
 * Este script não pode receber `exigirBancoLocal()`: ele fala com o n8n de
 * produção de propósito, e é esse o ponto do banco de provas. A guarda certa é
 * a mesma de `_provas-estoque-seed.ts`, por NOME do tenant. Sem ela, um
 * `WA_TEST_PHONE` trocado por engano faria o `limpa` apagar o histórico de
 * conversa de um produtor real, sem aviso e sem volta.
 */
async function exigirTenantDeProvas(phone: string): Promise<void> {
  const contato = await prisma.whatsAppContact.findFirst({
    where: { phone },
    select: { tenant: { select: { name: true } } },
  });
  const nome = contato?.tenant.name;
  if (nome && !/prova/i.test(nome)) {
    throw new Error(
      `Recusando: ${phone} pertence ao tenant "${nome}", que não é o de provas.\n` +
        "Corrija WA_TEST_PHONE no .env, ou rode `npm run wa:seed <telefone>` para criar o tenant de provas.",
    );
  }
}

async function dormir(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Monta o payload no formato que a Evolution manda e que o nó "Normalizar e
 * Filtrar" do fluxo espera. Se o fluxo mudar esse formato, este script para
 * de funcionar em vez de testar a coisa errada em silêncio, que é o
 * comportamento desejado.
 */
function payloadEvolution(phone: string, texto: string, seq: number) {
  return {
    event: "messages.upsert",
    instance: "banco-de-provas",
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe: false,
        id: `PROVA${Date.now()}${seq}`,
      },
      pushName: "Banco de Provas",
      message: { conversation: texto },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
}

async function diga(texto: string, seq = 0): Promise<string[]> {
  const phone = exigirTelefone();
  const antes = (await readOutbound(phone)).length;

  const res = await fetch(webhookUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadEvolution(phone, texto, seq)),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new Error(`Webhook do n8n respondeu ${res.status}: ${corpo.slice(0, 300)}`);
  }

  console.log(`\n  >> ${texto}`);

  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (Date.now() < limite) {
    await dormir(INTERVALO_MS);
    const agora = await readOutbound(phone);
    if (agora.length > antes) {
      // A lista vem da mais recente para a mais antiga; as novas são as
      // primeiras. Invertidas aqui para sair na ordem em que o produtor leria.
      const novas = agora.slice(0, agora.length - antes).reverse();
      for (const m of novas) console.log(`  << ${m.text}`);
      return novas.map((m) => m.text);
    }
  }

  console.log("  << (sem resposta dentro de 120s)");
  return [];
}

/**
 * Zera a conversa: caixa de saída, buffer de fragmentos, os pedidos pendentes
 * dos TRÊS domínios, a marca de última execução e o histórico que alimenta o
 * `recent_history`. Sem isso, um caso de teste enxerga a conversa do caso
 * anterior e o resultado deixa de ser reproduzível.
 *
 * Até 2026-08-18 só a pendência do REBANHO era apagada, e as de negócio (M31,
 * missão 1) e de estoque (missão 2) sobreviviam ao `limpa`. O sintoma não
 * parecia sujeira de estado: dois casos seguidos que perguntavam o mesmo campo
 * faziam o segundo cair na trava de laço e responder "vou deixar de lado",
 * como se a conversa estivesse quebrada. `tibe:ultima-execucao` entra pelo
 * mesmo motivo: é ele que decide se um "sim" ainda tem a que se referir.
 */
async function limpa() {
  const phone = exigirTelefone();
  const redis = getRedisConnection();

  await clearOutbound(phone);
  await redis.del(`tibe:wa-buffer:${phone}`);
  await redis.del(`tibe:wa-buffer-seq:${phone}`);

  const contato = await prisma.whatsAppContact.findFirst({ where: { phone } });
  if (contato) {
    const apagados = await prisma.agentConversationLog.deleteMany({
      where: { whatsapp_contact_id: contato.id },
    });
    console.log(`historico apagado: ${apagados.count} linha(s)`);
    if (contato.user_id) {
      const escopo = `${contato.tenant_id}:${contato.user_id}`;
      await redis.del(
        `tibe:herd-pending:${escopo}`,
        `tibe:negocio-pending:${escopo}`,
        `tibe:estoque-pending:${escopo}`,
        `tibe:ultima-execucao:${escopo}`,
      );
      console.log("pedidos pendentes (rebanho, negocio, estoque): limpos");
    }
  } else {
    console.log(`nenhum WhatsAppContact para ${phone} (conversa ainda nao comecou)`);
  }
  console.log("caixa de saida e buffer: limpos");
}

/** Mostra quem o telefone identifica e as ultimas trocas, sem mandar nada. */
async function estado() {
  const phone = exigirTelefone();
  const user = await prisma.user.findFirst({
    where: { phone, active: true },
    select: { id: true, name: true, email: true, role: true, tenant: { select: { name: true } } },
  });
  console.log(`telefone: ${phone}`);
  console.log(
    user
      ? `identifica: ${user.name} (${user.email}), ${user.role}, tenant "${user.tenant.name}"`
      : "identifica: NINGUEM (o agente vai responder que o numero nao esta cadastrado)",
  );

  const caixa = await readOutbound(phone);
  console.log(`\ncaixa de saida: ${caixa.length} mensagem(ns)`);
  for (const m of caixa.slice().reverse()) console.log(`  << [${m.at}] ${m.text}`);
}

/**
 * Roda um roteiro: uma mensagem por linha, linhas vazias e comecadas por "#"
 * ignoradas. Cada mensagem so e enviada depois da resposta da anterior, que e
 * como uma conversa de verdade acontece.
 */
async function roteiro(caminho: string) {
  const fs = await import("node:fs/promises");
  const bruto = await fs.readFile(caminho, "utf8");
  const linhas = bruto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  console.log(`roteiro: ${linhas.length} mensagem(ns) de ${caminho}`);
  let i = 0;
  for (const linha of linhas) {
    await diga(linha, i++);
  }
}

async function main() {
  const [comando, ...resto] = process.argv.slice(2);

  // Antes de qualquer comando, inclusive `estado`: descobrir tarde que o
  // telefone e de um cliente ja seria tarde demais para o `limpa`.
  if (TELEFONE) await exigirTenantDeProvas(TELEFONE);

  switch (comando) {
    case "diga":
      if (!resto.length) throw new Error('uso: diga "sua mensagem"');
      await diga(resto.join(" "));
      break;
    case "limpa":
      await limpa();
      break;
    case "estado":
      await estado();
      break;
    case "roteiro":
      if (!resto[0]) throw new Error("uso: roteiro caminho/do/arquivo.txt");
      await roteiro(resto[0]);
      break;
    default:
      console.log("comandos: diga | limpa | estado | roteiro");
      console.log('  npx tsx scripts/whatsapp-e2e.ts diga "Comprei 20 bezerros"');
      break;
  }

  await prisma.$disconnect();
  getRedisConnection().disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
