import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { POST as resolveContact } from "@/app/api/internal/whatsapp/resolve-contact/route";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";

/**
 * Testes do Módulo 3 (Agente WhatsApp): resolução de contato, permissão por
 * role/perfil, confirmação de ações de alto valor, e isolamento de tenant nas
 * rotas internas. Roda: `npm run test:m3`
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

async function callResolve(phone: string) {
  const req = new Request("http://localhost/api/internal/whatsapp/resolve-contact", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
    body: JSON.stringify({ phone }),
  });
  const res = await resolveContact(req);
  return { status: res.status, body: await res.json() };
}

async function callExecute(input: {
  tenant_id: string;
  user_id: string;
  intent: string;
  parameters?: Record<string, unknown>;
  message_text?: string;
  confirmed?: boolean;
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
  console.log("🔒 Módulo 3: Agente WhatsApp\n");

  const tenantA = await prisma.tenant.create({
    data: { name: "M3 Tenant A", document: "M3A000000001", plan: "grupo" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "M3 Tenant B", document: "M3B000000002", plan: "fazenda" },
  });
  const dbA = prismaForTenant(tenantA.id);
  const dbB = prismaForTenant(tenantB.id);

  try {
    await dbA.tenantProfile.create({ data: scoped({ profile_type: "fazenda" }) });
    await dbA.tenantProfile.create({ data: scoped({ profile_type: "prestador" }) });
    await dbB.tenantProfile.create({ data: scoped({ profile_type: "fazenda" }) });

    const propA = await dbA.property.create({ data: scoped({ name: "Fazenda A" }) });
    await dbB.property.create({ data: scoped({ name: "Fazenda B" }) });

    const ownerA = await dbA.user.create({
      data: scoped({
        name: "Owner A",
        email: "m3-owner-a@test.local",
        password_hash: "x",
        role: "OWNER",
        phone: "5511900000001",
      }),
    });
    const viewerA = await dbA.user.create({
      data: scoped({
        name: "Viewer A",
        email: "m3-viewer-a@test.local",
        password_hash: "x",
        role: "VISUALIZADOR",
        phone: "5511900000002",
      }),
    });
    const ownerB = await dbB.user.create({
      data: scoped({
        name: "Owner B",
        email: "m3-owner-b@test.local",
        password_hash: "x",
        role: "OWNER",
        phone: "5511900000003",
      }),
    });

    // ── resolve-contact ──────────────────────────────────────────
    const r1 = await callResolve(ownerA.phone!);
    assert(r1.status === 200 && r1.body.data.identified === true, "resolve-contact identifica owner A");
    assert(r1.body.data.tenant_id === tenantA.id, "resolve-contact retorna tenant_id correto");
    assert(r1.body.meta.first_contact === true, "primeira mensagem marcada como first_contact");
    assert(typeof r1.body.meta.suggested_reply === "string", "first_contact traz suggested_reply de boas-vindas");

    const r2 = await callResolve(ownerA.phone!);
    assert(r2.body.meta.first_contact === false, "segunda mensagem NÃO é first_contact");

    const r3 = await callResolve("5599999999999");
    assert(r3.body.data.identified === false, "telefone desconhecido -> identified false");
    assert(typeof r3.body.meta.suggested_reply === "string", "não identificado traz suggested_reply de orientação");

    // ── permissão por role (visualizador não escreve) ───────────
    const eDenied = await callExecute({
      tenant_id: tenantA.id,
      user_id: viewerA.id,
      intent: "cadastrar_animal",
      parameters: { ear_tag: "V001", breed: "Nelore", sex: "male" },
    });
    assert(
      !/cadastrado com sucesso/.test(eDenied.body.data.reply_text) && eDenied.status === 200,
      "visualizador NÃO consegue cadastrar animal via WhatsApp",
    );
    const deniedAnimal = await dbA.animal.findFirst({ where: { ear_tag: "V001" } });
    assert(deniedAnimal === null, "nenhum animal foi criado pela tentativa negada");

    // ── cadastrar_animal (auto-resolve propriedade única) ───────
    const eCreate = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "cadastrar_animal",
      parameters: { ear_tag: "A100", breed: "Nelore", sex: "male" },
    });
    assert(
      /cadastrado com sucesso/.test(eCreate.body.data.reply_text),
      "owner cadastra animal via WhatsApp (propriedade única auto-resolvida)",
    );
    const created = await dbA.animal.findFirst({ where: { ear_tag: "A100" } });
    assert(created?.property_id === propA.id, "animal criado na única propriedade do tenant");

    // ── registrar_peso ───────────────────────────────────────────
    const eWeight = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_peso",
      parameters: { ear_tag: "A100", weight: 250 },
    });
    assert(/250kg/.test(eWeight.body.data.reply_text), "peso registrado e refletido na resposta");

    // ── confirmação para venda de alto valor ────────────────────
    const eSaleAsk = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_movimento",
      parameters: { ear_tag: "A100", movement_type: "sale", value: 10000 },
    });
    assert(eSaleAsk.body.data.requires_confirmation === true, "venda > R$5.000 exige confirmação");
    const beforeConfirm = await dbA.financialEntry.count({ where: { related_module: "rebanho" } });
    assert(beforeConfirm === 0, "nenhum FinancialEntry criado antes da confirmação");

    const eSaleConfirm = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_movimento",
      parameters: { ear_tag: "A100", movement_type: "sale", value: 10000 },
      message_text: "sim",
    });
    assert(
      eSaleConfirm.body.data.requires_confirmation === false &&
        !/Confirma/.test(eSaleConfirm.body.data.reply_text),
      "resposta 'sim' (texto livre) confirma a venda",
    );
    const soldAnimal = await dbA.animal.findFirst({ where: { ear_tag: "A100" } });
    assert(soldAnimal?.status === "sold", "status do animal atualizado para vendido");
    const entry = await dbA.financialEntry.findFirst({ where: { related_module: "rebanho" } });
    assert(!!entry && entry.entry_type === "income", "FinancialEntry de receita criado após confirmação");

    // ── isolamento: tenant B não enxerga o brinco de A ──────────
    const eCrossTenant = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "consultar_animal",
      parameters: { ear_tag: "A100" },
    });
    assert(
      /não encontrado/i.test(eCrossTenant.body.data.reply_text),
      "tenant B não encontra animal com brinco de A (isolamento)",
    );

    // ── consultar_saldo reflete a venda ──────────────────────────
    const eBalance = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "consultar_saldo",
    });
    assert(
      eBalance.body.data.auxiliary_data.income >= 10000,
      "consultar_saldo reflete a receita da venda confirmada",
    );

    // ── log de conversação ───────────────────────────────────────
    const contactA = await dbA.whatsAppContact.findFirst({ where: { user_id: ownerA.id } });
    const logs = await dbA.agentConversationLog.findMany({
      where: { whatsapp_contact_id: contactA!.id },
    });
    assert(logs.some((l) => l.direction === "in"), "log registra mensagens recebidas (in)");
    assert(logs.some((l) => l.direction === "out"), "log registra respostas enviadas (out)");
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 3: 0 falhas.");
  else console.error(`❌ Módulo 3: ${failures} falha(s).`);
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
