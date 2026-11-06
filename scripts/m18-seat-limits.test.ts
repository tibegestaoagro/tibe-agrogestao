import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { PLAN_SEATS } from "@/lib/asaas";
import { getSeatUsage, checkSeatAvailable, EMPORIO_SEATS } from "@/lib/seats";
import { inviteUserAction, setUserActiveAction } from "@/lib/actions/users";

exigirBancoLocal();


/**
 * Testes do limite de assentos por plano (decisão 2026-07-30).
 * Cobre as três semânticas fechadas com o usuário: o Owner ocupa assento,
 * usuário desativado libera assento, e o limite nunca desativa ninguém
 * retroativamente (tenant acima do limite continua funcionando).
 * E a Q190 (06/11/2026): a equipe do Empório conta num limite próprio
 * (`EMPORIO_SEATS`), separado do plano, e Configurações não a ativa nem desativa.
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

    // ── Q190: a equipe do Empório tem limite próprio (EMPORIO_SEATS) ──
    console.log("\n  Q190: dois limites separados");
    assert(EMPORIO_SEATS === 50, "EMPORIO_SEATS é 50");
    const tenantQ = await prisma.tenant.create({
      data: { name: "M18 Q190", document: `4${stamp}0`, plan: "fazenda", status: "trial" },
    });
    createdTenantIds.push(tenantQ.id);
    const dbQ = prismaForTenant(tenantQ.id);
    await dbQ.user.create({
      data: scoped({ name: "Owner Q190", email: uniqueEmail("owner-q"), password_hash: "x", role: "OWNER", active: true }),
    });
    // 49 ativos da equipe, mais 3 desativados (não ocupam vaga).
    await prisma.user.createMany({
      data: [
        ...Array.from({ length: EMPORIO_SEATS - 1 }, (_, i) => ({
          tenant_id: tenantQ.id, name: `Equipe ${i}`, email: uniqueEmail(`eq-${i}`), password_hash: "x",
          role: "OPERADOR" as const, emporio_role: "vendedor" as const,
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          tenant_id: tenantQ.id, name: `Equipe off ${i}`, email: uniqueEmail(`eq-off-${i}`), password_hash: "x",
          role: "OPERADOR" as const, emporio_role: "caixa" as const, active: false,
        })),
      ],
    });
    const planoQ = await getSeatUsage(dbQ, tenantQ.id);
    assert(
      planoQ.used === 1 && planoQ.limit === 2 && planoQ.has_room,
      `a equipe do Empório não ocupa assento do plano (plano: ${planoQ.used} de ${planoQ.limit})`,
    );
    const emporioQ = await getSeatUsage(dbQ, tenantQ.id, "emporio");
    assert(
      emporioQ.used === 49 && emporioQ.limit === 50 && emporioQ.has_room,
      `o Dono e os desativados não contam no limite do Empório (${emporioQ.used} de ${emporioQ.limit})`,
    );
    const quinquagesimo = await inviteUserAction(
      dbQ, tenantQ.id, { name: "Equipe 50", email: uniqueEmail("eq-50"), role: "OPERADOR" }, "emporio",
    );
    assert(quinquagesimo.ok, "o 50º da equipe entra");
    // O convite cria sem função; quem dá a função é a Equipe. Aqui, direto no banco.
    if (quinquagesimo.ok) {
      await prisma.user.update({ where: { id: quinquagesimo.data.id }, data: { emporio_role: "vendedor" } });
    }
    const cheioQ = await checkSeatAvailable(dbQ, tenantQ.id, "emporio");
    assert(
      cheioQ !== null && cheioQ.includes("50") && cheioQ.includes("equipe do Empório"),
      `com 50 ativos, a equipe do Empório está cheia, e a mensagem diz o limite (${cheioQ})`,
    );
    const q51 = await inviteUserAction(
      dbQ, tenantQ.id, { name: "Equipe 51", email: uniqueEmail("eq-51"), role: "OPERADOR" }, "emporio",
    );
    assert(!q51.ok && q51.code === "SEAT_LIMIT_REACHED", "o 51º da equipe é recusado com SEAT_LIMIT_REACHED");
    const tibeQ = await inviteUserAction(dbQ, tenantQ.id, { name: "Tibé 2", email: uniqueEmail("tibe-2"), role: "OPERADOR" });
    assert(tibeQ.ok, "com o Empório cheio, o convite de usuário do Tibé passa (assento do plano livre)");
    const tibe3 = await inviteUserAction(dbQ, tenantQ.id, { name: "Tibé 3", email: uniqueEmail("tibe-3"), role: "OPERADOR" });
    assert(
      !tibe3.ok && tibe3.code === "SEAT_LIMIT_REACHED" && tibe3.message.includes("fazenda"),
      "e o plano continua valendo para o usuário do Tibé (fazenda: o 3º é recusado)",
    );
    const membro = await dbQ.user.findFirst({ where: { active: true, emporio_role: { not: null } } });
    const desat = await setUserActiveAction(dbQ, tenantQ.id, membro!.id, false);
    assert(
      !desat.ok && desat.code === "EMPORIO_ROLE" && desat.status === 409,
      "Configurações recusa desativar quem é da equipe do Empório (409 EMPORIO_ROLE)",
    );
    const off = await dbQ.user.findFirst({ where: { active: false, emporio_role: { not: null } } });
    const reat = await setUserActiveAction(dbQ, tenantQ.id, off!.id, true);
    assert(
      !reat.ok && reat.code === "EMPORIO_ROLE",
      "Configurações recusa reativar quem é da equipe do Empório (409 EMPORIO_ROLE)",
    );
    const emporioFinal = await getSeatUsage(dbQ, tenantQ.id, "emporio");
    assert(emporioFinal.used === 50, "e nada disso mudou a contagem da equipe (50 de 50)");
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
