import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Fase 0 dos Módulos 33 e 34: a tela de contatos.
 *
 * Prova:
 *   1. CONTACT_TYPES cobre o enum inteiro (os 3 tipos do Módulo 32 §24 estavam
 *      fora, e a rota recusava contato de laticínio).
 *   2. Edição altera, e devolve o contato novo.
 *   3. Editar com nome vazio é recusado no campo `name`.
 *   4. Editar contato que não existe devolve 404, não explode.
 *   5. Arquivar tira da listagem, e desarquivar devolve.
 *   6. Contato arquivado não é achado por `findOrCreateContact`: ele CRIA um
 *      novo, que é o comportamento correto (o arquivado saiu de circulação).
 *   7. O detalhe traz as negociações do contato.
 *
 * Roda: `npm run test:m55`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("📇 M55: contatos (fase 0 dos Módulos 33 e 34)\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { ContactType } = await import("@/generated/prisma/enums");
  const {
    CONTACT_TYPES,
    listContacts,
    createContact,
    updateContact,
    setContactArchived,
    getContactDetail,
    findOrCreateContact,
  } = await import("@/lib/actions/contacts");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M55 ${stamp}`, document: `M55${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    console.log("1. CONTACT_TYPES cobre o enum inteiro (§24 do Módulo 32)");
    const doEnum = Object.values(ContactType) as string[];
    const faltando = doEnum.filter((t) => !(CONTACT_TYPES as readonly string[]).includes(t));
    check(
      "nenhum tipo do enum fora de CONTACT_TYPES",
      faltando.length === 0,
      `faltam: ${faltando.join(", ")}`,
    );

    console.log("\n2. Edição");
    const criado = await createContact(db, { name: "Pedro Cercador", type: "prestador_servico" });
    if (!criado.ok) throw new Error("createContact falhou");
    const editado = await updateContact(db, criado.data.id, {
      name: "Pedro Cercador e Filhos",
      type: "prestador_servico",
      phone: "62999990000",
      city: "Rio Verde",
      notes: null,
    });
    check("edição devolve ok", editado.ok);
    check(
      "nome novo persistiu",
      editado.ok && editado.data.name === "Pedro Cercador e Filhos",
      editado.ok ? editado.data.name : "recusado",
    );
    check("telefone persistiu", editado.ok && editado.data.phone === "62999990000");

    console.log("\n3. Recusa por campo");
    const semNome = await updateContact(db, criado.data.id, { name: "   " });
    check("nome vazio é recusado", !semNome.ok);
    check(
      "a recusa aponta o campo name",
      !semNome.ok && semNome.field === "name",
      !semNome.ok ? String(semNome.field) : "aceitou",
    );

    console.log("\n4. Contato inexistente");
    const fantasma = await updateContact(db, "clnaoexiste000000000000", { name: "X" });
    check("editar inexistente devolve recusa", !fantasma.ok);
    check("com status 404", !fantasma.ok && fantasma.status === 404);

    console.log("\n5. Arquivar e desarquivar");
    const arquivado = await setContactArchived(db, criado.data.id, true);
    check("arquivar devolve ok", arquivado.ok);
    const listaSem = await listContacts(db);
    check(
      "arquivado sai da listagem",
      !listaSem.some((c) => c.id === criado.data.id),
      `lista tem ${listaSem.length}`,
    );
    await setContactArchived(db, criado.data.id, false);
    const listaCom = await listContacts(db);
    check(
      "desarquivado volta à listagem",
      listaCom.some((c) => c.id === criado.data.id),
    );

    console.log("\n6. Arquivado não é reaproveitado pela conversa");
    await setContactArchived(db, criado.data.id, true);
    const achado = await findOrCreateContact(db, "Pedro Cercador e Filhos");
    check("findOrCreateContact cria um novo", achado.criado === true);
    check("e não devolve o arquivado", achado.id !== criado.data.id);

    console.log("\n7. Detalhe com histórico");
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M55" }) });
    const joao = await createContact(db, { name: "João Comprador" });
    if (!joao.ok) throw new Error("createContact falhou");
    await db.negotiation.create({
      data: scoped({
        type: "venda_gado",
        occurred_at: new Date("2026-08-01"),
        property_id: fazenda.id,
        contact_id: joao.data.id,
        amount: 15000,
      }),
    });
    const detalhe = await getContactDetail(db, joao.data.id);
    check("detalhe devolve ok", detalhe.ok);
    check(
      "com a negociação do contato",
      detalhe.ok && detalhe.data.negotiations.length === 1,
      detalhe.ok ? String(detalhe.data.negotiations.length) : "recusado",
    );
    check(
      "e o valor serializado como número",
      detalhe.ok && detalhe.data.negotiations[0]?.amount === 15000,
      detalhe.ok ? String(detalhe.data.negotiations[0]?.amount) : "recusado",
    );
    console.log("\n8. As rotas de /contacts/:id existem");
    const rota = await import("@/app/api/v1/contacts/[id]/route");
    check("GET existe", typeof rota.GET === "function");
    check("PATCH existe", typeof rota.PATCH === "function");
    check("DELETE existe", typeof rota.DELETE === "function");
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

comBanco().then(() => {
  console.log(falhas === 0 ? "\n✅ M55 verde" : `\n❌ M55: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
