import "./_env-local";
import { exigirBancoLocal, exigirRedisLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();
exigirRedisLocal();

/**
 * O agente do WhatsApp obedece à régua de cobrança do painel (dívida 3.3).
 * Roda: `npm run test:m76`
 *
 * Decisão do usuário (14/10/2026): `read_only` só consulta, `blocked` nada
 * passa, e a resposta aponta para a página de assinatura. Antes, o tenant
 * inadimplente seguia gravando pelo WhatsApp sem restrição nenhuma.
 *
 * O atraso vem do trial vencido (`trial_ends_at`), a mesma régua de dias da
 * assinatura: < 5 dias full, 5 a 15 read_only, 15 ou mais blocked.
 */
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let failures = 0;
function assert(cond: boolean, msg: string, detalhe = "") {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}${detalhe ? ` (${detalhe})` : ""}`);
    failures++;
  }
}

async function main() {
  console.log("🔎 M76: o agente respeita a régua de cobrança (dívida 3.3)\n");

  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { recordMovement } = await import("@/lib/actions/herd-ledger");
  const { executarIntencao } = await import("@/lib/actions/executar-intencao");
  const { clearPendingHerd } = await import("@/lib/actions/herd-pending");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M76 ${stamp}`, document: `M76${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
  });
  const owner = await prisma.user.create({
    data: { tenant_id: tenant.id, name: "M76 Dono", email: `m76-${stamp}@teste.local`, password_hash: "x", role: "OWNER" },
  });
  const db = prismaForTenant(tenant.id);
  await db.tenantProfile.create({ data: scoped({ profile_type: "fazenda", active: true }) });

  const venceuHa = (dias: number) =>
    prisma.tenant.update({ where: { id: tenant.id }, data: { trial_ends_at: new Date(Date.now() - dias * 86_400_000) } });
  let n = 0;
  const diz = (intent: Parameters<typeof executarIntencao>[0]["intent"], parameters: Record<string, unknown>, message_text: string) =>
    executarIntencao({
      db,
      tenant_id: tenant.id,
      user: { id: owner.id, role: owner.role },
      contato_id: null,
      activeProfiles: ["fazenda"],
      intent,
      parameters,
      message_text,
      confirmed_do_corpo: null,
      provider_message_id: `M76-${stamp}-${n++}`,
      registrar_entrada: false,
    });
  const mortes = () => db.herdMovement.count({ where: { movement_type: "morte", canceled_at: null } });

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M76" }) });
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 10,
      to: { category_id: "femea_13_24", property_id: fazenda.id, pasture_id: null, situation: "presente", owner: "proprio" },
    });
    const morte = { movement_type: "morte", categoria: "Fêmea - 13 a 24 meses", quantidade: 2 };

    console.log("1. Em dia: o pedido de escrita é guardado para confirmar");
    {
      const r = await diz("registrar_movimentacao_rebanho", morte, "morreram 2 fêmeas de 13 a 24 meses");
      assert(r.requires_confirmation === true, "a morte pede confirmação", r.reply_text);
    }

    console.log("\n2. Atrasado (read_only): consulta passa, escrita não");
    await venceuHa(7);
    {
      const sim = await diz("registrar_movimentacao_rebanho", {}, "sim");
      assert(sim.action_taken.endsWith(":assinatura_read_only"), "o 'sim' do pedido guardado é recusado", sim.action_taken);
      assert(sim.reply_text.includes("/configuracoes/assinatura") && sim.reply_text.includes("consultas"), "a resposta diz o que ainda vale e onde regularizar", sim.reply_text);
      assert((await mortes()) === 0, "e a morte não foi gravada");

      const ambigua = await diz("ambigua", {}, "sim");
      assert(ambigua.action_taken.endsWith(":assinatura_read_only"), "um 'sim' lido como ambígua também é recusado", ambigua.action_taken);
      assert((await mortes()) === 0, "e segue sem gravar");

      const nova = await diz("registrar_movimentacao_rebanho", morte, "morreram 2 fêmeas de 13 a 24 meses");
      assert(nova.action_taken.endsWith(":assinatura_read_only") && !nova.requires_confirmation, "pedido de escrita novo é recusado sem pedir confirmação", nova.action_taken);

      const saldo = await diz("consultar_rebanho", {}, "quantos animais eu tenho");
      assert(!saldo.action_taken.includes("assinatura") && saldo.reply_text.includes("10"), "a consulta do rebanho responde normalmente", saldo.reply_text);
    }

    console.log("\n3. Bloqueado: nem consulta");
    await venceuHa(20);
    {
      const saldo = await diz("consultar_rebanho", {}, "quantos animais eu tenho");
      assert(saldo.action_taken.endsWith(":assinatura_blocked"), "a consulta é recusada", saldo.action_taken);
      assert(saldo.reply_text.includes("bloqueado") && saldo.reply_text.includes("/configuracoes/assinatura"), "com a frase de bloqueio e o link", saldo.reply_text);
    }

    console.log("\n3b. Bloqueado: a identificação recusa antes de gravar o contato");
    {
      const { identificarContato } = await import("@/lib/actions/whatsapp-contato");
      const telefone = `55119${String(stamp).slice(-8)}`;
      await prisma.user.update({ where: { id: owner.id }, data: { phone: telefone } });
      const zap = await identificarContato(telefone);
      assert(!zap.identificado && (zap.resposta_sugerida ?? "").includes("bloqueado"), "o primeiro contato ouve a cobrança, não a saudação", JSON.stringify(zap));
      assert((await prisma.whatsAppContact.count({ where: { tenant_id: tenant.id } })) === 0, "e nenhum contato de WhatsApp nasce");
    }

    console.log("\n4. Regularizado: volta tudo");
    await prisma.tenant.update({ where: { id: tenant.id }, data: { trial_ends_at: new Date(Date.now() + 86_400_000) } });
    {
      const nova = await diz("registrar_movimentacao_rebanho", morte, "morreram 2 fêmeas de 13 a 24 meses");
      const sim = await diz("registrar_movimentacao_rebanho", {}, "sim");
      assert(nova.requires_confirmation && (await mortes()) === 1, "a morte pedida e confirmada é gravada", sim.reply_text);
    }
  } finally {
    await clearPendingHerd(tenant.id, owner.id).catch(() => {});
    const where = { tenant_id: tenant.id };
    await prisma.whatsAppContact.deleteMany({ where });
    await prisma.agentRequest.deleteMany({ where });
    await prisma.agentFlowState.deleteMany({ where });
    await prisma.herdMovement.deleteMany({ where });
    await prisma.property.deleteMany({ where });
    await prisma.tenantProfile.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\n✅ M76 passou." : `\n❌ M76: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
