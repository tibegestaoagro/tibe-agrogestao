import "dotenv/config";
import { prisma, prismaForTenant, scoped, type TenantPrismaClient } from "@/lib/prisma";
import {
  registrarNegocioProduto,
  ajustarEstoque,
  registrarUsoEstoque,
} from "@/lib/actions/whatsapp-handlers/estoque";
import { createProduct, ensureProductCategories, listProductCategories } from "@/lib/actions/products";
import { getStockBalance } from "@/lib/actions/stock-ledger";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";
import { loadPendingStock, clearPendingStock } from "@/lib/actions/stock-pending";

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
    data: { name: "R1V2 probe", document: `r1${stamp}0`, plan: "fazenda" },
  });
  await prisma.tenantProfile.create({
    data: { tenant_id: tenant.id, profile_type: "fazenda", active: true },
  });
  const usuario = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "Probe",
      email: `r1v2-${stamp}@probe.local`,
      password_hash: "x",
      role: "OWNER",
    },
  });
  const userId = usuario.id;

  try {
    const db = prismaForTenant(tenant.id);
    await db.property.create({ data: scoped({ name: "Fazenda Unica" }) });
    await ensureProductCategories(db);
    const cats = await listProductCategories(db);
    const catSal = cats.find((c) => c.name === "Sal mineral")!;
    const sal = await createProduct(db, { name: "Sal mineral 60 P", category_id: catSal.id, unit: "saca" });
    if (!sal.ok) throw new Error("nao criou produto");
    const salId = sal.data.id;

    const saldo = async () => {
      const [p] = await getStockBalance(db, { product_id: salId });
      return p?.quantity ?? 0;
    };

    console.log("=== A) confirmacao pendente executa sem 'sim'? ===");
    await clearPendingStock(tenant.id, userId);
    const r1 = await registrarNegocioProduto(
      ctx(db, tenant.id, { tipo: "compra", produto: "sal", quantidade: 10, valor: 1200 }, { userId }),
    );
    console.log("turno 1:", r1.action_taken, "|", r1.reply_text.replace(/\n/g, " / "));
    const pend = await loadPendingStock(tenant.id, userId);
    console.log("pendente aguardando:", pend?.aguardando);

    // Turno 2: o produtor NAO diz sim. Ele corrige: "na verdade foram 20 sacas".
    const r2 = await registrarNegocioProduto(
      ctx(db, tenant.id, { tipo: "compra", produto: "sal", quantidade: 20, valor: 1200 }, { userId }),
    );
    console.log("turno 2 (correcao, sem 'sim'):", r2.action_taken, "|", r2.reply_text.replace(/\n/g, " / "));
    const negs = await db.negotiation.findMany({ include: { entries: true, stock_movements: true } });
    console.log(
      "negociacoes gravadas:", negs.length,
      "| itens:", negs.map((n) => n.stock_movements.map((m) => String(m.quantity))),
      "| lancamentos:", negs.map((n) => n.entries.map((e) => `${e.entry_type} ${e.amount}`)),
    );
    console.log("saldo do sal:", await saldo());

    console.log("\n=== A2) turno 2 com mensagem irrelevante ('quanto?') ===");
    await clearPendingStock(tenant.id, userId);
    await db.stockMovement.deleteMany({});
    await db.financialEntry.deleteMany({});
    await db.negotiation.deleteMany({});
    await registrarNegocioProduto(
      ctx(db, tenant.id, { tipo: "compra", produto: "sal", quantidade: 5, valor: 600 }, { userId }),
    );
    const r3 = await registrarNegocioProduto(ctx(db, tenant.id, {}, { userId }));
    console.log("turno 2 (params vazios):", r3.action_taken, "|", r3.reply_text.replace(/\n/g, " / "));
    console.log("negociacoes:", await db.negotiation.count(), "| saldo:", await saldo());

    console.log("\n=== B) ajuste pendente executa sem 'sim'? ===");
    await clearPendingStock(tenant.id, userId);
    await db.stockMovement.deleteMany({});
    await db.financialEntry.deleteMany({});
    await db.negotiation.deleteMany({});
    // entra 20 sacas
    const { recordStockMovement } = await import("@/lib/actions/stock-ledger");
    const props = await db.property.findMany();
    await recordStockMovement(db, {
      product_id: salId,
      property_id: props[0].id,
      movement_type: "compra",
      quantity: 20,
    });
    console.log("saldo inicial:", await saldo());
    const a1 = await ajustarEstoque(ctx(db, tenant.id, { produto: "sal", saldo: 2 }, { userId }));
    console.log("turno 1:", a1.action_taken, "|", a1.reply_text);
    const a2 = await ajustarEstoque(ctx(db, tenant.id, {}, { userId }));
    console.log("turno 2 (sem 'sim'):", a2.action_taken, "|", a2.reply_text);
    console.log("saldo apos:", await saldo());

    console.log("\n=== C) data invalida: loop? ===");
    await clearPendingStock(tenant.id, userId);
    let c = await registrarNegocioProduto(
      ctx(
        db,
        tenant.id,
        { tipo: "compra", produto: "sal", quantidade: 10, valor: 1200, data: "31/02/2026" },
        { userId },
      ),
    );
    console.log("t1:", c.action_taken, "|", c.reply_text);
    for (let i = 2; i <= 5; i++) {
      c = await registrarNegocioProduto(ctx(db, tenant.id, { valor: "1200" }, { userId }));
      console.log(`t${i}:`, c.action_taken, "|", c.reply_text.replace(/\n/g, " / "));
    }
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
