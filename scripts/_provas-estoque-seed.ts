/**
 * Prepara o catalogo do bloco 0 do roteiro no tenant BANCO DE PROVAS.
 *
 * Existe para exercitar os roteiros de estoque contra o classificador REAL de
 * producao, pelo `npm run wa`, sem depender de alguem com o celular na mao.
 * Resolve o tenant pelo WA_TEST_PHONE (o mesmo do banco de provas) e RECUSA
 * rodar se o tenant nao for o de provas: catalogo de teste no estoque de um
 * cliente destroi a confianca no numero que ele esta conferindo.
 */
import "dotenv/config";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { ensureProductCategories, createProduct, listProductCategories } from "@/lib/actions/products";
import { adjustStock } from "@/lib/actions/stock-ledger";

const DESEJADOS = [
  { name: "Sal mineral 60 P", unit: "saca", minimum_stock: 5, saldo: 20 },
  { name: "Sal mineral proteinado", unit: "saca", minimum_stock: null, saldo: 10 },
  { name: "Vermifugo", unit: "frasco", minimum_stock: null, saldo: 0 },
];

async function main() {
  const phone = process.env.WA_TEST_PHONE;
  if (!phone) throw new Error("WA_TEST_PHONE nao definido no .env");

  const contato = await prisma.whatsAppContact.findFirst({ where: { phone } });
  if (!contato) throw new Error(`nenhum WhatsAppContact para ${phone}: rode o wa:seed antes`);

  const tenant = await prisma.tenant.findUnique({ where: { id: contato.tenant_id } });
  if (!tenant) throw new Error("tenant nao encontrado");
  if (!/prova/i.test(tenant.name)) {
    throw new Error(`recusando: "${tenant.name}" nao parece o tenant de provas`);
  }
  console.log(`tenant: ${tenant.name}`);

  const db = prismaForTenant(tenant.id);
  await ensureProductCategories(db);
  const categorias = await listProductCategories(db);
  const cat = categorias[0];
  console.log(`categoria: ${cat.name}`);

  const fazenda = await db.property.findFirst({ where: { archived_at: null } });
  if (!fazenda) throw new Error("o tenant de provas nao tem fazenda cadastrada");
  console.log(`fazenda: ${fazenda.name}`);

  for (const d of DESEJADOS) {
    let produto = await db.product.findFirst({ where: { name: d.name } });
    if (!produto) {
      const r = await createProduct(db, {
        name: d.name,
        category_id: cat.id,
        unit: d.unit,
        minimum_stock: d.minimum_stock,
      });
      if (!r.ok) throw new Error(`${d.name}: ${r.message}`);
      produto = await db.product.findFirst({ where: { name: d.name } });
      console.log(`criado: ${d.name} (${d.unit})`);
    } else {
      console.log(`ja existia: ${d.name}`);
    }
    if (d.saldo > 0 && produto) {
      const r = await adjustStock(db, {
        product_id: produto.id,
        property_id: fazenda.id,
        corrected_balance: d.saldo,
        reason: "Saldo inicial do banco de provas",
        recorded_by_user_id: contato.user_id ?? null,
      });
      console.log(`  saldo -> ${d.saldo}: ${r.ok ? "ok" : r.code}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
