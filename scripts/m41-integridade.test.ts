import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * As garantias que passaram a viver no BANCO, e nao so no codigo.
 *
 * Tres coisas que a documentacao prometia e o schema nao entregava:
 *   1. idempotencia de alerta (era `findFirst` + `create`, racy sob concorrencia)
 *   2. integridade dos eixos de posicao do livro-razao (texto solto, sem FK)
 *   3. auditoria do financeiro (nao dava para saber quem criou nem quando mudou)
 *
 * Roda: `npm run test:m41` (precisa do banco local).
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
  console.log("🔗 M41: integridade e auditoria no banco\n");

  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M41 ${stamp}`, document: `M41${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const user = await db.user.create({
      data: scoped({
        name: "M41 Owner",
        email: `m41-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER" as const,
      }),
    });
    const property = await db.property.create({ data: scoped({ name: "Fazenda M41" }) });

    console.log("1. Alerta: a mesma chave no mesmo dia colide de verdade");
    {
      const chave = `vaccine_due|rebanho|alvo-${stamp}|${new Date().toISOString().slice(0, 10)}`;
      await db.alert.create({
        data: scoped({
          alert_type: "vaccine_due" as const,
          related_module: "rebanho" as const,
          related_id: `alvo-${stamp}`,
          message: "primeiro",
          dedup_key: chave,
        }),
      });

      let colidiu = false;
      try {
        await db.alert.create({
          data: scoped({
            alert_type: "vaccine_due" as const,
            related_module: "rebanho" as const,
            related_id: `alvo-${stamp}`,
            message: "segundo, deveria ser recusado",
            dedup_key: chave,
          }),
        });
      } catch (e) {
        colidiu = (e as { code?: unknown })?.code === "P2002";
      }
      assert(colidiu, "segundo alerta com a mesma chave e recusado pelo banco (P2002)");

      // A janela e o ponto: alerta recorrente precisa voltar a avisar amanha.
      const amanha = chave.replace(/\d{4}-\d{2}-\d{2}$/, "2099-01-01");
      const outroDia = await db.alert.create({
        data: scoped({
          alert_type: "vaccine_due" as const,
          related_module: "rebanho" as const,
          related_id: `alvo-${stamp}`,
          message: "mesmo alvo, outro dia",
          dedup_key: amanha,
        }),
      });
      assert(!!outroDia.id, "o MESMO alvo em outro dia e aceito (a recorrencia sobrevive)");
    }

    console.log("\n2. Alerta: a corrida que o findFirst nao cobria");
    {
      const chave = `bill_due|geral|corrida-${stamp}|${new Date().toISOString().slice(0, 10)}`;
      const tentativa = () =>
        db.alert.create({
          data: scoped({
            alert_type: "bill_due" as const,
            related_module: "geral" as const,
            related_id: `corrida-${stamp}`,
            message: "concorrente",
            dedup_key: chave,
          }),
        });

      const r = await Promise.allSettled([tentativa(), tentativa(), tentativa()]);
      const criados = r.filter((x) => x.status === "fulfilled").length;
      assert(criados === 1, `tres criacoes simultaneas produzem exatamente 1 alerta (produziram ${criados})`);
    }

    console.log("\n3. Livro-razao: propriedade inexistente e recusada");
    {
      let recusou = false;
      try {
        await db.herdMovement.create({
          data: scoped({
            movement_type: "compra" as const,
            quantity: 5,
            occurred_at: new Date(),
            to_category_id: "bezerro_0_7",
            to_property_id: `nao-existe-${stamp}`,
          }),
        });
      } catch (e) {
        recusou = (e as { code?: unknown })?.code === "P2003";
      }
      assert(recusou, "movimentacao apontando para propriedade inexistente e recusada (P2003)");
    }

    console.log("\n4. Livro-razao: categoria continua sendo chave de codigo, sem FK");
    {
      // Isto NAO e permissividade por esquecimento: categoria e constante de
      // codigo (`src/lib/herd/categories.ts`), nao linha de tabela. Uma FK
      // aqui travaria toda movimentacao existente. Quem valida e
      // `isValidCategory()`, na action.
      const mov = await db.herdMovement.create({
        data: scoped({
          movement_type: "compra" as const,
          quantity: 3,
          occurred_at: new Date(),
          to_category_id: "bezerro_0_7",
          to_property_id: property.id,
        }),
      });
      assert(mov.to_category_id === "bezerro_0_7", "categoria como chave de codigo e aceita pelo banco");
    }

    console.log("\n5. Livro-razao: apagar propriedade em uso e barrado");
    {
      let barrou = false;
      try {
        await db.property.delete({ where: { id: property.id } });
      } catch (e) {
        barrou = (e as { code?: unknown })?.code === "P2003";
      }
      assert(barrou, "propriedade referenciada pelo livro-razao nao pode ser apagada (P2003)");
    }

    console.log("\n6. Financeiro: autoria e updated_at existem e funcionam");
    {
      const entry = await db.financialEntry.create({
        data: scoped({
          entry_type: "expense" as const,
          category: "Teste M41",
          amount: 100,
          due_date: new Date(),
          created_by_user_id: user.id,
        }),
      });
      assert(entry.created_by_user_id === user.id, "grava quem criou o lancamento");

      const depois = await db.financialEntry.update({
        where: { id: entry.id },
        data: { amount: 150, updated_by_user_id: user.id },
      });
      assert(depois.updated_by_user_id === user.id, "grava quem alterou");
      assert(depois.updated_at != null, "updated_at passa a existir apos a alteracao");
    }

    console.log("\n7. Livro-razao: apagar a entrada financeira nao deixa ponteiro pendurado");
    {
      // `cancelMovement()` APAGA a FinancialEntry pendente de proposito. Antes
      // da FK, o vinculo ficava apontando para linha inexistente se o codigo
      // esquecesse de limpar. Agora o banco resolve.
      const entry = await db.financialEntry.create({
        data: scoped({
          entry_type: "expense" as const,
          category: "Vinculo M41",
          amount: 50,
          due_date: new Date(),
        }),
      });
      const mov = await db.herdMovement.create({
        data: scoped({
          movement_type: "compra" as const,
          quantity: 1,
          occurred_at: new Date(),
          to_category_id: "bezerro_0_7",
          to_property_id: property.id,
          financial_entry_id: entry.id,
        }),
      });

      await db.financialEntry.delete({ where: { id: entry.id } });
      const depois = await db.herdMovement.findUnique({ where: { id: mov.id } });
      assert(depois?.financial_entry_id === null, "o vinculo vira nulo sozinho, em vez de apontar para o vazio");
    }

    console.log("");
    if (failures > 0) {
      console.error(`❌ M41: ${failures} falha(s).`);
      process.exit(1);
    }
    console.log("✅ M41: 0 falhas.");
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

main();
