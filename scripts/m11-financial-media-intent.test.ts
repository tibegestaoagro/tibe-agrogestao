import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";

/**
 * Teste da intenção registrar_lancamento_financeiro (spec 2026-07-28: mídia
 * no agente WhatsApp: extração de recibo por imagem/PDF). Roda: `npm run test:m11`
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
  console.log("🔒 M11 — registrar_lancamento_financeiro (recibo por mídia)\n");

  const tenant = await prisma.tenant.create({
    data: { name: "M11 Tenant", document: "M11A000000001", plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const owner = await db.user.create({
      data: scoped({
        name: "Owner M11",
        email: "m11-owner@test.local",
        password_hash: "x",
        role: "OWNER",
        phone: "5511900000099",
      }),
    });

    // ── amount ausente: pede pra informar, não grava nada ──────────
    const eMissing = await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { category: "Combustível" },
    });
    assert(
      /valor/i.test(eMissing.body.data.reply_text) && eMissing.body.data.requires_confirmation === false,
      "amount ausente pede pra informar o valor, sem confirmação pendente",
    );
    const countAfterMissing = await db.financialEntry.count();
    assert(countAfterMissing === 0, "nenhum lançamento criado quando falta o valor");

    // ── pede confirmação, não grava antes de confirmar ──────────────
    const eAsk = await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { amount: 450.5, category: "Combustível", vendor: "Posto XX" },
    });
    assert(eAsk.body.data.requires_confirmation === true, "pede confirmação mesmo com valor baixo (sempre confirma)");
    assert(
      /450[,.]50/.test(eAsk.body.data.reply_text) && /Combustível/.test(eAsk.body.data.reply_text),
      "resumo de confirmação mostra valor e categoria",
    );
    const countBeforeConfirm = await db.financialEntry.count();
    assert(countBeforeConfirm === 0, "nenhum lançamento criado antes de confirmar");

    // ── explicitNo cancela sem gravar ────────────────────────────────
    const eNo = await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { amount: 450.5, category: "Combustível", vendor: "Posto XX" },
      message_text: "não",
    });
    assert(/cancelado/i.test(eNo.body.data.reply_text), "resposta 'não' cancela o lançamento");
    const countAfterNo = await db.financialEntry.count();
    assert(countAfterNo === 0, "nenhum lançamento criado após cancelar");

    // ── confirma: cria o FinancialEntry ──────────────────────────────
    const eConfirm = await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { amount: 450.5, category: "Combustível", vendor: "Posto XX" },
      message_text: "sim",
    });
    assert(
      eConfirm.body.data.requires_confirmation === false && /registrado/i.test(eConfirm.body.data.reply_text),
      "'sim' confirma e a resposta indica sucesso",
    );
    const entry = await db.financialEntry.findFirst({ where: { related_module: "geral", category: "Combustível" } });
    assert(!!entry, "FinancialEntry foi criado");
    assert(entry?.entry_type === "expense", "entry_type é despesa");
    assert(Number(entry?.amount) === 450.5, "amount gravado corretamente");
    assert(entry?.notes === "Posto XX", "vendor vai pro campo notes");
    assert(entry?.status === "pending", "nasce pending, igual qualquer lançamento manual");

    // ── categoria fora da lista fixa cai em "Outros" ─────────────────
    await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { amount: 100, category: "categoria-inventada" },
      message_text: "sim",
    });
    const entryOutros = await db.financialEntry.findFirst({ where: { related_module: "geral", amount: 100 } });
    assert(entryOutros?.category === "Outros", "categoria fora da lista fixa vira 'Outros'");
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  }

  console.log("");
  if (failures === 0) console.log("✅ M11: 0 falhas.");
  else console.error(`❌ M11: ${failures} falha(s).`);
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
