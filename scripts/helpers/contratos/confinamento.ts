import * as c from "@tibe/contracts";
import * as E from "@/generated/prisma/enums";
import { assert, tenantDaSecao, type SecaoDeContrato } from "../contratos";

/** Confinamento: sites, lotes e o resumo do lote (fase 3 do Módulo 30). */
export const secao: SecaoDeContrato = {
  titulo: "Confinamento",
  enums: [["ConfinementSiteType", c.confinementSiteTypeSchema, E.ConfinementSiteType]],
  async roda() {
    const { tenant, db, fazenda, cria, confere } = await tenantDaSecao("CONF");
    const { prisma, scoped } = await import("@/lib/prisma");
    const { registrarNoLivro, deleteTestTenants } = await import("../herd");
    const rotas = {
      sites: await import("@/app/api/v1/confinement/sites/route"),
      archive: await import("@/app/api/v1/confinement/sites/[id]/archive/route"),
      stays: await import("@/app/api/v1/confinement/stays/route"),
      stay: await import("@/app/api/v1/confinement/stays/[id]/route"),
      feeding: await import("@/app/api/v1/confinement/stays/[id]/feeding/route"),
      costs: await import("@/app/api/v1/confinement/stays/[id]/costs/route"),
      movements: await import("@/app/api/v1/stock/movements/route"),
    };

    try {
      console.log("  Cenário, montado pelas rotas de escrita");
      await registrarNoLivro(db, { property_id: fazenda.id, quantity: 20, category_id: "femea_36_mais" });
      const proprio = await cria("confinamento próprio", rotas.sites, "/api/v1/confinement/sites", {
        name: "Confinamento CONF",
        type: "proprio",
        property_id: fazenda.id,
        city: "Uberaba",
        capacity: 100,
        notes: "Curral novo",
      });
      const boitel = await cria("boitel", rotas.sites, "/api/v1/confinement/sites", {
        name: "Boitel CONF",
        type: "boitel",
        counterparty_name: "Boitel Parceiro",
      });
      await cria("arquivar o boitel", rotas.archive, `/api/v1/confinement/sites/${boitel}/archive`, {}, { id: boitel });
      const lote = await cria("lote", rotas.stays, "/api/v1/confinement/stays", {
        confinement_site_id: proprio,
        category_id: "femea_36_mais",
        quantity: 5,
        charge_type: "por_cabeca",
        charge_value: 12,
      });

      const categoria = await db.productCategory.create({ data: scoped({ name: "Ração CONF" }) });
      const produto = await db.product.create({ data: scoped({ name: "Ração CONF", category_id: categoria.id, unit: "kg" }) });
      await cria("compra de ração", rotas.movements, "/api/v1/stock/movements", {
        product_id: produto.id,
        property_id: fazenda.id,
        movement_type: "compra",
        quantity: 500,
      });
      await cria("alimentação", rotas.feeding, `/api/v1/confinement/stays/${lote}/feeding`, { quantity: 40, product_id: produto.id }, { id: lote });
      await cria("custo avulso", rotas.costs, `/api/v1/confinement/stays/${lote}/costs`, { category: "Frete", amount: 250, pago: true }, { id: lote });

      await confere("GET /confinement/sites", rotas.sites, "/api/v1/confinement/sites?include_archived=true", c.listConfinementSitesResponseSchema);
      const lotes = await confere("GET /confinement/stays", rotas.stays, "/api/v1/confinement/stays", c.listConfinementLotsResponseSchema);
      assert((lotes?.data.length ?? 0) > 0, "GET /confinement/stays: o lote do cenário aparece");
      await confere("GET /confinement/stays/:id", rotas.stay, `/api/v1/confinement/stays/${lote}`, c.getConfinementLotResponseSchema, { id: lote });
    } finally {
      const where = { tenant_id: tenant.id };
      await prisma.financialEntry.deleteMany({ where });
      await prisma.stockMovement.deleteMany({ where });
      await prisma.product.deleteMany({ where });
      await prisma.productCategory.deleteMany({ where });
      await prisma.herdMovement.deleteMany({ where });
      await prisma.herdStay.deleteMany({ where });
      await prisma.confinementSite.deleteMany({ where });
      await prisma.pasture.deleteMany({ where });
      await deleteTestTenants([tenant.id]);
    }
  },
};
