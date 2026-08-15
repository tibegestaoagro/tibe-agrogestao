import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import bcrypt from "bcryptjs";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { isStrongPassword } from "@/lib/passwords";
import {
  requestPasswordResetAction,
  verifyPasswordResetCodeAction,
  confirmPasswordResetAction,
} from "@/lib/actions/password-reset";

exigirBancoLocal();

/**
 * Testes do fluxo de recuperação de senha (arquitetura 2026-07-29): código
 * de 6 dígitos por email/WhatsApp, validação com limite de tentativas,
 * regra de senha forte. Sem teste de entrega real (mesmo motivo do M15).
 * Roda: `npm run test:m16` (DATABASE_URL do Docker local).
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
  console.log("🔒 M16: recuperação de senha (password-reset.ts)\n");

  // ── isStrongPassword(): validador isolado ────────────────────
  assert(isStrongPassword("SenhaForte1!").ok, "isStrongPassword: senha válida (8+, maiúscula, número, símbolo) passa");
  assert(!isStrongPassword("semnumero!A").ok, "isStrongPassword: sem número falha");
  assert(!isStrongPassword("semsimbolo1A").ok, "isStrongPassword: sem símbolo falha");
  assert(!isStrongPassword("semmaiuscula1!").ok, "isStrongPassword: sem maiúscula falha");
  assert(!isStrongPassword("Ab1!").ok, "isStrongPassword: menos de 8 caracteres falha");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: "M16 Tenant", document: `16${stamp}`.slice(0, 14), plan: "campo" },
  });
  const email = `m16-user-${stamp}@teste.local`;
  const originalHash = await bcrypt.hash("senhaOriginal1!", 10);
  const user = await prismaForTenant(tenant.id).user.create({
    data: scoped({
      name: "M16 User",
      email,
      password_hash: originalHash,
      role: "OWNER",
      phone: null,
    }),
  });

  try {
    // ── requestPasswordResetAction: resposta genérica ────────────
    const reqExisting = await requestPasswordResetAction({ email, channel: "email" });
    assert(reqExisting.ok, "request: email existente devolve ok");

    const reqMissing = await requestPasswordResetAction({
      email: `nao-existe-${stamp}@teste.local`,
      channel: "email",
    });
    assert(reqMissing.ok, "request: email inexistente devolve a MESMA resposta genérica (não revela)");

    const codesForUser = await prismaForTenant(tenant.id).passwordResetCode.findMany({
      where: { user_id: user.id },
    });
    assert(codesForUser.length === 1, "request: cria PasswordResetCode só para o email que existe");

    const codesForMissing = await prisma.passwordResetCode.count({
      where: { tenant_id: tenant.id, user_id: { not: user.id } },
    });
    assert(codesForMissing === 0, "request: nenhum código criado pro email inexistente");

    // ── requestPasswordResetAction: whatsapp sem telefone também não vaza ──
    const reqWhatsapp = await requestPasswordResetAction({ email, channel: "whatsapp" });
    assert(reqWhatsapp.ok, "request: canal whatsapp sem telefone cadastrado ainda devolve ok genérico");

    // ── rate limit do pedido de código (3/hora) ──────────────────
    const rateLimitEmail = `m16-ratelimit-${stamp}@teste.local`;
    let rateLimited = false;
    for (let i = 0; i < 4; i++) {
      const r = await requestPasswordResetAction({ email: rateLimitEmail, channel: "email" });
      if (!r.ok && r.code === "RATE_LIMITED") rateLimited = true;
    }
    assert(rateLimited, "request: 4ª tentativa na mesma hora é bloqueada por rate limit (limite: 3)");

    // ── verifyPasswordResetCodeAction: código errado incrementa tentativas ──
    const wrong1 = await verifyPasswordResetCodeAction({ email, code: "000000" });
    assert(!wrong1.ok && wrong1.code === "INVALID_CODE", "verify: código errado devolve INVALID_CODE");

    const resetRow = await prismaForTenant(tenant.id).passwordResetCode.findFirst({
      where: { user_id: user.id },
      orderBy: { created_at: "desc" },
    });
    assert(resetRow?.attempts === 1, "verify: tentativa errada incrementa attempts");

    // Esgota as tentativas restantes (já usou 1 de 5).
    for (let i = 0; i < 4; i++) {
      await verifyPasswordResetCodeAction({ email, code: "111111" });
    }
    const lockedRow = await prismaForTenant(tenant.id).passwordResetCode.findFirst({
      where: { id: resetRow!.id },
    });
    assert(lockedRow?.attempts === 5, "verify: 5 tentativas erradas esgotam o limite (attempts=5)");

    const afterLockout = await verifyPasswordResetCodeAction({ email, code: "222222" });
    assert(
      !afterLockout.ok && afterLockout.code === "INVALID_CODE",
      "verify: 6ª tentativa é bloqueada mesmo sem checar o código",
    );

    // ── código expirado ───────────────────────────────────────────
    const email2 = `m16-user2-${stamp}@teste.local`;
    const user2 = await prismaForTenant(tenant.id).user.create({
      data: scoped({
        name: "M16 User 2",
        email: email2,
        password_hash: originalHash,
        role: "OWNER",
        phone: null,
      }),
    });
    await requestPasswordResetAction({ email: email2, channel: "email" });
    const codeRow2 = await prismaForTenant(tenant.id).passwordResetCode.findFirst({
      where: { user_id: user2.id },
      orderBy: { created_at: "desc" },
    });
    await prismaForTenant(tenant.id).passwordResetCode.update({
      where: { id: codeRow2!.id },
      data: { expires_at: new Date(Date.now() - 60_000) },
    });
    const expiredResult = await verifyPasswordResetCodeAction({ email: email2, code: "123456" });
    assert(
      !expiredResult.ok && expiredResult.code === "INVALID_CODE",
      "verify: código expirado é rejeitado mesmo sem ter esgotado tentativas",
    );

    // ── fluxo feliz completo: pedir → validar → trocar senha ────
    const email3 = `m16-user3-${stamp}@teste.local`;
    const user3 = await prismaForTenant(tenant.id).user.create({
      data: scoped({
        name: "M16 User 3",
        email: email3,
        password_hash: originalHash,
        role: "OWNER",
        phone: null,
        must_change_password: true,
      }),
    });
    await requestPasswordResetAction({ email: email3, channel: "email" });
    const codeRow3 = await prismaForTenant(tenant.id).passwordResetCode.findFirst({
      where: { user_id: user3.id },
      orderBy: { created_at: "desc" },
    });
    // Não temos o código em claro (só o hash): regeneramos um hash conhecido pra simular o envio real.
    const knownCode = "654321";
    await prismaForTenant(tenant.id).passwordResetCode.update({
      where: { id: codeRow3!.id },
      data: { code_hash: await bcrypt.hash(knownCode, 10) },
    });

    const beforeVerified = await confirmPasswordResetAction({ reset_id: codeRow3!.id, newPassword: "SenhaForte1!" });
    assert(!beforeVerified.ok && beforeVerified.code === "INVALID_RESET", "confirm: sem verified_at é rejeitado");

    const verifyOk = await verifyPasswordResetCodeAction({ email: email3, code: knownCode });
    assert(verifyOk.ok, "verify: código certo é aceito");
    const resetId = verifyOk.ok ? verifyOk.data.reset_id : "";

    const weakConfirm = await confirmPasswordResetAction({ reset_id: resetId, newPassword: "fraca123" });
    assert(!weakConfirm.ok && weakConfirm.code === "VALIDATION_ERROR", "confirm: senha fraca é rejeitada mesmo com verified_at");

    const strongConfirm = await confirmPasswordResetAction({ reset_id: resetId, newPassword: "SenhaForte1!" });
    assert(strongConfirm.ok, "confirm: senha forte com verified_at é aceita");

    const userAfter = await prisma.user.findUnique({ where: { id: user3.id } });
    assert(userAfter?.password_hash !== originalHash, "confirm: password_hash foi atualizado");
    assert(userAfter?.must_change_password === false, "confirm: must_change_password vira false");
    assert(await bcrypt.compare("SenhaForte1!", userAfter!.password_hash), "confirm: nova senha bate no hash salvo");

    const reuseResult = await confirmPasswordResetAction({ reset_id: resetId, newPassword: "OutraSenha2@" });
    assert(!reuseResult.ok && reuseResult.code === "INVALID_RESET", "confirm: reusar o mesmo reset_id já consumido é rejeitado");
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  }

  console.log(failures === 0 ? "\n✅ M16: 0 falhas." : `\n❌ M16: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
