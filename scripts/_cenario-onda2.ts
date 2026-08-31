import "dotenv/config";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { provisionDefaultAnimalCategories } from "@/lib/actions/animal-categories";

/**
 * Monta, no banco LOCAL, o cenario exato das cinco recusas da onda 2
 * (frente 5, tarefa 12). Nao e suite: e o preparo para olhar a tela.
 *
 * Cada caso existe para uma recusa que so aparece com dado real:
 *
 * | tela                  | recusa a forcar          |
 * |-----------------------|--------------------------|
 * | negotiation-form      | INSUFFICIENT_BALANCE     |
 * | stock-movement-form   | INSUFFICIENT_STOCK       |
 * | machine-form          | custo de aquisicao < 0   |
 * | fazenda-form          | area <= 0                |
 * | invite-form           | email repetido (409)     |
 *
 * Idempotente: pode rodar de novo sem duplicar.
 */
exigirBancoLocal();

const DOCUMENTO = "11222333000181";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { document: DOCUMENTO } });
  if (!tenant) {
    console.error("❌ Tenant do seed nao encontrado. Rode `npm run db:seed` primeiro.");
    process.exit(1);
  }
  const tenant_id = tenant.id;
  const db = prismaForTenant(tenant_id);

  // Sem perfil ativo o primeiro login cai no onboarding, e nenhuma das telas
  // da onda 2 chega a renderizar.
  await prisma.tenantProfile.upsert({
    where: { tenant_id_profile_type: { tenant_id, profile_type: "fazenda" } },
    update: {},
    create: { tenant_id, profile_type: "fazenda" },
  });

  const property =
    (await prisma.property.findFirst({ where: { tenant_id } })) ??
    (await prisma.property.create({
      data: { tenant_id, name: "Fazenda da Validacao", city: "Montes Claros", area_hectares: 100 },
    }));

  await provisionDefaultAnimalCategories(db);
  // ⚠️ `to_category_id` guarda a CHAVE DE CODIGO (`src/lib/herd/categories.ts`),
  // nao o id da linha de `AnimalCategory`. O comentario do schema avisa, e
  // errar isso da um saldo que a tela nunca acha.
  const CATEGORIA = "bezerro_0_7";

  // ── Caso 1: saldo de rebanho PEQUENO, para a venda estourar ────────────────
  // O saldo nunca e gravado (invariante 2): ele e a soma das movimentacoes.
  // Entao o cenario e uma entrada de 3 cabecas, e nada mais.
  const jaTemEntrada = await prisma.herdMovement.findFirst({
    where: { tenant_id, to_category_id: CATEGORIA, movement_type: "compra" },
  });
  if (!jaTemEntrada) {
    await prisma.herdMovement.create({
      data: {
        tenant_id,
        movement_type: "compra",
        to_category_id: CATEGORIA,
        quantity: 3,
        to_property_id: property.id,
        // ⚠️ Sem estes dois o saldo fica invisivel: `getPositions` agrupa por
        // (categoria, propriedade, situacao, dono), e a venda procura o gado
        // presente e proprio. Fixture crua que os deixa nulos produz saldo
        // zero, e a tela parece errada quando quem errou foi a fixture.
        to_situation: "presente",
        to_owner: "proprio",
        occurred_at: new Date(),
      },
    });
  }

  // ── Caso 2: estoque PEQUENO, para a saida estourar ────────────────────────
  const categoriaProduto =
    (await prisma.productCategory.findFirst({ where: { tenant_id } })) ??
    (await prisma.productCategory.create({ data: { tenant_id, name: "Nutricao" } }));
  const produto =
    (await prisma.product.findFirst({ where: { tenant_id, name: "Sal mineral" } })) ??
    (await prisma.product.create({
      data: {
        tenant_id,
        category_id: categoriaProduto.id,
        name: "Sal mineral",
        unit: "kg",
      },
    }));
  const jaTemEstoque = await prisma.stockMovement.findFirst({
    where: { tenant_id, product_id: produto.id },
  });
  if (!jaTemEstoque) {
    await prisma.stockMovement.create({
      data: {
        tenant_id,
        product_id: produto.id,
        movement_type: "compra",
        quantity: 5,
        property_id: property.id,
        occurred_at: new Date(),
      },
    });
  }

  // ── Caso 5: um usuario ja existente, para o convite bater no 409 ──────────
  const emailOcupado = "operador.validacao@damata.com.br";
  const jaExiste = await prisma.user.findUnique({ where: { email: emailOcupado } });
  if (!jaExiste) {
    await prisma.user.create({
      data: {
        tenant_id,
        email: emailOcupado,
        name: "Operador da Validacao",
        // Hash de senha aleatoria: esta conta existe SO para ocupar o email.
        // Ninguem loga com ela, e nenhuma senha em claro passa por aqui.
        password_hash: "$2b$10$" + "x".repeat(53),
        role: "OPERADOR",
      },
    });
  }

  const owner = await prisma.user.findFirst({ where: { tenant_id, role: "OWNER" } });

  console.log("✅ Cenario da onda 2 pronto.");
  console.log(`   tenant_id:   ${tenant_id}`);
  console.log(`   owner id:    ${owner?.id}  (${owner?.email}, ${owner?.role})`);
  console.log(`   propriedade: ${property.name} (${property.id})`);
  console.log(`   categoria:   ${CATEGORIA}, saldo 3 cabecas`);
  console.log(`   produto:     ${produto.name} (${produto.id}), saldo 5 ${produto.unit}`);
  console.log(`   email ocupado para o 409: ${emailOcupado}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
