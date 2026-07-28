import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";

/**
 * Teste das intenções ajuda e resumo (spec 2026-07-28). Roda: `npm run test:m12`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";

async function callExecute(input: {
  tenant_id: string;
  user_id: string;
  intent: string;
  parameters?: Record<string, unknown>;
}) {
  const req = new Request("http://localhost/api/internal/whatsapp/execute-action", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
    body: JSON.stringify({ parameters: {}, ...input }),
  });
  const res = await executeAction(req);
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log("🔒 M12 — ajuda e resumo\n");

  // ── Tenant A: os dois perfis (fazenda + prestador) ──────────────────
  const tenantA = await prisma.tenant.create({
    data: { name: "M12 Tenant A", document: "M12A00000001", plan: "grupo" },
  });
  const dbA = prismaForTenant(tenantA.id);

  // ── Tenant B: só fazenda ─────────────────────────────────────────────
  const tenantB = await prisma.tenant.create({
    data: { name: "M12 Tenant B", document: "M12B00000002", plan: "fazenda" },
  });
  const dbB = prismaForTenant(tenantB.id);

  try {
    await dbA.tenantProfile.create({ data: scoped({ profile_type: "fazenda" }) });
    await dbA.tenantProfile.create({ data: scoped({ profile_type: "prestador" }) });
    await dbB.tenantProfile.create({ data: scoped({ profile_type: "fazenda" }) });

    const ownerA = await dbA.user.create({
      data: scoped({ name: "Owner A", email: "m12-owner-a@test.local", password_hash: "x", role: "OWNER" }),
    });
    const ownerB = await dbB.user.create({
      data: scoped({ name: "Owner B", email: "m12-owner-b@test.local", password_hash: "x", role: "OWNER" }),
    });

    // ── dados reais pro resumo ────────────────────────────────────────
    const propA = await dbA.property.create({ data: scoped({ name: "Fazenda A" }) });
    const animal = await dbA.animal.create(
      { data: scoped({ ear_tag: "M12-1", breed: "Nelore", sex: "male", property_id: propA.id }) },
    );
    const vaccine = await dbA.vaccine.create({ data: scoped({ name: "Aftosa M12" }) });
    await dbA.animalVaccination.create({
      data: scoped({
        animal_id: animal.id,
        vaccine_id: vaccine.id,
        applied_at: new Date(),
        next_due_at: new Date(Date.now() + 5 * 86_400_000),
      }),
    });

    const client = await dbA.serviceClient.create({ data: scoped({ name: "Cliente M12" }) });
    const service = await dbA.service.create(
      { data: scoped({ name: "Diária M12", pricing_type: "fixed", unit_price: 100 }) },
    );
    await dbA.serviceOrder.create({
      data: scoped({
        service_client_id: client.id,
        service_id: service.id,
        quantity: 1,
        total_value: 100,
        status: "scheduled",
      }),
    });
    await dbA.serviceOrder.create({
      data: scoped({
        service_client_id: client.id,
        service_id: service.id,
        quantity: 1,
        total_value: 250.5,
        status: "completed",
        performed_at: new Date(),
      }),
    });

    // ── ajuda: tópico específico ──────────────────────────────────────
    const helpAnimal = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "ajuda",
      parameters: { topic: "cadastrar_animal" },
    });
    assert(/brinco/i.test(helpAnimal.body.data.reply_text), "ajuda cadastrar_animal explica o brinco");

    // ── ajuda: tópico de perfil não-ativo (tenant B só tem fazenda) ────
    const helpOrdemSemPerfil = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "ajuda",
      parameters: { topic: "cadastrar_servico_ordem" },
    });
    assert(
      /não est[aá] habilitado/i.test(helpOrdemSemPerfil.body.data.reply_text),
      "ajuda sobre tópico de perfil não-ativo avisa que não está disponível",
    );

    // ── ajuda: geral (sem topic), lista só o disponível pro perfil ─────
    const helpGeralB = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "ajuda",
      parameters: {},
    });
    assert(
      /cadastro de animais/i.test(helpGeralB.body.data.reply_text) &&
        !/ordens de serviço/i.test(helpGeralB.body.data.reply_text),
      "ajuda geral do tenant só-fazenda não menciona ordens de serviço",
    );

    // ── resumo: escopo vazio, tenant com os dois perfis → pergunta nível 1
    const resumoAskA = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: {},
    });
    assert(
      /Rebanho/.test(resumoAskA.body.data.reply_text) &&
        /Prestador/.test(resumoAskA.body.data.reply_text) &&
        /Financeiro/.test(resumoAskA.body.data.reply_text),
      "resumo sem escopo (2 perfis) pergunta as 4 categorias",
    );

    // ── resumo: escopo vazio, tenant só fazenda → não pergunta sobre prestador
    const resumoAskB = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "resumo",
      parameters: {},
    });
    assert(
      /Rebanho/.test(resumoAskB.body.data.reply_text) && !/Prestador/.test(resumoAskB.body.data.reply_text),
      "resumo sem escopo (só fazenda) não oferece Prestador",
    );

    // ── resumo: rebanho (folha, dado real) ─────────────────────────────
    const resumoRebanho = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "rebanho" },
    });
    assert(/1 animal/i.test(resumoRebanho.body.data.reply_text), "resumo rebanho mostra 1 animal ativo");
    assert(/5 dia/.test(resumoRebanho.body.data.reply_text), "resumo rebanho mostra a próxima vacina em 5 dias");

    // ── resumo: prestador (nível 2, pergunta) ──────────────────────────
    const resumoPrestador = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "prestador" },
    });
    assert(
      /Clientes/.test(resumoPrestador.body.data.reply_text) &&
        /Agendamentos/.test(resumoPrestador.body.data.reply_text) &&
        /Contas a receber/.test(resumoPrestador.body.data.reply_text),
      "resumo prestador pergunta o nível 2",
    );

    // ── resumo: clientes (folha nível 2, dado real) ────────────────────
    const resumoClientes = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "clientes" },
    });
    assert(/1 cliente/i.test(resumoClientes.body.data.reply_text), "resumo clientes mostra 1 cliente cadastrado");

    // ── resumo: contas_a_receber (soma total_value das completed) ──────
    const resumoContas = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "contas_a_receber" },
    });
    assert(
      /1 ordem/i.test(resumoContas.body.data.reply_text) && /250[,.]50/.test(resumoContas.body.data.reply_text),
      "resumo contas_a_receber soma corretamente (1 ordem completed, R$ 250,50)",
    );

    // ── resumo: agendamentos (só a scheduled) ──────────────────────────
    const resumoAgendamentos = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "agendamentos" },
    });
    assert(/1 ordem/i.test(resumoAgendamentos.body.data.reply_text), "resumo agendamentos mostra 1 ordem scheduled");

    // ── resumo: escopo de prestador sem o perfil ativo (tenant B) ──────
    const resumoClientesSemPerfil = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "resumo",
      parameters: { scope: "clientes" },
    });
    assert(
      /não est[aá] habilitado/i.test(resumoClientesSemPerfil.body.data.reply_text),
      "resumo clientes sem perfil prestador avisa que não está disponível",
    );

    // ── ambigua: texto novo, menos robótico ─────────────────────────────
    const ambigua = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "ambigua",
      parameters: {},
    });
    assert(
      /cadastrado/i.test(ambigua.body.data.reply_text) && /o que você faz/i.test(ambigua.body.data.reply_text),
      "ambigua convida a perguntar 'o que você faz?' em vez de só pedir pra reformular",
    );
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ M12: 0 falhas.");
  else console.error(`❌ M12: ${failures} falha(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
