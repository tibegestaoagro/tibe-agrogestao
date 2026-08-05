import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { getPositions, recordMovement } from "@/lib/actions/herd-ledger";

/**
 * Módulo 30, tarefa 3: o livro-razão em si.
 *
 * `getPositions` soma as movimentações não canceladas por posição
 * (categoria x fazenda x pasto x situação x dono); `recordMovement` valida e
 * grava, usando `getPositions` para bloquear saldo negativo (§10.3).
 *
 * Roda: `npm run test:m33`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("📒 Módulo 30: livro-razão do rebanho (getPositions + recordMovement)\n");

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M33 Ledger", document: `33${stamp}0`, plan: "fazenda" },
  });

  try {
    const db = prismaForTenant(tenant.id);
    const propA = await db.property.create({ data: scoped({ name: "Fazenda A" }) });
    const propB = await db.property.create({ data: scoped({ name: "Fazenda B" }) });
    const pastoSede = await db.pasture.create({
      data: scoped({ property_id: propA.id, name: "Pasto da Sede", area_hectares: 10 }),
    });
    const pastoBaixada = await db.pasture.create({
      data: scoped({ property_id: propA.id, name: "Pasto da Baixada", area_hectares: 8 }),
    });

    console.log("1. getPositions com o livro vazio");
    const vazio = await getPositions(db);
    assert(vazio.length === 0, "nenhuma posição sem movimentação nenhuma");

    console.log("\n2. saldo_inicial (§10, §16 critério 1)");
    const inicial = await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 18,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-01"),
    });
    assert(inicial.ok, `saldo inicial registrado (${!inicial.ok ? inicial.message : ""})`);

    const posInicial = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    assert(
      posInicial.length === 1 && posInicial[0].quantity === 18,
      `posição reflete os 18 do saldo inicial (obtido: ${JSON.stringify(posInicial)})`,
    );

    console.log("\n3. compra soma, e gera FinancialEntry quando há valor (§10, decisão 7)");
    const compra = await recordMovement(db, {
      movement_type: "compra",
      quantity: 5,
      value: 15000,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-05"),
    });
    assert(compra.ok, "compra registrada");
    if (compra.ok) {
      assert(compra.data.financial_entry_id !== null, "compra com valor gera lançamento financeiro");
      const entry = await db.financialEntry.findFirst({ where: { id: compra.data.financial_entry_id! } });
      assert(
        !!entry && entry.entry_type === "expense" && Number(entry.amount) === 15000,
        "lançamento é despesa de 15000",
      );
    }

    const posAposCompra = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    assert(posAposCompra[0]?.quantity === 23, `18 + 5 = 23 (obtido: ${posAposCompra[0]?.quantity})`);

    console.log("\n4. nascimento não gera financeiro (§10.4)");
    const nascimento = await recordMovement(db, {
      movement_type: "nascimento",
      quantity: 3,
      to: {
        category_id: "bezerra_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-10"),
    });
    assert(nascimento.ok && nascimento.data.financial_entry_id === null, "nascimento sem lançamento financeiro");

    console.log("\n5. venda reduz e bloqueia saldo negativo (§10.3, critério 14)");
    const vendaOk = await recordMovement(db, {
      movement_type: "venda",
      quantity: 4,
      value: 8000,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-15"),
    });
    assert(vendaOk.ok, "venda dentro do saldo é aceita");
    const posAposVenda = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    assert(posAposVenda[0]?.quantity === 19, `23 - 4 = 19 (obtido: ${posAposVenda[0]?.quantity})`);

    const vendaDemais = await recordMovement(db, {
      movement_type: "venda",
      quantity: 100,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-16"),
    });
    assert(!vendaDemais.ok, "venda de 100 quando só há 19 é recusada");
    assert(
      !vendaDemais.ok && vendaDemais.message === "Existem apenas 19 animais nesta categoria. Revise a quantidade informada.",
      `mensagem é a literal do cliente com o número certo (obtida: "${!vendaDemais.ok ? vendaDemais.message : ""}")`,
    );
    const posAposRecusa = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    assert(
      posAposRecusa[0]?.quantity === 19,
      "a tentativa recusada não gravou nada (saldo continua 19)",
    );

    console.log("\n6. morte reduz sem financeiro (§10.5)");
    const morte = await recordMovement(db, {
      movement_type: "morte",
      quantity: 1,
      reason: "doenca",
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-20"),
    });
    assert(morte.ok && morte.data.financial_entry_id === null, "morte registrada sem lançamento financeiro");

    console.log("\n7. transferência entre pastos não muda o total (§8.5)");
    const transferPasto = await recordMovement(db, {
      movement_type: "transferencia_pasto",
      quantity: 10,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: pastoBaixada.id,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-21"),
    });
    assert(transferPasto.ok, "transferência entre pastos aceita");
    const totalFazendaDepoisTransfPasto = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    const totalNaFazenda = totalFazendaDepoisTransfPasto.reduce((s, p) => s + p.quantity, 0);
    assert(totalNaFazenda === 18, `total na fazenda inalterado (18, obtido: ${totalNaFazenda})`);
    const noPastoBaixada = totalFazendaDepoisTransfPasto.find((p) => p.pasture_id === pastoBaixada.id);
    assert(noPastoBaixada?.quantity === 10, `10 animais no Pasto da Baixada (obtido: ${noPastoBaixada?.quantity})`);

    console.log("\n8. transferência entre fazendas não muda o total geral (§8.6)");
    const transferFazenda = await recordMovement(db, {
      movement_type: "transferencia_fazenda",
      quantity: 6,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      to: {
        category_id: "bezerro_0_7",
        property_id: propB.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-22"),
    });
    assert(transferFazenda.ok, "transferência entre fazendas aceita");
    const totalGeral = await getPositions(db, {
      category_id: "bezerro_0_7",
      situation: "presente",
      owner: "proprio",
    });
    const somaGeral = totalGeral.reduce((s, p) => s + p.quantity, 0);
    assert(somaGeral === 18, `total geral inalterado (18, obtido: ${somaGeral})`);

    console.log("\n9. mudança de categoria não muda o total (§9)");
    const mudancaCategoria = await recordMovement(db, {
      movement_type: "mudanca_categoria",
      quantity: 2,
      from: {
        category_id: "bezerra_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      to: {
        category_id: "femea_8_12",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-02-01"),
    });
    assert(mudancaCategoria.ok, "mudança de categoria aceita");
    const femea812 = await getPositions(db, { category_id: "femea_8_12", property_id: propA.id });
    assert(femea812[0]?.quantity === 2, `2 animais migraram para Fêmea 8-12 (obtido: ${femea812[0]?.quantity})`);
    const bezerra07 = await getPositions(db, { category_id: "bezerra_0_7", property_id: propA.id });
    assert(bezerra07[0]?.quantity === 1, `sobrou 1 em Bezerra 0-7 (3 - 2, obtido: ${bezerra07[0]?.quantity})`);

    console.log("\n10. ajuste de saldo, histórico preservado (§8.7, critério 12)");
    const ajuste = await recordMovement(db, {
      movement_type: "ajuste",
      quantity: 2,
      reason: "contagem fisica",
      notes: "sistema mostrava 2 a mais",
      from: {
        category_id: "femea_8_12",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(ajuste.ok, "ajuste negativo registrado");
    const femea812AposAjuste = await getPositions(db, { category_id: "femea_8_12", property_id: propA.id });
    assert(
      (femea812AposAjuste[0]?.quantity ?? 0) === 0,
      `ajuste levou a posição a 0 (obtido: ${femea812AposAjuste[0]?.quantity})`,
    );
    const historico = await db.herdMovement.findMany({ where: { movement_type: "ajuste" } });
    assert(historico.length === 1 && historico[0].reason === "contagem fisica", "ajuste fica no histórico com o motivo");

    console.log("\n11. cancelar não conta mais no saldo, mas fica no histórico (§10.8)");
    const paraCancel = await recordMovement(db, {
      movement_type: "compra",
      quantity: 7,
      to: {
        category_id: "macho_8_12",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(paraCancel.ok, "compra a ser cancelada é registrada normalmente");
    if (paraCancel.ok) {
      const antes = await getPositions(db, { category_id: "macho_8_12", property_id: propA.id });
      assert(antes[0]?.quantity === 7, "antes de cancelar, os 7 contam no saldo");
      await db.herdMovement.update({
        where: { id: paraCancel.data.id },
        data: { canceled_at: new Date(), canceled_reason: "lançado errado" },
      });
      const depois = await getPositions(db, { category_id: "macho_8_12", property_id: propA.id });
      assert(
        (depois[0]?.quantity ?? 0) === 0,
        `cancelada, a movimentação some do saldo (obtido: ${depois[0]?.quantity})`,
      );
      const aindaExiste = await db.herdMovement.findUnique({ where: { id: paraCancel.data.id } });
      assert(!!aindaExiste, "a linha cancelada continua no histórico, não é apagada");
    }

    console.log("\n12. validações de forma por tipo de movimentação (§10.1, §10.2)");
    const semQuantidadeInteira = await recordMovement(db, {
      movement_type: "compra",
      quantity: 2.5,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!semQuantidadeInteira.ok, "quantidade não inteira é recusada (§10.1)");

    const semQuantidadePositiva = await recordMovement(db, {
      movement_type: "compra",
      quantity: 0,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!semQuantidadePositiva.ok, "quantidade zero é recusada (§10.2)");

    const vendaSemOrigem = await recordMovement(db, {
      movement_type: "venda",
      quantity: 1,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!vendaSemOrigem.ok, "venda sem origem (só destino) é recusada, forma errada");

    const compraComOrigem = await recordMovement(db, {
      movement_type: "compra",
      quantity: 1,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!compraComOrigem.ok, "compra com origem é recusada, entrada não tem origem");

    const transferenciaSemDestino = await recordMovement(db, {
      movement_type: "transferencia_pasto",
      quantity: 1,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!transferenciaSemDestino.ok, "transferência sem destino é recusada");

    const ajusteComOsDois = await recordMovement(db, {
      movement_type: "ajuste",
      quantity: 1,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!ajusteComOsDois.ok, "ajuste com origem E destino ao mesmo tempo é recusado");

    console.log("\n13. categoria e propriedade inválidas são recusadas");
    const categoriaInvalida = await recordMovement(db, {
      movement_type: "compra",
      quantity: 1,
      to: {
        category_id: "boi_gordo_inexistente",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!categoriaInvalida.ok, "categoria que não está na constante das 12 é recusada");

    const propriedadeInvalida = await recordMovement(db, {
      movement_type: "compra",
      quantity: 1,
      to: {
        category_id: "bezerro_0_7",
        property_id: "propriedade-que-nao-existe",
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!propriedadeInvalida.ok, "propriedade que não existe no tenant é recusada");

    console.log("\n14. dono e situação (fase 2 nasce agora, §2 do módulo)");
    const terceiro = await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 4,
      to: {
        category_id: "macho_36_mais",
        property_id: propA.id,
        pasture_id: pastoSede.id,
        situation: "presente",
        owner: "terceiro",
      },
    });
    assert(terceiro.ok, "posição de animal de terceiro é aceita");
    const proprioPresente = await getPositions(db, { property_id: propA.id, situation: "presente", owner: "proprio" });
    const terceiroPresente = await getPositions(db, { property_id: propA.id, situation: "presente", owner: "terceiro" });
    assert(
      terceiroPresente.some((p) => p.category_id === "macho_36_mais" && p.quantity === 4),
      "rebanho de terceiro não se mistura ao próprio na mesma posição",
    );
    assert(
      !proprioPresente.some((p) => p.category_id === "macho_36_mais"),
      "o próprio não ganha os 4 de terceiro",
    );

    console.log("\n15. isolamento multi-tenant continua valendo");
    const tenantB = await prisma.tenant.create({
      data: { name: "M33 Ledger B", document: `33${stamp}1`, plan: "fazenda" },
    });
    try {
      const dbB = prismaForTenant(tenantB.id);
      const posicoesTenantB = await getPositions(dbB);
      assert(posicoesTenantB.length === 0, "tenant B não enxerga nenhuma posição do tenant A");
    } finally {
      await prisma.tenant.deleteMany({ where: { id: tenantB.id } });
    }
  } finally {
    await prisma.herdMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.financialEntry.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.pasture.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.property.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }

  console.log("");
  if (failures === 0) {
    console.log("✅ Livro-razão do rebanho: 0 falhas.");
  } else {
    console.error(`❌ Livro-razão do rebanho: ${failures} falha(s).`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
