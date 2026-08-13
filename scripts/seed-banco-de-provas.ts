import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Cria (ou reaproveita) o tenant do banco de provas do agente WhatsApp.
 *
 * Existe um tenant SÓ para isso, em vez de testar na conta de alguém, por
 * dois motivos: as contas de produção são de pessoas reais da equipe do
 * cliente, e bezerro de teste no rebanho de quem está validando o sistema
 * destrói a confiança no número que ele está conferindo. O isolamento por
 * tenant, que é a regra mais forte do projeto, faz o resto: nada que
 * acontecer aqui aparece em qualquer outra conta.
 *
 * Idempotente: rodar de novo não duplica nada.
 *
 * Uso: npx tsx scripts/seed-banco-de-provas.ts <telefone-so-digitos>
 */

const NOME_TENANT = "BANCO DE PROVAS (automacao Tibe)";
const EMAIL = "banco-de-provas@tibe.local";

async function main() {
  const telefone = (process.argv[2] ?? "").replace(/\D/g, "");
  if (telefone.length < 12) {
    throw new Error("Informe o telefone com DDI e DDD, so digitos. Ex: 5511900000001");
  }

  const conflito = await prisma.user.findFirst({
    where: { phone: telefone },
    select: { email: true, tenant: { select: { name: true } } },
  });
  if (conflito && conflito.email !== EMAIL) {
    throw new Error(
      `O telefone ${telefone} ja pertence a ${conflito.email} (tenant "${conflito.tenant.name}"). ` +
        "Escolha outro numero: reaproveitar um numero real faria o banco de provas escrever na conta de alguem.",
    );
  }

  let tenant = await prisma.tenant.findFirst({ where: { name: NOME_TENANT } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: NOME_TENANT,
        document: "00000000000191",
        plan: "fazenda",
        plan_confirmed: true,
        status: "trial",
        // Trial longo de propósito: um banco de provas que expira vira uma
        // falha misteriosa de permissao no meio de um teste de conversa.
        trial_ends_at: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`tenant criado: ${tenant.id}`);
  } else {
    console.log(`tenant ja existia: ${tenant.id}`);
  }

  await prisma.tenantProfile.upsert({
    where: { tenant_id_profile_type: { tenant_id: tenant.id, profile_type: "fazenda" } },
    create: { tenant_id: tenant.id, profile_type: "fazenda", active: true },
    update: { active: true },
  });

  const existente = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existente) {
    await prisma.user.update({
      where: { id: existente.id },
      data: { phone: telefone, active: true, must_change_password: false },
    });
    console.log(`usuario atualizado: ${EMAIL} -> tel ${telefone}`);
  } else {
    await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Banco de Provas",
        email: EMAIL,
        phone: telefone,
        password_hash: await bcrypt.hash("banco-de-provas-nao-usar", 10),
        role: "OWNER",
        active: true,
        must_change_password: false,
      },
    });
    console.log(`usuario criado: ${EMAIL} -> tel ${telefone}`);
  }

  const fazenda = await prisma.property.findFirst({
    where: { tenant_id: tenant.id, archived_at: null },
  });
  if (!fazenda) {
    const nova = await prisma.property.create({
      data: {
        tenant_id: tenant.id,
        name: "Fazenda de Provas",
        area_hectares: 500,
        city: "Montes Claros",
        district: "Zona Rural",
      },
    });
    console.log(`fazenda criada: ${nova.name}`);
  } else {
    console.log(`fazenda ja existia: ${fazenda.name}`);
  }

  console.log(`\nPronto. Ponha no .env:\n  WA_TEST_PHONE=${telefone}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
