import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Rebanho cadastrado APARECE no saldo.
 *
 * O defeito, ate 2026-08-20: desde o Modulo 30 o saldo e o livro-razao, e
 * `POST /api/v1/animals` (mais o cadastro assistido do WhatsApp, que chama a
 * mesma camada) gravava so `AnimalBatch.quantity`, que o saldo ignora. O
 * produtor cadastrava e as cabecas nao apareciam em lugar nenhum: nem no
 * painel, nem na resposta do assistente. Sem erro e sem aviso.
 *
 * Roda: `npm run test:m45` (precisa do banco local).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("🐄 M45: lote cadastrado entra no saldo\n");

  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { createBatchAction } = await import("@/lib/actions/animal-batches");
  const { getPositions } = await import("@/lib/actions/herd-ledger");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M45 ${stamp}`, document: `M45${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const property = await db.property.create({ data: scoped({ name: "Fazenda M45" }) });

    console.log("1. Categoria que o livro-razao entende: entra no saldo");
    {
      // "Bezerro" e um dos apelidos que `resolveCategoryTerm` resolve sem
      // ambiguidade, porque bezerro e sempre 0 a 7 meses.
      const cat = await db.animalCategory.create({ data: scoped({ name: "Bezerro" }) });

      const r = await createBatchAction(db, {
        category_id: cat.id,
        property_id: property.id,
        quantity: 20,
      });
      assert(r.ok, "o lote e criado");

      const posicoes = await getPositions(db);
      const total = posicoes.reduce((s, p) => s + p.quantity, 0);
      assert(total === 20, `o saldo passa a contar as 20 cabecas (contou ${total})`);

      const movimentos = await db.herdMovement.count();
      assert(movimentos === 1, `foi gravada UMA movimentacao (foram ${movimentos})`);

      const mov = await db.herdMovement.findFirst();
      const idDoLote = r.ok ? r.data.id : null;
      assert(mov?.batch_id === idDoLote, "a movimentacao aponta para o lote criado");
      assert(mov?.to_category_id === "bezerro_0_7", `caiu na categoria certa (${mov?.to_category_id})`);
      assert(mov?.to_property_id === property.id, "caiu na fazenda certa");
    }

    console.log("\n2. Categoria antiga que NAO traduz: o lote existe, e o residuo fica visivel");
    {
      // "Nao classificado" e o placeholder da migracao de 2026-08-04, e nao
      // corresponde a nenhuma das 12 faixas. Chutar uma faixa seria pior:
      // lancaria animal na idade errada, que e exatamente o que o modulo
      // proibe. Entao o lote e criado e o residuo aparece no diagnostico.
      const cat = await db.animalCategory.create({ data: scoped({ name: "Não classificado" }) });

      const antes = await db.herdMovement.count();
      const r = await createBatchAction(db, {
        category_id: cat.id,
        property_id: property.id,
        quantity: 7,
      });
      assert(r.ok, "o lote continua sendo criado (quebrar o cadastro seria pior)");

      const depois = await db.herdMovement.count();
      assert(depois === antes, "nenhuma movimentacao inventada com categoria chutada");

      const invisiveis = await db.animalBatch.count({
        where: { quantity: { gt: 0 }, herd_movements: { none: {} } },
      });
      assert(invisiveis === 1, `o residuo e contavel: ${invisiveis} lote sem movimento`);
    }

    console.log("\n3. Cadastro com brinco (uma cabeca) tambem entra");
    {
      // "Vaca" resolve sem ambiguidade para fêmea acima de 36 meses, e é como
      // o produtor fala. Note que "Novilha de 13 a 24 meses" NAO resolveria:
      // os apelidos sao termos simples ("novilha", "vaca") e os labels tem
      // forma propria ("Fêmea - 13 a 24 meses"), entao uma frase que mistura
      // os dois cai no residuo. Isso e o comportamento correto, e nao um
      // buraco: chutar a faixa e o que o modulo proibe.
      const cat = await db.animalCategory.create({ data: scoped({ name: "Vaca" }) });
      const r = await createBatchAction(db, {
        category_id: cat.id,
        property_id: property.id,
        quantity: 1,
        ear_tag: `M45-${stamp}`,
      });
      assert(r.ok, "lote de 1 cabeca com brinco e criado");

      const posicoes = await getPositions(db);
      const total = posicoes.reduce((s, p) => s + p.quantity, 0);
      assert(total === 21, `saldo agora e 21 (20 + 1), e nao conta o nao classificado (contou ${total})`);
    }

    console.log("");
    if (failures > 0) {
      console.error(`❌ M45: ${failures} falha(s).`);
      process.exit(1);
    }
    console.log("✅ M45: 0 falhas.");
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

main();
