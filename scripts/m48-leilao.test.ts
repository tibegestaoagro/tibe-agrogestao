import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import type { TenantPrismaClient } from "@/lib/prisma";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

exigirBancoLocal();

/**
 * Módulo 31, missão 3: leilão, feira e eventos.
 *
 * A regra que esta suíte existe para proteger é uma frase do cliente: "o
 * simples envio de animais para um evento não será considerado venda" (§8, e
 * de novo no §17.8). O erro caro aqui é receita nascendo cedo, e por isso o
 * PRIMEIRO caso confere que nenhum lançamento financeiro existe depois do
 * envio.
 *
 * Roda: `npm run test:m48`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

function ctx(
  db: TenantPrismaClient,
  tenantId: string,
  parameters: Record<string, unknown>,
  opts: { confirmed?: boolean; explicitNo?: boolean; userId?: string } = {},
): HandlerCtx {
  return {
    db,
    tenant_id: tenantId,
    role: "OWNER",
    activeProfiles: ["fazenda"],
    parameters,
    confirmed: opts.confirmed ?? false,
    explicitNo: opts.explicitNo ?? false,
    user_id: opts.userId,
  };
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { openEventConsignment, closeEventConsignment } = await import(
    "@/lib/actions/event-consignments"
  );
  const { listStays } = await import("@/lib/actions/herd-stays");
  const { cancelNegotiation, getNegotiation, situacaoLabel, ehVenda } = await import(
    "@/lib/actions/negotiations"
  );
  const { getPositions, recordMovement } = await import("@/lib/actions/herd-ledger");
  const { registrarRemessaEvento, encerrarRemessaEvento } = await import(
    "@/lib/actions/whatsapp-handlers/evento"
  );
  const { clearPendingEvent } = await import("@/lib/actions/event-pending");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M48 ${stamp}`, document: `M48${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const usuario = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "Produtor de Teste",
      email: `m48-${stamp}@teste.local`,
      password_hash: "x",
      role: "OWNER",
    },
  });
  const USUARIO = usuario.id;
  const db = prismaForTenant(tenant.id);

  const soma = (posicoes: { quantity: number }[]) =>
    posicoes.reduce((s, p) => s + p.quantity, 0);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M48" }) });
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto A", area_hectares: 10 }),
    });

    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 500,
      to: {
        category_id: "femea_36_mais",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });

    console.log("1. A remessa nasce SEM receita nenhuma");
    {
      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
      const contasAntes = await db.financialEntry.count();

      const r = await openEventConsignment(db, {
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        pasture_id: pasto.id,
        quantity: 20,
        event_name: "Leilão de Outubro",
        event_type: "leilão",
        organizer_name: "Leiloeira Central",
      });
      check("a remessa abre", r.ok, r.ok ? "" : r.message);

      check(
        "NENHUM lançamento financeiro nasce (§17.8)",
        (await db.financialEntry.count()) === contasAntes,
      );

      const negociacao = await db.negotiation.findFirst({
        where: { id: r.ok ? r.data.id : "" },
      });
      check("a negociação é do tipo evento", negociacao?.type === "evento", negociacao?.type);
      check("e nasce SEM valor", negociacao?.amount === null, String(negociacao?.amount));

      check(
        "o rebanho próprio não muda: ainda é dele",
        soma(await getPositions(db, { owner: "proprio" })) === proprioAntes,
      );
      check(
        "20 cabeças passam a estar em evento",
        soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === 20,
      );

      const estadia = await db.herdStay.findFirst({ where: { id: r.ok ? r.data.stay_id : "" } });
      check(
        "a estadia aponta para a negociação",
        estadia?.negotiation_id === (r.ok ? r.data.id : null),
      );
      check("com o tipo do evento gravado", estadia?.event_type === "leilão", estadia?.event_type ?? "");
      check(
        "e o nome do evento no local",
        estadia?.location_name === "Leilão de Outubro",
        estadia?.location_name ?? "",
      );
      check(
        "a leiloeira fica como contraparte",
        estadia?.counterparty_name === "Leiloeira Central",
        estadia?.counterparty_name ?? "",
      );

      const mov = await db.herdMovement.findFirst({
        where: { stay_id: r.ok ? r.data.stay_id : "" },
      });
      check("o movimento é envio_evento", mov?.movement_type === "envio_evento", mov?.movement_type);
      check("e aponta para os dois", mov?.negotiation_id != null && mov?.stay_id != null);

      const contato = await db.contact.findFirst({ where: { name: "Leiloeira Central" } });
      check("o organizador vira contato", contato != null);
      check("e a negociação aponta para ele", negociacao?.contact_id === contato?.id);

      // Sem esta situação a remessa aberta caía em "confirmada", e a tela a
      // rotulava "A pagar": uma dívida que não existe, na coluna que o
      // produtor lê de relance. Achado na validação ao vivo do navegador.
      const detalhe = await getNegotiation(db, r.ok ? r.data.id : "");
      check("a situação derivada é 'sem_valor'", detalhe?.situacao === "sem_valor", detalhe?.situacao);
      check(
        "e a tela nunca a chama de 'A pagar'",
        situacaoLabel(detalhe?.situacao ?? "", false) === "Sem venda",
        situacaoLabel(detalhe?.situacao ?? "", false),
      );
    }

    console.log("\n2. Sem saldo não abre, e nada fica pela metade");
    {
      const negociacoesAntes = await db.negotiation.count();
      const estadiasAntes = await db.herdStay.count();
      const contatosAntes = await db.contact.count();

      const r = await openEventConsignment(db, {
        property_id: fazenda.id,
        category_id: "macho_36_mais",
        quantity: 999,
        event_name: "Leilão impossível",
        organizer_name: "Leiloeira Fantasma",
      });
      check(
        "recusa por saldo",
        !r.ok && r.code === "INSUFFICIENT_BALANCE",
        r.ok ? "abriu" : r.code,
      );
      check("apontando a quantidade", !r.ok && r.field === "quantity");
      check("e não deixa negociação órfã", (await db.negotiation.count()) === negociacoesAntes);
      check("nem estadia órfã", (await db.herdStay.count()) === estadiasAntes);
      check("nem contato órfão", (await db.contact.count()) === contatosAntes);
    }

    console.log("\n3. As recusas de entrada, antes de qualquer escrita");
    {
      const r1 = await openEventConsignment(db, {
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        quantity: 0,
        event_name: "Leilão de zero cabeças",
      });
      check("quantidade zero é recusada", !r1.ok && r1.code === "VALIDATION_ERROR", r1.ok ? "abriu" : r1.code);
      check("no campo da quantidade", !r1.ok && r1.field === "quantity");

      const r2 = await openEventConsignment(db, {
        property_id: fazenda.id,
        category_id: "categoria_que_nao_existe",
        quantity: 5,
        event_name: "Leilão de categoria inválida",
      });
      check("categoria inválida é recusada", !r2.ok && r2.code === "INVALID_CATEGORY", r2.ok ? "abriu" : r2.code);

      const r3 = await openEventConsignment(db, {
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        quantity: 5,
        event_name: "   ",
      });
      check("evento sem nome é recusado", !r3.ok && r3.code === "VALIDATION_ERROR", r3.ok ? "abriu" : r3.code);
      check("no campo do nome do evento", !r3.ok && r3.field === "event_name");
    }

    // As remessas seguintes são todas iguais: 20 cabeças no mesmo leilão. Cada
    // caso abre a sua, porque encerrar consome a remessa.
    const abrirComVinte = async () => {
      const r = await openEventConsignment(db, {
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        pasture_id: pasto.id,
        quantity: 20,
        event_name: "Leilão de Outubro",
        event_type: "leilão",
        organizer_name: "Leiloeira Central",
      });
      if (!r.ok) throw new Error(`não abriu a remessa: ${r.message}`);
      return r.data;
    };

    console.log("\n4. A soma dos três destinos tem que bater com o enviado");
    {
      const remessa = await abrirComVinte();
      const emEventoAntes = soma(await getPositions(db, { owner: "proprio", situation: "evento" }));

      const errado = await closeEventConsignment(db, remessa.id, {
        vendidos: 12,
        retornados: 5,
        amount: 36000,
        pago: true,
      });
      check(
        "17 de 20 é recusado",
        !errado.ok && errado.code === "DESTINOS_NAO_BATEM",
        errado.ok ? "passou" : errado.code,
      );
      check("apontando a quantidade", !errado.ok && errado.field === "quantity");
      check(
        "e nenhuma cabeça se mexeu",
        soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === emEventoAntes,
      );
      check("nem lançamento nenhum nasceu", (await db.financialEntry.count({ where: { negotiation_id: remessa.id } })) === 0);
    }

    console.log("\n5. Venda parcial: o exemplo do documento, 12 vendidos e 8 retornados");
    {
      // As comparações são todas ANTES contra DEPOIS: o caso 4 deixou uma
      // remessa aberta de propósito, e esperar zero absoluto seria medir o
      // resíduo dos outros casos em vez deste.
      const emEventoAntes = soma(await getPositions(db, { owner: "proprio", situation: "evento" }));
      const remessa = await abrirComVinte();
      const presenteAntes = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));

      const r = await closeEventConsignment(db, remessa.id, {
        vendidos: 12,
        retornados: 8,
        amount: 60000,
        pago: true,
        custos: [{ descricao: "Comissão da leiloeira", amount: 3000 }],
      });
      check("fecha", r.ok, r.ok ? "" : r.message);

      check(
        "os 8 voltaram para a fazenda",
        soma(await getPositions(db, { owner: "proprio", situation: "presente" })) === presenteAntes + 8,
      );
      check(
        "e o rebanho próprio caiu só os 12 vendidos",
        soma(await getPositions(db, { owner: "proprio" })) === proprioAntes - 12,
      );
      check(
        "nenhuma das 20 sobrou no evento",
        soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === emEventoAntes,
      );

      const negociacao = await db.negotiation.findFirst({ where: { id: remessa.id } });
      check(
        "a MESMA negociação passa a ter valor",
        Number(negociacao?.amount) === 60000,
        String(negociacao?.amount),
      );

      const lancamentos = await db.financialEntry.findMany({ where: { negotiation_id: remessa.id } });
      const principal = lancamentos.filter((l) => l.negotiation_role === "principal");
      const custos = lancamentos.filter((l) => l.negotiation_role === "custo_adicional");
      check(
        "a receita dos vendidos nasce como principal",
        principal.length === 1 && Number(principal[0]?.amount) === 60000,
        `${principal.length} / ${String(principal[0]?.amount)}`,
      );
      check("e ela é RECEITA", principal[0]?.entry_type === "income", principal[0]?.entry_type);
      check(
        "a comissão nasce como custo adicional",
        custos.length === 1 && Number(custos[0]?.amount) === 3000,
        `${custos.length} / ${String(custos[0]?.amount)}`,
      );
      check("e ela é DESPESA, mesmo numa venda", custos[0]?.entry_type === "expense", custos[0]?.entry_type);

      // Os três defeitos que a validação no navegador achou, na mesma linha
      // da tela, todos vindos de `evento` não contar como venda.
      const depois = await getNegotiation(db, remessa.id);
      check(
        "uma venda de leilão é RECEBIDA, não 'Quitada'",
        situacaoLabel(depois?.situacao ?? "", ehVenda("evento")) === "Recebida",
        situacaoLabel(depois?.situacao ?? "", ehVenda("evento")),
      );
      check("e o tipo evento conta como venda", ehVenda("evento"));
      check(
        "o líquido desconta a comissão, não a soma",
        depois?.totais.liquido === 57000,
        String(depois?.totais.liquido),
      );
      // A remessa tem ida E volta na mesma negociação (envio, venda, retorno).
      // Somar tudo contava as mesmas cabeças três vezes, e a tela mostrava 40
      // numa remessa de 20.
      const envios = (depois?.movimentos ?? []).filter((m) => m.movement_type === "envio_evento");
      check(
        "só o envio conta as cabeças da remessa",
        envios.reduce((s, m) => s + m.quantity, 0) === 20,
        String(envios.reduce((s, m) => s + m.quantity, 0)),
      );

      const encerrar = await closeEventConsignment(db, remessa.id, { retornados: 1 });
      check(
        "encerrar de novo é recusado: não há mais nada lá",
        !encerrar.ok && encerrar.code === "DESTINOS_NAO_BATEM",
        encerrar.ok ? "fechou duas vezes" : encerrar.code,
      );
    }

    console.log("\n6. Outro destino abre uma estadia nova, sem cabeça sumir");
    {
      const emEventoAntes = soma(await getPositions(db, { owner: "proprio", situation: "evento" }));
      const remessa = await abrirComVinte();
      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
      const pastoAntes = soma(await getPositions(db, { owner: "proprio", situation: "pasto_terceiro" }));

      const r = await closeEventConsignment(db, remessa.id, {
        vendidos: 5,
        retornados: 5,
        outro_destino: {
          quantity: 10,
          type: "pasto_terceiro",
          counterparty_name: "Sítio do João",
        },
        amount: 25000,
        pago: true,
      });
      check("fecha com os três destinos", r.ok, r.ok ? "" : r.message);
      check(
        "o rebanho próprio caiu só os 5 vendidos",
        soma(await getPositions(db, { owner: "proprio" })) === proprioAntes - 5,
      );
      check(
        "as 10 estão em pasto de terceiro",
        soma(await getPositions(db, { owner: "proprio", situation: "pasto_terceiro" })) === pastoAntes + 10,
      );
      check(
        "nenhuma das 20 sobrou em evento",
        soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === emEventoAntes,
      );

      const nova = await db.herdStay.findFirst({
        where: { type: "pasto_terceiro", counterparty_name: "Sítio do João" },
      });
      check("a estadia nova existe", nova != null);
      check("e o id dela volta na resposta", r.ok && r.data.nova_estadia_id === nova?.id);

      const estadias = await listStays(db, { apenas_abertas: true });
      const antiga = estadias.ok ? estadias.data.find((e) => e.id === remessa.stay_id) : undefined;
      check("a remessa antiga NÃO fica aberta com saldo fantasma", antiga === undefined);
      const abertaNova = estadias.ok ? estadias.data.find((e) => e.id === nova?.id) : undefined;
      check("e a nova aparece aberta com as 10", abertaNova?.saldo_aberto === 10, String(abertaNova?.saldo_aberto));
    }

    console.log("\n7. Sem venda não se aceita valor");
    {
      const remessa = await abrirComVinte();
      const r = await closeEventConsignment(db, remessa.id, { retornados: 20, amount: 5000 });
      check(
        "valor sem venda é recusado",
        !r.ok && r.code === "VALOR_SEM_VENDA",
        r.ok ? "aceitou" : r.code,
      );
      check("apontando o valor", !r.ok && r.field === "amount");

      const fechou = await closeEventConsignment(db, remessa.id, { retornados: 20 });
      check("sem valor, o retorno total fecha", fechou.ok, fechou.ok ? "" : fechou.message);
      const lancamentos = await db.financialEntry.findMany({ where: { negotiation_id: remessa.id } });
      check("e nenhum lançamento nasce", lancamentos.length === 0, String(lancamentos.length));
    }

    console.log("\n8. As parcelas do leilão seguem a regra do §14");
    {
      const remessa = await abrirComVinte();
      const emEventoAntes = soma(await getPositions(db, { owner: "proprio", situation: "evento" }));
      const r = await closeEventConsignment(db, remessa.id, {
        vendidos: 20,
        amount: 60000,
        parcelas: [
          { due_date: new Date(), amount: 20000 },
          { due_date: new Date(), amount: 30000 },
        ],
      });
      check(
        "parcela que não fecha com o valor é recusada",
        !r.ok && r.code === "PARCELAS_NAO_FECHAM",
        r.ok ? "aceitou" : r.code,
      );
      check(
        "e nenhuma cabeça se mexeu",
        soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === emEventoAntes,
      );

      const certo = await closeEventConsignment(db, remessa.id, {
        vendidos: 20,
        amount: 60000,
        parcelas: [
          { due_date: new Date(), amount: 30000 },
          { due_date: new Date(), amount: 30000 },
        ],
      });
      check("fechando, passa", certo.ok, certo.ok ? "" : certo.message);
      const lancamentos = await db.financialEntry.findMany({
        where: { negotiation_id: remessa.id, negotiation_role: "principal" },
      });
      check("duas parcelas, uma linha cada", lancamentos.length === 2, String(lancamentos.length));
      check("as duas em aberto", lancamentos.every((l) => l.status === "pending"));
    }

    console.log("\n9. Cancelar a remessa desfaz rebanho, dinheiro e estadia");
    {
      const presenteAntes = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
      const remessa = await abrirComVinte();
      check(
        "as 20 saíram da fazenda",
        soma(await getPositions(db, { owner: "proprio", situation: "presente" })) === presenteAntes - 20,
      );

      const r = await cancelNegotiation(db, remessa.id, "lançado errado");
      check("cancela", r.ok, r.ok ? "" : r.message);
      check(
        "as 20 voltam para a fazenda",
        soma(await getPositions(db, { owner: "proprio", situation: "presente" })) === presenteAntes,
      );

      const estadia = await db.herdStay.findFirst({ where: { id: remessa.stay_id } });
      check("e a estadia fica marcada como cancelada", estadia?.canceled_at != null);
      check("com o motivo registrado", estadia?.canceled_reason === "lançado errado", estadia?.canceled_reason ?? "");

      const abertas = await listStays(db, { apenas_abertas: true });
      check(
        "a remessa cancelada some de 'fora da fazenda agora'",
        abertas.ok && !abertas.data.some((e) => e.id === remessa.stay_id),
      );
    }

    console.log("\n10. Remessa já encerrada não se cancela inteira");
    {
      const remessa = await abrirComVinte();
      const fechou = await closeEventConsignment(db, remessa.id, {
        vendidos: 10,
        retornados: 10,
        amount: 30000,
        pago: true,
      });
      check("encerra primeiro", fechou.ok, fechou.ok ? "" : fechou.message);

      const r = await cancelNegotiation(db, remessa.id, "mudei de ideia");
      check(
        "recusa, porque desfazer venda é decisão do produtor",
        !r.ok && r.code === "ESTADIA_JA_ENCERRADA",
        r.ok ? "cancelou" : r.code,
      );

      const negociacao = await db.negotiation.findFirst({ where: { id: remessa.id } });
      check("e a negociação continua viva", negociacao?.canceled_at === null);
      const lancamentos = await db.financialEntry.findMany({
        where: { negotiation_id: remessa.id, status: "paid" },
      });
      check("com o dinheiro dela intacto", lancamentos.length === 1, String(lancamentos.length));
    }

    console.log("\n11. Pelo WhatsApp: recusa vence tudo, e o sim só vale para o que foi mostrado");
    {
      await clearPendingEvent(tenant.id, USUARIO);

      const negociacoesAntes = await db.negotiation.count();
      const recusa = await registrarRemessaEvento(
        ctx(db, tenant.id, { quantidade: 20, categoria: "vacas", evento: "Leilão de Outubro" }, {
          explicitNo: true,
          userId: USUARIO,
        }),
      );
      check("a recusa cancela", recusa.action_taken.endsWith(":cancelado"), recusa.action_taken);
      check("e nada é gravado", (await db.negotiation.count()) === negociacoesAntes);

      // O "sim" sem nada guardado NÃO escreve: é a cicatriz de 2026-08-18, em
      // que o classificador remontou os parâmetros e a compra recusada foi
      // gravada com a quantidade errada.
      const simSolto = await registrarRemessaEvento(
        ctx(db, tenant.id, { quantidade: 999, categoria: "vacas", evento: "Leilão fantasma" }, {
          confirmed: true,
          userId: USUARIO,
        }),
      );
      check(
        "um sim sem pendente não grava nada",
        simSolto.action_taken === "clarification_requested",
        simSolto.action_taken,
      );
      check("e a contagem continua igual", (await db.negotiation.count()) === negociacoesAntes);
    }

    console.log("\n12. Pelo WhatsApp: abrir a remessa e encerrar");
    {
      await clearPendingEvent(tenant.id, USUARIO);
      const emEventoAntes = soma(await getPositions(db, { owner: "proprio", situation: "evento" }));

      // Nome PRÓPRIO, e não o "Leilão de Outubro" dos casos acima: eles
      // deixaram remessas abertas de propósito, e o handler recusa escolher
      // entre duas com o mesmo nome, que é o comportamento certo dele.
      const abrir = await registrarRemessaEvento(
        ctx(db, tenant.id, { quantidade: 20, categoria: "vacas", evento: "Feira de Novembro" }, {
          userId: USUARIO,
        }),
      );
      check("o assistente confirma antes de gravar", abrir.requires_confirmation === true, abrir.reply_text);
      check(
        "e avisa que não está registrando venda",
        /nenhuma venda/i.test(abrir.reply_text),
        abrir.reply_text,
      );

      const confirmado = await registrarRemessaEvento(
        ctx(db, tenant.id, { quantidade: 20, categoria: "vacas", evento: "Feira de Novembro" }, {
          confirmed: true,
          userId: USUARIO,
        }),
      );
      check(
        "confirmado, a remessa nasce",
        confirmado.action_taken.startsWith("registrar_remessa_evento:ok"),
        confirmado.action_taken,
      );
      check(
        "e a resposta diz que não houve venda",
        /não registrei venda/i.test(confirmado.reply_text),
        confirmado.reply_text,
      );
      check(
        "as 20 estão em evento",
        soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === emEventoAntes + 20,
      );

      // Encerrar: 12 vendidos, e os 8 que sobraram voltam sem precisar dizer.
      const encerrar = await encerrarRemessaEvento(
        ctx(db, tenant.id, { evento: "Feira de Novembro", vendidos: 12, valor: 60000 }, {
          userId: USUARIO,
        }),
      );
      check("o encerramento também confirma antes", encerrar.requires_confirmation === true, encerrar.reply_text);

      const fechado = await encerrarRemessaEvento(
        ctx(db, tenant.id, { evento: "Feira de Novembro", vendidos: 12, valor: 60000 }, {
          confirmed: true,
          userId: USUARIO,
        }),
      );
      check(
        "confirmado, a remessa fecha",
        fechado.action_taken.startsWith("encerrar_remessa_evento:ok"),
        `${fechado.action_taken} / ${fechado.reply_text}`,
      );
      check(
        "as 20 saíram do evento",
        soma(await getPositions(db, { owner: "proprio", situation: "evento" })) === emEventoAntes,
      );
      check("e a resposta conta os dois destinos", /12/.test(fechado.reply_text) && /8/.test(fechado.reply_text), fechado.reply_text);

      await clearPendingEvent(tenant.id, USUARIO);
    }

    console.log("\n13. Pelo WhatsApp: sem remessa aberta, não inventa");
    {
      await clearPendingEvent(tenant.id, USUARIO);
      const r = await encerrarRemessaEvento(
        ctx(db, tenant.id, { evento: "Leilão que nunca existiu", vendidos: 5 }, { userId: USUARIO }),
      );
      check(
        "avisa que não achou a remessa, em vez de fechar outra",
        r.action_taken === "clarification_requested",
        r.action_taken,
      );
    }
  } finally {
    await clearPendingEvent(tenant.id, USUARIO);
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

comBanco()
  .then(() => {
    console.log(
      falhas === 0
        ? `\n✅ M48: leilão e eventos, 0 falhas.`
        : `\n❌ M48: ${falhas} falha(s).`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M48 quebrou:", erro);
    process.exit(1);
  });
