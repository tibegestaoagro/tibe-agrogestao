import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  DEFAULT_ANIMAL_CATEGORIES,
  provisionDefaultAnimalCategories,
  listCategoriesAction,
  createCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/animal-categories";
import { createBatchAction, sellFromCategoryAction } from "@/lib/actions/animal-batches";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";

exigirBancoLocal();


/**
 * Teste do Módulo 25: rebanho por categoria e quantidade
 * (docs/specs/module-25-rebanho-por-categoria.md). Roda: `npm run test:m25`
 * com o DATABASE_URL do Docker local.
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

// Mesmo espírito do teste do Módulo 24 (handoff 2026-08-03): não depender da
// presença/ausência de INTERNAL_API_SECRET no .env do ambiente que roda o
// teste (worktrees isolados não têm .env, a máquina principal pode ter).
// Preserva o valor real se já existir; senão injeta um descartável.
process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "m25-test-internal-secret";
const SECRET = process.env.INTERNAL_API_SECRET;

async function callExecute(input: {
  tenant_id: string;
  user_id: string;
  intent: string;
  parameters?: Record<string, unknown>;
  message_text?: string;
  confirmed?: boolean;
}) {
  const req = new Request("http://localhost/api/internal/whatsapp/execute-action", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
    body: JSON.stringify({ parameters: {}, ...input }),
  });
  const res = await executeAction(req);
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log("🐄 Módulo 25: rebanho por categoria e quantidade\n");

  const tenantA = await prisma.tenant.create({
    data: { name: "M25 Tenant A", document: `M25A-${Date.now()}`, plan: "fazenda" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "M25 Tenant B", document: `M25B-${Date.now()}`, plan: "fazenda" },
  });
  const dbA = prismaForTenant(tenantA.id);
  const dbB = prismaForTenant(tenantB.id);

  try {
    // ── Categorias padrão (equivalente ao onboarding do tenant) ────────
    await provisionDefaultAnimalCategories(dbA);
    const seeded = await dbA.animalCategory.findMany();
    assert(
      seeded.length === DEFAULT_ANIMAL_CATEGORIES.length &&
        DEFAULT_ANIMAL_CATEGORIES.every((name) => seeded.some((c) => c.name === name)),
      "categorias padrão (Bezerro, Bezerra, Garrote, Novilha, Vaca, Boi, Touro) semeadas",
    );
    await provisionDefaultAnimalCategories(dbA);
    const seededAgain = await dbA.animalCategory.count();
    assert(seededAgain === DEFAULT_ANIMAL_CATEGORIES.length, "provisionamento é idempotente, não duplica");

    // tenant B nasce sem categoria nenhuma: listCategoriesAction semeia a
    // lista padrão na primeira leitura (equivalente funcional ao onboarding).
    const listedB = await listCategoriesAction(dbB);
    assert(
      listedB.length === DEFAULT_ANIMAL_CATEGORIES.length,
      "listCategoriesAction semeia a lista padrão na primeira leitura de um tenant sem categorias",
    );

    // ── CRUD de categoria customizada ───────────────────────────────────
    const created = await createCategoryAction(dbA, { name: "Categoria Teste M25" });
    assert(created.ok, "cria categoria customizada");
    const dupCreate = await createCategoryAction(dbA, { name: "categoria teste m25" });
    assert(
      !dupCreate.ok && dupCreate.code === "DUPLICATE_CATEGORY",
      "rejeita nome duplicado (case-insensitive)",
    );
    if (created.ok) {
      const renamed = await updateCategoryAction(dbA, created.data.id, {
        name: "Categoria Renomeada M25",
      });
      assert(
        renamed.ok && renamed.data.name === "Categoria Renomeada M25",
        "renomeia categoria customizada",
      );
      const deactivated = await updateCategoryAction(dbA, created.data.id, { active: false });
      assert(!deactivated.ok ? false : deactivated.data.active === false, "desativa categoria");
    }
    const notFoundUpdate = await updateCategoryAction(dbA, "categoria-inexistente-m25", {
      name: "x",
    });
    assert(
      !notFoundUpdate.ok && notFoundUpdate.code === "NOT_FOUND",
      "update de categoria inexistente falha com NOT_FOUND",
    );

    // ── Isolamento multi-tenant de AnimalCategory ───────────────────────
    const bCategoryNames = (await dbB.animalCategory.findMany()).map((c) => c.name);
    assert(
      !bCategoryNames.includes("Categoria Renomeada M25"),
      "tenant B não vê categoria customizada criada pelo tenant A",
    );

    // ── Criação de lote via action (com e sem custo de aquisição) ───────
    const propA = await dbA.property.create({ data: scoped({ name: "Fazenda M25 A" }) });
    const bezerroA = await dbA.animalCategory.findFirst({ where: { name: "Bezerro" } });
    if (!bezerroA) throw new Error("categoria Bezerro não encontrada no tenant A");

    const batchWithCost = await createBatchAction(dbA, {
      category_id: bezerroA.id,
      property_id: propA.id,
      quantity: 20,
      acquisition_cost: 60000,
    });
    assert(
      batchWithCost.ok && batchWithCost.data.quantity === 20,
      "cria lote de 20 bezerros com custo de aquisição (exemplo do PRD)",
    );
    const purchaseEntry = batchWithCost.ok
      ? await dbA.financialEntry.findFirst({
          where: { related_module: "rebanho", related_id: batchWithCost.data.id },
        })
      : null;
    assert(
      purchaseEntry?.entry_type === "expense" && Number(purchaseEntry.amount) === 60000,
      "lote com custo gera FinancialEntry de despesa vinculado ao lote",
    );

    const batchNoCost = await createBatchAction(dbA, {
      category_id: bezerroA.id,
      property_id: propA.id,
      quantity: 8,
    });
    assert(batchNoCost.ok, "cria lote sem custo de aquisição (ex: nascimento na propriedade)");
    const entriesForNoCostBatch = batchNoCost.ok
      ? await dbA.financialEntry.count({
          where: { related_module: "rebanho", related_id: batchNoCost.data.id },
        })
      : -1;
    assert(entriesForNoCostBatch === 0, "lote sem custo não gera lançamento financeiro nenhum");

    const batchesForCategory = await dbA.animalBatch.count({ where: { category_id: bezerroA.id } });
    assert(
      batchesForCategory === 2,
      "cada aquisição gera um lote NOVO, nunca acumula quantidade numa linha existente",
    );

    const invalidQty = await createBatchAction(dbA, {
      category_id: bezerroA.id,
      property_id: propA.id,
      quantity: 0,
    });
    assert(
      !invalidQty.ok && invalidQty.code === "VALIDATION_ERROR",
      "rejeita quantidade zero/negativa ao criar lote",
    );

    const archivedProp = await dbA.property.create({
      data: scoped({ name: "Fazenda Arquivada M25", archived_at: new Date() }),
    });
    const archivedRejected = await createBatchAction(dbA, {
      category_id: bezerroA.id,
      property_id: archivedProp.id,
      quantity: 5,
    });
    assert(
      !archivedRejected.ok && archivedRejected.code === "PROPERTY_ARCHIVED",
      "rejeita lote em propriedade arquivada",
    );

    const inactiveCatResult = await createCategoryAction(dbA, { name: "Categoria Inativa M25" });
    if (inactiveCatResult.ok) {
      await updateCategoryAction(dbA, inactiveCatResult.data.id, { active: false });
      const inactiveRejected = await createBatchAction(dbA, {
        category_id: inactiveCatResult.data.id,
        property_id: propA.id,
        quantity: 5,
      });
      assert(
        !inactiveRejected.ok && inactiveRejected.code === "CATEGORY_INACTIVE",
        "rejeita lote em categoria desativada",
      );
    }

    // ── Venda de lote único ──────────────────────────────────────────────
    const garroteA = await dbA.animalCategory.findFirst({ where: { name: "Garrote" } });
    if (!garroteA) throw new Error("categoria Garrote não encontrada no tenant A");
    const singleBatch = await createBatchAction(dbA, {
      category_id: garroteA.id,
      property_id: propA.id,
      quantity: 10,
      acquisition_cost: 10000,
    });
    const singleSale = singleBatch.ok
      ? await sellFromCategoryAction(dbA, { category_id: garroteA.id, quantity: 4, value: 4800 })
      : null;
    assert(
      !!singleSale?.ok && singleSale.data.consumed.length === 1,
      "venda de lote único decrementa direto, sem precisar escolher lote",
    );
    const singleBatchAfter =
      singleBatch.ok && (await dbA.animalBatch.findFirst({ where: { id: singleBatch.data.id } }));
    assert(
      !!singleBatchAfter && singleBatchAfter.quantity === 6,
      "quantidade do lote único reduzida corretamente (10 - 4 = 6)",
    );
    const saleEntry =
      singleBatch.ok &&
      (await dbA.financialEntry.findFirst({
        where: { related_module: "rebanho", related_id: singleBatch.data.id, entry_type: "income" },
      }));
    assert(
      !!saleEntry && Number(saleEntry.amount) === 4800,
      "venda gera FinancialEntry de receita vinculado ao lote vendido",
    );

    // ── Venda com FIFO entre 2+ lotes da mesma categoria ─────────────────
    const novilhaA = await dbA.animalCategory.findFirst({ where: { name: "Novilha" } });
    if (!novilhaA) throw new Error("categoria Novilha não encontrada no tenant A");
    const oldBatch = await dbA.animalBatch.create({
      data: scoped({
        property_id: propA.id,
        category_id: novilhaA.id,
        quantity: 5,
        acquired_at: new Date("2026-01-01T00:00:00Z"),
      }),
    });
    const newBatch = await dbA.animalBatch.create({
      data: scoped({
        property_id: propA.id,
        category_id: novilhaA.id,
        quantity: 5,
        acquired_at: new Date("2026-06-01T00:00:00Z"),
      }),
    });
    const fifoSale = await sellFromCategoryAction(dbA, {
      category_id: novilhaA.id,
      quantity: 7,
      value: 7000,
    });
    assert(fifoSale.ok, "venda FIFO entre 2 lotes executa com sucesso");
    if (fifoSale.ok) {
      assert(fifoSale.data.consumed.length === 2, "consome 2 lotes quando a quantidade excede o primeiro");
      assert(
        fifoSale.data.consumed[0]?.batch_id === oldBatch.id && fifoSale.data.consumed[0]?.quantity === 5,
        "consome o lote MAIS ANTIGO primeiro, por completo (FIFO, sem perguntar ao usuário)",
      );
      assert(
        fifoSale.data.consumed[1]?.batch_id === newBatch.id && fifoSale.data.consumed[1]?.quantity === 2,
        "consome o restante necessário do lote mais novo",
      );
      const totalValue = fifoSale.data.consumed.reduce((sum, c) => sum + (c.value ?? 0), 0);
      assert(
        Math.abs(totalValue - 7000) < 0.001,
        "soma dos valores rateados entre os lotes bate exatamente com o valor total da venda",
      );
      const entriesForSale = await dbA.financialEntry.count({
        where: {
          related_module: "rebanho",
          related_id: { in: [oldBatch.id, newBatch.id] },
          entry_type: "income",
        },
      });
      assert(
        entriesForSale === 2,
        "venda que consome 2 lotes gera 2 FinancialEntry (um por lote afetado, não um só)",
      );
    }
    const oldBatchAfter = await dbA.animalBatch.findFirst({ where: { id: oldBatch.id } });
    const newBatchAfter = await dbA.animalBatch.findFirst({ where: { id: newBatch.id } });
    assert(
      oldBatchAfter?.quantity === 0 && newBatchAfter?.quantity === 3,
      "lotes refletem a baixa FIFO corretamente (0 e 3 restantes)",
    );

    // ── Recusa de venda acima do disponível ──────────────────────────────
    const overSale = await sellFromCategoryAction(dbA, {
      category_id: novilhaA.id,
      quantity: 999,
      value: 1000,
    });
    assert(
      !overSale.ok && overSale.code === "INSUFFICIENT_QUANTITY",
      "recusa venda acima do disponível na categoria, sem perguntar de qual lote",
    );
    const newBatchUnchanged = await dbA.animalBatch.findFirst({ where: { id: newBatch.id } });
    assert(
      newBatchUnchanged?.quantity === 3,
      "recusa não altera a quantidade de nenhum lote (transação abortada antes de escrever)",
    );

    // venda sem valor: permitida, sem lançamento financeiro (nem toda venda é
    // digitada com valor: mesma tolerância que a compra sem custo).
    const vacaA = await dbA.animalCategory.findFirst({ where: { name: "Vaca" } });
    if (!vacaA) throw new Error("categoria Vaca não encontrada no tenant A");
    const noValueBatch = await createBatchAction(dbA, {
      category_id: vacaA.id,
      property_id: propA.id,
      quantity: 3,
    });
    const noValueSale = noValueBatch.ok
      ? await sellFromCategoryAction(dbA, { category_id: vacaA.id, quantity: 3 })
      : null;
    assert(!!noValueSale?.ok, "venda sem valor informado é permitida");
    const entriesForNoValueSale = noValueBatch.ok
      ? await dbA.financialEntry.count({
          where: { related_module: "rebanho", related_id: noValueBatch.data.id },
        })
      : -1;
    assert(entriesForNoValueSale === 0, "venda sem valor não gera lançamento financeiro");

    // ── Isolamento multi-tenant de AnimalBatch ───────────────────────────
    const bBatches = await dbB.animalBatch.findMany();
    assert(bBatches.length === 0, "tenant B não vê nenhum lote criado pelo tenant A");
    assert(
      singleBatch.ok &&
        (await dbB.animalBatch.findUnique({ where: { id: singleBatch.data.id } })) === null,
      "findUnique de B pelo id de um lote de A retorna null",
    );

    // ── WhatsApp: registrar_lote_animal ponta a ponta ────────────────────
    const ownerA = await dbA.user.create({
      data: scoped({
        name: "Owner M25",
        email: `m25-owner-${Date.now()}@test.local`,
        password_hash: "x",
        role: "OWNER",
      }),
    });
    await dbA.tenantProfile.create({ data: scoped({ profile_type: "fazenda" }) });

    const missingParams = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_lote_animal",
      parameters: {},
    });
    assert(
      /categoria/i.test(missingParams.body.data.reply_text) &&
        missingParams.body.data.requires_confirmation === false,
      "sem categoria/quantidade, pede os dados sem confirmar nada",
    );

    const unknownCategory = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_lote_animal",
      parameters: { category: "categoria-inexistente-m25", quantity: 5, operation: "compra" },
    });
    assert(
      /Não encontrei a categoria/.test(unknownCategory.body.data.reply_text),
      "categoria não reconhecida faz o agente perguntar, em vez de criar sozinho",
    );
    const categoriesCountAfterUnknown = await dbA.animalCategory.count({
      where: { name: { contains: "categoria-inexistente" } },
    });
    assert(categoriesCountAfterUnknown === 0, "não cria categoria nova automaticamente pelo WhatsApp");

    // Compra com valor: pede confirmação (resumo) antes de gravar.
    const compraParams = {
      category: "Bezerro",
      quantity: 20,
      value: 60000,
      operation: "compra",
      property_id: propA.id,
    };
    const compraAsk = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_lote_animal",
      parameters: compraParams,
    });
    assert(
      compraAsk.body.data.requires_confirmation === true,
      "compra pede confirmação com resumo antes de gravar (mesmo padrão de cadastrar_animal/registrar_lancamento_financeiro)",
    );
    const batchesBeforeConfirm = await dbA.animalBatch.count({ where: { category_id: bezerroA.id } });

    const compraConfirm = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_lote_animal",
      parameters: compraParams,
      message_text: "sim",
    });
    assert(
      /registrado com sucesso/.test(compraConfirm.body.data.reply_text),
      "compra confirmada ('sim') responde sucesso",
    );
    const batchesAfterConfirm = await dbA.animalBatch.count({ where: { category_id: bezerroA.id } });
    assert(batchesAfterConfirm === batchesBeforeConfirm + 1, "confirmação cria exatamente um lote novo");
    const newestBatch = await dbA.animalBatch.findFirst({
      where: { category_id: bezerroA.id },
      orderBy: { created_at: "desc" },
    });
    const newestEntry =
      newestBatch &&
      (await dbA.financialEntry.findFirst({
        where: { related_module: "rebanho", related_id: newestBatch.id },
      }));
    assert(
      !!newestEntry && Number(newestEntry.amount) === 60000,
      "compra confirmada via WhatsApp cria o lote e o FinancialEntry vinculado com o valor informado (ponta a ponta)",
    );

    // Venda acima do disponível: recusa direto, sem pedir confirmação.
    const disponibilidadeGarrote = await dbA.animalBatch.aggregate({
      _sum: { quantity: true },
      where: { category_id: garroteA.id },
    });
    const disponivelGarrote = disponibilidadeGarrote._sum.quantity ?? 0;
    const vendaImpossivel = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_lote_animal",
      parameters: {
        category: "Garrote",
        quantity: disponivelGarrote + 100,
        value: 1000,
        operation: "venda",
      },
    });
    assert(
      /apenas/.test(vendaImpossivel.body.data.reply_text) &&
        vendaImpossivel.body.data.requires_confirmation === false,
      "venda acima do disponível recusa direto (mensagem clara), sem pedir confirmação",
    );

    // Venda dentro do disponível: pede confirmação e executa ao confirmar.
    const vendaParams = { category: "Garrote", quantity: 2, value: 2400, operation: "venda" };
    const vendaAsk = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_lote_animal",
      parameters: vendaParams,
    });
    assert(vendaAsk.body.data.requires_confirmation === true, "venda dentro do disponível pede confirmação");
    const vendaConfirm = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "registrar_lote_animal",
      parameters: vendaParams,
      message_text: "sim",
    });
    assert(
      /Venda registrada/.test(vendaConfirm.body.data.reply_text),
      "venda confirmada ('sim') responde sucesso",
    );

    // Isolamento ponta a ponta: tenant B (mesmo endpoint interno) não enxerga
    // o estoque de Bezerro comprado pelo tenant A.
    const ownerB = await dbB.user.create({
      data: scoped({
        name: "Owner B M25",
        email: `m25-ownerb-${Date.now()}@test.local`,
        password_hash: "x",
        role: "OWNER",
      }),
    });
    await dbB.tenantProfile.create({ data: scoped({ profile_type: "fazenda" }) });
    const crossTenantAsk = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "registrar_lote_animal",
      parameters: { category: "Bezerro", quantity: 1, operation: "venda" },
    });
    assert(
      /apenas 0/.test(crossTenantAsk.body.data.reply_text),
      "tenant B não enxerga o estoque de Bezerro do tenant A pelo mesmo endpoint interno (isolamento ponta a ponta)",
    );

    // Sem permissão de escrita (VISUALIZADOR) nega a intenção.
    const viewerA = await dbA.user.create({
      data: scoped({
        name: "Visualizador M25",
        email: `m25-viewer-${Date.now()}@test.local`,
        password_hash: "x",
        role: "VISUALIZADOR",
      }),
    });
    const viewerAttempt = await callExecute({
      tenant_id: tenantA.id,
      user_id: viewerA.id,
      intent: "registrar_lote_animal",
      parameters: { category: "Bezerro", quantity: 1, operation: "compra" },
    });
    assert(
      /permissão/i.test(viewerAttempt.body.data.reply_text),
      "VISUALIZADOR não tem permissão para registrar lote pelo WhatsApp",
    );
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 25: 0 falhas.");
  else console.error(`❌ Módulo 25: ${failures} falha(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
