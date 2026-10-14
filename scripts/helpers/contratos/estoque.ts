import * as c from "@tibe/contracts";
import { StockMovementType, ShoppingItemStatus, ShoppingPriority, ShoppingPurpose } from "@/generated/prisma/enums";
import { assert, tenantDaSecao, type SecaoDeContrato } from "../contratos";

/** Estoque e Lista de Compra: as quatro rotas GET de `packages/contracts/src/stock.ts`. */
export const secao: SecaoDeContrato = {
  titulo: "Estoque (Módulos 31 e 36)",
  enums: [
    ["StockMovementType", c.stockMovementTypeSchema, StockMovementType],
    ["ShoppingItemStatus", c.shoppingItemStatusSchema, ShoppingItemStatus],
    ["ShoppingPriority", c.shoppingPrioritySchema, ShoppingPriority],
    ["ShoppingPurpose", c.shoppingPurposeSchema, ShoppingPurpose],
  ],
  async roda() {
    const { prisma } = await import("@/lib/prisma");
    const { tenant, fazenda, cria, confere } = await tenantDaSecao("ESTQ");
    try {
      const rotas = {
        categorias: await import("@/app/api/v1/product-categories/route"),
        produtos: await import("@/app/api/v1/products/route"),
        movimentos: await import("@/app/api/v1/stock/movements/route"),
        ajuste: await import("@/app/api/v1/stock/adjust/route"),
        negocios: await import("@/app/api/v1/negotiations/route"),
        lista: await import("@/app/api/v1/shopping-items/route"),
      };

      // A primeira leitura semeia as categorias; o cenário precisa de uma.
      const categorias = await confere("GET /product-categories", rotas.categorias, "/api/v1/product-categories", c.listProductCategoriesResponseSchema);
      const categoriaId = categorias?.data[0]?.id ?? "";
      assert(categoriaId !== "", "cenário: categoria semeada");

      const produto = await cria("produto", rotas.produtos, "/api/v1/products", {
        name: "Sal mineral ESTQ",
        category_id: categoriaId,
        unit: "saca",
        brand: "Marca ESTQ",
        minimum_stock: 5,
        storage_location: "Paiol",
        notes: "Teste",
      });
      await cria("compra de produto", rotas.negocios, "/api/v1/negotiations", {
        type: "compra_produto",
        property_id: fazenda.id,
        itens: [{ product_id: produto, quantity: 10 }],
        amount: 1200,
        contact_name: "Fornecedor ESTQ",
        pago: true,
      });
      await cria("utilização", rotas.movimentos, "/api/v1/stock/movements", {
        product_id: produto,
        property_id: fazenda.id,
        movement_type: "utilizacao",
        quantity: 2,
        purpose: "Gado",
        notes: "Cocho",
      });
      await cria("ajuste", rotas.ajuste, "/api/v1/stock/adjust", { product_id: produto, property_id: fazenda.id, corrected_balance: 7, reason: "Contagem" });
      await cria("item da lista", rotas.lista, "/api/v1/shopping-items", {
        description: "Sal mineral",
        product_id: produto,
        quantity: 3,
        unit: "saca",
        property_id: fazenda.id,
        category_id: categoriaId,
        purpose: "rebanho",
        priority: "urgente",
        place: "Agropecuária",
        notes: "Urgente",
      });

      await confere("GET /products", rotas.produtos, `/api/v1/products?property_id=${fazenda.id}`, c.listProductsResponseSchema);
      await confere("GET /stock/movements", rotas.movimentos, "/api/v1/stock/movements", c.listStockMovementsResponseSchema);
      await confere("GET /shopping-items", rotas.lista, "/api/v1/shopping-items", c.listShoppingItemsResponseSchema);
    } finally {
      const where = { tenant_id: tenant.id };
      await prisma.shoppingItem.deleteMany({ where });
      await prisma.stockMovement.deleteMany({ where });
      await prisma.financialEntry.deleteMany({ where });
      await prisma.negotiation.deleteMany({ where });
      await prisma.contact.deleteMany({ where });
      await prisma.product.deleteMany({ where });
      await prisma.productCategory.deleteMany({ where });
      await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    }
  },
};
