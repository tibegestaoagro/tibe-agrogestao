import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();

/**
 * A porta de entrada do produto deixou de ser a parte mais fragil dele.
 *
 * `POST /api/internal/whatsapp/execute-action` e a rota que o agente usa para
 * escrever dinheiro, rebanho e estoque. Ate 2026-08-20 ela: recebia o
 * `tenant_id` NO CORPO, guardado so por um segredo estatico compartilhado com
 * uma instancia n8n externa; e nao tinha idempotencia nenhuma, entao um retry
 * regravava a mesma venda.
 *
 * `globalThis.AsyncLocalStorage` precisa existir antes de qualquer modulo do
 * Next carregar, mesmo motivo documentado em m23.
 *
 * Roda: `npm run test:m42` (precisa do banco local).
 */
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const SEGREDO = "segredo-de-teste-m42";

async function main() {
  console.log("🔐 M42: execute-action endurecido\n");

  process.env.INTERNAL_API_SECRET = SEGREDO;

  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const rota = await import("@/app/api/internal/whatsapp/execute-action/route");

  const stamp = Date.now();

  async function criarTenant(rotulo: string) {
    const tenant = await prisma.tenant.create({
      data: { name: `M42 ${rotulo} ${stamp}`, document: `M42${rotulo}${stamp}`.slice(0, 14), plan: "fazenda" },
    });
    const db = prismaForTenant(tenant.id);
    await db.tenantProfile.create({ data: scoped({ profile_type: "fazenda" as const, active: true }) });
    const user = await db.user.create({
      data: scoped({
        name: `M42 ${rotulo}`,
        email: `m42-${rotulo.toLowerCase()}-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER" as const,
      }),
    });
    return { tenant, db, user };
  }

  const A = await criarTenant("A");
  const B = await criarTenant("B");

  function chamar(body: Record<string, unknown>, segredo = SEGREDO) {
    return rota.POST(
      new Request("http://localhost/api/internal/whatsapp/execute-action", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": segredo },
        body: JSON.stringify(body),
      }),
    );
  }

  try {
    console.log("1. O segredo continua sendo exigido");
    {
      const res = await chamar({ tenant_id: A.tenant.id, user_id: A.user.id, intent: "ajuda" }, "errado");
      assert(res.status === 401, "segredo errado devolve 401");
    }

    console.log("\n2. O tenant_id do CORPO deixou de ser autoridade");
    {
      // Este e o cenario que o segredo sozinho nao impedia: quem tivesse a
      // chave escolhia a fazenda alvo no corpo da requisicao.
      const res = await chamar({
        tenant_id: B.tenant.id, // fazenda de outra pessoa
        user_id: A.user.id, // usuario que NAO pertence a ela
        intent: "ajuda",
      });
      const body = (await res.json()) as { error?: { code: string } };
      assert(
        res.status === 403 && body.error?.code === "TENANT_MISMATCH",
        "usuario de um tenant com o id de outro tenant e recusado (403 TENANT_MISMATCH)",
      );
    }

    console.log("\n3. A combinacao correta continua funcionando");
    {
      const res = await chamar({ tenant_id: A.tenant.id, user_id: A.user.id, intent: "ajuda" });
      assert(res.status === 200, "usuario com o proprio tenant responde 200");
    }

    console.log("\n4. Replay da mesma mensagem nao executa de novo");
    {
      const wamid = `wamid.TESTE${stamp}`;
      const primeira = await chamar({
        tenant_id: A.tenant.id,
        user_id: A.user.id,
        intent: "ajuda",
        message_text: "como faco pra registrar gasto?",
        provider_message_id: wamid,
      });
      const corpo1 = (await primeira.json()) as { data?: { reply_text?: string } };

      const segunda = await chamar({
        tenant_id: A.tenant.id,
        user_id: A.user.id,
        intent: "ajuda",
        message_text: "como faco pra registrar gasto?",
        provider_message_id: wamid,
      });
      const corpo2 = (await segunda.json()) as { data?: { reply_text?: string } };

      assert(segunda.status === 200, "replay responde 200");
      assert(
        corpo1.data?.reply_text === corpo2.data?.reply_text,
        "replay devolve exatamente a resposta da primeira vez",
      );

      const registros = await A.db.agentRequest.count({ where: { provider_message_id: wamid } });
      assert(registros === 1, `a mensagem gerou UM registro de execucao (gerou ${registros})`);

      // O ponto que mais importa: replay nao pode engordar o historico da
      // conversa, porque nao e mensagem nova do produtor.
      const logs = await A.db.agentConversationLog.count();
      assert(logs <= 2, `replay nao registra a conversa de novo (${logs} linhas para 1 mensagem)`);
    }

    console.log("\n5. Mensagens diferentes seguem sendo executadas");
    {
      const res = await chamar({
        tenant_id: A.tenant.id,
        user_id: A.user.id,
        intent: "ajuda",
        provider_message_id: `wamid.OUTRA${stamp}`,
      });
      assert(res.status === 200, "outro wamid executa normalmente");
      const total = await A.db.agentRequest.count();
      assert(total === 2, `dois wamid distintos geram dois registros (gerou ${total})`);
    }

    console.log("\n6. O registro de execucao e escopado por tenant");
    {
      const doB = await B.db.agentRequest.count();
      assert(doB === 0, "o tenant B nao enxerga as execucoes do tenant A");
    }

    console.log("\n7. Sem wamid, o comportamento antigo continua (sem travar o n8n de hoje)");
    {
      const res = await chamar({ tenant_id: A.tenant.id, user_id: A.user.id, intent: "ajuda" });
      assert(res.status === 200, "chamada sem provider_message_id ainda responde 200");
    }

    console.log("");
    if (failures > 0) {
      console.error(`❌ M42: ${failures} falha(s).`);
      process.exit(1);
    }
    console.log("✅ M42: 0 falhas.");
  } finally {
    await prisma.tenant.delete({ where: { id: A.tenant.id } });
    await prisma.tenant.delete({ where: { id: B.tenant.id } });
  }
}

main();
