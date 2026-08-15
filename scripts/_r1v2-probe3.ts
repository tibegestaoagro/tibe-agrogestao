import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { createProduct, ensureProductCategories, listProductCategories, listProductsWithBalance } from "@/lib/actions/products";
import { getStockBalance, recordStockMovement, adjustStock } from "@/lib/actions/stock-ledger";
import { createProductNegotiation } from "@/lib/actions/product-negotiations";
import { cancelNegotiation, getNegotiation } from "@/lib/actions/negotiations";

async function main() {
  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "R1V2 probe3", document: `r3${stamp}0`, plan: "fazenda" },
  });
  await prisma.tenantProfile.create({
    data: { tenant_id: tenant.id, profile_type: "fazenda", active: true },
  });

  try {
    const db = prismaForTenant(tenant.id);
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda A" }) });
    await ensureProductCategories(db);
    const cats = await listProductCategories(db);
    const cat = cats.find((c) => c.name === "Sal mineral")!;
    const p = await createProduct(db, { name: "Sal 60", category_id: cat.id, unit: "saca", minimum_stock: 5 });
    if (!p.ok) throw new Error("x");
    const produtoId = p.data.id;
    const saldo = async () => (await getStockBalance(db, { product_id: produtoId }))[0]?.quantity ?? 0;
    const somaCrua = async () => {
      const linhas = await db.stockMovement.findMany({ where: { canceled_at: null } });
      return linhas.reduce((s, l) => {
        if (l.movement_type === "ajuste") {
          return s + (Number(l.corrected_balance) - Number(l.previous_balance));
        }
        return s + (["venda", "utilizacao", "permuta_saida"].includes(l.movement_type) ? -Number(l.quantity) : Number(l.quantity));
      }, 0);
    };

    console.log("=== H) duas saidas simultaneas do mesmo saldo ===");
    await recordStockMovement(db, { product_id: produtoId, property_id: fazenda.id, movement_type: "compra", quantity: 10 });
    const [h1, h2] = await Promise.all([
      recordStockMovement(db, { product_id: produtoId, property_id: fazenda.id, movement_type: "utilizacao", quantity: 6 }),
      recordStockMovement(db, { product_id: produtoId, property_id: fazenda.id, movement_type: "utilizacao", quantity: 6 }),
    ]);
    console.log("r1:", h1.ok ? "ok" : h1.code, "| r2:", h2.ok ? "ok" : h2.code, "| saldo:", await saldo());

    console.log("\n=== I) ajuste simultaneo com uso ===");
    await db.stockMovement.deleteMany({});
    await recordStockMovement(db, { product_id: produtoId, property_id: fazenda.id, movement_type: "compra", quantity: 20 });
    const [i1, i2] = await Promise.all([
      adjustStock(db, { product_id: produtoId, property_id: fazenda.id, corrected_balance: 20 - 3 }),
      recordStockMovement(db, { product_id: produtoId, property_id: fazenda.id, movement_type: "utilizacao", quantity: 15 }),
    ]);
    console.log("ajuste p/ 17:", i1.ok ? JSON.stringify(i1.data) : i1.code, "| uso 15:", i2.ok ? "ok" : i2.code);
    console.log("saldo:", await saldo(), "| soma crua:", await somaCrua());

    console.log("\n=== J) cancelar compra depois de um ajuste para MAIS ===");
    await db.stockMovement.deleteMany({});
    const neg = await createProductNegotiation(db, {
      type: "compra_produto",
      property_id: fazenda.id,
      itens: [{ product_id: produtoId, quantity: 20 }],
      amount: 2400,
      pago: true,
    });
    if (!neg.ok) throw new Error(neg.message);
    await adjustStock(db, { product_id: produtoId, property_id: fazenda.id, corrected_balance: 30 });
    console.log("saldo antes do cancelamento:", await saldo());
    const canc = await cancelNegotiation(db, neg.data.id, "erro de lancamento", "devolvido");
    console.log("cancelamento:", canc.ok ? JSON.stringify(canc.data) : `${canc.code} ${canc.message}`);
    console.log("saldo depois:", await saldo(), "| soma crua:", await somaCrua());
    const det = await getNegotiation(db, neg.data.id);
    console.log(
      "lancamentos:",
      det?.lancamentos.map((l) => `${l.entry_type} ${l.amount} ${l.status} ${l.negotiation_role}`),
    );
    const todos = await db.financialEntry.findMany();
    console.log(
      "modulos:", todos.map((e) => `${e.related_module}/${e.entry_type}/${e.amount}/${e.status}`),
    );

    console.log("\n=== K) fracao: 0.1 + 0.2, e minimo ===");
    await db.stockMovement.deleteMany({});
    await recordStockMovement(db, { product_id: produtoId, property_id: fazenda.id, movement_type: "compra", quantity: 0.1 });
    await recordStockMovement(db, { product_id: produtoId, property_id: fazenda.id, movement_type: "compra", quantity: 0.2 });
    console.log("saldo:", await saldo());
    const lista = await listProductsWithBalance(db);
    console.log("abaixo_do_minimo:", lista[0].abaixo_do_minimo, "| saldo_total:", lista[0].saldo_total);

    console.log("\n=== L) venda de produto: saida maior que o saldo, atomicidade ===");
    await db.stockMovement.deleteMany({});
    await db.financialEntry.deleteMany({});
    await db.negotiation.deleteMany({});
    await recordStockMovement(db, { product_id: produtoId, property_id: fazenda.id, movement_type: "compra", quantity: 5 });
    const v = await createProductNegotiation(db, {
      type: "venda_produto",
      property_id: fazenda.id,
      itens: [{ product_id: produtoId, quantity: 50 }],
      amount: 6000,
      custos: [{ descricao: "Frete", amount: 300 }],
    });
    console.log("venda:", v.ok ? "ok" : `${v.code}`, "| negociacoes:", await db.negotiation.count(), "| lancamentos:", await db.financialEntry.count(), "| saldo:", await saldo());

    console.log("\n=== M) venda de produto: mesmo produto duas vezes na mesma compra ===");
    await db.stockMovement.deleteMany({});
    await db.financialEntry.deleteMany({});
    await db.negotiation.deleteMany({});
    await recordStockMovement(db, { product_id: produtoId, property_id: fazenda.id, movement_type: "compra", quantity: 5 });
    const v2 = await createProductNegotiation(db, {
      type: "venda_produto",
      property_id: fazenda.id,
      itens: [
        { product_id: produtoId, quantity: 3 },
        { product_id: produtoId, quantity: 3 },
      ],
      amount: 600,
    });
    console.log("venda dupla:", v2.ok ? "ok" : v2.code, "| saldo:", await saldo());
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
