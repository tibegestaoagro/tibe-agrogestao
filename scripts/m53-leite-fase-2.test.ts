import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Área Leite, fase 2 (Módulo 32, §12 a §22). Ver
 * docs/specs/module-32-area-leite.md, seção 12.
 *
 * Prova, por seção:
 *   1. O cadastro do local (§13, §16): fazenda obrigatória no próprio,
 *      contraparte obrigatória no de terceiros.
 *   2. §14: a produção entra no tanque, e isso NÃO é venda.
 *   3. §16 e §17: o exemplo literal (800 no tanque, entrega 600, sobram 200 e
 *      600 ficam no ponto de coleta), com o leite continuando NOSSO.
 *   4. §19 e §20: o exemplo literal do tanque com três donos (próprio 400,
 *      João 300, Carlos 250, físico 950), separados.
 *   5. §21: a retirada informa a composição, dá baixa em cada dono, e uma
 *      retirada parcial deixa o resto.
 *   6. A retirada é TUDO OU NADA: um dono sem saldo derruba a operação
 *      inteira, sem gravar os donos anteriores.
 *   7. As recusas com `field`: saldo insuficiente, dono repetido, tipo de
 *      local errado.
 *   8. §22: a cobrança gera receita em `related_module: leite`, e cancelar
 *      cancela o lançamento JUNTO.
 *   9. Destino `venda` NÃO gera dinheiro nesta fase.
 *  10. Cancelar uma movimentação recalcula o saldo e mantém o histórico.
 *
 * Roda: `npm run test:m53`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🥛 M53: Área Leite, fase 2 (tanque, ponto de coleta, terceiros)\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { createMilkSite, listMilkSites, setMilkSiteArchived } = await import(
    "@/lib/actions/milk-sites"
  );
  const { getMilkPositions, getMilkBalance, cancelMilkMovement, getPhysicalVolumeBySite } =
    await import("@/lib/actions/milk-ledger");
  const {
    storeProduction,
    transferToCollectionPoint,
    receiveFromThirdParty,
    withdrawFromSite,
    recordMilkCharge,
    cancelMilkCharge,
    getMilkStorageSummary,
  } = await import("@/lib/actions/milk-storage");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M53 ${stamp}`, document: `M53${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M53" }) });
    const joao = await db.contact.create({ data: scoped({ name: "João M53" }) });
    const carlos = await db.contact.create({ data: scoped({ name: "Carlos M53" }) });

    // ── 1. O cadastro do local ───────────────────────────────────────────

    console.log("1. Cadastro de tanque e de ponto de coleta (§13, §16)");

    const semFazenda = await createMilkSite(db, { name: "Tanque", type: "proprio" });
    check("tanque próprio sem fazenda é recusado", !semFazenda.ok);
    check(
      "e a recusa aponta `property_id`",
      !semFazenda.ok && semFazenda.field === "property_id",
      semFazenda.ok ? "" : String(semFazenda.field),
    );

    const semDono = await createMilkSite(db, { name: "Ponto", type: "terceiro" });
    check("ponto de coleta sem contraparte é recusado", !semDono.ok);
    check(
      "e a recusa aponta `counterparty_name`",
      !semDono.ok && semDono.field === "counterparty_name",
      semDono.ok ? "" : String(semDono.field),
    );

    const tanqueR = await createMilkSite(db, {
      name: "Tanque Principal",
      type: "proprio",
      property_id: fazenda.id,
      capacity: 2000,
    });
    const pontoR = await createMilkSite(db, {
      name: "Ponto São José",
      type: "terceiro",
      counterparty_name: "Cooperativa São José",
    });
    check("tanque e ponto criados", tanqueR.ok && pontoR.ok);
    if (!tanqueR.ok || !pontoR.ok) throw new Error("cadastro falhou");
    const tanque = tanqueR.data.id;
    const ponto = pontoR.data.id;

    // ── 2. §14: a produção entra no tanque ───────────────────────────────

    console.log("\n2. A produção entra no tanque (§14), e não é venda (§37.5)");

    const guardar = await storeProduction(db, { site_id: tanque, liters: 800 });
    check("armazenar é aceito", guardar.ok, guardar.ok ? "" : guardar.message);
    check(
      "o tanque passa a ter 800 do dono próprio",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === 800,
    );
    check(
      "nenhum lançamento financeiro nasceu: guardar não é vender",
      (await db.financialEntry.count({ where: { related_module: "leite" } })) === 0,
    );

    const noPonto = await storeProduction(db, { site_id: ponto, liters: 10 });
    check("armazenar produção num ponto de TERCEIROS é recusado", !noPonto.ok);
    check(
      "com o código TIPO_DE_LOCAL_ERRADO",
      !noPonto.ok && noPonto.code === "TIPO_DE_LOCAL_ERRADO",
      noPonto.ok ? "" : noPonto.code,
    );

    // ── 3. §16 e §17: entrega em ponto de coleta ─────────────────────────

    console.log("\n3. O exemplo do §17: 800 no tanque, entrega 600");

    const transferir = await transferToCollectionPoint(db, {
      from_site_id: tanque,
      to_site_id: ponto,
      liters: 600,
    });
    check("a transferência é aceita", transferir.ok, transferir.ok ? "" : transferir.message);
    check(
      "sobram 200 no tanque próprio",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === 200,
    );
    check(
      "e 600 ficam no ponto de coleta, AINDA NOSSOS (dono nulo)",
      (await getMilkBalance(db, { site_id: ponto, owner_id: null })) === 600,
    );
    check(
      "o envio não gerou receita nenhuma (§17)",
      (await db.financialEntry.count({ where: { related_module: "leite" } })) === 0,
    );

    const doPonto = await transferToCollectionPoint(db, {
      from_site_id: ponto,
      to_site_id: tanque,
      liters: 10,
    });
    check("transferir DE um ponto de terceiros é recusado", !doPonto.ok);

    // ── 4. §19 e §20: leite de terceiros no mesmo tanque ─────────────────

    console.log("\n4. O exemplo do §20: três donos no mesmo tanque");

    // O §20 usa 400 próprio: o tanque tem 200, então mais 200 de produção.
    await storeProduction(db, { site_id: tanque, liters: 200 });
    await receiveFromThirdParty(db, { site_id: tanque, owner_id: joao.id, liters: 300 });
    await receiveFromThirdParty(db, { site_id: tanque, owner_id: carlos.id, liters: 250 });

    const noTanque = await getMilkPositions(db, { site_id: tanque });
    const porDono = new Map(noTanque.map((p) => [p.owner_id ?? "-", p.liters]));
    check("próprio: 400", porDono.get("-") === 400, String(porDono.get("-")));
    check("João: 300", porDono.get(joao.id) === 300, String(porDono.get(joao.id)));
    check("Carlos: 250", porDono.get(carlos.id) === 250, String(porDono.get(carlos.id)));

    const fisico = await getPhysicalVolumeBySite(db);
    check(
      "e o volume FÍSICO do tanque é 950, a soma dos três (§20)",
      fisico.get(tanque) === 950,
      String(fisico.get(tanque)),
    );

    const resumo = await getMilkStorageSummary(db);
    check(
      "o resumo do §34 separa meu tanque (400), meu ponto (600) e terceiros (550)",
      resumo.proprio_em_tanque === 400 &&
        resumo.proprio_em_ponto_de_coleta === 600 &&
        resumo.de_terceiros === 550,
      JSON.stringify(resumo),
    );
    check("e o físico total é 1550", resumo.fisico_total === 1550, String(resumo.fisico_total));

    // O leite de terceiro NÃO é produção própria (§19): a Área Leite fase 1
    // não registrou nada, e é isso que esta asserção guarda.
    check(
      "receber de terceiro não criou registro de produção (§19)",
      (await db.milkProduction.count()) === 0,
    );

    // ── 5. §21: a retirada com composição ────────────────────────────────

    console.log("\n5. A retirada informa a composição (§21)");

    const parcial = await withdrawFromSite(db, {
      site_id: tanque,
      destination: "laticinio",
      itens: [
        { owner_id: null, liters: 100 },
        { owner_id: joao.id, liters: 50 },
      ],
    });
    check("a retirada parcial é aceita", parcial.ok, parcial.ok ? "" : parcial.message);
    check(
      "gravou DUAS linhas, uma por dono",
      parcial.ok && parcial.data.length === 2,
      parcial.ok ? String(parcial.data.length) : "",
    );
    check(
      "próprio caiu para 300",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === 300,
    );
    check(
      "João caiu para 250",
      (await getMilkBalance(db, { site_id: tanque, owner_id: joao.id })) === 250,
    );
    check(
      "Carlos NÃO foi tocado: continua 250",
      (await getMilkBalance(db, { site_id: tanque, owner_id: carlos.id })) === 250,
    );

    // ── 6. A retirada é tudo ou nada ─────────────────────────────────────

    console.log("\n6. A retirada é TUDO OU NADA");

    const antes = await getMilkPositions(db, { site_id: tanque });
    const estourada = await withdrawFromSite(db, {
      site_id: tanque,
      destination: "laticinio",
      itens: [
        { owner_id: null, liters: 300 },
        // Carlos tem 250: esta linha derruba a operação inteira.
        { owner_id: carlos.id, liters: 999 },
      ],
    });
    check("a retirada com um dono sem saldo é recusada", !estourada.ok);
    check(
      "com SALDO_INSUFICIENTE no campo `liters`",
      !estourada.ok && estourada.code === "SALDO_INSUFICIENTE" && estourada.field === "liters",
      estourada.ok ? "" : `${estourada.code}/${estourada.field}`,
    );
    const depois = await getMilkPositions(db, { site_id: tanque });
    check(
      "e NADA foi gravado: o dono da primeira linha continua com 300",
      JSON.stringify(antes) === JSON.stringify(depois),
      JSON.stringify(depois),
    );

    const repetido = await withdrawFromSite(db, {
      site_id: tanque,
      destination: "laticinio",
      itens: [
        { owner_id: joao.id, liters: 10 },
        { owner_id: joao.id, liters: 10 },
      ],
    });
    check("dono repetido na retirada é recusado", !repetido.ok);
    check(
      "com o código DONO_REPETIDO",
      !repetido.ok && repetido.code === "DONO_REPETIDO",
      repetido.ok ? "" : repetido.code,
    );

    // ── 7. Destino venda não gera dinheiro nesta fase ────────────────────

    console.log("\n7. Destino `venda` não gera dinheiro (fase 3 faz isso)");

    await withdrawFromSite(db, {
      site_id: tanque,
      destination: "venda",
      itens: [{ owner_id: null, liters: 50 }],
    });
    check(
      "a saída por venda reduziu o saldo para 250",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === 250,
    );
    check(
      "e NENHUM lançamento financeiro nasceu",
      (await db.financialEntry.count({ where: { related_module: "leite" } })) === 0,
    );

    // ── 8. §22: a cobrança e o Financeiro ────────────────────────────────

    console.log("\n8. A cobrança do §22 alimenta o Financeiro");

    const cobranca = await recordMilkCharge(db, {
      owner_id: joao.id,
      type: "por_litro",
      amount: 250,
      period_label: "agosto/2026",
    });
    check("a cobrança é aceita", cobranca.ok, cobranca.ok ? "" : cobranca.message);
    check(
      "e gerou um lançamento em `related_module: leite`",
      (await db.financialEntry.count({
        where: { related_module: "leite", entry_type: "income" },
      })) === 1,
    );
    if (cobranca.ok) {
      const lancamento = await db.financialEntry.findFirst({
        where: { id: cobranca.data.financial_entry_id ?? "" },
        select: { amount: true, status: true, entry_type: true },
      });
      check("com o valor DIGITADO, 250", Number(lancamento?.amount) === 250, String(lancamento?.amount));
      check("como receita paga", lancamento?.entry_type === "income" && lancamento?.status === "paid");

      const cancelada = await cancelMilkCharge(db, cobranca.data.id);
      check("cancelar a cobrança é aceito", cancelada.ok);
      const depoisDoCancel = await db.financialEntry.findFirst({
        where: { id: cobranca.data.financial_entry_id ?? "" },
        select: { status: true },
      });
      check(
        "e o LANÇAMENTO foi cancelado junto: o erro do confinamento de 31/08",
        depoisDoCancel?.status === "cancelled",
        String(depoisDoCancel?.status),
      );
      check(
        "o lançamento não foi apagado: o DRE do mês continua contando a história",
        depoisDoCancel !== null,
      );
      check("cancelar de novo é recusado", !(await cancelMilkCharge(db, cobranca.data.id)).ok);
    }

    // ── 9. Cancelar movimentação recalcula ───────────────────────────────

    console.log("\n9. Cancelar movimentação recalcula o saldo (§37.11)");

    const entrada = await receiveFromThirdParty(db, {
      site_id: tanque,
      owner_id: carlos.id,
      liters: 90,
    });
    check(
      "Carlos sobe para 340",
      (await getMilkBalance(db, { site_id: tanque, owner_id: carlos.id })) === 340,
    );
    if (entrada.ok) {
      const cancelado = await cancelMilkMovement(db, entrada.data.id);
      check("o cancelamento é aceito", cancelado.ok);
      check(
        "e Carlos volta para 250",
        (await getMilkBalance(db, { site_id: tanque, owner_id: carlos.id })) === 250,
      );
      check(
        "a movimentação continua no banco, marcada",
        (await db.milkMovement.count({
          where: { id: entrada.data.id, canceled_at: { not: null } },
        })) === 1,
      );
      check("cancelar de novo é recusado", !(await cancelMilkMovement(db, entrada.data.id)).ok);
    }

    // ── 10. Posição zerada some, e o arquivamento não esconde saldo ──────

    console.log("\n10. Posição zerada some da lista, e arquivar não esconde leite");

    const vazio = await createMilkSite(db, {
      name: "Tanque Vazio",
      type: "proprio",
      property_id: fazenda.id,
    });
    if (vazio.ok) {
      await storeProduction(db, { site_id: vazio.data.id, liters: 40 });
      await withdrawFromSite(db, {
        site_id: vazio.data.id,
        destination: "descarte",
        itens: [{ owner_id: null, liters: 40 }],
      });
      check(
        "o local que zerou não aparece mais nas posições",
        (await getMilkPositions(db, { site_id: vazio.data.id })).length === 0,
      );
    }

    await setMilkSiteArchived(db, tanque, true);
    check(
      "arquivar o tanque é aceito mesmo com leite dentro",
      (await listMilkSites(db, { include_archived: true })).some(
        (s) => s.id === tanque && s.archived_at !== null,
      ),
    );
    check(
      "e o saldo continua visível: o leite não sumiu porque o local foi arquivado",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === 250,
    );
    const emTanqueArquivado = await storeProduction(db, { site_id: tanque, liters: 10 });
    check("mas o local arquivado não aceita entrada nova", !emTanqueArquivado.ok);
    check(
      "com o código SITE_ARCHIVED",
      !emTanqueArquivado.ok && emTanqueArquivado.code === "SITE_ARCHIVED",
      emTanqueArquivado.ok ? "" : emTanqueArquivado.code,
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

comBanco()
  .then(() => {
    console.log(
      falhas === 0
        ? `\n✅ M53: Área Leite, fase 2 (Módulo 32), 0 falhas.`
        : `\n❌ M53: ${falhas} falha(s).`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M53 quebrou:", erro);
    process.exit(1);
  });
