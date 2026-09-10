import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { createLinkedEntry } from "@/lib/financial";
import { registrarPagamentoAction } from "@/lib/actions/financial-payments";

/**
 * Monta, no banco LOCAL, o cenário da fase 35.1 do Financeiro para OLHAR a
 * tela. Não é suíte: é o preparo da validação ao vivo (T10).
 *
 * | caso | o que ele prova na tela |
 * |---|---|
 * | venda de 20.000 com 8.000 recebidos | "Parcialmente recebida", saldo de 12.000, painel com a lista |
 * | compra de 10.000 vencida há 12 dias | "Vencida" derivada, que o status `overdue` nunca deu |
 * | diária de 900 já paga | "Paga", e o pagamento que nasce junto do lançamento |
 * | insumo de 1.500 sem fazenda | o aviso de quantos ficaram fora do filtro |
 *
 * Os três primeiros ficam na primeira fazenda do tenant, com contato.
 * Idempotente: apaga o que ele mesmo criou antes de recriar, reconhecendo pelo
 * prefixo do `related_id`. ⚠️ `createLinkedEntry` **não aceita `notes`**, então
 * a marca precisa viver no `related_id`.
 */
exigirBancoLocal();

const DOCUMENTO = "11222333000181";
const MARCA = "cenario-35";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { document: DOCUMENTO } });
  if (!tenant) {
    console.error("❌ Tenant do seed nao encontrado. Rode `npm run db:seed` primeiro.");
    process.exit(1);
  }
  const db = prismaForTenant(tenant.id);

  const antigos = await db.financialEntry.findMany({
    where: { related_id: { startsWith: MARCA } },
    select: { id: true },
  });
  if (antigos.length > 0) {
    const ids = antigos.map((e) => e.id);
    await db.financialPayment.deleteMany({ where: { entry_id: { in: ids } } });
    await db.financialEntry.deleteMany({ where: { id: { in: ids } } });
    console.log(`  limpou ${antigos.length} lancamento(s) de uma rodada anterior`);
  }

  let fazenda = await db.property.findFirst({ where: { archived_at: null }, orderBy: { name: "asc" } });
  if (!fazenda) {
    fazenda = await db.property.create({ data: scoped({ name: "Fazenda Santa Helena" }) });
  }

  let contato = await db.contact.findFirst({ where: { archived_at: null } });
  if (!contato) {
    contato = await db.contact.create({ data: scoped({ name: "Frigorifico Boi Forte" }) });
  }

  const agora = new Date();
  const diasAtras = (n: number) => new Date(agora.getTime() - n * 86_400_000);

  const venda = await createLinkedEntry(db, {
    entry_type: "income",
    category: "Venda de animais",
    amount: 20000,
    related_module: "rebanho",
    related_id: `${MARCA}-venda`,
    occurred_at: diasAtras(5),
    status: "pending",
    due_date: diasAtras(5),
    property_id: fazenda.id,
    contact_id: contato.id,
  });
  const parcial = await registrarPagamentoAction(db, venda.id, {
    amount: 8000,
    paid_at: diasAtras(2),
    method: "pix",
    notes: "primeira parcela",
  });
  if (!parcial.ok) {
    console.error("❌ nao consegui registrar o recebimento parcial:", parcial.message);
    process.exit(1);
  }

  await createLinkedEntry(db, {
    entry_type: "expense",
    category: "Alimentação animal",
    amount: 10000,
    related_module: "geral",
    related_id: `${MARCA}-vencida`,
    occurred_at: diasAtras(12),
    status: "pending",
    due_date: diasAtras(12),
    property_id: fazenda.id,
    contact_id: contato.id,
  });

  await createLinkedEntry(db, {
    entry_type: "expense",
    category: "Mão de obra",
    amount: 900,
    related_module: "mao_de_obra",
    related_id: `${MARCA}-paga`,
    occurred_at: diasAtras(3),
    status: "paid",
    due_date: diasAtras(3),
    property_id: fazenda.id,
  });

  await createLinkedEntry(db, {
    entry_type: "expense",
    category: "Sementes",
    amount: 1500,
    related_module: "lavoura",
    related_id: `${MARCA}-sem-fazenda`,
    occurred_at: diasAtras(8),
    status: "pending",
    due_date: diasAtras(8),
  });

  console.log("\n✅ Cenario da fase 35.1 montado.");
  console.log(`   fazenda: ${fazenda.name} (${fazenda.id})`);
  console.log(`   contato: ${contato.name}`);
  console.log("   /financeiro deve mostrar: Parcialmente recebida (12.000 a receber),");
  console.log("   Vencida, Paga, e o aviso de 1 lancamento sem fazenda quando filtrar.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌", e);
  await prisma.$disconnect();
  process.exit(1);
});
