import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { resolverValor } from "@/lib/actions/milk-sales";

exigirBancoLocal();

/**
 * Área Leite, fase 3 (Módulo 32, §23 a §30). Ver
 * docs/specs/module-32-area-leite.md, seção 13.
 *
 * Prova, por seção:
 *   1. §25 sem banco: o valor por litro vira total, o total passa direto, e os
 *      dois juntos são recusados.
 *   2. §23 a §26: vender JÁ retira o leite, e a receita nasce paga.
 *   3. §27: a prazo vira conta a receber, e com parcelas vira uma por data.
 *   4. Vender mais do que existe é recusado, e nada é gravado.
 *   5. §28 e §29: o fechamento soma as entregas do comprador, cria a venda e
 *      NÃO move leite.
 *   6. Fechar duas vezes o mesmo período não cobra duas vezes.
 *   7. Cancelar a venda avulsa DEVOLVE o leite e desfaz o dinheiro.
 *   8. Cancelar o fechamento solta a cobrança e MANTÉM as entregas, que voltam
 *      a ficar em aberto.
 *   9. O estorno da venda de leite é arquivado em `leite`, não em `geral`.
 *  10. §30: `doacao` existe como destino.
 *
 * Roda: `npm run test:m54`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🥛 M54: Área Leite, fase 3 (venda, fechamento, dinheiro)\n");

// ── 1. §25, sem banco ────────────────────────────────────────────────────

console.log("1. O cálculo do §25");

{
  const porLitro = resolverValor(1000, { price_per_liter: 2.4 });
  check(
    "1.000 litros a R$ 2,40 dão R$ 2.400,00 (o exemplo do §25)",
    porLitro.ok && porLitro.data === 2400,
    porLitro.ok ? String(porLitro.data) : porLitro.message,
  );

  const total = resolverValor(1000, { amount: 2400 });
  check("o total informado passa direto", total.ok && total.data === 2400);

  const nenhum = resolverValor(1000, {});
  check("sem nenhum dos dois é recusado", !nenhum.ok);
  check(
    "com o campo `amount`",
    !nenhum.ok && nenhum.field === "amount",
    nenhum.ok ? "" : String(nenhum.field),
  );

  const ambos = resolverValor(1000, { amount: 2400, price_per_liter: 2.4 });
  check("com OS DOIS é recusado, mesmo batendo", !ambos.ok);
  check(
    "com o código VALOR_DUPLICADO",
    !ambos.ok && ambos.code === "VALOR_DUPLICADO",
    ambos.ok ? "" : ambos.code,
  );

  const zero = resolverValor(1000, { amount: 0 });
  check("valor zero é recusado", !zero.ok);
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { createMilkSite } = await import("@/lib/actions/milk-sites");
  const { getMilkBalance } = await import("@/lib/actions/milk-ledger");
  const { storeProduction, withdrawFromSite } = await import("@/lib/actions/milk-storage");
  const { recordMilkSale, closeMilkPeriod, listPendingDeliveries } = await import(
    "@/lib/actions/milk-sales"
  );
  const { cancelNegotiation, getNegotiation } = await import("@/lib/actions/negotiations");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M54 ${stamp}`, document: `M54${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  const dia = (d: number) => new Date(`2026-09-${String(d).padStart(2, "0")}T15:00:00.000Z`);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M54" }) });
    const laticinio = await db.contact.create({
      data: scoped({ name: "Laticinio Boa Vida", type: "laticinio" }),
    });

    const tanqueR = await createMilkSite(db, {
      name: "Tanque M54",
      type: "proprio",
      property_id: fazenda.id,
    });
    if (!tanqueR.ok) throw new Error("tanque nao criado");
    const tanque = tanqueR.data.id;

    await storeProduction(db, { site_id: tanque, liters: 5000, occurred_at: dia(1) });

    // ── 2. §23 a §26: a venda paga ───────────────────────────────────────

    console.log("\n2. Vender JÁ retira o leite (§23), e a receita nasce paga (§26)");

    const venda = await recordMilkSale(db, {
      site_id: tanque,
      property_id: fazenda.id,
      liters: 500,
      price_per_liter: 2.4,
      buyer_id: laticinio.id,
      pago: true,
      occurred_at: dia(2),
    });
    check("a venda é aceita", venda.ok, venda.ok ? "" : venda.message);
    check(
      "o valor calculado é R$ 1.200,00",
      venda.ok && venda.data.amount === 1200,
      venda.ok ? String(venda.data.amount) : "",
    );
    check(
      "o leite saiu do tanque: 5000 - 500 = 4500",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === 4500,
    );
    check(
      "nasceu uma Negotiation de tipo `venda_leite`",
      (await db.negotiation.count({ where: { type: "venda_leite" } })) === 1,
    );
    const receita = await db.financialEntry.findFirst({
      where: { related_module: "leite", entry_type: "income" },
      select: { amount: true, status: true },
    });
    check(
      "e a receita de R$ 1.200,00 nasceu PAGA, sob `leite`",
      Number(receita?.amount) === 1200 && receita?.status === "paid",
      `${receita?.amount}/${receita?.status}`,
    );

    /**
     * A LEITURA DA TELA, e não só a escrita.
     *
     * Achado pela validação ao vivo em 2026-09-02: `ehVenda` não conhecia
     * `venda_leite`, então a situação procurava uma DESPESA num negócio cujo
     * lançamento é receita, e a tela de Negociações lia "sem dinheiro" e "Sem
     * venda" para uma venda de R$ 1.200,00 gravada certinho. O banco estava
     * correto o tempo todo: quem estava errado era a leitura.
     */
    if (venda.ok) {
      const detalhe = await getNegotiation(db, venda.data.negotiation_id);
      check(
        "a venda é lida como dinheiro que ENTRA",
        detalhe?.recebe_dinheiro === true,
        String(detalhe?.recebe_dinheiro),
      );
      check(
        "e a situação é `paga`, não `sem_valor`",
        detalhe?.situacao === "paga",
        String(detalhe?.situacao),
      );
      check(
        "com o principal de R$ 1.200,00",
        detalhe?.totais.principal === 1200,
        String(detalhe?.totais.principal),
      );
    }

    // ── 3. §27: a prazo ──────────────────────────────────────────────────

    console.log("\n3. A prazo vira conta a receber (§27)");

    const aPrazo = await recordMilkSale(db, {
      site_id: tanque,
      property_id: fazenda.id,
      liters: 1000,
      amount: 2400,
      buyer_id: laticinio.id,
      parcelas: [
        { due_date: dia(10), amount: 1200 },
        { due_date: dia(20), amount: 1200 },
      ],
      occurred_at: dia(3),
    });
    check("a venda a prazo é aceita", aPrazo.ok, aPrazo.ok ? "" : aPrazo.message);
    const pendentesFin = await db.financialEntry.findMany({
      where: { related_module: "leite", status: "pending" },
      select: { amount: true, due_date: true },
      orderBy: { due_date: "asc" },
    });
    check(
      "duas parcelas pendentes, uma por data",
      pendentesFin.length === 2 &&
        Number(pendentesFin[0].amount) === 1200 &&
        Number(pendentesFin[1].amount) === 1200,
      String(pendentesFin.length),
    );

    // ── 4. Vender mais do que existe ─────────────────────────────────────

    console.log("\n4. Vender mais do que existe é recusado");

    const saldoAntes = await getMilkBalance(db, { site_id: tanque, owner_id: null });
    const demais = await recordMilkSale(db, {
      site_id: tanque,
      property_id: fazenda.id,
      liters: 99999,
      price_per_liter: 2,
      occurred_at: dia(4),
    });
    check("recusado", !demais.ok);
    check(
      "com SALDO_INSUFICIENTE no campo `liters`",
      !demais.ok && demais.code === "SALDO_INSUFICIENTE" && demais.field === "liters",
      demais.ok ? "" : `${demais.code}/${demais.field}`,
    );
    check(
      "e o saldo não mudou",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === saldoAntes,
    );
    check(
      "nenhuma Negotiation órfã ficou para trás",
      (await db.negotiation.count({ where: { type: "venda_leite" } })) === 2,
    );

    // ── 5. §28 e §29: o fechamento ───────────────────────────────────────

    console.log("\n5. O fechamento por período soma as entregas (§28, §29)");

    for (const [d, litros] of [
      [11, 450],
      [12, 470],
      [13, 460],
    ] as const) {
      await withdrawFromSite(db, {
        site_id: tanque,
        destination: "laticinio",
        itens: [{ owner_id: null, liters: litros }],
        occurred_at: dia(d),
        buyer_id: laticinio.id,
      });
    }

    const emAberto = await listPendingDeliveries(db, { buyer_id: laticinio.id });
    check(
      "as três entregas somam 1.380 L em aberto",
      emAberto.length === 1 && emAberto[0].liters === 1380 && emAberto[0].entregas === 3,
      JSON.stringify(emAberto),
    );

    const saldoAntesDoFecho = await getMilkBalance(db, { site_id: tanque, owner_id: null });
    const fecho = await closeMilkPeriod(db, {
      buyer_id: laticinio.id,
      property_id: fazenda.id,
      de: dia(10),
      ate: dia(15),
      price_per_liter: 2.35,
      period_label: "1a quinzena",
    });
    check("o fechamento é aceito", fecho.ok, fecho.ok ? "" : fecho.message);
    check(
      "1.380 L a R$ 2,35 dão R$ 3.243,00",
      fecho.ok && fecho.data.amount === 3243,
      fecho.ok ? String(fecho.data.amount) : "",
    );
    check(
      "o fechamento NÃO moveu leite: o saldo é o mesmo",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === saldoAntesDoFecho,
    );
    check(
      "e as entregas saíram da lista de pendentes",
      (await listPendingDeliveries(db, { buyer_id: laticinio.id })).length === 0,
    );

    // ── 6. Fechar duas vezes ─────────────────────────────────────────────

    console.log("\n6. Fechar duas vezes o mesmo período não cobra duas vezes");

    const denovo = await closeMilkPeriod(db, {
      buyer_id: laticinio.id,
      property_id: fazenda.id,
      de: dia(10),
      ate: dia(15),
      price_per_liter: 2.35,
    });
    check("o segundo fechamento é recusado", !denovo.ok);
    check(
      "com SEM_ENTREGAS",
      !denovo.ok && denovo.code === "SEM_ENTREGAS",
      denovo.ok ? "" : denovo.code,
    );

    // ── 7. Cancelar a venda avulsa devolve o leite ───────────────────────

    console.log("\n7. Cancelar a venda DEVOLVE o leite (decisão 13.4)");

    const saldoAntesDoCancel = await getMilkBalance(db, { site_id: tanque, owner_id: null });
    const cancelou = await cancelNegotiation(
      db,
      venda.ok ? venda.data.negotiation_id : "",
      "lancado errado",
      "devolvido",
    );
    check("o cancelamento é aceito", cancelou.ok, cancelou.ok ? "" : cancelou.message);
    check(
      "os 500 L voltaram para o tanque",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === saldoAntesDoCancel + 500,
    );
    check(
      "a movimentação da venda foi CANCELADA, não apagada",
      (await db.milkMovement.count({
        where: { created_by_sale: true, canceled_at: { not: null } },
      })) === 1,
    );

    // ── 8. Cancelar o fechamento mantém as entregas ──────────────────────

    console.log("\n8. Cancelar o fechamento solta a cobrança e MANTÉM as entregas");

    const saldoAntesDoCancelFecho = await getMilkBalance(db, { site_id: tanque, owner_id: null });
    const cancelaFecho = await cancelNegotiation(
      db,
      fecho.ok ? fecho.data.negotiation_id : "",
      "preco errado",
      "devolvido",
    );
    check("o cancelamento do fechamento é aceito", cancelaFecho.ok);
    check(
      "o leite NÃO voltou: as entregas aconteceram de verdade",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) === saldoAntesDoCancelFecho,
    );
    const voltaram = await listPendingDeliveries(db, { buyer_id: laticinio.id });
    check(
      "e as três entregas voltaram a ficar EM ABERTO, somando 1.380 L",
      voltaram.length === 1 && voltaram[0].liters === 1380 && voltaram[0].entregas === 3,
      JSON.stringify(voltaram),
    );
    check(
      "nenhuma entrega foi cancelada por engano",
      (await db.milkMovement.count({
        where: { created_by_sale: false, canceled_at: { not: null } },
      })) === 0,
    );

    // ── 9. O estorno vai para a gaveta certa ─────────────────────────────

    console.log("\n9. O estorno da venda de leite fica sob `leite`");

    const estornos = await db.financialEntry.findMany({
      where: { negotiation_role: "estorno" },
      select: { related_module: true },
    });
    check(
      "existe estorno",
      estornos.length > 0,
      String(estornos.length),
    );
    check(
      "e TODO estorno está sob `leite`, não `geral`",
      estornos.every((e) => e.related_module === "leite"),
      estornos.map((e) => e.related_module).join(","),
    );

    // ── 10. §30: doação ──────────────────────────────────────────────────

    console.log("\n10. §30: o destino `doacao` existe");

    // Contar antes e depois é o que a afirmação quer dizer. Um número fixo
    // dependeria de quantos lançamentos as seções acima deixaram, e passaria
    // ou falharia por motivo que não é este.
    const lancamentosAntes = await db.financialEntry.count();
    const saldoAntesDaDoacao = await getMilkBalance(db, { site_id: tanque, owner_id: null });

    const doacao = await withdrawFromSite(db, {
      site_id: tanque,
      destination: "doacao",
      itens: [{ owner_id: null, liters: 10 }],
      occurred_at: dia(16),
    });
    check("doar é aceito", doacao.ok, doacao.ok ? "" : doacao.message);
    check(
      "o leite saiu: 10 L a menos",
      (await getMilkBalance(db, { site_id: tanque, owner_id: null })) ===
        saldoAntesDaDoacao - 10,
    );
    check(
      "e NENHUM lançamento financeiro novo nasceu",
      (await db.financialEntry.count()) === lancamentosAntes,
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

comBanco()
  .then(() => {
    console.log(
      falhas === 0
        ? `\n✅ M54: Área Leite, fase 3 (Módulo 32), 0 falhas.`
        : `\n❌ M54: ${falhas} falha(s).`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M54 quebrou:", erro);
    process.exit(1);
  });
