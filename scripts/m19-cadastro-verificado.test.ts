import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  startSignupAction,
  verifySignupCodeAction,
  resendSignupCodeAction,
  getSignupStateAction,
  purgeExpiredSignups,
  maskEmail,
  maskPhone,
  MAX_CODE_ATTEMPTS,
} from "@/lib/actions/signup-flow";

/**
 * Testes do Módulo 19 (cadastro público verificado em 4 etapas).
 *
 * O envio real (WhatsApp/email) não é exercitado: as funções de disparo falham
 * graciosamente sem credencial, e o que importa aqui é a máquina de estados.
 * Os códigos em claro não voltam pela API de propósito, então os testes leem o
 * hash e injetam um código conhecido, mesmo padrão do teste de recuperação de
 * senha (m16).
 * Roda: `npm run test:m19`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

/** Injeta um código conhecido no canal, devolvendo o valor em claro. */
async function forceCode(signupId: string, channel: "whatsapp" | "email") {
  const code = "123456";
  const hash = await bcrypt.hash(code, 10);
  const expires = new Date(Date.now() + 10 * 60_000);
  await prisma.pendingSignup.update({
    where: { id: signupId },
    data:
      channel === "whatsapp"
        ? {
            whatsapp_code_hash: hash,
            whatsapp_code_expires_at: expires,
            whatsapp_attempts: 0,
          }
        : { email_code_hash: hash, email_code_expires_at: expires, email_attempts: 0 },
  });
  return code;
}

async function main() {
  console.log("📝 Módulo 19: cadastro público verificado\n");

  const stamp = Date.now().toString().slice(-9);
  const doc = `9${stamp}0`;
  const email = `m19-${stamp}@test.local`;
  const createdTenantIds: string[] = [];
  const createdSignupIds: string[] = [];

  const base = {
    company_name: "M19 Fazenda Teste",
    owner_name: "Dono M19",
    owner_email: email,
    document: doc,
    phone: "22988887777",
    plan: "fazenda" as const,
  };

  try {
    // ── mascaramento não vaza o contato inteiro ───────────────────────
    assert(!maskEmail("joao@fazenda.com.br").startsWith("joao@"), "maskEmail esconde o usuário");
    assert(maskPhone("5522988887777").includes("*"), "maskPhone esconde o miolo do número");

    // ── etapa 1: cria pendente, NÃO cria tenant ───────────────────────
    const started = await startSignupAction(base);
    assert(started.ok, "startSignupAction abre o cadastro pendente");
    const signupId = started.ok ? started.data.signup_id : "";
    createdSignupIds.push(signupId);

    const tenantAfterStart = await prisma.tenant.findUnique({ where: { document: doc } });
    assert(tenantAfterStart === null, "etapa 1 NÃO cria Tenant (KPI e CPF preservados)");
    const userAfterStart = await prisma.user.findUnique({ where: { email } });
    assert(userAfterStart === null, "etapa 1 NÃO cria User");
    assert(
      started.ok && started.data.state.current_step === "whatsapp",
      "o primeiro passo é o WhatsApp",
    );

    // ── ordem obrigatória: email antes do WhatsApp é recusado ─────────
    const emailFirst = await verifySignupCodeAction(signupId, "email", "123456");
    assert(
      !emailFirst.ok && emailFirst.code === "WHATSAPP_PENDING",
      "não dá para confirmar o email antes do WhatsApp",
    );

    // ── código errado não revela nada e conta tentativa ───────────────
    await forceCode(signupId, "whatsapp");
    const wrong = await verifySignupCodeAction(signupId, "whatsapp", "000000");
    assert(!wrong.ok && wrong.code === "INVALID_CODE", "código errado devolve INVALID_CODE");
    const afterWrong = await prisma.pendingSignup.findUnique({ where: { id: signupId } });
    assert(afterWrong?.whatsapp_attempts === 1, "tentativa errada é contabilizada");

    // ── código expirado responde igual a código errado ────────────────
    await prisma.pendingSignup.update({
      where: { id: signupId },
      data: { whatsapp_code_expires_at: new Date(Date.now() - 1000) },
    });
    const expired = await verifySignupCodeAction(signupId, "whatsapp", "123456");
    assert(
      !expired.ok && expired.code === "INVALID_CODE",
      "código expirado devolve o MESMO erro do código errado (sem diferenciar)",
    );

    // ── limite de tentativas invalida o código, não a conta ───────────
    await forceCode(signupId, "whatsapp");
    await prisma.pendingSignup.update({
      where: { id: signupId },
      data: { whatsapp_attempts: MAX_CODE_ATTEMPTS },
    });
    const blocked = await verifySignupCodeAction(signupId, "whatsapp", "123456");
    assert(
      !blocked.ok && blocked.code === "TOO_MANY_ATTEMPTS",
      "estourar tentativas bloqueia o código",
    );
    const stillAlive = await getSignupStateAction(signupId);
    assert(stillAlive.ok, "o cadastro continua vivo depois do bloqueio do código");

    // ── reenvio zera tentativas e permite seguir ──────────────────────
    const resent = await resendSignupCodeAction(signupId, "whatsapp");
    assert(resent.ok, "reenviar código é permitido para canal não verificado");
    const afterResend = await prisma.pendingSignup.findUnique({ where: { id: signupId } });
    assert(afterResend?.whatsapp_attempts === 0, "reenvio zera o contador de tentativas");

    // ── corrigir o número troca o destino ─────────────────────────────
    const fixed = await resendSignupCodeAction(signupId, "whatsapp", "22977776666");
    assert(fixed.ok, "corrigir o número é permitido");
    const afterFix = await prisma.pendingSignup.findUnique({ where: { id: signupId } });
    assert(afterFix?.phone === "5522977776666", "o novo número é normalizado e persistido");

    // ── confirma WhatsApp: ainda sem conta, e o email vira o passo ────
    const waCode = await forceCode(signupId, "whatsapp");
    const waOk = await verifySignupCodeAction(signupId, "whatsapp", waCode);
    assert(waOk.ok && !waOk.data.completed, "WhatsApp confirmado não conclui o cadastro");
    assert(
      waOk.ok && !waOk.data.completed && waOk.data.state.current_step === "email",
      "depois do WhatsApp o passo passa a ser o email",
    );
    assert(
      (await prisma.tenant.findUnique({ where: { document: doc } })) === null,
      "com apenas UM canal verificado, o Tenant ainda não existe",
    );

    // ── canal já verificado não aceita reenvio ────────────────────────
    const resendVerified = await resendSignupCodeAction(signupId, "whatsapp");
    assert(
      !resendVerified.ok && resendVerified.code === "ALREADY_VERIFIED",
      "canal já confirmado recusa novo envio",
    );

    // ── conclusão: os dois canais criam a conta de verdade ────────────
    const emailCode = await forceCode(signupId, "email");
    const done = await verifySignupCodeAction(signupId, "email", emailCode);
    assert(done.ok && done.data.completed, "o segundo canal conclui o cadastro");
    assert(
      done.ok && done.data.completed && done.data.temp_password.length > 0,
      "a conclusão devolve a senha temporária para o login automático",
    );

    const tenant = await prisma.tenant.findUnique({ where: { document: doc } });
    assert(tenant !== null, "Tenant criado só depois dos DOIS canais verificados");
    if (tenant) createdTenantIds.push(tenant.id);
    assert(tenant?.status === "trial", "Tenant nasce em trial");

    const user = await prisma.user.findUnique({ where: { email } });
    assert(user?.role === "OWNER", "o responsável nasce como OWNER");
    assert(
      user?.must_change_password === true,
      "a troca de senha é obrigatória no primeiro acesso",
    );
    assert(
      user?.phone === "5522977776666",
      "o telefone gravado é o corrigido e verificado, não o digitado no formulário",
    );

    const pendingGone = await prisma.pendingSignup.findUnique({ where: { id: signupId } });
    assert(pendingGone === null, "o cadastro pendente é apagado ao concluir");

    // ── duplicidade é barrada na etapa 1, antes de qualquer verificação ─
    const dup = await startSignupAction({ ...base, owner_email: `outro-${stamp}@test.local` });
    assert(
      !dup.ok && dup.code === "DUPLICATE_DOCUMENT",
      "documento já usado é barrado logo na etapa 1",
    );
    const dupMail = await startSignupAction({ ...base, document: `8${stamp}0` });
    assert(
      !dupMail.ok && dupMail.code === "DUPLICATE_EMAIL",
      "email já usado é barrado logo na etapa 1",
    );

    // ── expiração e purga ─────────────────────────────────────────────
    const doc2 = `7${stamp}0`;
    const started2 = await startSignupAction({
      ...base,
      document: doc2,
      owner_email: `m19b-${stamp}@test.local`,
    });
    const signupId2 = started2.ok ? started2.data.signup_id : "";
    createdSignupIds.push(signupId2);
    await prisma.pendingSignup.update({
      where: { id: signupId2 },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    const expiredState = await getSignupStateAction(signupId2);
    assert(
      !expiredState.ok && expiredState.code === "SIGNUP_EXPIRED",
      "cadastro vencido responde SIGNUP_EXPIRED",
    );
    const expiredVerify = await verifySignupCodeAction(signupId2, "whatsapp", "123456");
    assert(
      !expiredVerify.ok && expiredVerify.code === "SIGNUP_EXPIRED",
      "cadastro vencido não aceita mais verificação",
    );
    await purgeExpiredSignups();
    assert(
      (await prisma.pendingSignup.findUnique({ where: { id: signupId2 } })) === null,
      "a purga remove cadastro abandonado (sem guardar dado pessoal à toa)",
    );

    // ── retomada: mesmo documento reaproveita o cadastro pendente ─────
    const doc3 = `6${stamp}0`;
    const mail3 = `m19c-${stamp}@test.local`;
    const first = await startSignupAction({ ...base, document: doc3, owner_email: mail3 });
    const firstId = first.ok ? first.data.signup_id : "";
    createdSignupIds.push(firstId);
    await forceCode(firstId, "whatsapp");
    await verifySignupCodeAction(firstId, "whatsapp", "123456");

    const again = await startSignupAction({ ...base, document: doc3, owner_email: mail3 });
    assert(again.ok && again.data.signup_id === firstId, "voltar com o mesmo documento retoma o cadastro");
    assert(
      again.ok && again.data.state.whatsapp_verified,
      "a retomada preserva o canal já confirmado",
    );
    assert(
      again.ok && again.data.state.current_step === "email",
      "a retomada cai direto na etapa que faltava",
    );

    // ── trocar o telefone na retomada invalida a verificação daquele canal ─
    const changed = await startSignupAction({
      ...base,
      document: doc3,
      owner_email: mail3,
      phone: "22955554444",
    });
    assert(
      changed.ok && !changed.data.state.whatsapp_verified,
      "mudar o número derruba a verificação: verificamos o contato, não a intenção",
    );
  } finally {
    await prisma.pendingSignup
      .deleteMany({ where: { id: { in: createdSignupIds.filter(Boolean) } } })
      .catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 19: 0 falhas.");
  else console.error(`❌ Módulo 19: ${failures} falha(s).`);
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
