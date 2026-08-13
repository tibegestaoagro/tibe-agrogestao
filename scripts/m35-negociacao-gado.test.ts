import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { getPositions, recordMovement } from "@/lib/actions/herd-ledger";
import {
  cancelNegotiation,
  createCattleNegotiation,
  getNegotiation,
  listNegotiations,
} from "@/lib/actions/negotiations";

/**
 * Área Negociações, missão 1: negócio de gado.
 *
 * A decisão central que este teste protege: a Negociação é um ENVELOPE, não a
 * fonte da verdade. O saldo do rebanho continua sendo a soma de HerdMovement e
 * o dinheiro continua em FinancialEntry; a negociação amarra os dois e guarda o
 * que é comercial. Se algum dia alguém gravar saldo aqui, os testes de soma
 * abaixo quebram.
 *
 * Roda: `npm run test:m35`
 */

let falhas = 0;
/**
 * Ordem `(condição, nome)`, igual ao `assert` de m33 e m34. Escrevi este
 * helper na ordem inversa por engano e 42 das 43 verificações passaram a
 * receber uma string não vazia como condição, ou seja, passavam SEMPRE, sem
 * verificar nada. Quem pegou foi o `tsc`.
 */
function check(cond: boolean, nome: string, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.error(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  console.log("🤝 Negociações, missão 1: negócio de gado\n");

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M35 Negoc", document: `35${stamp}0`, plan: "fazenda" },
  });

  try {
    const db = prismaForTenant(tenant.id);
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda Boa Sorte" }) });
    const contato = await db.contact.create({
      data: scoped({ name: "João da Ponte", type: "fazendeiro", city: "Unaí" }),
    });

    // Saldo de partida, para as vendas terem de onde sair.
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 50,
      to: {
        category_id: "femea_36_mais",
        property_id: fazenda.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-01"),
    });

    const saldoDe = async (categoria: string) => {
      const pos = await getPositions(db, {
        category_id: categoria,
        property_id: fazenda.id,
        owner: "proprio",
      });
      return pos.reduce((s, p) => s + p.quantity, 0);
    };

    console.log("1. §6: compra de gado à vista");
    const compra = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      contact_id: contato.id,
      itens: [{ category_id: "bezerro_0_7", quantity: 20 }],
      amount: 60000,
      pago: true,
      occurred_at: new Date("2026-02-01"),
    });
    check(compra.ok, "compra registrada", !compra.ok ? compra.message : "");
    if (!compra.ok) throw new Error("sem a compra o resto não faz sentido");

    check(
      (await saldoDe("bezerro_0_7")) === 20,
      "os 20 bezerros entraram no rebanho (§6.4)",
      String(await saldoDe("bezerro_0_7")),
    );

    const detalheCompra = await getNegotiation(db, compra.data.id);
    check(detalheCompra?.movimentos.length === 1, "a negociação aponta para 1 movimento");
    check(
      detalheCompra?.movimentos[0]?.movement_type === "compra",
      "o movimento é do tipo compra",
    );
    check(detalheCompra?.lancamentos.length === 1, "gerou 1 lançamento financeiro");
    check(
      detalheCompra?.lancamentos[0]?.entry_type === "expense" &&
        detalheCompra.lancamentos[0].status === "paid",
      "despesa, e já paga porque o pagamento foi à vista (§6.3)",
    );
    check(detalheCompra?.situacao === "paga", `situação derivada = paga (obtida: ${detalheCompra?.situacao})`);

    console.log("\n2. §6.3 e §14: compra a prazo, em parcelas");
    const aPrazo = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "macho_13_24", quantity: 10 }],
      amount: 45000,
      pago: false,
      parcelas: [
        { due_date: new Date("2026-03-10"), amount: 15000 },
        { due_date: new Date("2026-04-10"), amount: 15000 },
        { due_date: new Date("2026-05-10"), amount: 15000 },
      ],
      occurred_at: new Date("2026-02-10"),
    });
    check(aPrazo.ok, "compra a prazo registrada", !aPrazo.ok ? aPrazo.message : "");
    if (aPrazo.ok) {
      const d = await getNegotiation(db, aPrazo.data.id);
      check(d?.lancamentos.length === 3, `3 contas a pagar (obtido: ${d?.lancamentos.length})`);
      check(
        !!d?.lancamentos.every((l) => l.status === "pending"),
        "todas pendentes: viram conta a pagar",
      );
      check(
        d?.totais.principal === 45000,
        `soma das parcelas = valor da operação (obtido: ${d?.totais.principal})`,
      );
      check(d?.situacao === "confirmada", `nenhuma paga ainda (obtida: ${d?.situacao})`);
    }

    console.log("\n3. §14: soma das parcelas diferente do valor é RECUSADA");
    const somaErrada = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "macho_13_24", quantity: 5 }],
      amount: 30000,
      pago: false,
      parcelas: [
        { due_date: new Date("2026-03-10"), amount: 10000 },
        { due_date: new Date("2026-04-10"), amount: 10000 },
      ],
    });
    check(!somaErrada.ok, "recusa quando a soma das parcelas não bate");
    const negociacoesDepois = await listNegotiations(db, {}, { limit: 100 });
    check(
      !negociacoesDepois.items.some((n) => Number(n.amount) === 30000),
      "e NADA foi gravado: a recusa é atômica",
    );

    console.log("\n4. §15: custos adicionais são lançamentos próprios");
    const comCustos = await createCattleNegotiation(db, {
      type: "venda_gado",
      property_id: fazenda.id,
      contact_id: contato.id,
      itens: [{ category_id: "femea_36_mais", quantity: 10 }],
      amount: 80000,
      pago: true,
      custos: [
        { descricao: "Comissão", amount: 4000 },
        { descricao: "Frete", amount: 1500 },
      ],
      occurred_at: new Date("2026-02-20"),
    });
    check(comCustos.ok, "venda com custos registrada", !comCustos.ok ? comCustos.message : "");
    if (comCustos.ok) {
      const d = await getNegotiation(db, comCustos.data.id);
      check(d?.totais.principal === 80000, "principal é o valor combinado");
      check(d?.totais.custos === 5500, `custos somam 5500 (obtido: ${d?.totais.custos})`);
      check(
        d?.totais.liquido === 74500,
        `líquido da venda = 74.500, como no exemplo do §15 (obtido: ${d?.totais.liquido})`,
      );
      check(
        d?.lancamentos.filter((l) => l.negotiation_role === "custo_adicional").length === 2,
        "os dois custos são lançamentos filhos, não campos",
      );
      check(
        !!d?.lancamentos.some((l) => l.negotiation_role === "custo_adicional" && l.entry_type === "expense"),
        "custo entra como DESPESA, então aparece no DRE",
      );
    }

    console.log("\n5. §7: venda reduz o rebanho");
    check(
      (await saldoDe("femea_36_mais")) === 40,
      `50 - 10 = 40 (obtido: ${await saldoDe("femea_36_mais")})`,
    );

    console.log("\n6. §7.5: venda acima do disponível é recusada, e não grava nada");
    const antes = await listNegotiations(db, {}, { limit: 100 });
    const vendaDemais = await createCattleNegotiation(db, {
      type: "venda_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "femea_36_mais", quantity: 999 }],
      amount: 100000,
      pago: true,
    });
    check(!vendaDemais.ok, "venda de 999 com 40 no saldo é recusada");
    check(
      !vendaDemais.ok && vendaDemais.message.includes("Revise a quantidade informada"),
      `mensagem é a do documento (obtida: ${!vendaDemais.ok ? vendaDemais.message : ""})`,
    );
    const depois = await listNegotiations(db, {}, { limit: 100 });
    check(
      antes.total === depois.total,
      `ATOMICIDADE: nenhuma negociação órfã (antes ${antes.total}, depois ${depois.total})`,
    );
    check((await saldoDe("femea_36_mais")) === 40, "e o saldo não se mexeu");

    console.log("\n7. §17.9: cancelar a negociação cancela os filhos");
    const paraCancelar = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "bezerra_0_7", quantity: 8 }],
      amount: 20000,
      pago: true,
    });
    check(paraCancelar.ok, "compra a ser cancelada registrada");
    if (paraCancelar.ok) {
      check((await saldoDe("bezerra_0_7")) === 8, "as 8 entraram");
      const cancel = await cancelNegotiation(db, paraCancelar.data.id, "comprei errado");
      check(cancel.ok, "cancelamento aceito", !cancel.ok ? cancel.message : "");
      check((await saldoDe("bezerra_0_7")) === 0, "o rebanho voltou ao que era");

      const d = await getNegotiation(db, paraCancelar.data.id);
      check(d?.situacao === "cancelada", "situação derivada vira cancelada");
      check(
        !!d?.movimentos.every((m) => m.canceled_at !== null),
        "os movimentos filhos ficaram cancelados",
      );
      check(
        !!d?.lancamentos.every((l) => l.status === "cancelled"),
        "os lançamentos filhos ficaram cancelados",
      );
      check(!!d, "a negociação continua no histórico, não foi apagada (§17.10)");
    }

    console.log("\n8. §17.9: cancelar é bloqueado quando os animais já saíram");
    const compraUsada = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "macho_25_36", quantity: 10 }],
      amount: 30000,
      pago: true,
    });
    if (compraUsada.ok) {
      await createCattleNegotiation(db, {
        type: "venda_gado",
        property_id: fazenda.id,
        itens: [{ category_id: "macho_25_36", quantity: 8 }],
        amount: 28000,
        pago: true,
      });
      const bloqueado = await cancelNegotiation(db, compraUsada.data.id, "tentando desfazer");
      check(!bloqueado.ok, "recusa: 8 dos 10 já foram vendidos");
      check(
        !bloqueado.ok && bloqueado.message.length > 20,
        `e explica o porquê (obtida: ${!bloqueado.ok ? bloqueado.message : ""})`,
      );
      check((await saldoDe("macho_25_36")) === 2, "o saldo continua intacto depois da recusa");
    }

    console.log("\n9. §16: situação parcialmente paga é DERIVADA");
    const parcial = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "femea_8_12", quantity: 4 }],
      amount: 20000,
      pago: false,
      parcelas: [
        { due_date: new Date("2026-06-10"), amount: 10000 },
        { due_date: new Date("2026-07-10"), amount: 10000 },
      ],
    });
    if (parcial.ok) {
      const antesDoPagamento = await getNegotiation(db, parcial.data.id);
      check(antesDoPagamento?.situacao === "confirmada", "sem pagar nada: confirmada");

      const primeira = antesDoPagamento!.lancamentos[0];
      await db.financialEntry.update({
        where: { id: primeira.id },
        data: { status: "paid", paid_at: new Date() },
      });
      const meioPago = await getNegotiation(db, parcial.data.id);
      check(
        meioPago?.situacao === "parcialmente_paga",
        `uma parcela paga: parcialmente paga (obtida: ${meioPago?.situacao})`,
      );

      await db.financialEntry.updateMany({
        where: { negotiation_id: parcial.data.id, negotiation_role: "principal" },
        data: { status: "paid", paid_at: new Date() },
      });
      const tudoPago = await getNegotiation(db, parcial.data.id);
      check(tudoPago?.situacao === "paga", `todas pagas: paga (obtida: ${tudoPago?.situacao})`);
    }

    console.log("\n10. Nenhuma coluna de situação gravada");
    const cru = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Negotiation'`,
    );
    const colunas = cru.map((c) => c.column_name);
    check(
      !colunas.includes("status") && !colunas.includes("situacao"),
      `situação é derivada, não gravada (colunas: ${colunas.join(", ")})`,
    );

    console.log("\n11. Isolamento multi-tenant");
    const tenantB = await prisma.tenant.create({
      data: { name: "M35 Negoc B", document: `35${stamp}1`, plan: "fazenda" },
    });
    try {
      const dbB = prismaForTenant(tenantB.id);
      const listaB = await listNegotiations(dbB, {}, { limit: 100 });
      check(listaB.total === 0, "tenant B não enxerga negociação do tenant A");
      const espiar = await getNegotiation(dbB, compra.data.id);
      check(espiar === null, "tenant B não abre negociação do tenant A pelo id");
    } finally {
      await prisma.tenant.deleteMany({ where: { id: tenantB.id } });
    }
  } finally {
    await prisma.financialEntry.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.herdMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.negotiation.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.contact.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.property.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }

  console.log("");
  console.log(
    falhas === 0
      ? "✅ Negociação de gado: 0 falhas."
      : `❌ Negociação de gado: ${falhas} falha(s).`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
