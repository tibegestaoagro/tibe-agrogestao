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
  const { recordMovement } = await import("@/lib/actions/herd-ledger");
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
