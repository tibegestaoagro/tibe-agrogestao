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
  const { recordMovement, getPositions } = await import("@/lib/actions/herd-ledger");

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

    console.log("\n7. Pagamento sem valor previsto");
    {
      const { createWorker } = await import("@/lib/actions/workers");
      const pedro = await createWorker(db, {
        name: "Pedro M67",
        role: "vaqueiro",
        type: "fixo",
        pay_frequency: "mensal",
        pay_amount: 1800,
      });
      if (!pedro.ok) throw new Error(`setup Pedro M67 falhou: ${pedro.message}`);
      /*
       * O cadastro cria a previsão automaticamente (previsão rolante). Zera a
       * data de vencimento dela para chegar no estado que o handler realmente
       * lê como "sem previsto" (`worker.proximo_pagamento`, que exige
       * `due_date`), sem deixar de existir uma previsão pendente de verdade
       * para a confirmação atualizar.
       */
      await db.financialEntry.updateMany({
        where: { related_module: "mao_de_obra", related_id: pedro.data.id, status: "pending" },
        data: { due_date: null },
      });

      const pergunta = await acao("registrar_pagamento_trabalhador", { nome: "Pedro M67" }, "paguei o Pedro");
      check("pergunta o valor", /valor|quanto/i.test(pergunta.data.reply_text), pergunta.data.reply_text);
      const resposta = await acao("registrar_pagamento_trabalhador", { valor: 2500 }, "2500");
      check("a resposta só com o valor lembra do Pedro", /Pedro/.test(resposta.data.reply_text), resposta.data.reply_text);
      const confirmado = await acao("registrar_pagamento_trabalhador", {}, "sim", { confirmed: true });
      const pagamento = await db.financialEntry.findFirst({
        where: { related_module: "mao_de_obra", related_id: pedro.data.id, status: "paid", amount: 2500 },
      });
      check(
        'o "sim" vazio executa o pendente guardado: paga Pedro M67 em 2500',
        pagamento !== null,
        confirmado.data.reply_text,
      );
    }

    console.log("\n8. O sim pertence ao pedido mais recente");
    {
      // Seções anteriores deixam pendências mais ANTIGAS que as deste caso
      // (serviço aguardando data, por exemplo). Por serem anteriores, não
      // mudam o desempate, mas limpar deixa o caso sem ambiguidade.
      const { clearPendingService } = await import("@/lib/actions/service-pending");
      const { clearPendingStock, loadPendingStock } = await import("@/lib/actions/stock-pending");
      const { clearPendingMilk } = await import("@/lib/actions/leite-pending");
      await clearPendingService(tenant.id, owner.id);
      await clearPendingStock(tenant.id, owner.id);
      await clearPendingMilk(tenant.id, owner.id);

      const categoriaSal = await db.productCategory.create({ data: scoped({ name: "Sal M67" }) });
      await db.product.create({ data: scoped({ category_id: categoriaSal.id, name: "Sal M67", unit: "saca" }) });
      const compra = await acao(
        "registrar_negocio_produto",
        { tipo: "compra", produto: "Sal M67", quantidade: 10, valor: 1200 },
        "comprei 10 sacas de sal por 1200",
      );
      check("a compra de sal ficou esperando confirmação", compra.data.requires_confirmation === true, compra.data.reply_text);
      await new Promise((r) => setTimeout(r, 20));
      const lactacao = await acao(
        "definir_vacas_em_lactacao",
        { quantidade: 32, fazenda: "Fazenda M67" },
        "estou com 32 vacas dando leite",
      );
      check("a contagem de lactação ficou esperando confirmação", lactacao.data.requires_confirmation === true, lactacao.data.reply_text);
      const sim = await acao("registrar_entrada_lactacao", {}, "sim", { confirmed: true });
      const compras = await db.stockMovement.count({ where: { movement_type: "compra" } });
      check("o sim NÃO gravou a compra de sal, que era mais antiga", compras === 0, `${compras}: ${sim.data.reply_text}`);
      const entradas = await db.lactationEntry.count({ where: { type: "entrada" } });
      check("nem uma ENTRADA de lactação onde se perguntou a contagem", entradas === 0, String(entradas));
      /*
       * O handler de estoque também recusa pedido que não é o mais recente, e
       * sozinho já impediria a gravação. Mas ali ele APAGA a compra e responde
       * pelo estoque. O roteador tem de nem desviar: o "sim" fica com o leite,
       * e a compra continua viva para quando for a vez dela.
       */
      check("a compra de sal continua pendente, não foi destruída", (await loadPendingStock(tenant.id, owner.id)) !== null);

      /*
       * O desempate por data lê o registro de `pending-store.ts`, e um store
       * só se registra quando o arquivo dele é carregado. `stock-pending.ts`
       * importa todos para não depender de quem mais foi carregado antes.
       * Conferência estática, porque neste processo a rota já carregou todos
       * os handlers e o registro estaria completo de qualquer jeito: um
       * `*-pending.ts` novo sem o import reprova aqui.
       */
      const { readdirSync, readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const pasta = join(process.cwd(), "src", "lib", "actions");
      const fonteDoEstoque = readFileSync(join(pasta, "stock-pending.ts"), "utf8");
      const semImport = readdirSync(pasta)
        .filter((f) => f.endsWith("-pending.ts") && f !== "stock-pending.ts")
        .filter((f) => readFileSync(join(pasta, f), "utf8").includes("criarStoreDePendencia<"))
        .filter((f) => !fonteDoEstoque.includes(`import "@/lib/actions/${f.replace(/\.ts$/, "")}";`));
      check(
        "todo store de pendência em disco entra no desempate por data",
        semImport.length === 0,
        `sem import em stock-pending.ts: ${semImport.join(", ")}`,
      );
    }

    console.log("\n9. Cadastro assistido");
    {
      await db.property.create({ data: scoped({ name: "Fazenda B M67" }) });
      const abre = await acao("cadastrar_animal", { count: 1 }, "quero cadastrar um boi");
      check("com duas fazendas, pergunta qual", /qual fazenda|em qual/i.test(abre.data.reply_text), abre.data.reply_text);

      /*
       * Fix round 1 (achado Importante): a asserção antiga só provava a
       * AUSÊNCIA de palavras de campo, o que passaria mesmo com um
       * `interrompe()` quebrado que respondesse "Não encontrei a
       * propriedade...". Marcador POSITIVO: `action_taken` é o intent de
       * verdade que rodou (meu-dia.ts, `responder(..., "consultar_meu_dia")`),
       * e a resposta não pode falar de fazenda (senão é a pergunta pendente
       * vazando, não o roteamento normal).
       */
      const outro = await acao("consultar_meu_dia", {}, "o que tenho pra hoje");
      check(
        "assunto novo com gesto próprio é roteado de verdade (marcador positivo)",
        outro.data.action_taken === "consultar_meu_dia",
        outro.data.action_taken,
      );
      check(
        "e a resposta não é a pergunta da fazenda vazando",
        !/fazenda|propriedade/i.test(outro.data.reply_text),
        outro.data.reply_text,
      );

      /*
       * "Fazenda" bate em "Fazenda M67" E "Fazenda B M67" ao mesmo tempo
       * (contém as duas): antes do fix round 1, `findActivePropertyByName`
       * (contains + findFirst) escolhia a PRIMEIRA batida do banco em vez de
       * perguntar de novo. Ambíguo tem que perguntar, nunca escolher.
       */
      const ambigua = await acao("cadastrar_animal", {}, "Fazenda");
      check(
        "resposta ambígua ('Fazenda' bate nas duas) pergunta de novo, não escolhe",
        /^em qual fazenda\?/i.test(ambigua.data.reply_text),
        ambigua.data.reply_text,
      );

      /*
       * Frase natural ("na fazenda b m67"): o `contains` antigo verificava se
       * o NOME CADASTRADO continha o texto digitado (nunca o contrário), e
       * "Fazenda B M67" não contém "na fazenda b m67". Precisa casar pelo
       * texto CONTENDO o nome da fazenda, não o oposto.
       */
      const respostaFazenda = await acao("cadastrar_animal", {}, "na fazenda b m67");
      check(
        "a resposta natural da fazenda abre o formulário de campos, não repete a pergunta",
        /brinco/i.test(respostaFazenda.data.reply_text),
        respostaFazenda.data.reply_text,
      );

      /*
       * Interrupção a nível de CAMPO, não só na pergunta da fazenda: o
       * formulário já está perguntando a raça (brinco acabou de ser
       * respondido). Precisa ser uma intenção FORA da antiga lista fixa
       * (`consultar_meu_dia` nunca esteve em `INTERRUPTING`) para provar a
       * regra nova, e o estado precisa sobreviver (não é cancelamento).
       */
      await acao("cadastrar_animal", {}, "1234"); // responde o brinco, fica perguntando a raça
      const interrompeCampo = await acao("consultar_meu_dia", {}, "o que tenho pra hoje");
      check(
        "intenção de outro assunto no meio de um CAMPO também é roteada (marcador positivo)",
        interrompeCampo.data.action_taken === "consultar_meu_dia",
        interrompeCampo.data.action_taken,
      );
      const estadoAposInterrupcao = await db.agentFlowState.findFirst({ where: { user_id: owner.id } });
      check(
        "o formulário continua guardado depois da interrupção (ainda perguntando a raça)",
        estadoAposInterrupcao?.pending_field === "breed",
        JSON.stringify(estadoAposInterrupcao),
      );

      await db.agentFlowState.deleteMany({ where: { user_id: owner.id } });

      /*
       * Lote de 2, na fazenda escolhida: prova ponta a ponta que a fazenda
       * resolvida na pergunta viaja com CADA item do lote (não só o
       * primeiro) e é ela que `commitAnimals` grava, nunca `props[0]`.
       */
      const fazendaB = await db.property.findFirstOrThrow({ where: { name: "Fazenda B M67" } });
      const abreLote = await acao("cadastrar_animal", { count: 2 }, "quero cadastrar 2 bois");
      check(
        "lote de 2 também pergunta a fazenda antes de abrir",
        /^em qual fazenda\?/i.test(abreLote.data.reply_text),
        abreLote.data.reply_text,
      );
      await acao("cadastrar_animal", {}, "na fazenda b m67");
      await acao("cadastrar_animal", {}, "2001");
      await acao("cadastrar_animal", {}, "Nelore");
      await acao("cadastrar_animal", {}, "macho");
      const primeiroItem = await acao("cadastrar_animal", {}, "boi");
      check("primeiro item completo, pede o segundo", /faltam 1/i.test(primeiroItem.data.reply_text), primeiroItem.data.reply_text);
      await acao("cadastrar_animal", {}, "2002");
      await acao("cadastrar_animal", {}, "Nelore");
      await acao("cadastrar_animal", {}, "fêmea");
      const resumoLote = await acao("cadastrar_animal", {}, "vaca");
      check("os dois completos, pede confirmação do resumo", /posso cadastrar/i.test(resumoLote.data.reply_text), resumoLote.data.reply_text);
      const confirmado = await acao("cadastrar_animal", {}, "sim", { confirmed: true });
      check("confirma e cadastra os 2", /2 animal/i.test(confirmado.data.reply_text), confirmado.data.reply_text);

      const lote = await db.animalBatch.findMany({ where: { ear_tag: { in: ["2001", "2002"] } } });
      check("os dois lotes foram criados", lote.length === 2, String(lote.length));
      check(
        "os dois foram gravados na fazenda ESCOLHIDA (Fazenda B), nunca em props[0]",
        lote.every((l) => l.property_id === fazendaB.id),
        JSON.stringify(lote.map((l) => l.property_id)),
      );

      await db.agentFlowState.deleteMany({ where: { user_id: owner.id } });
    }

    console.log("\n10. Comprei item da lista");
    {
      /*
       * Seções anteriores usam o mesmo `owner`: limpa qualquer pendente de
       * Lista de Compra que possa ter sobrado (nenhuma seção usou esta
       * intenção antes, mas o pendente é por usuário, não por seção, e uma
       * corrida futura não pode virar falso positivo aqui).
       */
      const { clearPendingLista } = await import("@/lib/actions/shopping-pending");
      await clearPendingLista(tenant.id, owner.id);

      await acao("adicionar_item_lista", { item: "Arame M67", quantidade: 2, unidade: "rolo" }, "anota 2 rolos de arame");
      await acao("adicionar_item_lista", { item: "Arame M67", quantidade: 2, unidade: "rolo" }, "sim", { confirmed: true });

      /*
       * `comprei_item_lista` só registra a compra de verdade quando o item já
       * tem produto e fazenda (T06 §1), e nada no gesto de adicionar pelo
       * WhatsApp preenche isso. Simula o que a tela faria: liga o item ao
       * catálogo antes de "comprar".
       */
      const categoriaArame = await db.productCategory.create({ data: scoped({ name: "Arame M67" }) });
      const produtoArame = await db.product.create({
        data: scoped({ category_id: categoriaArame.id, name: "Arame M67", unit: "rolo" }),
      });
      await db.shoppingItem.updateMany({
        where: { description: "Arame M67", status: "pendente" },
        data: { product_id: produtoArame.id, property_id: fazenda.id },
      });

      const r = await acao("comprei_item_lista", { item: "Arame M67", valor: 380 }, "comprei o arame por 380");
      check("pergunta antes de gravar a compra com valor", r.data.requires_confirmation === true, r.data.reply_text);
      const lanc = await db.financialEntry.count({ where: { amount: 380 } });
      check("e não lançou ainda", lanc === 0, String(lanc));

      // §19.7 pode ter deixado DOIS itens "Arame M67" na lista (o segundo
      // `adicionar_item_lista` acima confirma a duplicata direto): o alvo da
      // compra é o `item_id` que o próprio pedido guardou, não a descrição.
      const itemId = String((r.data.auxiliary_data as { item_id?: string })?.item_id);

      /*
       * O "sim" executa o GUARDADO, não o que esta mensagem trouxe: parâmetros
       * vazios de propósito, igual ao achado de `registrar_lancamento_financeiro`.
       */
      const confirmado = await acao("comprei_item_lista", {}, "sim", { confirmed: true });
      check(
        "confirmação com parâmetros vazios executa o pendente guardado",
        confirmado.data.requires_confirmation === false,
        confirmado.data.reply_text,
      );
      const lancDepois = await db.financialEntry.count({ where: { amount: 380 } });
      check("lançou a despesa de 380 ao confirmar", lancDepois === 1, String(lancDepois));
      const itemComprado = await db.shoppingItem.findFirst({ where: { id: itemId } });
      check("o item saiu da lista (não está mais pendente)", itemComprado?.status !== "pendente", String(itemComprado?.status));

      /*
       * `confirmed: true` chegando com parâmetros cheios, mas SEM pendente
       * guardado para este item (o de Arame já foi resolvido e limpo acima):
       * precisa resolver de novo, guardar e perguntar, NUNCA gravar direto do
       * que esta mensagem trouxe. Item novo, também já ligado ao catálogo.
       */
      const categoriaCorreia = await db.productCategory.create({ data: scoped({ name: "Correia M67" }) });
      const produtoCorreia = await db.product.create({
        data: scoped({ category_id: categoriaCorreia.id, name: "Correia M67", unit: "unidade" }),
      });
      await acao("adicionar_item_lista", { item: "Correia M67" }, "preciso de uma correia");
      await db.shoppingItem.updateMany({
        where: { description: "Correia M67", status: "pendente" },
        data: { product_id: produtoCorreia.id, property_id: fazenda.id },
      });

      const simSemPedido = await acao(
        "comprei_item_lista",
        { item: "Correia M67", valor: 222 },
        "sim",
        { confirmed: true },
      );
      check(
        "confirmado sem pendente guardado não grava, pergunta de novo",
        simSemPedido.data.requires_confirmation === true,
        JSON.stringify(simSemPedido.data),
      );
      const lancSemPedido = await db.financialEntry.count({ where: { amount: 222 } });
      check("nada gravado com valor 222 sem pendente", lancSemPedido === 0, String(lancSemPedido));
    }

    console.log("\n11. Período");
    {
      const { lerMes } = await import("@/lib/actions/whatsapp-handlers/parsers");
      const ref = new Date("2026-09-14T15:00:00Z");
      const casos: [string, string | null][] = [
        ["2026-08", "2026-8"], ["08/2026", "2026-8"], ["agosto", "2026-8"], ["agosto de 2025", "2025-8"],
        ["mes passado", "2026-8"], ["este mês", "2026-9"], ["qualquer coisa", null],
      ];
      for (const [t, e] of casos) {
        const r = lerMes(t, ref);
        check(`lerMes("${t}")`, (r ? `${r.ano}-${r.mes}` : null) === e, JSON.stringify(r));
      }

      // Nível de rota: mesmas checagens contra o handler de verdade, com o
      // relógio real (sem `ref`), igual ao que `consultarSaldo` chama.
      const mesPassado = lerMes("mes passado")!;
      const nomeMesPassado = new Date(mesPassado.ano, mesPassado.mes - 1, 1)
        .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      const saldoMesPassado = await acao("consultar_saldo", { period: "mes passado" }, "quanto sobrou mes passado");
      check(
        "consultar_saldo com 'mes passado' responde sobre o mês anterior",
        saldoMesPassado.data.reply_text.toLowerCase().includes(nomeMesPassado.toLowerCase()),
        saldoMesPassado.data.reply_text,
      );

      const saldoAmbiguo = await acao("consultar_saldo", { period: "qualquer coisa" }, "saldo de qualquer coisa");
      check(
        "consultar_saldo com mês ilegível pergunta de qual mês",
        /de qual m[eê]s/i.test(saldoAmbiguo.data.reply_text),
        saldoAmbiguo.data.reply_text,
      );
    }

    console.log("\n12. Livro-razão e confinamento");
    {
      /*
       * Seções anteriores usam o mesmo `owner`: limpa os pendentes que um "sim"
       * desta seção poderia confirmar no lugar do pedido de confinamento (gado,
       * estoque, rebanho, lista e o próprio confinamento).
       */
      const { clearPendingNegotiation } = await import("@/lib/actions/negotiation-pending");
      const { clearPendingStock } = await import("@/lib/actions/stock-pending");
      const { clearPendingHerd } = await import("@/lib/actions/herd-pending");
      const { clearPendingLista } = await import("@/lib/actions/shopping-pending");
      const { clearPendingConfinement } = await import("@/lib/actions/confinamento-pending");
      for (const limpar of [clearPendingNegotiation, clearPendingStock, clearPendingHerd, clearPendingLista, clearPendingConfinement]) {
        await limpar(tenant.id, owner.id);
      }

      const comCat = await acao("cadastrar_animal", { ear_tag: "M67-3", breed: "Nelore", sex: "male", property_name: "Fazenda M67", category: "boi" }, "cadastra o boi M67-3");
      const noLivro = await getPositions(db, { category_id: "macho_36_mais", property_id: fazenda.id });
      check(
        "com categoria, o animal entra no livro-razão",
        noLivro.reduce((s, p) => s + p.quantity, 0) === 1,
        `${comCat.data.action_taken}: ${JSON.stringify(noLivro)}`,
      );

      /*
       * Ambígua: o formulário abre com brinco, raça, sexo e fazenda já
       * preenchidos, e a resposta só com a faixa fecha o item (o sexo que o
       * produtor já disse desempata "13 a 24 meses").
       */
      const ambigua = await acao("cadastrar_animal", { ear_tag: "M67-2", breed: "Nelore", sex: "female", property_name: "Fazenda M67", category: "novilha" }, "cadastra a novilha M67-2");
      check("categoria ambígua pergunta a faixa", /mais de uma categoria/i.test(ambigua.data.reply_text), ambigua.data.reply_text);
      check("categoria ambígua não cria o lote", (await db.animalBatch.count({ where: { ear_tag: "M67-2" } })) === 0);
      const faixa = await acao("ambigua", {}, "de 13 a 24 meses");
      check("a faixa respondida fecha o item no resumo", /Confere antes de eu salvar/.test(faixa.data.reply_text) && /M67-2/.test(faixa.data.reply_text) && /13 a 24/.test(faixa.data.reply_text), faixa.data.reply_text);
      await db.agentFlowState.deleteMany({ where: { user_id: owner.id } });

      const semCat = await acao("cadastrar_animal", { ear_tag: "M67-1", breed: "Nelore", sex: "male", property_name: "Fazenda M67" }, "cadastra o boi M67-1 nelore macho");
      check("sem categoria, pergunta a categoria", semCat.data.reply_text === "Qual a categoria? (ex: bezerro, novilha de 13 a 24 meses, vaca, boi, garrote, touro)", semCat.data.reply_text);
      const loteSemCat = await db.animalBatch.count({ where: { ear_tag: "M67-1" } });
      check("sem categoria, não cria o lote", loteSemCat === 0, String(loteSemCat));

      const respostaCat = await acao("cadastrar_animal", { category: "boi" }, "boi");
      check(
        "a categoria respondida vai direto ao resumo, sem repetir brinco, raça e sexo",
        /Confere antes de eu salvar/.test(respostaCat.data.reply_text) && /M67-1/.test(respostaCat.data.reply_text),
        respostaCat.data.reply_text,
      );
      check("nada gravado antes do sim do resumo", (await db.animalBatch.count({ where: { ear_tag: "M67-1" } })) === 0);
      const simCadastro = await acao("cadastrar_animal", {}, "sim", { confirmed: true });
      const loteM671 = await db.animalBatch.findFirst({ where: { ear_tag: "M67-1" } });
      const movM671 = loteM671 ? await db.herdMovement.count({ where: { batch_id: loteM671.id } }) : 0;
      check("depois do sim, o lote M67-1 existe e entrou no livro-razão", !!loteM671 && movM671 > 0, `${simCadastro.data.reply_text} / mov ${movM671}`);
      // Um formulário que sobrasse aberto engoliria o "não" da venda abaixo.
      await db.agentFlowState.deleteMany({ where: { user_id: owner.id } });

      const semLote = await acao("registrar_negocio_gado", { tipo: "venda", categoria: "boi", quantidade: 5, valor: 25000 }, "vendi 5 bois do confinamento por 25 mil");
      check("sem lote aberto, a venda segue como negócio", !/confinamento/i.test(semLote.data.reply_text),`${semLote.data.action_taken}: ${semLote.data.reply_text}`);
      await clearPendingNegotiation(tenant.id, owner.id);

      const { createConfinementSite, openConfinementStay } = await import("@/lib/actions/confinement");
      const site = await createConfinementSite(db, { name: "Conf M67", type: "proprio", property_id: fazenda.id });
      if (site.ok) await openConfinementStay(db, { confinement_site_id: site.data.id, category_id: "macho_25_36", quantity: 10, pasture_id: pasto.id });

      const soma = async (situation: "presente" | "confinamento", pasture_id?: string) =>
        (await getPositions(db, { category_id: "macho_25_36", situation, ...(pasture_id ? { pasture_id } : {}) }))
          .reduce((s, p) => s + p.quantity, 0);
      const loteAntes = await soma("confinamento");
      const pastoAntes = await soma("presente", pasto.id);

      const r = await acao("registrar_negocio_gado", { tipo: "venda", categoria: "boi", quantidade: 5, valor: 25000 }, "vendi 5 bois do confinamento por 25 mil");
      check("a venda que cita o confinamento vira saída do lote", /confinamento/i.test(r.data.reply_text) && r.data.action_taken?.startsWith("encerrar_confinamento"), `${r.data.action_taken}: ${r.data.reply_text}`);
      check("e pergunta antes de gravar", r.data.requires_confirmation === true, r.data.reply_text);
      check("a pergunta nomeia o lote e a categoria", /Conf M67/.test(r.data.reply_text) && /machos de 25 a 36 meses/.test(r.data.reply_text), r.data.reply_text);
      check("nada saiu do lote antes do sim", (await soma("confinamento")) === loteAntes);

      // (i) O "sim" chega reemitido como gado, com a frase remontada.
      const sim = await acao("registrar_negocio_gado", { tipo: "venda", categoria: "boi", quantidade: 5, valor: 25000 }, "sim", { confirmed: true });
      const loteDepois = await soma("confinamento");
      const pastoDepois = await soma("presente", pasto.id);
      check("o sim reemitido como gado tira 5 cabeças do lote", loteDepois === loteAntes - 5, `${loteAntes} -> ${loteDepois}: ${sim.data.action_taken}: ${sim.data.reply_text}`);
      check("e o pasto não muda", pastoDepois === pastoAntes, `${pastoAntes} -> ${pastoDepois}`);

      // (ii) Negócio de gado MAIS ANTIGO esperando, depois a venda do lote, e o "sim".
      const velho = await acao(
        "registrar_negocio_gado",
        { tipo: "venda", categoria: "macho_25_36", quantidade: 3, valor: 9999, fazenda: "Fazenda M67", pasto: "Pasto M67" },
        "vendi 3 machos do pasto por 9999",
      );
      check("o negócio antigo ficou esperando", velho.data.action_taken?.startsWith("registrar_negocio_gado"), `${velho.data.action_taken}: ${velho.data.reply_text}`);
      await acao("registrar_negocio_gado", { tipo: "venda", categoria: "boi", quantidade: 2, valor: 8000 }, "vendi 2 bois do confinamento por 8 mil");
      const lote2Antes = await soma("confinamento");
      const pasto2Antes = await soma("presente", pasto.id);
      const sim2 = await acao("registrar_negocio_gado", { tipo: "venda", categoria: "boi", quantidade: 2, valor: 8000 }, "sim", { confirmed: true });
      check("o sim vai à venda do lote, a mais recente", (await soma("confinamento")) === lote2Antes - 2, `${sim2.data.action_taken}: ${sim2.data.reply_text}`);
      check("e o negócio antigo do pasto não executa", (await soma("presente", pasto.id)) === pasto2Antes);
      check("nenhuma negociação de 9999 criada", (await db.negotiation.count({ where: { amount: 9999 } })) === 0);

      // (iii) "não" reemitido como gado cancela a venda do lote.
      await acao("registrar_negocio_gado", { tipo: "venda", categoria: "boi", quantidade: 1, valor: 4000 }, "vendi 1 boi do confinamento por 4 mil");
      const lote3Antes = await soma("confinamento");
      const nao = await acao("registrar_negocio_gado", { tipo: "venda", categoria: "boi", quantidade: 1, valor: 4000 }, "não");
      const simDepoisDoNao = await acao("encerrar_confinamento", {}, "sim", { confirmed: true });
      check("o não reemitido como gado cancela a saída do lote", (await soma("confinamento")) === lote3Antes, `${nao.data.action_taken} / ${simDepoisDoNao.data.reply_text}`);
      check("e o sim seguinte não tem o que confirmar", /Não tenho nenhuma saída/.test(simDepoisDoNao.data.reply_text), simDepoisDoNao.data.reply_text);
      await clearPendingNegotiation(tenant.id, owner.id);
    }

    console.log("\n13. O formulário não toma o sim/não de um pedido mais novo");
    {
      const { clearPendingFinance, loadPendingFinance } = await import("@/lib/actions/finance-pending");
      const { chavesDePendencia } = await import("@/lib/actions/pending-store");
      const { getRedisConnection } = await import("@/lib/redis");
      const limparTudo = async () => {
        for (const chave of chavesDePendencia()) await getRedisConnection().del(chave(tenant.id, owner.id));
      };
      await limparTudo();
      await db.agentFlowState.deleteMany({ where: { user_id: owner.id } });

      // Formulário parado no resumo, depois um lançamento financeiro pedido.
      const abreResumo = async () => {
        await acao("cadastrar_animal", { ear_tag: "M67-C1", breed: "Nelore", sex: "male", property_name: "Fazenda M67" }, "cadastra o boi M67-C1");
        const resumo = await acao("cadastrar_animal", { category: "boi" }, "boi");
        check("o formulário chegou ao resumo", /Confere antes de eu salvar/.test(resumo.data.reply_text), resumo.data.reply_text);
        await new Promise((r) => setTimeout(r, 20));
      };

      await abreResumo();
      const pedido = await acao("registrar_lancamento_financeiro", { amount: 431, category: "Diesel", tipo: "despesa" }, "gastei 431 de diesel");
      check("o lançamento ficou esperando confirmação", pedido.data.requires_confirmation === true, pedido.data.reply_text);
      const nao = await acao("registrar_lancamento_financeiro", {}, "não");
      check("o não cancela o lançamento, que é o pedido mais recente", /cancelado/i.test(nao.data.reply_text), `${nao.data.action_taken}: ${nao.data.reply_text}`);
      check("nada gravado com 431", (await db.financialEntry.count({ where: { amount: 431 } })) === 0);
      check("o pendente financeiro foi limpo", (await loadPendingFinance(tenant.id, owner.id)) === null);
      const formDepoisDoNao = await db.agentFlowState.findFirst({ where: { user_id: owner.id } });
      check("o formulário continua no resumo", formDepoisDoNao?.awaiting_summary === true, JSON.stringify(formDepoisDoNao));

      await db.agentFlowState.deleteMany({ where: { user_id: owner.id } });
      await clearPendingFinance(tenant.id, owner.id);
      await abreResumo();
      await acao("registrar_lancamento_financeiro", { amount: 432, category: "Diesel", tipo: "despesa" }, "gastei 432 de diesel");
      const sim = await acao("registrar_lancamento_financeiro", {}, "sim", { confirmed: true });
      check("o sim grava o lançamento", (await db.financialEntry.count({ where: { amount: 432 } })) === 1, `${sim.data.action_taken}: ${sim.data.reply_text}`);
      check("e nenhum animal", (await db.animalBatch.count({ where: { ear_tag: "M67-C1" } })) === 0);

      await db.agentFlowState.deleteMany({ where: { user_id: owner.id } });
      await limparTudo();
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
