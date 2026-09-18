import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Task 1 do plano "telefone sempre com o nono dígito": o classificador do
 * WhatsApp recebe o número sem o 9 quando a conta foi criada antes da
 * mudança do nono dígito, e `identificarContato` comparava por igualdade
 * exata (`normalizePhone`), então nunca casava com o cadastro (que tem 13
 * dígitos). `toBrazilPhoneDigits` passa a completar o nono dígito, e
 * `identificarContato` passa a usar essa mesma função, tanto na busca quanto
 * na criação do `WhatsAppContact`.
 *
 * Casos literais do `task-1-brief.md`, escritos ANTES da implementação.
 *
 * Roda: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m71`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("📱 M71: o nono dígito no funil do telefone\n");

async function main() {
  const { toBrazilPhoneDigits } = await import("@/lib/phone");

  console.log("1. toBrazilPhoneDigits: os casos do brief");
  // Os dois números reais que falharam em produção.
  check("Lucas sem o 9 ganha o 9", toBrazilPhoneDigits("553897449264") === "5538997449264");
  check("Max sem o 9 ganha o 9", toBrazilPhoneDigits("553899925508") === "5538999925508");
  // Idempotente: quem já tem o 9 não ganha outro.
  check("com o 9 fica igual", toBrazilPhoneDigits("5538997449264") === "5538997449264");
  // Sem DDI: ganha 55 e o 9.
  check("so DDD e numero antigo", toBrazilPhoneDigits("3897449264") === "5538997449264");
  // FIXO: nunca ganha o 9.
  check("fixo com DDI fica igual", toBrazilPhoneDigits("553832214567") === "553832214567");
  check("fixo sem DDI ganha so o 55", toBrazilPhoneDigits("3832214567") === "553832214567");
  // Formatação solta.
  check("com mascara", toBrazilPhoneDigits("+55 (38) 9744-9264") === "5538997449264");
  // Estrangeiro não é mexido.
  check("numero de fora", toBrazilPhoneDigits("14155552671") === "14155552671");

  console.log("\n2. Ponta a ponta: usuário cadastrado com o 9, mensagem chega sem");
  const { prisma } = await import("@/lib/prisma");
  const { identificarContato } = await import("@/lib/actions/whatsapp-contato");

  const stamp = Date.now();
  // DDD 38, subscriber forçado a começar com 9 (celular): garante que o
  // número "antigo" (12 dígitos) precisa mesmo ganhar o nono dígito, e evita
  // colisão com outro tenant do banco de dev (telefone único por execução).
  const semNono8Digitos = `9${String(stamp).slice(-7)}`;
  const telefoneCanonico = `5538` + `9${semNono8Digitos}`; // 13 dígitos, já com o 9
  const telefoneAntigo = `5538${semNono8Digitos}`; // 12 dígitos, como o WhatsApp antigo manda

  const tenant = await prisma.tenant.create({
    data: { name: `M71 ${stamp}`, document: `M71${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  try {
    await prisma.tenantProfile.create({ data: { tenant_id: tenant.id, profile_type: "fazenda", active: true } });
    const owner = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Dono M71",
        email: `m71-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
        active: true,
        phone: telefoneCanonico,
      },
    });

    const resultado = await identificarContato(telefoneAntigo);
    check(
      "reconhecido mesmo sem o 9 na mensagem",
      resultado.identificado && resultado.tenant_id === tenant.id && resultado.user.id === owner.id,
      JSON.stringify(resultado),
    );

    const contato = await prisma.whatsAppContact.findFirst({ where: { user_id: owner.id } });
    check(
      "o WhatsAppContact nasce com o telefone CANÔNICO (13 dígitos), não o de 12 que chegou",
      contato?.phone === telefoneCanonico,
      contato?.phone,
    );

    // Segunda mensagem, ainda sem o 9: não deve criar um segundo contato.
    const segunda = await identificarContato(telefoneAntigo);
    check(
      "segunda mensagem não é mais 'primeiro contato'",
      segunda.identificado && segunda.primeiro_contato === false,
    );
    const total = await prisma.whatsAppContact.count({ where: { user_id: owner.id } });
    check("continua um único WhatsAppContact", total === 1, String(total));
  } finally {
    await prisma.whatsAppContact.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.agentConversationLog.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.user.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenantProfile.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M71 verde" : `\n❌ M71: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
