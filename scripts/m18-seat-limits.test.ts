import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { PLAN_SEATS } from "@/lib/asaas";
import { getSeatUsage, checkSeatAvailable } from "@/lib/seats";
import { inviteUserAction, setUserActiveAction } from "@/lib/actions/users";

/**
 * Testes do limite de assentos por plano (decisão 2026-07-30).
 * Cobre as três semânticas fechadas com o usuário: o Owner ocupa assento,
 * usuário desativado libera assento, e o limite nunca desativa ninguém
 * retroativamente (tenant acima do limite continua funcionando).
 * Roda: `npm run test:m18`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

let seq = 0;
function uniqueEmail(prefix: string) {
  seq += 1;
  return `m18-${prefix}-${Date.now()}-${seq}@test.local`;
}

async function main() {
  console.log("🪑 Limite de assentos por plano\n");

  const stamp = Date.now().toString().slice(-9);
  const tenantCampo = await prisma.tenant.create({
    data: { name: "M18 Campo", document: `1${stamp}0`, plan: "campo", status: "trial" },
  });
  const tenantFazenda = await prisma.tenant.create({
    data: { name: "M18 Fazenda", document: `2${stamp}0`, plan: "fazenda", status: "trial" },
  });
  const tenantGrupo = await prisma.tenant.create({
    data: { name: "M18 Grupo", document: `3${stamp}0`, plan: "grupo", status: "trial" },
  });
  const dbCampo = prismaForTenant(tenantCampo.id);
  const dbFazenda = prismaForTenant(tenantFazenda.id);
  const dbGrupo = prismaForTenant(tenantGrupo.id);
  const createdTenantIds = [tenantCampo.id, tenantFazenda.id, tenantGrupo.id];

  try {
    // ── limites vêm de PLAN_SEATS, não de número solto ────────────────
    assert(
      PLAN_SEATS.campo === 1 && PLAN_SEATS.fazenda === 2 && PLAN_SEATS.grupo === 5,
      "PLAN_SEATS define 1 (campo), 2 (fazenda) e 5 (grupo)",
    );

    // ── o Owner ocupa um assento ──────────────────────────────────────
    const ownerCampo = await dbCampo.user.create({
      data: scoped({
        name: "Owner Campo",
        email: uniqueEmail("owner-campo"),
        password_hash: "x",
        role: "OWNER",
        active: true,
      }),
    });
    const usageCampo = await getSeatUsage(dbCampo, tenantCampo.id);
    assert(
      usageCampo.used === 1 && usageCampo.limit === 1 && !usageCampo.has_room,
      "plano campo com só o Owner já está no limite (1 de 1, sem vaga)",
    );

    const inviteBlocked = await inviteUserAction(dbCampo, tenantCampo.id, {
      name: "Operador Extra",
      email: uniqueEmail("extra"),
      role: "OPERADOR",
    });
    assert(
      !inviteBlocked.ok && inviteBlocked.code === "SEAT_LIMIT_REACHED",
      "convite além do limite é bloqueado com SEAT_LIMIT_REACHED",
    );
    assert(
      !inviteBlocked.ok && inviteBlocked.message.includes("campo"),
      "mensagem de erro nomeia o plano em vez de um 'não permitido' seco",
    );
    const campoUsers = await dbCampo.user.count();
    assert(campoUsers === 1, "convite bloqueado não cria usuário nenhum");

    // ── duplicidade de email tem prioridade sobre o limite ────────────
    const dupEmail = ownerCampo.email;
    const dupWhileFull = await inviteUserAction(dbCampo, tenantCampo.id, {
      name: "Duplicado",
      email: dupEmail,
      role: "OPERADOR",
    });
    assert(
      !dupWhileFull.ok && dupWhileFull.code === "DUPLICATE_EMAIL",
      "email duplicado responde DUPLICATE_EMAIL mesmo com o plano cheio (não manda fazer upgrade à toa)",
    );

    // ── plano fazenda: 2 assentos, o segundo convite passa ────────────
    await dbFazenda.user.create({
      data: scoped({
        name: "Owner Fazenda",
        email: uniqueEmail("owner-fazenda"),
        password_hash: "x",
        role: "OWNER",
        active: true,
      }),
    });
    const inviteOk = await inviteUserAction(dbFazenda, tenantFazenda.id, {
      name: "Operador Fazenda",
      email: uniqueEmail("op-fazenda"),
      role: "OPERADOR",
    });
    assert(inviteOk.ok, "plano fazenda aceita o segundo usuário (2 assentos)");
    const operadorFazendaId = inviteOk.ok ? inviteOk.data.id : "";

    const inviteThird = await inviteUserAction(dbFazenda, tenantFazenda.id, {
      name: "Terceiro",
      email: uniqueEmail("terceiro"),
      role: "OPERADOR",
    });
    assert(
      !inviteThird.ok && inviteThird.code === "SEAT_LIMIT_REACHED",
      "o terceiro usuário no plano fazenda é bloqueado",
    );

    // ── desativar libera assento; reativar volta a ocupar ─────────────
    const deactivate = await setUserActiveAction(
      dbFazenda,
      tenantFazenda.id,
      operadorFazendaId,
      false,
    );
    assert(deactivate.ok, "desativar usuário é sempre permitido");
    const usageAfterDeactivate = await getSeatUsage(dbFazenda, tenantFazenda.id);
    assert(
      usageAfterDeactivate.used === 1 && usageAfterDeactivate.has_room,
      "usuário desativado não ocupa assento (vaga liberada)",
    );

    const inviteAfterFree = await inviteUserAction(dbFazenda, tenantFazenda.id, {
      name: "Substituto",
      email: uniqueEmail("substituto"),
      role: "OPERADOR",
    });
    assert(
      inviteAfterFree.ok,
      "com a vaga liberada, é possível convidar um substituto sem upgrade de plano",
    );

    const reactivateBlocked = await setUserActiveAction(
      dbFazenda,
      tenantFazenda.id,
      operadorFazendaId,
      true,
    );
    assert(
      !reactivateBlocked.ok && reactivateBlocked.code === "SEAT_LIMIT_REACHED",
      "reativar quando o plano voltou a encher é bloqueado",
    );

    // Reativar quem já está ativo não consome assento novo e não é bloqueado.
    const activeUser = await dbFazenda.user.findFirst({ where: { active: true } });
    const reactivateNoop = await setUserActiveAction(
      dbFazenda,
      tenantFazenda.id,
      activeUser!.id,
      true,
    );
    assert(reactivateNoop.ok, "reativar um usuário que já está ativo não é bloqueado");

    // ── nunca desativa ninguém retroativamente ────────────────────────
    for (let i = 0; i < PLAN_SEATS.grupo; i++) {
      await dbGrupo.user.create({
        data: scoped({
          name: `Grupo ${i}`,
          email: uniqueEmail(`grupo-${i}`),
          password_hash: "x",
          role: i === 0 ? "OWNER" : "OPERADOR",
          active: true,
        }),
      });
    }
    await prisma.tenant.update({ where: { id: tenantGrupo.id }, data: { plan: "campo" } });

    const usageAfterDowngrade = await getSeatUsage(dbGrupo, tenantGrupo.id);
    assert(
      usageAfterDowngrade.used === 5 && usageAfterDowngrade.limit === 1,
      "downgrade deixa o tenant acima do limite (5 de 1), sem erro",
    );
    const stillActive = await dbGrupo.user.count({ where: { active: true } });
    assert(
      stillActive === 5,
      "downgrade NÃO desativa ninguém retroativamente (acesso preservado)",
    );
    const inviteAfterDowngrade = await inviteUserAction(dbGrupo, tenantGrupo.id, {
      name: "Pos Downgrade",
      email: uniqueEmail("pos-downgrade"),
      role: "OPERADOR",
    });
    assert(
      !inviteAfterDowngrade.ok && inviteAfterDowngrade.code === "SEAT_LIMIT_REACHED",
      "acima do limite, apenas convites novos são bloqueados",
    );

    // ── isolamento: a contagem é por tenant ───────────────────────────
    const usageCampoAfterAll = await getSeatUsage(dbCampo, tenantCampo.id);
    assert(
      usageCampoAfterAll.used === 1,
      "a contagem de assentos é escopada por tenant (usuários de outros tenants não contam)",
    );
    const campoStillFull = await checkSeatAvailable(dbCampo, tenantCampo.id);
    assert(
      campoStillFull !== null,
      "checkSeatAvailable segue bloqueando o tenant campo independentemente dos outros",
    );
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Limite de assentos: 0 falhas.");
  else console.error(`❌ Limite de assentos: ${failures} falha(s).`);
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
