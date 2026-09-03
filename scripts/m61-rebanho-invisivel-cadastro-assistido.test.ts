import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { maybeStartAnimalFlow, handleActiveFlow } from "@/lib/actions/whatsapp-flow-bridge";
import { getPositions } from "@/lib/actions/herd-ledger";
import type { Intent } from "@/lib/whatsapp-intents";

exigirBancoLocal();

/**
 * O rebanho invisível do cadastro assistido (`dividas.md` §2.9).
 *
 * Prova, pela PONTE (`whatsapp-flow-bridge.ts`), não só pela máquina de
 * estados (isso já é o `m21`):
 *   1. Cadastro assistido completo cria `AnimalBatch` E `HerdMovement`.
 *   2. O saldo (`getPositions`) enxerga o animal depois do cadastro.
 *   3. Categoria que não traduz faz o fluxo reperguntar, e não grava.
 *   4. Falha em item (brinco repetido) registra o motivo na contagem, e não
 *      derruba os outros itens do mesmo lote.
 *
 * Roda: `npm run test:m61`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🐄 M61: o rebanho invisível do cadastro assistido (dividas.md §2.9)\n");

async function main() {
  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M61 ${stamp}`, document: `M61${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const user = await db.user.create({
      data: scoped({
        name: "Dono M61",
        email: `m61-${stamp}@t.local`,
        password_hash: "x",
        role: "OWNER",
      }),
    });
    await db.property.create({ data: scoped({ name: "Fazenda M61" }) });

    const falar = (
      messageText: string,
      opts: { confirmed?: boolean; explicitNo?: boolean; intent?: Intent } = {},
    ) =>
      handleActiveFlow({
        db,
        userId: user.id,
        intent: opts.intent ?? ("ambigua" as Intent),
        messageText,
        confirmed: opts.confirmed ?? false,
        explicitNo: opts.explicitNo ?? false,
      });

    console.log("1. Cadastro completo: brinco, raça, sexo, categoria, e o 'sim' final");
    const abriu = await maybeStartAnimalFlow(db, user.id, {});
    check("abre o modo assistido quando faltam campos", abriu !== null, JSON.stringify(abriu));

    await falar("501");
    await falar("Nelore");
    await falar("femea");
    const perguntouCategoria = await falar("vaca");
    check(
      "com os 4 campos, chega ao resumo",
      perguntouCategoria?.action_taken === "cadastro_assistido:summary",
      perguntouCategoria?.action_taken,
    );

    const antes = await db.animalBatch.count();
    check("nada gravado antes do 'sim'", antes === 0, String(antes));

    const commit = await falar("sim", { confirmed: true });
    check(
      "o 'sim' confirma o cadastro",
      commit?.action_taken === "cadastro_assistido:concluido",
      commit?.action_taken,
    );
    check(
      "a resposta diz 1 animal cadastrado",
      (commit?.reply_text ?? "").includes("1 animal"),
      commit?.reply_text,
    );

    check("um AnimalBatch foi criado", (await db.animalBatch.count()) === 1, String(await db.animalBatch.count()));

    /**
     * ⚠️ O CASO QUE DISCRIMINA A FASE INTEIRA. Antes desta correção,
     * `commitAnimals` chamava `db.animalBatch.create()` direto: o lote
     * existia, mas NENHUM `HerdMovement` nascia, e o saldo continuava o
     * mesmo. Sem erro, sem aviso.
     */
    const movimentos = await db.herdMovement.count();
    check(
      "e um HerdMovement foi criado junto (o defeito original)",
      movimentos === 1,
      String(movimentos),
    );

    const posicoes = await getPositions(db, { category_id: "femea_36_mais" });
    const total = posicoes.reduce((s, p) => s + p.quantity, 0);
    check(
      "o saldo (getPositions) enxerga o animal na categoria certa",
      total === 1,
      String(total),
    );

    console.log("\n2. Categoria que não traduz: repergunta, e não grava");
    await maybeStartAnimalFlow(db, user.id, {});
    await falar("502");
    await falar("Angus");
    await falar("macho");
    const ambigua = await falar("novilho");
    check(
      "'novilho' é ambíguo (3 faixas): repergunta em vez de escolher",
      ambigua?.action_taken === "cadastro_assistido:question" &&
        (ambigua.reply_text ?? "").toLowerCase().includes("categoria"),
      JSON.stringify(ambigua),
    );
    const desconhecida = await falar("sei lá o que é isso");
    check(
      "categoria desconhecida também repergunta",
      desconhecida?.action_taken === "cadastro_assistido:question",
      desconhecida?.action_taken,
    );
    check(
      "nenhum AnimalBatch novo nasceu enquanto a categoria não resolveu",
      (await db.animalBatch.count()) === 1,
      String(await db.animalBatch.count()),
    );
    // Cancela para não deixar o fluxo aberto contaminando o bloco seguinte.
    await falar("cancelar", { explicitNo: true });

    console.log("\n3. Falha num item (brinco repetido) não derruba o lote inteiro");
    const fazenda = await db.property.findFirstOrThrow();
    const categoriaVaca =
      (await db.animalCategory.findFirst({ where: { name: "Fêmea - acima de 36 meses" } })) ??
      (await db.animalCategory.create({ data: scoped({ name: "Fêmea - acima de 36 meses" }) }));
    await db.animalBatch.create({
      data: scoped({
        ear_tag: "900",
        breed: "Nelore",
        sex: "female",
        property_id: fazenda.id,
        category_id: categoriaVaca.id,
        quantity: 1,
      }),
    });

    await maybeStartAnimalFlow(db, user.id, { count: 2 });
    // Primeiro item: brinco "900", que já existe. Segundo: brinco novo "901".
    await falar("900");
    await falar("Nelore");
    await falar("femea");
    await falar("vaca");
    await falar("901");
    await falar("Nelore");
    await falar("femea");
    await falar("vaca");
    const resultado = await falar("sim", { confirmed: true });
    check(
      "a resposta relata o que não pôde ser cadastrado, sem esconder",
      (resultado?.reply_text ?? "").includes("1 não pude cadastrar"),
      resultado?.reply_text,
    );
    check(
      "o item novo (901) foi gravado mesmo com o outro falhando",
      (await db.animalBatch.count({ where: { ear_tag: "901" } })) === 1,
    );
    check(
      "e o total de lotes é 900 (pré-existente) + 501 + 901, não mais",
      (await db.animalBatch.count()) === 3,
      String(await db.animalBatch.count()),
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M61 verde" : `\n❌ M61: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
