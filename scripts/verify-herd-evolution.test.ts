import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";
import { getHerdEvolution } from "@/lib/actions/herd-evolution";

/**
 * A trava faltava aqui, e a falha e a MESMA que causou o acidente de
 * 2026-08-15: ela foi aplicada em massa por um filtro `scripts/m*.test.ts`, e
 * este arquivo nao casa com o padrao. Ele varre `prisma.tenant.findMany()` sem
 * escopo, entao rodar contra o Neon leria a base inteira de clientes reais.
 * Nao ha perda de proposito: o comentario do laco ja diz que o volume vem do
 * `npm run seed:demo`, que semeia o banco local.
 */
exigirBancoLocal();

/**
 * Prova que a reescrita de `getHerdEvolution` (auditoria de performance,
 * 2026-08-04: de 2 queries POR MÊS para 4 no total) devolve exatamente o
 * mesmo resultado da implementação antiga, contra os dados reais do banco.
 *
 * A implementação antiga (laço mês a mês) está reproduzida aqui de propósito:
 * é a referência contra a qual a nova é comparada. Atualizada em 2026-08-04
 * para SOMAR cabeças em vez de contar linhas: o que a referência guarda é a
 * FORMA de calcular (uma query por mês), não a semântica antiga de 1 animal
 * por linha, que deixou de existir com o modelo único de lote. Se um dia a regra do gráfico mudar de
 * verdade, este teste deve ser atualizado junto, conscientemente.
 *
 * Roda: `npm run test:herd`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

/** Implementação ANTIGA, laço mês a mês: referência da comparação. */
async function getHerdEvolutionLegacy(
  db: TenantPrismaClient,
  opts: { months: number; propertyId?: string | null },
): Promise<{ month: string; count: number }[]> {
  const now = new Date();
  const points: { month: string; count: number }[] = [];
  const propertyFilter = opts.propertyId ? { property_id: opts.propertyId } : {};

  for (let i = opts.months - 1; i >= 0; i--) {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const [registered, departed] = await Promise.all([
      db.animalBatch
        .aggregate({ where: { created_at: { lte: monthEnd }, ...propertyFilter }, _sum: { quantity: true } })
        .then((a) => a._sum.quantity ?? 0),
      db.animalMovement.aggregate({
        where: {
          movement_type: { in: ["sale", "death"] },
          occurred_at: { lte: monthEnd },
          ...(opts.propertyId ? { batch: { property_id: opts.propertyId } } : {}),
        },
        _sum: { quantity: true },
      }).then((a) => a._sum.quantity ?? 0),
    ]);
    points.push({
      month: monthEnd.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      count: Math.max(registered - departed, 0),
    });
  }
  return points;
}

async function main() {
  console.log("📈 getHerdEvolution: nova implementação x antiga\n");

  // Roda contra todos os tenants que têm animais: o seed de demonstração dá
  // volume real (2 anos de histórico), e tenants vazios cobrem o caso zero.
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let comparados = 0;

  for (const tenant of tenants) {
    const db = prismaForTenant(tenant.id);
    const total = await db.animalBatch.count();
    if (total === 0) continue;

    const properties = await db.property.findMany({ select: { id: true }, take: 2 });
    const cenarios: (string | null)[] = [null, ...properties.map((p) => p.id)];

    for (const propertyId of cenarios) {
      for (const months of [1, 6, 12]) {
        const [novo, antigo] = await Promise.all([
          getHerdEvolution(db, { months, propertyId }),
          getHerdEvolutionLegacy(db, { months, propertyId }),
        ]);
        const escopo = `${tenant.name} / ${propertyId ?? "todas"} / ${months}m`;
        assert(
          JSON.stringify(novo) === JSON.stringify(antigo),
          `${escopo}: resultado idêntico (${JSON.stringify(novo.map((p) => p.count))})`,
        );
        comparados++;
      }
    }
  }

  if (comparados === 0) {
    console.error("  ❌ nenhum tenant com animais: o teste não provou nada");
    failures++;
  }

  console.log("");
  if (failures === 0) {
    console.log(`✅ getHerdEvolution validado em ${comparados} cenário(s): 0 falhas.`);
  } else {
    console.error(`❌ getHerdEvolution DIVERGIU: ${failures} cenário(s) com erro.`);
  }
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
