import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Confinamento: custo avulso e os destinos de saída (dívida 2.8).
 * Spec: docs/superpowers/specs/2026-09-14-confinamento-custos-e-saidas.md.
 *
 * A numeração de suíte não bate com a de módulo: esta cobre o confinamento
 * (Módulo 30, fase 3), que a `m51` testa desde a origem.
 *
 * Roda: `npm run test:m66`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🐂 M66: confinamento, custo avulso e destinos de saída\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { recordMovement, getPositions } = await import("@/lib/actions/herd-ledger");
  const { closeStay, listStays } = await import("@/lib/actions/herd-stays");
  const { createConfinementSite, openConfinementStay, recordConfinementCost, getConfinementLotSummary } =
    await import("@/lib/actions/confinement");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M66 ${stamp}`, document: `M66${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M66" }) });
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto M66", area_hectares: 40 }),
    });
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 500,
      to: { category_id: "macho_25_36", property_id: fazenda.id, pasture_id: pasto.id, situation: "presente", owner: "proprio" },
    });
    const site = await createConfinementSite(db, { name: "Confinamento M66", type: "proprio", property_id: fazenda.id });
    if (!site.ok) throw new Error(`site: ${site.message}`);

    const abrirLote = async (quantity: number) => {
      const r = await openConfinementStay(db, {
        confinement_site_id: site.data.id,
        category_id: "macho_25_36",
        quantity,
        pasture_id: pasto.id,
      });
      if (!r.ok) throw new Error(`lote: ${r.message}`);
      return r.data.id;
    };

    console.log("1. Custo avulso do lote entra no custo acumulado (§13, §14)");
    {
      const lote = await abrirLote(40);
      const semVencimento = await recordConfinementCost(db, { stay_id: lote, category: "Ração", amount: 3000 });
      check(
        "a prazo sem vencimento é recusado no campo due_date",
        !semVencimento.ok && semVencimento.code === "VENCIMENTO_OBRIGATORIO" && semVencimento.field === "due_date",
        semVencimento.ok ? "aceitou" : semVencimento.code,
      );

      const aPrazo = await recordConfinementCost(db, {
        stay_id: lote,
        category: "Ração",
        amount: 3000,
        due_date: new Date(Date.now() + 10 * 86_400_000),
      });
      const pago = await recordConfinementCost(db, { stay_id: lote, category: "Frete", amount: 450.5, pago: true });
      check("a prazo com vencimento é aceito", aPrazo.ok, aPrazo.ok ? "" : aPrazo.message);
      check("pago é aceito", pago.ok, pago.ok ? "" : pago.message);

      const resumo = await getConfinementLotSummary(db, lote);
      check(
        "o custo acumulado soma os dois: 3.450,50",
        resumo.ok && resumo.data.financial_cost === 3450.5,
        resumo.ok ? String(resumo.data.financial_cost) : resumo.message,
      );

      if (pago.ok) {
        const entry = await db.financialEntry.findFirst({ where: { id: pago.data.id }, include: { payments: true } });
        check(
          "o pago nasce quitado, com o pagamento junto, na fazenda do lote",
          entry?.status === "paid" && entry.payments.length === 1 && entry.property_id === fazenda.id,
          JSON.stringify({ status: entry?.status, pagamentos: entry?.payments.length, fazenda: entry?.property_id }),
        );
      }

      const semLote = await recordConfinementCost(db, { stay_id: "nao-existe", category: "Ração", amount: 10, pago: true });
      check("lote inexistente é recusado", !semLote.ok && semLote.code === "NOT_FOUND");
    }

    const fazendaB = await db.property.create({ data: scoped({ name: "Fazenda B M66" }) });
    const pastoB = await db.pasture.create({
      data: scoped({ property_id: fazendaB.id, name: "Pasto B M66", area_hectares: 30 }),
    });
    const naPosicao = async (filtro: Parameters<typeof getPositions>[1]) =>
      (await getPositions(db, filtro)).reduce((s, p) => s + p.quantity, 0);
    const saldoDoLote = async (id: string | undefined) => {
      const r = await listStays(db, {});
      return r.ok ? r.data.find((s) => s.id === id)?.saldo_aberto : undefined;
    };

    console.log("\n2. Transferência para outra fazenda (§17)");
    {
      const lote = await abrirLote(20);
      const r = await closeStay(db, lote, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 20, property_id: fazendaB.id, pasture_id: pastoB.id }],
      });
      check("o encerramento é aceito", r.ok, r.ok ? "" : r.message);
      check(
        "as 20 cabeças estão no pasto da Fazenda B, e não na fazenda de abertura",
        (await naPosicao({ property_id: fazendaB.id, pasture_id: pastoB.id, situation: "presente" })) === 20,
      );

      const lote2 = await abrirLote(5);
      const pastoErrado = await closeStay(db, lote2, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 5, property_id: fazendaB.id, pasture_id: pasto.id }],
      });
      check("pasto de outra fazenda é recusado", !pastoErrado.ok, pastoErrado.ok ? "aceitou" : pastoErrado.code);

      const fazendaNaVenda = await closeStay(db, lote2, {
        destinos: [{ movement_type: "morte", quantity: 1, property_id: fazendaB.id }],
      });
      check(
        "fazenda de destino numa morte é recusada, e não ignorada",
        !fazendaNaVenda.ok && fazendaNaVenda.field === "movement_type",
        fazendaNaVenda.ok ? "aceitou" : fazendaNaVenda.code,
      );
    }

    console.log("\n3. Outro destino sai do rebanho, com motivo (§17)");
    {
      const lote = await abrirLote(10);
      const semMotivo = await closeStay(db, lote, { destinos: [{ movement_type: "ajuste", quantity: 2 }] });
      check("sem motivo é recusado no campo reason", !semMotivo.ok && semMotivo.field === "reason");

      const proprioAntes = await naPosicao({ owner: "proprio" });
      const r = await closeStay(db, lote, {
        destinos: [{ movement_type: "ajuste", quantity: 2, reason: "Doados ao vizinho" }],
      });
      check("com motivo é aceito", r.ok, r.ok ? "" : r.message);
      check("o rebanho próprio cai 2", (await naPosicao({ owner: "proprio" })) === proprioAntes - 2);
      const mov = await db.herdMovement.findFirst({ where: { stay_id: lote, movement_type: "ajuste" } });
      check("o motivo fica no histórico", mov?.reason === "Doados ao vizinho", String(mov?.reason));
    }

    console.log("\n4. Venda do lote vira negociação, com comprador (§19)");
    {
      const lote = await abrirLote(15);
      const r = await closeStay(db, lote, {
        destinos: [
          {
            movement_type: "venda",
            quantity: 15,
            value: 90000,
            contact_name: "Frigorifico Boa Carne",
            due_date: new Date(Date.now() + 15 * 86_400_000),
          },
        ],
      });
      check("a venda é aceita", r.ok, r.ok ? "" : r.message);
      const mov = await db.herdMovement.findFirst({ where: { stay_id: lote, movement_type: "venda" } });
      const negociacao = mov?.negotiation_id
        ? await db.negotiation.findFirst({ where: { id: mov.negotiation_id }, include: { contact: true } })
        : null;
      check(
        "a movimentação aponta para uma negociação de venda de gado",
        negociacao?.type === "venda_gado",
        String(negociacao?.type),
      );
      check("com o comprador informado", negociacao?.contact?.name === "Frigorifico Boa Carne", String(negociacao?.contact?.name));
      const receitas = await db.financialEntry.findMany({ where: { entry_type: "income", amount: 90000 } });
      check(
        "UMA receita de 90.000, da negociação, e não uma segunda pelo livro-razão",
        receitas.length === 1 && receitas[0].negotiation_id === negociacao?.id,
        `${receitas.length} receita(s)`,
      );
      check(
        "a receita vence na data combinada",
        receitas[0]?.status === "pending" && receitas[0]?.due_date != null && receitas[0].due_date.getTime() > Date.now(),
      );
    }

    console.log("\n5. Outro confinamento abre lote novo lá, na mesma operação");
    {
      const siteB = await createConfinementSite(db, { name: "Confinamento B M66", type: "proprio", property_id: fazendaB.id });
      if (!siteB.ok) throw new Error(`siteB: ${siteB.message}`);
      const lote = await abrirLote(12);

      const mesmo = await closeStay(db, lote, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 12, confinement_site_id: site.data.id }],
      });
      check("o mesmo confinamento é recusado", !mesmo.ok && mesmo.code === "MESMO_CONFINAMENTO");

      const confinadosAntes = await naPosicao({ situation: "confinamento" });
      const r = await closeStay(db, lote, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 12, confinement_site_id: siteB.data.id }],
      });
      check("a transferência é aceita", r.ok && r.data.encerrada, r.ok ? JSON.stringify(r.data) : r.message);
      const novo = await db.herdStay.findFirst({ where: { confinement_site_id: siteB.data.id } });
      const saldoNovo = await saldoDoLote(novo?.id);
      check("um lote novo abriu no Confinamento B com as 12 cabeças", saldoNovo === 12, String(saldoNovo));
      check(
        "o total confinado não mudou: as cabeças nunca ficaram fora do confinamento",
        (await naPosicao({ situation: "confinamento" })) === confinadosAntes,
      );
      check("e na fazenda do confinamento B", novo?.property_id === fazendaB.id);
    }

    console.log("\n6. Leilão ou feira abre a remessa de evento (Módulo 31, missão 3)");
    {
      const lote = await abrirLote(8);
      const r = await closeStay(db, lote, {
        destinos: [
          {
            movement_type: "retorno_estadia",
            quantity: 8,
            evento: { event_name: "Leilao de Primavera", organizer_name: "Leiloeira Sul" },
          },
        ],
      });
      check("o encerramento é aceito", r.ok, r.ok ? "" : r.message);
      const remessa = await db.herdStay.findFirst({ where: { type: "evento", location_name: "Leilao de Primavera" } });
      check("a remessa existe, filha de uma negociação de evento", remessa?.negotiation_id != null);
      check("as 8 cabeças estão no evento", (await naPosicao({ situation: "evento" })) === 8);
      const receitaNoEnvio = remessa?.negotiation_id
        ? await db.financialEntry.count({ where: { negotiation_id: remessa.negotiation_id } })
        : -1;
      check("e nenhuma receita nasceu no envio (§17.8)", receitaNoEnvio === 0, String(receitaNoEnvio));
    }

    console.log("\n7. Atomicidade: falha no destino não tira cabeça nenhuma do lote");
    {
      const lote = await abrirLote(6);
      const r = await closeStay(db, lote, {
        destinos: [
          { movement_type: "morte", quantity: 1 },
          { movement_type: "retorno_estadia", quantity: 5, confinement_site_id: "site-que-nao-existe" },
        ],
      });
      check("o destino inválido recusa o encerramento", !r.ok && r.code === "INVALID_CONFINEMENT_SITE");
      const aberto = await saldoDoLote(lote);
      check("e a morte do primeiro destino também não foi gravada", aberto === 6, String(aberto));
    }
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

comBanco()
  .then(() => {
    console.log(falhas === 0 ? `\n✅ M66: 0 falhas.` : `\n❌ M66: ${falhas} falha(s).`);
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M66 quebrou:", erro);
    process.exit(1);
  });
