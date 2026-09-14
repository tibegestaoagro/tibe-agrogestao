import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Agente do WhatsApp, Fase 1 (fundacao). Spec:
 * docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md.
 * Chama a rota execute-action como o n8n chama. Roda: `npm run test:m67`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "m67-segredo";

async function main() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { POST } = await import("@/app/api/internal/whatsapp/execute-action/route");
  const { recordMovement } = await import("@/lib/actions/herd-ledger");

  const { detectConfirmation } = await import("@/lib/actions/confirmation");
  console.log("1. Confirmação estrita");
  const esperado: [string, "yes" | "no" | null][] = [
    ["sim", "yes"], ["Sim, pode", "yes"], ["pode sim", "yes"], ["ok", "yes"], ["isso mesmo", "yes"],
    ["confirmo a venda", "yes"], ["não", "no"], ["Não, deixa pra lá", "no"], ["cancela", "no"], ["esquece isso", "no"],
    ["pode lançar 500 de diesel", null], ["ok, anota 500 de diesel", null], ["para o João", null],
    ["para amanhã me lembra de vacinar", null], ["pode cancelar", null], ["isso aí não é boi", null],
    ["sim mas foram 30 e não 20", null], ["não sei quanto foi, uns 20", "no"],
    ["não, foram 30 e não 20", "no"], ["não, deixa pra lá, depois eu vejo isso", "no"],
    ["pode, mas cancelado", null],
  ];
  for (const [frase, resp] of esperado) {
    const r = detectConfirmation(frase);
    check(`"${frase}" -> ${resp}`, r === resp, String(r));
  }

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M67 ${stamp}`, document: `M67${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);
  try {
    await prisma.tenantProfile.create({ data: { tenant_id: tenant.id, profile_type: "fazenda", active: true } });
    const owner = await prisma.user.create({
      data: { tenant_id: tenant.id, name: "Dono M67", email: `m67-${stamp}@teste.local`, password_hash: "x", role: "OWNER", active: true },
    });
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M67" }) });
    const pasto = await db.pasture.create({ data: scoped({ property_id: fazenda.id, name: "Pasto M67", area_hectares: 10 }) });
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 100,
      to: { category_id: "macho_25_36", property_id: fazenda.id, pasture_id: pasto.id, situation: "presente", owner: "proprio" },
    });

    let seq = 0;
    const acao = async (
      intent: string,
      parameters: Record<string, unknown>,
      message_text?: string,
      extra: Record<string, unknown> = {},
    ) => {
      seq += 1;
      const res = await POST(
        new Request("http://localhost/api/internal/whatsapp/execute-action", {
          method: "POST",
          headers: { "content-type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET! },
          body: JSON.stringify({ tenant_id: tenant.id, user_id: owner.id, intent, parameters, message_text: message_text ?? null, ...extra }),
        }),
      );
      const corpo = await res.json();
      return { status: res.status, data: corpo.data ?? corpo, seq };
    };

    console.log("🤖 M67: agente do WhatsApp, fundacao\n");

    console.log("\n2. Idempotência por intenção");
    {
      const wamid = `WAMID-${stamp}`;
      const a = await acao("consultar_rebanho", {}, "quantos animais e o que tenho a pagar", { provider_message_id: wamid });
      const b = await acao("resumo", { scope: "contas_a_pagar" }, "quantos animais e o que tenho a pagar", { provider_message_id: wamid });
      check("a segunda intenção da mesma mensagem EXECUTA", b.data.action_taken !== a.data.action_taken, `${a.data.action_taken} / ${b.data.action_taken}`);
      const c = await acao("consultar_rebanho", {}, "quantos animais e o que tenho a pagar", { provider_message_id: wamid });
      check("a mesma intenção repetida devolve a resposta anterior", c.data.reply_text === a.data.reply_text);
      const gravados = await db.agentRequest.count({ where: { provider_message_id: { startsWith: wamid } } });
      check("duas chaves gravadas, uma por intenção", gravados === 2, String(gravados));
    }

    console.log("\n3. Ajuste de rebanho");
    {
      const antes = (await db.herdMovement.count({ where: { movement_type: "ajuste" } }));
      const p = { movement_type: "ajuste", itens: [{ categoria: "macho_25_36", quantidade: 2 }], pasto: "Pasto M67", sentido: "saida" };
      await acao("registrar_movimentacao_rebanho", p, "tinha 2 bois a menos na contagem");
      const r = await acao("registrar_movimentacao_rebanho", p, "sim", { confirmed: true });
      const depois = await db.herdMovement.count({ where: { movement_type: "ajuste" } });
      check("o ajuste confirmado grava", depois === antes + 1, `${r.data.action_taken}: ${r.data.reply_text}`);
      const semSentido = await acao("registrar_movimentacao_rebanho", { movement_type: "ajuste", itens: [{ categoria: "macho_25_36", quantidade: 1 }] }, "ajusta 1 boi");
      check("sem sentido, pergunta se aumenta ou diminui", /aumenta ou diminui/i.test(semSentido.data.reply_text), semSentido.data.reply_text);
    }

    void fazenda;
    void pasto;
  } finally {
    const { deleteTestTenants } = await import("./helpers/herd");
    await prisma.user.deleteMany({ where: { tenant_id: tenant.id } });
    await deleteTestTenants([tenant.id]);
  }
}

main()
  .then(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
    console.log(falhas === 0 ? "\n✅ M67: 0 falhas." : `\n❌ M67: ${falhas} falha(s).`);
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error("\n❌ M67 quebrou:", e);
    process.exit(1);
  });
