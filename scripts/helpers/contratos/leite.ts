import * as c from "@tibe/contracts";
import * as E from "@/generated/prisma/enums";
import { assert, tenantDaSecao, type SecaoDeContrato } from "../contratos";

/** Área Leite (Módulo 32): as rotas GET de `/api/v1/milk`. */
export const secao: SecaoDeContrato = {
  titulo: "Leite",
  enums: [
    ["MilkSiteType", c.milkSiteTypeSchema, E.MilkSiteType],
    ["MilkMovementType", c.milkMovementTypeSchema, E.MilkMovementType],
    ["MilkDestination", c.milkDestinationSchema, E.MilkDestination],
    ["MilkChargeType", c.milkChargeTypeSchema, E.MilkChargeType],
    ["MilkShift", c.milkShiftSchema, E.MilkShift],
    ["LactationEntryType", c.lactationEntryTypeSchema, E.LactationEntryType],
  ],
  roda: async () => {
    const t = await tenantDaSecao("LEITE");
    const { cria, confere, db, fazenda } = t;
    const rotas = {
      contacts: await import("@/app/api/v1/contacts/route"),
      groups: await import("@/app/api/v1/milk/groups/route"),
      sites: await import("@/app/api/v1/milk/sites/route"),
      lactation: await import("@/app/api/v1/milk/lactation/route"),
      production: await import("@/app/api/v1/milk/production/route"),
      storage: await import("@/app/api/v1/milk/storage/route"),
      charges: await import("@/app/api/v1/milk/charges/route"),
      summary: await import("@/app/api/v1/milk/summary/route"),
      pending: await import("@/app/api/v1/milk/sales/pending/route"),
    };

    try {
      console.log("0. Cenário, montado pelas rotas de escrita");
      const produtor = await cria("produtor", rotas.contacts, "/api/v1/contacts", { name: "Produtor LEITE" });
      const laticinio = await cria("laticínio", rotas.contacts, "/api/v1/contacts", { name: "Laticínio LEITE" });
      const lote = await cria("lote leiteiro", rotas.groups, "/api/v1/milk/groups", { property_id: fazenda.id, name: "Em produção LEITE" });
      const tanque = await cria("tanque", rotas.sites, "/api/v1/milk/sites", {
        name: "Tanque LEITE",
        type: "proprio",
        property_id: fazenda.id,
        capacity: 1000,
        notes: "Tanque de expansão",
      });
      const ponto = await cria("ponto de coleta", rotas.sites, "/api/v1/milk/sites", {
        name: "Ponto LEITE",
        type: "terceiro",
        counterparty_name: "Cooperativa LEITE",
        city: "Patos de Minas",
      });
      await cria("lactação", rotas.lactation, "/api/v1/milk/lactation", { property_id: fazenda.id, type: "definir", quantity: 30, group_id: lote, notes: "Contagem inicial" });
      await cria("produção", rotas.production, "/api/v1/milk/production", {
        property_id: fazenda.id,
        manha: 300,
        tarde: 180,
        group_id: lote,
        notes: "Dois turnos",
      });
      await cria("armazenar", rotas.storage, "/api/v1/milk/storage", { gesto: "armazenar", site_id: tanque, liters: 480, notes: "Produção do dia" });
      await cria("receber de terceiro", rotas.storage, "/api/v1/milk/storage", { gesto: "receber", site_id: tanque, owner_id: produtor, liters: 300 });
      await cria("transferir", rotas.storage, "/api/v1/milk/storage", { gesto: "transferir", from_site_id: tanque, to_site_id: ponto, liters: 50 });
      await cria("retirar", rotas.storage, "/api/v1/milk/storage", {
        gesto: "retirar",
        site_id: tanque,
        destination: "consumo",
        itens: [{ owner_id: null, liters: 20 }],
      });
      await cria("cobrança", rotas.charges, "/api/v1/milk/charges", { owner_id: produtor, type: "por_coleta", amount: 80, site_id: ponto, period_label: "Semana 1" });
      // A rota de retirada não aceita `buyer_id` (só o WhatsApp o usa): a entrega
      // a um comprador, que alimenta a lista de pendentes, entra pela action.
      const { withdrawFromSite } = await import("@/lib/actions/milk-storage");
      const entrega = await withdrawFromSite(db, {
        site_id: tanque,
        destination: "laticinio",
        itens: [{ owner_id: null, liters: 100 }],
        buyer_id: laticinio,
      });
      if (!entrega.ok) throw new Error(`cenário: entrega ao laticínio (${entrega.code})`);

      await confere("GET /milk/sites", rotas.sites, "/api/v1/milk/sites", c.listMilkSitesResponseSchema);
      await confere("GET /milk/groups", rotas.groups, "/api/v1/milk/groups", c.listMilkGroupsResponseSchema);
      const lactacao = await confere("GET /milk/lactation", rotas.lactation, `/api/v1/milk/lactation?property_id=${fazenda.id}`, c.listLactationResponseSchema);
      assert(lactacao?.meta.vacas_em_lactacao === 30, "GET /milk/lactation: com property_id a contagem vem no meta");
      await confere("GET /milk/production", rotas.production, "/api/v1/milk/production", c.listMilkProductionResponseSchema);
      await confere("GET /milk/summary", rotas.summary, `/api/v1/milk/summary?property_id=${fazenda.id}`, c.getMilkSummaryResponseSchema);
      await confere("GET /milk/storage", rotas.storage, "/api/v1/milk/storage", c.getMilkStorageResponseSchema);
      await confere("GET /milk/charges", rotas.charges, "/api/v1/milk/charges", c.listMilkChargesResponseSchema);
      await confere("GET /milk/sales/pending", rotas.pending, "/api/v1/milk/sales/pending", c.listMilkPendingDeliveriesResponseSchema);

      // Sem `property_id`, a contagem do meta é nula: o contrato a declara nullable.
      const semFazenda = await confere("GET /milk/lactation (sem property_id)", rotas.lactation, "/api/v1/milk/lactation", c.listLactationResponseSchema);
      assert(semFazenda?.meta.vacas_em_lactacao === null, "GET /milk/lactation: sem property_id a contagem é nula");
    } finally {
      const where = { tenant_id: t.tenant.id };
      const { prisma } = await import("@/lib/prisma");
      const { deleteTestTenants } = await import("../herd");
      await prisma.milkMovement.deleteMany({ where });
      await prisma.milkCharge.deleteMany({ where });
      await prisma.financialEntry.deleteMany({ where });
      await prisma.milkProduction.deleteMany({ where });
      await prisma.lactationEntry.deleteMany({ where });
      await prisma.milkSite.deleteMany({ where });
      await prisma.milkGroup.deleteMany({ where });
      await prisma.contact.deleteMany({ where });
      await deleteTestTenants([t.tenant.id]);
    }
  },
};
