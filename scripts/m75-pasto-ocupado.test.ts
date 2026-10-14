import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();

/**
 * Desativar pasto com gado é recusado (dívida 5.12; Módulo 29, Minha Fazenda).
 * Roda: `npm run test:m75`
 *
 * Antes, `POST /api/v1/pastures/:id/archive` gravava `archived_at` sem olhar
 * o pasto, e as cabeças ficavam num pasto que nenhuma tela oferece mais.
 * Decisão do usuário (14/10/2026): recusar, e o produtor transfere antes.
 */
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let failures = 0;
function assert(cond: boolean, msg: string, detalhe = "") {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}${detalhe ? ` (${detalhe})` : ""}`);
    failures++;
  }
}

async function main() {
  console.log("🔎 M75: pasto com gado não é desativado (dívida 5.12)\n");

  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { recordMovement } = await import("@/lib/actions/herd-ledger");
  const { archivePastureAction } = await import("@/lib/actions/properties");
  const bcrypt = (await import("bcryptjs")).default;
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const rota = await import("@/app/api/v1/pastures/[id]/archive/route");

  const stamp = Date.now();
  const criarTenant = async (sufixo: string) => {
    const tenant = await prisma.tenant.create({
      data: { name: `M75${sufixo} ${stamp}`, document: `M75${sufixo}${stamp}`.slice(0, 14), plan: "fazenda" },
    });
    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "M75 Dono",
        email: `m75${sufixo}-${stamp}@teste.local`,
        password_hash: await bcrypt.hash("SenhaForte#2026", 4),
        role: "OWNER",
      },
    });
    const db = prismaForTenant(tenant.id);
    await db.tenantProfile.create({ data: scoped({ profile_type: "fazenda", active: true }) });
    return { tenant, user, db };
  };
  const a = await criarTenant("a");
  const b = await criarTenant("b");
  const { db } = a;
  const token = signAccessToken(a.user.id);

  const arquivar = (id: string) =>
    withBearer(token, () =>
      rota.POST(new Request(`http://localhost/api/v1/pastures/${id}/archive`, { method: "POST" }), {
        params: Promise.resolve({ id }),
      }),
    ).then(async (r) => ({
      status: r.status,
      body: (await r.json()) as { data?: { archived_at: string | null }; error?: { code: string; message: string } },
    }));

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M75" }) });
    const pasto = (name: string) => db.pasture.create({ data: scoped({ property_id: fazenda.id, name, area_hectares: 5 }) });
    const [cheio, deTerceiro, vazio, destino] = await Promise.all([
      pasto("Pasto Cheio"),
      pasto("Pasto de Terceiro"),
      pasto("Pasto Vazio"),
      pasto("Pasto Destino"),
    ]);
    const posicao = (pasture_id: string, owner: "proprio" | "terceiro") => ({
      category_id: "macho_13_24",
      property_id: fazenda.id,
      pasture_id,
      situation: "presente" as const,
      owner,
    });
    for (const [pastoId, owner, quantity] of [
      [cheio.id, "proprio", 10],
      [deTerceiro.id, "terceiro", 3],
    ] as const) {
      const r = await recordMovement(db, { movement_type: "saldo_inicial", quantity, to: posicao(pastoId, owner) });
      if (!r.ok) throw new Error(`cenário: ${r.message}`);
    }

    console.log("1. Pasto com gado próprio");
    {
      const r = await arquivar(cheio.id);
      assert(r.status === 409 && r.body.error?.code === "PASTO_OCUPADO", "desativar é recusado com 409 PASTO_OCUPADO", `${r.status} ${r.body.error?.code}`);
      assert(r.body.error?.message.includes("10 animais") === true, "a recusa diz quantas cabeças estão lá", r.body.error?.message);
      const depois = await db.pasture.findUnique({ where: { id: cheio.id } });
      assert(depois?.archived_at === null, "e o pasto continua ativo");
    }

    console.log("\n2. Gado de terceiro também ocupa o pasto");
    {
      const r = await arquivar(deTerceiro.id);
      assert(r.status === 409 && r.body.error?.message.includes("3 animais") === true, "3 cabeças de terceiro bastam para recusar", `${r.status} ${r.body.error?.message}`);
    }

    console.log("\n3. Pasto vazio, e o que esvaziou");
    {
      const r = await arquivar(vazio.id);
      assert(r.status === 200 && r.body.data?.archived_at != null, "pasto sem gado é desativado", String(r.status));

      const mover = await recordMovement(db, {
        movement_type: "transferencia_pasto",
        quantity: 10,
        from: posicao(cheio.id, "proprio"),
        to: posicao(destino.id, "proprio"),
      });
      if (!mover.ok) throw new Error(`transferir: ${mover.message}`);
      const esvaziado = await arquivar(cheio.id);
      assert(esvaziado.status === 200 && esvaziado.body.data?.archived_at != null, "depois de transferir as 10, o pasto é desativado", String(esvaziado.status));

      const primeira = esvaziado.body.data?.archived_at;
      const denovo = await arquivar(cheio.id);
      assert(denovo.status === 200 && denovo.body.data?.archived_at === primeira, "desativar de novo mantém a data original", `${denovo.body.data?.archived_at} x ${primeira}`);
    }

    console.log("\n4. Isolamento");
    {
      const r = await archivePastureAction(b.db, deTerceiro.id);
      assert(!r.ok && r.status === 404, "outro tenant não acha o pasto", r.ok ? "ok" : r.code);
      const inexistente = await arquivar("nao-existe");
      assert(inexistente.status === 404, "pasto inexistente devolve 404", String(inexistente.status));
    }
  } finally {
    for (const { tenant } of [a, b]) {
      const where = { tenant_id: tenant.id };
      await prisma.herdMovement.deleteMany({ where });
      await prisma.pasture.deleteMany({ where });
      await prisma.property.deleteMany({ where });
      await prisma.tenantProfile.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    }
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\n✅ M75 passou." : `\n❌ M75: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
