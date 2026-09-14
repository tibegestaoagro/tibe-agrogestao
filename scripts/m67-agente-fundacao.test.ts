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

    console.log("\n4. Receita pelo WhatsApp");
    {
      const p = { amount: 1500, category: "Aluguel", tipo: "receita", description: "aluguel do pasto" };
      const pergunta = await acao("registrar_lancamento_financeiro", p, "recebi 1500 de aluguel do pasto");
      check("a confirmação diz que é receita", /receita|receber|recebi/i.test(pergunta.data.reply_text), pergunta.data.reply_text);
      /*
       * Parâmetros VAZIOS na confirmação: o classificador do n8n não remonta
       * os parâmetros literalmente (`.claude/rules/whatsapp.md`), então quem
       * executa é o pendente guardado no "sim" anterior, nunca o que chega
       * agora. Sem o pendente (handler antigo), um "sim" sem `tipo` cairia no
       * default despesa em silêncio: é exatamente o achado da revisão.
       */
      const confirmacao = await acao("registrar_lancamento_financeiro", {}, "sim", { confirmed: true });
      check("a resposta final também diz Receita", /Receita/.test(confirmacao.data.reply_text), confirmacao.data.reply_text);
      /*
       * Só por `amount`, não por `category`: "Aluguel" não é nome de nenhuma
       * categoria padrão de receita (nem palpite por palavra-chave bate com
       * "aluguel do pasto", que difere de "aluguel de pasto" no dicionário de
       * `category-suggestions.ts`), então cai no fallback "Outras receitas",
       * mesmo comportamento já coberto por `m11` para categoria desconhecida
       * ("categoria-inventada" -> "Outras despesas"). O que esta seção prova é
       * a distinção receita/despesa (Task 5), não a resolução de categoria.
       */
      const entrada = await db.financialEntry.findFirst({ where: { amount: 1500 } });
      check("grava como receita", entrada?.entry_type === "income", String(entrada?.entry_type));

      /*
       * Re-revisão (achado Crítico): "sim" com `confirmed: true` e parâmetros
       * cheios, mas SEM nenhuma pergunta anterior (nenhum pendente guardado
       * para este usuário), NUNCA grava. Sem esta guarda, um TTL vencido ou
       * um "sim" fora de contexto gravava direto do que o classificador
       * reconstruiu, podendo trocar receita por despesa em silêncio: é o
       * mesmo risco do achado original, só que sem depender de um "não" no
       * meio do caminho.
       */
      const semPedidoAnterior = { amount: 2750, category: "Diesel", tipo: "receita", description: "diesel vendido" };
      const simSemPedido = await acao("registrar_lancamento_financeiro", semPedidoAnterior, "sim", { confirmed: true });
      check(
        "sim sem pergunta anterior nao grava, pergunta de novo",
        simSemPedido.data.requires_confirmation === true,
        JSON.stringify(simSemPedido.data),
      );
      const entradaSemPedido = await db.financialEntry.findFirst({ where: { amount: 2750 } });
      check("nada gravado com amount 2750", entradaSemPedido === null, String(entradaSemPedido));
    }

    console.log("\n5. Serviço prestado agendado e depois iniciado");
    {
      // Fix round 2: statusInicialDoServico é pura, por DIA de calendário em
      // São Paulo, não por instante. Datas FIXAS, não Date.now(): o teste não
      // pode depender da hora em que a suíte roda.
      const { statusInicialDoServico } = await import("@/lib/actions/service-jobs");
      console.log("   statusInicialDoServico: por DIA em São Paulo, não por instante");
      check(
        "08h em SP, serviço no mesmo dia (09h SP): concluido",
        statusInicialDoServico(new Date("2026-09-14T12:00:00Z"), new Date("2026-09-14T11:00:00Z")) === "concluido",
      );
      check(
        "08h em SP, serviço no dia seguinte: agendado",
        statusInicialDoServico(new Date("2026-09-15T12:00:00Z"), new Date("2026-09-14T11:00:00Z")) === "agendado",
      );
      check(
        "20h30 em SP (quase virando o dia em UTC), serviço no dia seguinte: agendado",
        statusInicialDoServico(new Date("2026-09-15T12:00:00Z"), new Date("2026-09-14T23:30:00Z")) === "agendado",
      );

      await db.machine.create({ data: scoped({ name: "Trator M67", property_id: fazenda.id, type: "Trator" }) });

      // Fix round 1: nunca se inventa data. O agendado do teste precisa dizer
      // UMA data futura de verdade, não mais "concluido: false" sozinho.
      const daqui10 = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const dataAgendada =
        `${String(daqui10.getDate()).padStart(2, "0")}/` +
        `${String(daqui10.getMonth() + 1).padStart(2, "0")}/${daqui10.getFullYear()}`;

      const p = {
        servico: "gradagem",
        maquina: "Trator M67",
        quem: "Joao M67",
        valor: 2000,
        quantidade: 8,
        unidade: "hectare",
        concluido: false,
        data: dataAgendada,
      };
      await acao("registrar_servico_prestado", p, "vou fazer gradagem de 8 hectares pro Joao por 2 mil");
      await acao("registrar_servico_prestado", p, "sim", { confirmed: true });
      const job = await db.serviceJob.findFirst({ where: { description: { contains: "gradagem" } } });
      check("nasce agendado", job?.status === "agendado", String(job?.status));
      check("quantidade prevista na observação", job?.notes?.includes("8") ?? false, String(job?.notes));
      const logs = await db.serviceJobLog.count({ where: { service_job_id: job?.id } });
      check("nenhum log de produção", logs === 0, String(logs));
      const financeiro = await db.financialEntry.count({
        where: { related_module: "servico", related_id: job?.id },
      });
      check("nenhuma conta a receber ainda", financeiro === 0, String(financeiro));

      // Continua achável por iniciar_servico: base do que a Task 7 reusa.
      const inicio = await acao("iniciar_servico", { quem: "Joao M67" }, "comecei a gradagem do Joao");
      check(
        "iniciar_servico acha o serviço do Joao (match positivo, não só ausência de recusa)",
        inicio.data.reply_text.includes("Joao M67"),
        inicio.data.reply_text,
      );

      console.log("   concluido:false sem nenhuma data: pergunta, não inventa");
      const antesDaPergunta = await db.serviceJob.count();
      const semData = await acao(
        "registrar_servico_prestado",
        {
          servico: "roçada",
          maquina: "Trator M67",
          quem: "Maria M67",
          valor: 1000,
          quantidade: 3,
          unidade: "hectare",
          concluido: false,
        },
        "vou fazer uma roçada pra Maria",
      );
      check(
        "pergunta exatamente para quando ficou marcado",
        semData.data.reply_text === "Para quando ficou marcado?",
        semData.data.reply_text,
      );
      check("e não cria nenhum serviço novo", (await db.serviceJob.count()) === antesDaPergunta);

      // A pergunta acima deixou um pendente "aguardando: data" no Redis. Sem
      // limpar, o PRÓXIMO registrar_servico_prestado (mesmo user_id) tomaria
      // essa resposta como resposta À PERGUNTA DA MARIA (mesma chave para
      // todo gesto de serviço), e o caso do Pedro abaixo gravaria "roçada
      // para Maria" em vez de "aração para Pedro".
      const { clearPendingService } = await import("@/lib/actions/service-pending");
      await clearPendingService(tenant.id, owner.id);

      console.log("   data: hoje nunca é futuro: nasce feito, não agendado");
      const pHoje = {
        servico: "aração",
        maquina: "Trator M67",
        quem: "Pedro M67",
        valor: 500,
        quantidade: 2,
        unidade: "hectare",
        data: "hoje",
      };
      await acao("registrar_servico_prestado", pHoje, "fiz aração hoje pro Pedro");
      await acao("registrar_servico_prestado", pHoje, "sim", { confirmed: true });
      const jobHoje = await db.serviceJob.findFirst({ where: { description: { contains: "ração" } } });
      check("hoje não vira agendado", jobHoje?.status === "concluido", String(jobHoje?.status));

      console.log('   concluido: "terminei" não é negativo reconhecido: nasce feito');
      const pTerminei = {
        servico: "plantio",
        maquina: "Trator M67",
        quem: "Ana M67",
        valor: 700,
        quantidade: 4,
        unidade: "hectare",
        concluido: "terminei",
      };
      await acao("registrar_servico_prestado", pTerminei, "terminei o plantio da Ana");
      await acao("registrar_servico_prestado", pTerminei, "sim", { confirmed: true });
      const jobTerminei = await db.serviceJob.findFirst({ where: { description: { contains: "plantio" } } });
      check(
        '"terminei" não é o negativo explícito: nasce feito, não agendado',
        jobTerminei?.status === "concluido",
        String(jobTerminei?.status),
      );

      /**
       * Achado (Importante, novo) do re-review: `concluido` negativo com data
       * de HOJE ("ainda não fiz, faço hoje") tinha que nascer `agendado`, e
       * o handler DIZIA isso, mas `createServiceJob` recalculava o status por
       * INSTANTE por conta própria e gravava `concluido`: órfão de produção,
       * sem conta a receber, resposta mentindo, e invisível para
       * `iniciar_servico`. Fix round 2: o handler decide `agendado` UMA vez
       * (incorporando o `concluido` explícito) e manda `status` pronto.
       */
      console.log('   concluido:false com data:"hoje": agendado hoje, não concluido');
      const pHojeNegativo = {
        servico: "colheita",
        maquina: "Trator M67",
        quem: "Carla M67",
        valor: 900,
        quantidade: 5,
        unidade: "hectare",
        concluido: false,
        data: "hoje",
      };
      await acao("registrar_servico_prestado", pHojeNegativo, "ainda não fiz a colheita da Carla, faço hoje");
      await acao("registrar_servico_prestado", pHojeNegativo, "sim", { confirmed: true });
      const jobHojeNegativo = await db.serviceJob.findFirst({ where: { description: { contains: "colheita" } } });
      check(
        "concluido:false com hoje nasce agendado, não concluido",
        jobHojeNegativo?.status === "agendado",
        String(jobHojeNegativo?.status),
      );
      const logsHojeNegativo = await db.serviceJobLog.count({
        where: { service_job_id: jobHojeNegativo?.id },
      });
      check("e sem log de produção", logsHojeNegativo === 0, String(logsHojeNegativo));
      const financeiroHojeNegativo = await db.financialEntry.count({
        where: { related_module: "servico", related_id: jobHojeNegativo?.id },
      });
      check("e sem conta a receber ainda", financeiroHojeNegativo === 0, String(financeiroHojeNegativo));

      console.log("   concluido:false com data PASSADA: pergunta de novo, não cria (contraditório)");
      const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const dataPassada =
        `${String(dezDiasAtras.getDate()).padStart(2, "0")}/` +
        `${String(dezDiasAtras.getMonth() + 1).padStart(2, "0")}/${dezDiasAtras.getFullYear()}`;
      const antesDaPassada = await db.serviceJob.count();
      const passada = await acao(
        "registrar_servico_prestado",
        {
          servico: "adubação",
          maquina: "Trator M67",
          quem: "Bruno M67",
          valor: 600,
          quantidade: 6,
          unidade: "hectare",
          concluido: false,
          data: dataPassada,
        },
        "ainda não fiz a adubação do Bruno",
      );
      check(
        "concluido:false com data passada pergunta de novo, não inventa",
        passada.data.reply_text === "Para quando ficou marcado?",
        passada.data.reply_text,
      );
      check("e não cria nada", (await db.serviceJob.count()) === antesDaPassada);
    }

    console.log("\n6. Diesel sem saldo");
    {
      const categoriaDiesel = await db.productCategory.create({ data: scoped({ name: "Combustíveis M67" }) });
      await db.product.create({
        data: scoped({ category_id: categoriaDiesel.id, name: "Diesel M67", unit: "litro" }),
      });
      const p = { quem: "Joao M67", produto: "Diesel M67", quantidade: 50 };
      await acao("iniciar_servico", { quem: "Joao M67" }, "sim", { confirmed: true });
      await acao("registrar_combustivel_servico", p, "gastei 50 litros de diesel na gradagem");
      const r = await acao("registrar_combustivel_servico", p, "sim", { confirmed: true });
      check("responde 200 com frase, não 500", r.status === 200 && typeof r.data.reply_text === "string", `${r.status}`);
      check("a frase fala de saldo", /saldo|estoque|tem só|não tem/i.test(r.data.reply_text ?? ""), r.data.reply_text);
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
