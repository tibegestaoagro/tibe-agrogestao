import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Fase 5 do agente do WhatsApp, Task 2: achar as contas a receber em aberto
 * de um contato (`contasEmAbertoDoContato`, `src/lib/actions/contas-do-contato.ts`).
 *
 * Escrita ÀS CEGAS, a partir do `task-2-brief.md`: os sete casos do Step 1,
 * literais. O vínculo é sempre ESTRUTURADO (`related_module` + `related_id`
 * para ordem de serviço, `negotiation_id` para negócio), nunca texto livre
 * nas notas: decisão do usuário de 16/09.
 *
 * Roda: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m70`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("💰 M70: contas a receber em aberto de um contato (Fase 5, Task 2)\n");

async function main() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { contasEmAbertoDoContato } = await import("@/lib/actions/contas-do-contato");
  const { registrarPagamentoAction } = await import("@/lib/actions/financial-payments");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M70 ${stamp}`, document: `M70${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M70" }) });

    // ── 1. Contato inexistente devolve null ──────────────────────────────

    console.log("1. Contato inexistente devolve null");
    check(
      "ninguém com esse nome",
      (await contasEmAbertoDoContato(db, "Fulano Que Não Existe")) === null,
    );

    // ── 2. Cliente de serviço sem conta pendente devolve lista vazia ──────

    console.log("\n2. Cliente de serviço sem conta pendente devolve lista vazia, não null");
    const clienteZero = await db.serviceClient.create({
      data: scoped({ name: "Cliente Sem Pendencia" }),
    });
    const r2 = await contasEmAbertoDoContato(db, "Cliente Sem Pendencia");
    check("não é null", r2 !== null);
    check("lista vazia", r2?.contas.length === 0, String(r2?.contas.length));
    check("nome do contato preservado", r2?.contato === clienteZero.name, r2?.contato);

    // ── 3, 4, 5, 6: ordens de serviço do mesmo cliente ─────────────────────

    console.log("\n3 a 6. Ordens de serviço de um cliente");
    const maria = await db.serviceClient.create({ data: scoped({ name: "Maria da Roçada" }) });
    const servico = await db.service.create({
      data: scoped({ name: "Roçada", pricing_type: "fixed", unit_price: 1000 }),
    });

    const ordemAberta = await db.serviceOrder.create({
      data: scoped({
        service_client_id: maria.id,
        service_id: servico.id,
        description: "roçada do pasto 3",
        total_value: 1000,
        performed_at: new Date("2026-09-12T12:00:00.000Z"),
        status: "invoiced",
      }),
    });
    const entryAberta = await db.financialEntry.create({
      data: scoped({
        entry_type: "income",
        category: "Serviço - Roçada",
        amount: 1000,
        related_module: "servico",
        related_id: ordemAberta.id,
        status: "pending",
        due_date: new Date("2026-09-20T12:00:00.000Z"),
      }),
    });

    console.log("\n3. Ordem faturada e não paga aparece com saldo igual ao valor");
    const r3 = await contasEmAbertoDoContato(db, "Maria da Roçada");
    check("não é null", r3 !== null);
    check("uma conta", r3?.contas.length === 1, String(r3?.contas.length));
    check("amount 1000", r3?.contas[0]?.amount === 1000, String(r3?.contas[0]?.amount));
    check("saldo 1000 (nada pago ainda)", r3?.contas[0]?.saldo === 1000, String(r3?.contas[0]?.saldo));
    check("origem servico", r3?.contas[0]?.origem === "servico", r3?.contas[0]?.origem);

    console.log("\n4. Pagamento parcial de 40% deixa saldo de 60%");
    const pgto = await registrarPagamentoAction(db, entryAberta.id, { amount: 400 });
    check("pagamento aceito", pgto.ok, pgto.ok ? "" : pgto.message);
    const r4 = await contasEmAbertoDoContato(db, "Maria da Roçada");
    check(
      "saldo agora é 600",
      r4?.contas.find((c) => c.id === entryAberta.id)?.saldo === 600,
      String(r4?.contas.find((c) => c.id === entryAberta.id)?.saldo),
    );

    console.log("\n5. Conta já paga NÃO aparece");
    const ordemPaga = await db.serviceOrder.create({
      data: scoped({
        service_client_id: maria.id,
        service_id: servico.id,
        description: "roçada já quitada",
        total_value: 500,
        performed_at: new Date("2026-08-01T12:00:00.000Z"),
        status: "invoiced",
      }),
    });
    await db.financialEntry.create({
      data: scoped({
        entry_type: "income",
        category: "Serviço - Roçada",
        amount: 500,
        related_module: "servico",
        related_id: ordemPaga.id,
        status: "paid",
        paid_at: new Date("2026-08-05T12:00:00.000Z"),
        due_date: new Date("2026-08-05T12:00:00.000Z"),
      }),
    });
    const r5 = await contasEmAbertoDoContato(db, "Maria da Roçada");
    check(
      "continua só a conta em aberto",
      r5?.contas.length === 1 && r5.contas[0]?.id === entryAberta.id,
      String(r5?.contas.map((c) => c.id)),
    );

    console.log("\n6. Despesa do mesmo contato NÃO aparece (isto é contas a RECEBER)");
    await db.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Insumo",
        amount: 300,
        related_module: "servico",
        related_id: ordemAberta.id,
        status: "pending",
        due_date: new Date("2026-09-25T12:00:00.000Z"),
      }),
    });
    const r6 = await contasEmAbertoDoContato(db, "Maria da Roçada");
    check(
      "a despesa não entrou na lista",
      r6?.contas.length === 1 && r6.contas[0]?.id === entryAberta.id,
      String(r6?.contas.map((c) => c.id)),
    );

    // ── 7. Duas contas em aberto, por negociação, ordenadas por vencimento ─

    console.log("\n7. Duas contas em aberto (negócio) vêm as duas, ordenadas por vencimento");
    const joao = await db.contact.create({ data: scoped({ name: "João Comprador" }) });
    const neg1 = await db.negotiation.create({
      data: scoped({
        type: "venda_gado",
        occurred_at: new Date("2026-09-01T12:00:00.000Z"),
        property_id: fazenda.id,
        contact_id: joao.id,
        amount: 5000,
      }),
    });
    const neg2 = await db.negotiation.create({
      data: scoped({
        type: "venda_gado",
        occurred_at: new Date("2026-09-05T12:00:00.000Z"),
        property_id: fazenda.id,
        contact_id: joao.id,
        amount: 3000,
      }),
    });
    // Vencimento fora de ordem de criação de propósito: prova que a lista é
    // ORDENADA, não devolvida na ordem em que nasceu.
    const entryTarde = await db.financialEntry.create({
      data: scoped({
        entry_type: "income",
        category: "Venda de animal",
        amount: 5000,
        negotiation_id: neg1.id,
        status: "pending",
        due_date: new Date("2026-10-15T12:00:00.000Z"),
      }),
    });
    const entryCedo = await db.financialEntry.create({
      data: scoped({
        entry_type: "income",
        category: "Venda de animal",
        amount: 3000,
        negotiation_id: neg2.id,
        status: "pending",
        due_date: new Date("2026-09-30T12:00:00.000Z"),
      }),
    });
    const r7 = await contasEmAbertoDoContato(db, "João Comprador");
    check("não é null", r7 !== null);
    check("duas contas", r7?.contas.length === 2, String(r7?.contas.length));
    check(
      "ordenadas por vencimento, a mais cedo primeiro",
      r7?.contas[0]?.id === entryCedo.id && r7.contas[1]?.id === entryTarde.id,
      String(r7?.contas.map((c) => c.id)),
    );
    check(
      "origem negocio nas duas",
      r7?.contas.every((c) => c.origem === "negocio") ?? false,
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M70 verde" : `\n❌ M70: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
