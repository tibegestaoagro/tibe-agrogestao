import "dotenv/config";
import { prisma, prismaForTenant, scoped, type TenantPrismaClient } from "@/lib/prisma";
import { registrarNegocioProduto, ajustarEstoque } from "@/lib/actions/whatsapp-handlers/estoque";
import { createProduct, ensureProductCategories, listProductCategories } from "@/lib/actions/products";
import { getStockBalance, recordStockMovement } from "@/lib/actions/stock-ledger";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";
import { clearPendingStock } from "@/lib/actions/stock-pending";

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

async function main() {
  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "R1V2 probe2", document: `r2${stamp}0`, plan: "fazenda" },
  });
  await prisma.tenantProfile.create({
    data: { tenant_id: tenant.id, profile_type: "fazenda", active: true },
  });
  const usuario = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "Probe",
      email: `r1v2b-${stamp}@probe.local`,
      password_hash: "x",
      role: "OWNER",
    },
  });
  const userId = usuario.id;

  try {
    const db = prismaForTenant(tenant.id);
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda Unica" }) });
    await ensureProductCategories(db);
    const cats = await listProductCategories(db);
    const catSal = cats.find((c) => c.name === "Sal mineral")!;
    const sal = await createProduct(db, { name: "Sal mineral 60 P", category_id: catSal.id, unit: "saca" });
    if (!sal.ok) throw new Error("nao criou");
    const salId = sal.data.id;
    const saldo = async () => (await getStockBalance(db, { product_id: salId }))[0]?.quantity ?? 0;

    console.log("=== D) 'sim' SEM pendente (TTL expirou / redis fora / segundo sim) ===");
    await clearPendingStock(tenant.id, userId);
    const d1 = await registrarNegocioProduto(
      ctx(db, tenant.id, { tipo: "compra", produto: "sal", quantidade: 100, valor: 12000 }, { userId, confirmed: true }),
    );
    console.log("resposta:", d1.action_taken, "|", d1.reply_text);
    console.log("negociacoes:", await db.negotiation.count(), "| saldo:", await saldo());

    console.log("\n=== E) dois 'sim' seguidos: duplica? ===");
    await db.stockMovement.deleteMany({});
    await db.financialEntry.deleteMany({});
    await db.negotiation.deleteMany({});
    await clearPendingStock(tenant.id, userId);
    const params = { tipo: "compra", produto: "sal", quantidade: 10, valor: 1200 };
    await registrarNegocioProduto(ctx(db, tenant.id, params, { userId }));
    const e1 = await registrarNegocioProduto(ctx(db, tenant.id, params, { userId, confirmed: true }));
    console.log("sim #1:", e1.action_taken);
    const e2 = await registrarNegocioProduto(ctx(db, tenant.id, params, { userId, confirmed: true }));
    console.log("sim #2:", e2.action_taken, "|", e2.reply_text);
    const negs = await db.negotiation.findMany({ include: { entries: true } });
    console.log(
      "negociacoes:", negs.length,
      "| total lancado R$:", negs.flatMap((n) => n.entries).reduce((s, e) => s + Number(e.amount), 0),
      "| saldo:", await saldo(),
    );

    console.log("\n=== F) 'sim' sem user_id (sem ancora nenhuma) ===");
    await db.stockMovement.deleteMany({});
    await db.financialEntry.deleteMany({});
    await db.negotiation.deleteMany({});
    const f1 = await registrarNegocioProduto(
      ctx(db, tenant.id, { tipo: "compra", produto: "sal", quantidade: 7, valor: 999 }, { confirmed: true }),
    );
    console.log("resposta:", f1.action_taken, "|", f1.reply_text);
    console.log("negociacoes:", await db.negotiation.count(), "| saldo:", await saldo());

    console.log("\n=== G) ajuste: 'sim' sem pendente ===");
    await db.stockMovement.deleteMany({});
    await db.financialEntry.deleteMany({});
    await db.negotiation.deleteMany({});
    await clearPendingStock(tenant.id, userId);
    await recordStockMovement(db, {
      product_id: salId,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 20,
    });
    console.log("saldo antes:", await saldo());
    const g1 = await ajustarEstoque(
      ctx(db, tenant.id, { produto: "sal", saldo: 2 }, { userId, confirmed: true }),
    );
    console.log("resposta:", g1.action_taken, "|", g1.reply_text);
    console.log("saldo depois:", await saldo());
  } finally {
    await clearPendingStock(tenant.id, userId);
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
