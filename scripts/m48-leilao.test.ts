import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

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

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { openEventConsignment } = await import("@/lib/actions/event-consignments");
  const { getPositions, recordMovement } = await import("@/lib/actions/herd-ledger");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M48 ${stamp}`, document: `M48${stamp}`.slice(0, 14), plan: "fazenda" },
  });
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
  } finally {
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
