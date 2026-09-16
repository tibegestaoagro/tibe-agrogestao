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

    console.log("1. Contato inexistente devolve nao_encontrado");
    check(
      "ninguém com esse nome",
      (await contasEmAbertoDoContato(db, "Fulano Que Não Existe")).estado === "nao_encontrado",
    );

    // ── 2. Cliente de serviço sem conta pendente devolve lista vazia ──────

    console.log("\n2. Cliente de serviço sem conta pendente devolve lista vazia, não nao_encontrado");
    const clienteZero = await db.serviceClient.create({
      data: scoped({ name: "Cliente Sem Pendencia" }),
    });
    const r2 = await contasEmAbertoDoContato(db, "Cliente Sem Pendencia");
    check("estado ok", r2.estado === "ok", r2.estado);
    check("lista vazia", r2.estado === "ok" && r2.contas.length === 0, r2.estado === "ok" ? String(r2.contas.length) : "");
    check(
      "nome do contato preservado",
      r2.estado === "ok" && r2.contato === clienteZero.name,
      r2.estado === "ok" ? r2.contato : "",
    );

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
    check("estado ok", r3.estado === "ok", r3.estado);
    check("uma conta", r3.estado === "ok" && r3.contas.length === 1, r3.estado === "ok" ? String(r3.contas.length) : "");
    check(
      "amount 1000",
      r3.estado === "ok" && r3.contas[0]?.amount === 1000,
      r3.estado === "ok" ? String(r3.contas[0]?.amount) : "",
    );
    check(
      "saldo 1000 (nada pago ainda)",
      r3.estado === "ok" && r3.contas[0]?.saldo === 1000,
      r3.estado === "ok" ? String(r3.contas[0]?.saldo) : "",
    );
    check(
      "origem servico",
      r3.estado === "ok" && r3.contas[0]?.origem === "servico",
      r3.estado === "ok" ? r3.contas[0]?.origem : "",
    );

    console.log("\n4. Pagamento parcial de 40% deixa saldo de 60%");
    const pgto = await registrarPagamentoAction(db, entryAberta.id, { amount: 400 });
    check("pagamento aceito", pgto.ok, pgto.ok ? "" : pgto.message);
    const r4 = await contasEmAbertoDoContato(db, "Maria da Roçada");
    check(
      "saldo agora é 600",
      r4.estado === "ok" && r4.contas.find((c) => c.id === entryAberta.id)?.saldo === 600,
      r4.estado === "ok" ? String(r4.contas.find((c) => c.id === entryAberta.id)?.saldo) : "",
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
      r5.estado === "ok" && r5.contas.length === 1 && r5.contas[0]?.id === entryAberta.id,
      r5.estado === "ok" ? String(r5.contas.map((c) => c.id)) : "",
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
      r6.estado === "ok" && r6.contas.length === 1 && r6.contas[0]?.id === entryAberta.id,
      r6.estado === "ok" ? String(r6.contas.map((c) => c.id)) : "",
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
    check("estado ok", r7.estado === "ok", r7.estado);
    check("duas contas", r7.estado === "ok" && r7.contas.length === 2, r7.estado === "ok" ? String(r7.contas.length) : "");
    check(
      "ordenadas por vencimento, a mais cedo primeiro",
      r7.estado === "ok" && r7.contas[0]?.id === entryCedo.id && r7.contas[1]?.id === entryTarde.id,
      r7.estado === "ok" ? String(r7.contas.map((c) => c.id)) : "",
    );
    check(
      "origem negocio nas duas",
      r7.estado === "ok" && r7.contas.every((c) => c.origem === "negocio"),
    );

    // ── 8. Turno no Tibé: o roteiro de conversa do recebimento (Fase 5, Task 3) ─
    //
    // Um caso por linha da tabela do task-3-brief.md, passando pelo turno
    // inteiro (`executarTurno`), com o transporte do modelo substituído, no
    // mesmo molde da seção 7 da `m68`. Nenhuma chamada à OpenAI de verdade.

    console.log("\n8. Turno no Tibé: o roteiro de conversa do recebimento");
    {
      const { executarTurno } = await import("@/lib/actions/turno");
      const { definirTransporteDoModelo } = await import("@/lib/agente/modelo");
      const { reaisBr } = await import("@/lib/numero-br");

      await prisma.tenantProfile.create({ data: { tenant_id: tenant.id, profile_type: "fazenda", active: true } });
      const phoneT8 = `11${String(stamp).slice(-9)}`;
      await prisma.user.create({
        data: {
          tenant_id: tenant.id,
          name: "Dono M70",
          email: `m70-${stamp}@teste.local`,
          password_hash: "x",
          role: "OWNER",
          active: true,
          phone: phoneT8,
        },
      });

      const chamadas: string[] = [];
      let respostas: Record<string, unknown> = {};
      definirTransporteDoModelo(async (corpo) => {
        const nome = (corpo.response_format as { json_schema: { name: string } }).json_schema.name;
        chamadas.push(nome);
        const r = respostas[nome];
        const conteudo = Array.isArray(r) ? r.shift() : r;
        return { status: 200, json: { choices: [{ message: { content: JSON.stringify(conteudo) } }] } };
      });
      const prepara = (r: Record<string, unknown>) => {
        respostas = r;
        chamadas.length = 0;
      };
      const turno = (texto: string, wamid: string) =>
        executarTurno({ telefone: phoneT8, texto, provider_message_id: wamid });

      // Fixtures: um contato por linha da tabela, contas por negociação (mesmo
      // molde da seção 7 acima), para não misturar estado entre casos.
      const duda = await db.contact.create({ data: scoped({ name: "Duda Sem Pendencia" }) });
      const marli = await db.contact.create({ data: scoped({ name: "Marli" }) });
      const negMarli = await db.negotiation.create({
        data: scoped({
          type: "venda_gado",
          occurred_at: new Date("2026-09-01T12:00:00.000Z"),
          property_id: fazenda.id,
          contact_id: marli.id,
          amount: 1000,
        }),
      });
      const entryMarli = await db.financialEntry.create({
        data: scoped({
          entry_type: "income",
          category: "Venda de animal",
          amount: 1000,
          negotiation_id: negMarli.id,
          status: "pending",
          due_date: new Date("2026-10-01T12:00:00.000Z"),
        }),
      });

      const duplo = await db.contact.create({ data: scoped({ name: "Duplo" }) });
      const negDuploCedo = await db.negotiation.create({
        data: scoped({
          type: "venda_gado",
          occurred_at: new Date("2026-09-01T12:00:00.000Z"),
          property_id: fazenda.id,
          contact_id: duplo.id,
          amount: 300,
        }),
      });
      const entryDuploCedo = await db.financialEntry.create({
        data: scoped({
          entry_type: "income",
          category: "Venda de animal",
          amount: 300,
          negotiation_id: negDuploCedo.id,
          status: "pending",
          due_date: new Date("2026-09-20T12:00:00.000Z"),
        }),
      });
      const negDuploTarde = await db.negotiation.create({
        data: scoped({
          type: "venda_gado",
          occurred_at: new Date("2026-09-05T12:00:00.000Z"),
          property_id: fazenda.id,
          contact_id: duplo.id,
          amount: 500,
        }),
      });
      const entryDuploTarde = await db.financialEntry.create({
        data: scoped({
          entry_type: "income",
          category: "Venda de animal",
          amount: 500,
          negotiation_id: negDuploTarde.id,
          status: "pending",
          due_date: new Date("2026-10-05T12:00:00.000Z"),
        }),
      });

      const zeCarlos = await db.contact.create({ data: scoped({ name: "Zé Carlos" }) });
      const negZe = await db.negotiation.create({
        data: scoped({
          type: "venda_gado",
          occurred_at: new Date("2026-09-01T12:00:00.000Z"),
          property_id: fazenda.id,
          contact_id: zeCarlos.id,
          amount: 2000,
        }),
      });
      const entryZe = await db.financialEntry.create({
        data: scoped({
          entry_type: "income",
          category: "Venda de animal",
          amount: 2000,
          negotiation_id: negZe.id,
          status: "pending",
          due_date: new Date("2026-11-01T12:00:00.000Z"),
        }),
      });

      // Primeiro contato deste telefone: a saudação, não a classificação.
      // Sem isto a linha 1 cai na boas-vindas em vez do roteiro.
      prepara({});
      await turno("oi", "T8_oi");

      // Linha 1: nome não casa com ninguém.
      prepara({
        dominio: { pedidos: [{ dominio: "financeiro", trecho: "o Zeca me pagou" }] },
        extracao_financeiro: { intent: "registrar_recebimento", parametros: { contato: "Zeca" } },
      });
      const l1 = await turno("o Zeca me pagou", "T8L1");
      check(
        "linha 1: nome que não casa com ninguém",
        l1.mensagens[0]?.texto === "Não achei nenhum cliente com esse nome. Como ele está cadastrado?",
        JSON.stringify(l1),
      );

      // Linha 2: contato existe, sem conta em aberto.
      prepara({
        dominio: { pedidos: [{ dominio: "financeiro", trecho: "a Duda Sem Pendencia me pagou" }] },
        extracao_financeiro: { intent: "registrar_recebimento", parametros: { contato: "Duda Sem Pendencia" } },
      });
      const l2 = await turno("a Duda Sem Pendencia me pagou", "T8L2");
      check(
        "linha 2: contato sem conta em aberto",
        l2.mensagens[0]?.texto === `${duda.name} não tem nenhuma conta em aberto comigo.`,
        JSON.stringify(l2),
      );

      // Linha 3: uma conta, valor não dito, pergunta se quita tudo.
      prepara({
        dominio: { pedidos: [{ dominio: "financeiro", trecho: "a Marli me pagou" }] },
        extracao_financeiro: { intent: "registrar_recebimento", parametros: { contato: "Marli" } },
      });
      const l3 = await turno("a Marli me pagou", "T8L3");
      check(
        "linha 3: uma conta, sem valor, pergunta se quita tudo",
        l3.mensagens[0]?.texto.includes("Confirma que quitou tudo?") &&
          l3.mensagens[0].texto.includes(reaisBr(1000)) &&
          l3.mensagens[0].pode_humanizar === false,
        JSON.stringify(l3),
      );

      // O defeito clássico deste projeto: "não" depois da confirmação NÃO
      // pode dar baixa em nada (2026-08-18, "não, deixa pra lá" gravou a
      // compra recusada no estoque).
      prepara({});
      const l3nao = await turno("não, deixa pra lá", "T8L3nao");
      check(
        "linha 3 + 'não': cancela sem gravar",
        l3nao.mensagens[0]?.texto === "Tudo bem, não registrei nada." && chamadas.length === 0,
        JSON.stringify(l3nao),
      );
      check(
        "o 'não' não criou nenhum pagamento",
        (await db.financialPayment.count({ where: { entry_id: entryMarli.id } })) === 0,
      );
      check(
        "e a conta continua pendente",
        (await db.financialEntry.findUniqueOrThrow({ where: { id: entryMarli.id } })).status === "pending",
      );

      // Linha 4: uma conta, valor dito MENOR que o saldo, pagamento parcial.
      prepara({
        dominio: { pedidos: [{ dominio: "financeiro", trecho: "a Marli me pagou 400" }] },
        extracao_financeiro: { intent: "registrar_recebimento", parametros: { contato: "Marli", valor: 400 } },
      });
      const l4 = await turno("a Marli me pagou 400", "T8L4");
      check(
        "linha 4: valor menor que o saldo pergunta o pagamento parcial",
        l4.mensagens[0]?.texto.includes(reaisBr(400)) &&
          l4.mensagens[0].texto.includes(reaisBr(1000)) &&
          l4.mensagens[0].texto.includes("Confirma o pagamento"),
        JSON.stringify(l4),
      );
      prepara({});
      const l4sim = await turno("sim", "T8L4sim");
      check(
        "linha 4 + 'sim': registra o pagamento parcial",
        l4sim.mensagens[0]?.texto.includes("registrado") && chamadas.length === 0,
        JSON.stringify(l4sim),
      );
      const pagoAposL4 = await contasEmAbertoDoContato(db, "Marli");
      check(
        "saldo cai para 600 depois do pagamento parcial de 400",
        pagoAposL4.estado === "ok" && pagoAposL4.contas.find((c) => c.id === entryMarli.id)?.saldo === 600,
        pagoAposL4.estado === "ok" ? String(pagoAposL4.contas.find((c) => c.id === entryMarli.id)?.saldo) : "",
      );

      // Linha 5: valor dito MAIOR que o saldo (agora 600): nunca aceita, recusa e pergunta de novo.
      prepara({
        dominio: { pedidos: [{ dominio: "financeiro", trecho: "a Marli me pagou 900" }] },
        extracao_financeiro: { intent: "registrar_recebimento", parametros: { contato: "Marli", valor: 900 } },
      });
      const l5 = await turno("a Marli me pagou 900", "T8L5");
      check(
        "linha 5: valor maior que o saldo é recusado, não confirmado",
        l5.mensagens[0]?.texto.includes("maior que o saldo") &&
          l5.mensagens[0].texto.includes(reaisBr(600)) &&
          l5.mensagens[0].texto.includes("Quanto você quer registrar?"),
        JSON.stringify(l5),
      );
      check(
        "a tentativa acima do saldo não criou pagamento nenhum",
        (await db.financialPayment.count({ where: { entry_id: entryMarli.id, amount: 900 } })) === 0,
      );

      // Corrige com um valor válido: a resposta curta volta ao campo pendente.
      prepara({ resposta: { tipo: "responde", valor: "500" } });
      const l5corrige = await turno("500", "T8L5b");
      check(
        "correção com valor dentro do saldo abre a confirmação do parcial",
        l5corrige.mensagens[0]?.texto.includes(reaisBr(500)) && chamadas.join() === "resposta",
        JSON.stringify({ l5corrige, chamadas }),
      );
      prepara({});
      await turno("sim", "T8L5sim");
      const pagoAposL5 = await contasEmAbertoDoContato(db, "Marli");
      check(
        "saldo cai para 100 depois do segundo pagamento parcial",
        pagoAposL5.estado === "ok" && pagoAposL5.contas.find((c) => c.id === entryMarli.id)?.saldo === 100,
        pagoAposL5.estado === "ok" ? String(pagoAposL5.contas.find((c) => c.id === entryMarli.id)?.saldo) : "",
      );

      // Linha 6: duas contas em aberto: lista numerada, pergunta qual.
      prepara({
        dominio: { pedidos: [{ dominio: "financeiro", trecho: "o Duplo me pagou" }] },
        extracao_financeiro: { intent: "registrar_recebimento", parametros: { contato: "Duplo" } },
      });
      const l6 = await turno("o Duplo me pagou", "T8L6");
      check(
        "linha 6: duas contas lista numerada e pergunta qual",
        l6.mensagens[0]?.texto.includes("1.") &&
          l6.mensagens[0].texto.includes("2.") &&
          l6.mensagens[0].texto.includes(reaisBr(300)) &&
          l6.mensagens[0].texto.includes(reaisBr(500)) &&
          l6.mensagens[0].texto.includes("Qual delas?"),
        JSON.stringify(l6),
      );
      prepara({ resposta: { tipo: "responde", valor: "1" } });
      const l6escolhe = await turno("1", "T8L6b");
      check(
        "a escolha da primeira conta pergunta se quita tudo",
        l6escolhe.mensagens[0]?.texto.includes("Confirma que quitou tudo?") && chamadas.join() === "resposta",
        JSON.stringify(l6escolhe),
      );
      prepara({});
      await turno("sim", "T8L6sim");
      const duploCedoDepois = await db.financialEntry.findUniqueOrThrow({ where: { id: entryDuploCedo.id } });
      const duploTardeDepois = await db.financialEntry.findUniqueOrThrow({ where: { id: entryDuploTarde.id } });
      check("a conta escolhida (a mais cedo) foi quitada", duploCedoDepois.status === "paid");
      check("a outra conta do mesmo contato continua pendente", duploTardeDepois.status === "pending");

      // Linha 7: consulta. Nunca grava.
      prepara({
        dominio: { pedidos: [{ dominio: "financeiro", trecho: "quanto o Zé Carlos ainda me deve" }] },
        extracao_financeiro: { intent: "consultar_recebimento", parametros: { contato: "Zé Carlos" } },
      });
      const l7 = await turno("quanto o Zé Carlos ainda me deve", "T8L7");
      check(
        "linha 7: consulta responde saldo e vencimento, sem gravar",
        l7.mensagens[0]?.texto.includes(reaisBr(2000)) &&
          l7.mensagens[0].texto.includes("01/11/2026") &&
          l7.mensagens[0].pode_humanizar === false,
        JSON.stringify(l7),
      );
      check(
        "a consulta não criou pagamento nenhum",
        (await db.financialPayment.count({ where: { entry_id: entryZe.id } })) === 0,
      );
      check(
        "e a conta consultada continua pendente",
        (await db.financialEntry.findUniqueOrThrow({ where: { id: entryZe.id } })).status === "pending",
      );

      // ── 8.9 (G1): o "sim" tem de executar o ENTRY_ID mostrado, nunca ──────
      // reindexar a lista de contas em aberto.
      //
      // Reproduzido pelo juiz: a lista mostrou "1. R$300 vence 20/09, 2. R$500
      // vence 05/10"; o produtor escolheu "1"; entre a pergunta e o "sim", uma
      // ordem de R$9.000 vencendo 18/09 foi faturada pelo painel (vencimento
      // mais cedo, entra na FRENTE da lista ordenada); o "sim" tem que quitar a
      // conta de R$300 que foi MOSTRADA, nunca a de R$9.000 que passaria a
      // ocupar a posição 1 se a lista fosse reconsultada.
      console.log("\n8.9. G1: o 'sim' não pode reindexar a lista entre a pergunta e a confirmação");
      {
        const marcos = await db.contact.create({ data: scoped({ name: "Marcos Dois Boletos M70" }) });
        const negA = await db.negotiation.create({
          data: scoped({
            type: "venda_gado",
            occurred_at: new Date("2026-09-01T12:00:00.000Z"),
            property_id: fazenda.id,
            contact_id: marcos.id,
            amount: 300,
          }),
        });
        const entryA = await db.financialEntry.create({
          data: scoped({
            entry_type: "income",
            category: "Venda de animal",
            amount: 300,
            negotiation_id: negA.id,
            status: "pending",
            due_date: new Date("2026-09-20T12:00:00.000Z"),
          }),
        });
        const negB = await db.negotiation.create({
          data: scoped({
            type: "venda_gado",
            occurred_at: new Date("2026-09-02T12:00:00.000Z"),
            property_id: fazenda.id,
            contact_id: marcos.id,
            amount: 500,
          }),
        });
        const entryB = await db.financialEntry.create({
          data: scoped({
            entry_type: "income",
            category: "Venda de animal",
            amount: 500,
            negotiation_id: negB.id,
            status: "pending",
            due_date: new Date("2026-10-05T12:00:00.000Z"),
          }),
        });

        prepara({
          dominio: { pedidos: [{ dominio: "financeiro", trecho: "o Marcos Dois Boletos M70 me pagou" }] },
          extracao_financeiro: {
            intent: "registrar_recebimento",
            parametros: { contato: "Marcos Dois Boletos M70" },
          },
        });
        const g1a = await turno("o Marcos Dois Boletos M70 me pagou", "G1_a");
        check(
          "lista as duas contas, 300 antes de 500",
          g1a.mensagens[0]?.texto.includes(reaisBr(300)) && g1a.mensagens[0].texto.includes(reaisBr(500)),
          JSON.stringify(g1a),
        );

        prepara({ resposta: { tipo: "responde", valor: "1" } });
        const g1b = await turno("1", "G1_b");
        check(
          "escolheu a conta de 300, pergunta se quita tudo",
          g1b.mensagens[0]?.texto.includes("Confirma que quitou tudo?") &&
            g1b.mensagens[0].texto.includes(reaisBr(300)),
          JSON.stringify(g1b),
        );

        // Entre a pergunta e o "sim": uma ordem nova é faturada pelo painel,
        // com vencimento mais cedo que as outras duas.
        const negC = await db.negotiation.create({
          data: scoped({
            type: "venda_gado",
            occurred_at: new Date("2026-09-10T12:00:00.000Z"),
            property_id: fazenda.id,
            contact_id: marcos.id,
            amount: 9000,
          }),
        });
        const entryC = await db.financialEntry.create({
          data: scoped({
            entry_type: "income",
            category: "Venda de animal",
            amount: 9000,
            negotiation_id: negC.id,
            status: "pending",
            due_date: new Date("2026-09-18T12:00:00.000Z"),
          }),
        });

        prepara({});
        const g1sim = await turno("sim", "G1_sim");
        check(
          "o 'sim' registrou o recebimento",
          g1sim.mensagens[0]?.texto.includes("registrado"),
          JSON.stringify(g1sim),
        );

        const entryADepois = await db.financialEntry.findUniqueOrThrow({ where: { id: entryA.id } });
        const entryBDepois = await db.financialEntry.findUniqueOrThrow({ where: { id: entryB.id } });
        const entryCDepois = await db.financialEntry.findUniqueOrThrow({ where: { id: entryC.id } });
        check(
          "quitou a conta MOSTRADA (300), não a que entrou depois da pergunta",
          entryADepois.status === "paid",
          entryADepois.status,
        );
        check("a de 500 continua pendente", entryBDepois.status === "pending", entryBDepois.status);
        check(
          "a de 9.000, que só existiu DEPOIS da pergunta, não foi tocada",
          entryCDepois.status === "pending",
          entryCDepois.status,
        );
      }

      // ── 8.10 (G2): homônimo pergunta qual, nunca escolhe o primeiro em ────
      // silêncio.
      //
      // Reproduzido pelo juiz: a pergunta nomeava "Joao Pereira", mas o "sim"
      // pagava a conta do "Joao Silva", porque `contato` era sempre o primeiro
      // em ordem alfabética entre os que casaram o nome, enquanto as contas
      // eram a UNIÃO de todos eles.
      console.log("\n8.10. G2: dois contatos com nome parecido, sem escolher o primeiro em silêncio");
      {
        const semConta = await db.contact.create({ data: scoped({ name: "Beltrano Pereira M70" }) });
        const comConta = await db.contact.create({ data: scoped({ name: "Beltrano Silva M70" }) });
        const negBeltrano = await db.negotiation.create({
          data: scoped({
            type: "venda_gado",
            occurred_at: new Date("2026-09-01T12:00:00.000Z"),
            property_id: fazenda.id,
            contact_id: comConta.id,
            amount: 1000,
          }),
        });
        const entryBeltrano = await db.financialEntry.create({
          data: scoped({
            entry_type: "income",
            category: "Venda de animal",
            amount: 1000,
            negotiation_id: negBeltrano.id,
            status: "pending",
            due_date: new Date("2026-09-25T12:00:00.000Z"),
          }),
        });

        prepara({
          dominio: { pedidos: [{ dominio: "financeiro", trecho: "o Beltrano me pagou" }] },
          extracao_financeiro: { intent: "registrar_recebimento", parametros: { contato: "Beltrano" } },
        });
        const g2a = await turno("o Beltrano me pagou", "G2_a");
        check(
          "pergunta qual dos dois, sem escolher em silêncio",
          g2a.mensagens[0]?.texto.includes(semConta.name) &&
            g2a.mensagens[0].texto.includes(comConta.name) &&
            g2a.mensagens[0].texto.includes("Qual deles?"),
          JSON.stringify(g2a),
        );

        prepara({ resposta: { tipo: "responde", valor: "2" } });
        const g2b = await turno("2", "G2_b");
        check(
          "escolhido o Beltrano Silva, pergunta pela conta dele, com o nome CERTO",
          g2b.mensagens[0]?.texto.includes(comConta.name) &&
            g2b.mensagens[0].texto.includes(reaisBr(1000)) &&
            !g2b.mensagens[0].texto.includes(semConta.name),
          JSON.stringify(g2b),
        );

        prepara({});
        await turno("sim", "G2_sim");
        const entryBeltranoDepois = await db.financialEntry.findUniqueOrThrow({ where: { id: entryBeltrano.id } });
        check(
          "a conta do Beltrano Silva (o escolhido) foi quitada",
          entryBeltranoDepois.status === "paid",
          entryBeltranoDepois.status,
        );
      }

      // ── 8.11 (G5): nome com acento no cadastro casa com a mensagem sem ────
      // acento.
      console.log("\n8.11. G5: fixture acentuado, mensagem sem acento");
      {
        const zeCardoso = await db.contact.create({ data: scoped({ name: "Zé Cardoso M70" }) });
        const negZeCardoso = await db.negotiation.create({
          data: scoped({
            type: "venda_gado",
            occurred_at: new Date("2026-09-01T12:00:00.000Z"),
            property_id: fazenda.id,
            contact_id: zeCardoso.id,
            amount: 700,
          }),
        });
        await db.financialEntry.create({
          data: scoped({
            entry_type: "income",
            category: "Venda de animal",
            amount: 700,
            negotiation_id: negZeCardoso.id,
            status: "pending",
            due_date: new Date("2026-09-30T12:00:00.000Z"),
          }),
        });

        prepara({
          dominio: { pedidos: [{ dominio: "financeiro", trecho: "recebi do Ze Cardoso M70" }] },
          extracao_financeiro: {
            intent: "consultar_recebimento",
            parametros: { contato: "Ze Cardoso M70" },
          },
        });
        const g5 = await turno("recebi do Ze Cardoso M70", "G5_a");
        check(
          "achou o contato mesmo sem o acento na mensagem",
          g5.mensagens[0]?.texto.includes(reaisBr(700)),
          JSON.stringify(g5),
        );
      }
    }

    // ── 9. O pagamento futuro da equipe (Fase 5, Task 4) ───────────────────
    //
    // Os cinco casos do task-4-brief.md, literais: "vou pagar o Pedro dia 10"
    // não cria despesa nova quando já existe previsão pendente (muda o
    // vencimento dela, e o valor se dito); sem previsão, cria uma; a
    // conciliação do Módulo 33 (m57) continua valendo depois; data no
    // passado é recusada.

    console.log("\n9. O pagamento futuro da equipe (agendar_pagamento_trabalhador)");
    {
      const { routeIntent } = await import("@/lib/actions/whatsapp-router");
      const { createWorker } = await import("@/lib/actions/workers");
      const USER9 = "m70-user-9";

      const falar = (
        intent: string,
        parameters: Record<string, unknown>,
        extra: { confirmed?: boolean; explicitNo?: boolean } = {},
      ) =>
        routeIntent(db, {
          intent: intent as never,
          tenant_id: tenant.id,
          role: "OWNER",
          activeProfiles: ["fazenda"],
          parameters,
          confirmed: extra.confirmed ?? false,
          explicitNo: extra.explicitNo ?? false,
          user_id: USER9,
        });

      const joao = await createWorker(db, {
        name: "João Vaqueiro M70",
        role: "Vaqueiro",
        type: "fixo",
        pay_frequency: "mensal",
        pay_amount: 2000,
      });
      if (!joao.ok) throw new Error("setup do worker falhou: " + joao.message);
      const previsaoInicial = await db.financialEntry.findFirstOrThrow({
        where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
      });

      console.log("\n9.1. Trabalhador com previsão: a data muda, e continua UMA linha pendente");
      const c1 = await falar("agendar_pagamento_trabalhador", {
        nome: "João Vaqueiro M70",
        data: "10/12/2026",
      });
      check("pede confirmação", c1.requires_confirmation === true, c1.reply_text);
      check("mostra a data pedida", c1.reply_text.includes("10/12/2026"), c1.reply_text);
      const c1sim = await falar("agendar_pagamento_trabalhador", {}, { confirmed: true });
      check("gravou", c1sim.action_taken === "agendar_pagamento_trabalhador:ok", c1sim.action_taken);
      const previsoesJoao1 = await db.financialEntry.count({
        where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
      });
      check("continua UMA previsão pendente", previsoesJoao1 === 1, String(previsoesJoao1));
      const previsaoAtualizada = await db.financialEntry.findFirstOrThrow({
        where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
      });
      check("é a MESMA linha, só com a data nova", previsaoAtualizada.id === previsaoInicial.id);
      check(
        "com o vencimento de 10/12/2026",
        previsaoAtualizada.due_date?.toISOString().startsWith("2026-12-10") ?? false,
        String(previsaoAtualizada.due_date),
      );
      check("e o valor PRESERVADO (não dito)", Number(previsaoAtualizada.amount) === 2000);

      console.log("\n9.2. Trabalhador SEM previsão: nasce uma, com o vencimento dito");
      const ze = await createWorker(db, {
        name: "Zé Tratorista M70",
        role: "Tratorista",
        type: "fixo",
        pay_frequency: "mensal",
        pay_amount: 1500,
      });
      if (!ze.ok) throw new Error("setup do worker falhou: " + ze.message);
      await db.financialEntry.deleteMany({
        where: { related_module: "mao_de_obra", related_id: ze.data.id },
      });
      check(
        "de fato ficou sem previsão",
        (await db.financialEntry.count({ where: { related_id: ze.data.id } })) === 0,
      );
      const c2 = await falar("agendar_pagamento_trabalhador", {
        nome: "Zé Tratorista M70",
        data: "12/12/2026",
      });
      check(
        "pede confirmação, com o valor do cadastro (não dito)",
        c2.reply_text.includes("1.500"),
        c2.reply_text,
      );
      const c2sim = await falar("agendar_pagamento_trabalhador", {}, { confirmed: true });
      check("gravou", c2sim.action_taken === "agendar_pagamento_trabalhador:ok", c2sim.action_taken);
      const previsaoZe = await db.financialEntry.findFirstOrThrow({
        where: { related_module: "mao_de_obra", related_id: ze.data.id, status: "pending" },
      });
      check(
        "nasceu com o vencimento dito",
        previsaoZe.due_date?.toISOString().startsWith("2026-12-12") ?? false,
        String(previsaoZe.due_date),
      );
      check("e o valor do cadastro (não dito)", Number(previsaoZe.amount) === 1500);

      console.log("\n9.3. Valor dito muda o valor; valor não dito preserva o previsto");
      const c3 = await falar("agendar_pagamento_trabalhador", {
        nome: "João Vaqueiro M70",
        data: "15/12/2026",
        valor: 2200,
      });
      check("pede confirmação com o valor dito", c3.reply_text.includes("2.200"), c3.reply_text);
      await falar("agendar_pagamento_trabalhador", {}, { confirmed: true });
      const previsaoComValor = await db.financialEntry.findFirstOrThrow({
        where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
      });
      check("valor mudou para 2.200", Number(previsaoComValor.amount) === 2200);

      const c3b = await falar("agendar_pagamento_trabalhador", {
        nome: "João Vaqueiro M70",
        data: "20/12/2026",
      });
      check("sem valor dito, oferece o previsto (2.200)", c3b.reply_text.includes("2.200"), c3b.reply_text);
      await falar("agendar_pagamento_trabalhador", {}, { confirmed: true });
      const previsaoValorPreservado = await db.financialEntry.findFirstOrThrow({
        where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
      });
      check("valor PRESERVADO em 2.200", Number(previsaoValorPreservado.amount) === 2200);
      check(
        "continua UMA previsão pendente para o João",
        (await db.financialEntry.count({
          where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
        })) === 1,
      );

      console.log(
        '\n9.4. Depois de agendar, "paguei o João" quita a MESMA previsão (conciliação do Módulo 33)',
      );
      const p1 = await falar("registrar_pagamento_trabalhador", { nome: "João Vaqueiro M70" });
      check("oferece o valor agendado (2.200)", p1.reply_text.includes("2.200"), p1.reply_text);
      const p2 = await falar("registrar_pagamento_trabalhador", {}, { confirmed: true });
      check(
        "gravou",
        p2.action_taken === "registrar_pagamento_trabalhador:ok",
        p2.action_taken,
      );
      const pagas = await db.financialEntry.count({
        where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "paid" },
      });
      const pendentes = await db.financialEntry.count({
        where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
      });
      check("a previsão agendada virou PAGA (não uma linha nova)", pagas === 1, String(pagas));
      check(
        "a quitada é a MESMA linha da agendada",
        (await db.financialEntry.findUniqueOrThrow({ where: { id: previsaoInicial.id } })).status ===
          "paid",
      );
      check("e nasceu a PRÓXIMA previsão, só uma", pendentes === 1, String(pendentes));

      console.log('\n9.5. Data no passado: recusa e pergunta, porque "vou pagar" é futuro');
      const c5 = await falar("agendar_pagamento_trabalhador", {
        nome: "Zé Tratorista M70",
        data: "10/01/2026",
      });
      check(
        "recusa e pergunta, sem pedir confirmação",
        c5.requires_confirmation === false && c5.reply_text.toLowerCase().includes("já passou"),
        c5.reply_text,
      );
      const zeDepois = await db.financialEntry.findUniqueOrThrow({ where: { id: previsaoZe.id } });
      check(
        "e não mexeu na previsão do Zé",
        zeDepois.due_date?.toISOString().startsWith("2026-12-12") ?? false,
        String(zeDepois.due_date),
      );
    }
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M70 verde" : `\n❌ M70: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
