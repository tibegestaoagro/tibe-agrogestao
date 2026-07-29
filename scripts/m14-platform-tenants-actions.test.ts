import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  updateTenantAction,
  setTenantArchivedAction,
  resendWelcomeMessageAction,
} from "@/lib/actions/platform-tenants";

/**
 * Testes das actions de platform-tenants.ts sem cobertura antes desta
 * rodada (arquitetura 2026-07-29, candidato #6 do relatório):
 * updateTenantAction, setTenantArchivedAction, resendWelcomeMessageAction.
 * `forceSubscriptionStatusAction` já é coberta por test:m6, não repetida aqui.
 * Roda: `npm run test:m14` (DATABASE_URL do Docker local).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const NON_EXISTENT_ID = "cnonexistent00000000000000";

async function main() {
  console.log("🔒 M14: platform-tenants.ts (update/archive/reenvio de boas-vindas)\n");

  const stamp = Date.now();
  // Documentos só com dígitos (como um documento normalizado de verdade
  // fica no banco), pra que a checagem de duplicidade de updateTenantAction
  // (que também normaliza antes de comparar) tenha algo real pra comparar.
  const tenantX = await prisma.tenant.create({
    data: { name: "M14 Tenant X", document: `1${stamp}`.slice(0, 14), plan: "campo" },
  });
  const tenantY = await prisma.tenant.create({
    data: { name: "M14 Tenant Y", document: `2${stamp}`.slice(0, 14), plan: "campo" },
  });
  let noPhoneTenantId: string | undefined;

  try {
    // ── updateTenantAction ──────────────────────────────────────
    const renamed = await updateTenantAction(tenantX.id, { name: "M14 Tenant X Renomeado" });
    assert(renamed.ok, "updateTenantAction: atualiza nome");
    const afterRename = await prisma.tenant.findUnique({ where: { id: tenantX.id } });
    assert(afterRename?.name === "M14 Tenant X Renomeado", "nome persistido");

    const phoneUpdate = await updateTenantAction(tenantX.id, { phone: "(22) 99988-7766" });
    assert(phoneUpdate.ok, "updateTenantAction: atualiza telefone");
    const afterPhone = await prisma.tenant.findUnique({ where: { id: tenantX.id } });
    assert(afterPhone?.phone === "5522999887766", "telefone normalizado (toBrazilPhoneDigits)");

    const planUpdate = await updateTenantAction(tenantX.id, { plan: "grupo" });
    assert(planUpdate.ok && (await prisma.tenant.findUnique({ where: { id: tenantX.id } }))?.plan === "grupo", "updateTenantAction: atualiza plano");

    const dupDoc = await updateTenantAction(tenantX.id, { document: tenantY.document });
    assert(!dupDoc.ok && dupDoc.code === "DUPLICATE_DOCUMENT", "updateTenantAction: documento duplicado (de outro tenant) é rejeitado");
    const afterDupAttempt = await prisma.tenant.findUnique({ where: { id: tenantX.id } });
    assert(afterDupAttempt?.document !== tenantY.document, "documento de X não foi alterado pela tentativa rejeitada");

    const notFound = await updateTenantAction(NON_EXISTENT_ID, { name: "Não existe" });
    assert(!notFound.ok && notFound.code === "NOT_FOUND", "updateTenantAction: tenant inexistente devolve NOT_FOUND");

    // ── setTenantArchivedAction ─────────────────────────────────
    const archived = await setTenantArchivedAction(tenantX.id, true);
    assert(archived.ok && archived.data.archived_at !== null, "setTenantArchivedAction: arquiva (archived_at preenchido)");

    const firstArchivedAt = archived.ok ? archived.data.archived_at : null;
    const archivedAgain = await setTenantArchivedAction(tenantX.id, true);
    assert(
      archivedAgain.ok && archivedAgain.data.archived_at?.getTime() === firstArchivedAt?.getTime(),
      "setTenantArchivedAction: arquivar de novo é idempotente (archived_at não muda)",
    );

    const unarchived = await setTenantArchivedAction(tenantX.id, false);
    assert(unarchived.ok && unarchived.data.archived_at === null, "setTenantArchivedAction: desarquiva (archived_at volta a null)");

    const archiveNotFound = await setTenantArchivedAction(NON_EXISTENT_ID, true);
    assert(!archiveNotFound.ok && archiveNotFound.code === "NOT_FOUND", "setTenantArchivedAction: tenant inexistente devolve NOT_FOUND");

    // ── resendWelcomeMessageAction ──────────────────────────────
    // Garante estado determinístico independente de outro teste (ex: test:m7)
    // ter deixado um provider ativo (mesmo que inalcançável) na mesma base.
    await prisma.whatsAppProviderConfig.updateMany({ where: { active: true }, data: { active: false } });

    const noPhoneTenant = await prisma.tenant.create({
      data: { name: "M14 Sem Telefone", document: `3${stamp}`.slice(0, 14), plan: "campo", phone: null },
    });
    noPhoneTenantId = noPhoneTenant.id;
    const noPhoneResult = await resendWelcomeMessageAction(noPhoneTenant.id);
    assert(!noPhoneResult.ok && noPhoneResult.code === "VALIDATION_ERROR", "resendWelcomeMessageAction: tenant sem telefone devolve VALIDATION_ERROR");

    const resendNotFound = await resendWelcomeMessageAction(NON_EXISTENT_ID);
    assert(!resendNotFound.ok && resendNotFound.code === "NOT_FOUND", "resendWelcomeMessageAction: tenant inexistente devolve NOT_FOUND");

    await prisma.tenant.update({ where: { id: tenantY.id }, data: { phone: "22988776655" } });
    const noOwnerResult = await resendWelcomeMessageAction(tenantY.id);
    assert(!noOwnerResult.ok && noOwnerResult.code === "NOT_FOUND", "resendWelcomeMessageAction: tenant com telefone mas sem Owner devolve NOT_FOUND");

    const originalHash = await bcrypt.hash("senhaOriginal123", 10);
    const owner = await prismaForTenant(tenantY.id).user.create({
      data: scoped({
        name: "M14 Owner Y",
        email: `m14-owner-${stamp}@teste.local`,
        password_hash: originalHash,
        role: "OWNER",
        phone: "22988776655",
        must_change_password: false,
      }),
    });

    const resendResult = await resendWelcomeMessageAction(tenantY.id);
    assert(
      !resendResult.ok && resendResult.code === "NO_PROVIDER_ACTIVE",
      "resendWelcomeMessageAction: sem provider ativo, o envio falha com NO_PROVIDER_ACTIVE",
    );

    const ownerAfter = await prisma.user.findUnique({ where: { id: owner.id } });
    assert(
      ownerAfter?.password_hash !== originalHash,
      "senha do owner foi regenerada mesmo com o envio falhando (mutação acontece antes do envio)",
    );
    assert(
      ownerAfter?.must_change_password === true,
      "must_change_password virou true mesmo com o envio falhando",
    );
  } finally {
    const idsToClean = [tenantX.id, tenantY.id, noPhoneTenantId].filter((id): id is string => !!id);
    await prisma.tenant.deleteMany({ where: { id: { in: idsToClean } } }).catch(() => {});
  }

  console.log(failures === 0 ? "\n✅ M14: 0 falhas." : `\n❌ M14: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
