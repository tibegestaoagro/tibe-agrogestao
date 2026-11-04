import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M92: Módulo 39 (Meu Empório), entrega 2: caixa com turno.
 * Roda: `npm run test:m92`
 *
 * Seção 1: o modelo (caixas numerados, sessão única por caixa, "Com a gerência").
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const j = (x: unknown) => JSON.stringify(x);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;

console.log("🧾 M92: Módulo 39 (Meu Empório), entrega 2: caixa com turno\n");

const tenantIds: string[] = [];

async function secao1() {
  console.log("Seção 1: o modelo (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture } = await import("./_emporio-papel");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Caixa = await import("@/lib/actions/emporio-caixa");
  const stamp = Date.now();

  async function arranjo(rotulo: string) {
    const t = await prisma.tenant.create({
      data: {
        name: `M92 ${rotulo} ${stamp}`,
        document: `M92${rotulo}${stamp}`.slice(0, 14),
        plan: "grupo",
        status: "trial",
        trial_ends_at: new Date(Date.now() + 86_400_000),
      },
    });
    tenantIds.push(t.id);
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    const u = await prisma.user.create({
      data: {
        tenant_id: t.id,
        name: `M92 ${rotulo}`,
        email: `m92-${rotulo}-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
        ...papelDeFixture("OWNER"),
      },
    });
    const owner = { id: u.id, role: "OWNER" as const, email: u.email };
    const db = prismaForTenant(t.id);
    const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: `M92 Loja ${rotulo}` });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    return { t, u, owner, db, lojaId: loja.data.id };
  }

  const A = await arranjo("A");
  const B = await arranjo("B");

  // criarEstabelecimentoAction cria o Caixa 1
  const caixasA = await A.db.cashRegister.findMany({ where: { establishment_id: A.lojaId } });
  check("a loja nasce com exatamente um caixa, o de número 1", caixasA.length === 1 && caixasA[0].number === 1, j(caixasA));
  const caixa1 = caixasA[0];

  // saldo por caixa
  const caixa2 = await A.db.cashRegister.create({ data: scoped({ establishment_id: A.lojaId, number: 2 }) });
  const mov = (extra: Dado) => ({
    establishment_id: A.lojaId,
    direction: "entrada" as const,
    origin: "implantacao" as const,
    occurred_at: new Date(),
    ...extra,
  });
  await A.db.cashMovement.create({ data: scoped(mov({ amount: 50, cash_register_id: caixa1.id })) });
  await A.db.cashMovement.create({ data: scoped(mov({ amount: 20, cash_register_id: caixa2.id })) });
  check("saldoDoCaixa: Caixa 1 = 5000", (await Caixa.saldoDoCaixa(A.db, caixa1.id)) === 5000);
  check("saldoDoCaixa: Caixa 2 = 2000", (await Caixa.saldoDoCaixa(A.db, caixa2.id)) === 2000);
  check("saldoDaGaveta é a soma dos caixas da loja = 7000", (await Caixa.saldoDaGaveta(A.db, A.lojaId)) === 7000);

  // Com a gerência
  await A.db.cashMovement.create({
    data: scoped({
      manager_establishment_id: A.lojaId,
      direction: "entrada",
      origin: "sangria",
      occurred_at: new Date(),
      amount: 30,
    }),
  });
  check("saldoDaGerencia soma só o que tem manager_establishment_id = 3000", (await Caixa.saldoDaGerencia(A.db, A.lojaId)) === 3000);
  check("saldoDaGaveta não inclui a gerência (continua 7000)", (await Caixa.saldoDaGaveta(A.db, A.lojaId)) === 7000);

  // CHECK: dois lugares
  let recusou = false;
  try {
    await A.db.cashMovement.create({
      data: scoped(mov({ amount: 5, manager_establishment_id: A.lojaId, origin: "sangria" })),
    });
  } catch {
    recusou = true;
  }
  check("o CHECK recusa movimento com gaveta e gerência juntas", recusou);

  // um único aberto por caixa
  const sessao = (n: string, extra: Dado = {}) => ({
    establishment_id: A.lojaId,
    cash_register_id: caixa1.id,
    operation_key: `m92-${stamp}-${n}`,
    opened_by_user_id: A.u.id,
    opened_at: new Date(),
    opening_expected: 0,
    opening_counted: 0,
    ...extra,
  });
  await A.db.cashSession.create({ data: scoped(sessao("s1", { open_register_id: caixa1.id })) });
  let dupAberta = false;
  try {
    await A.db.cashSession.create({ data: scoped(sessao("s2", { open_register_id: caixa1.id })) });
  } catch {
    dupAberta = true;
  }
  check("duas sessões abertas no mesmo caixa violam o único", dupAberta);
  let encerradasOk = true;
  try {
    await A.db.cashSession.create({ data: scoped(sessao("s3", { open_register_id: null })) });
    await A.db.cashSession.create({ data: scoped(sessao("s4", { open_register_id: null })) });
  } catch (e) {
    encerradasOk = false;
    console.log(String(e));
  }
  check("sessões encerradas (open_register_id nulo) convivem", encerradasOk);

  // CashHandover existe e é escopado
  const sess = await A.db.cashSession.findFirst({ where: { operation_key: `m92-${stamp}-s1` } });
  await A.db.cashHandover.create({
    data: scoped({
      establishment_id: A.lojaId,
      cash_register_id: caixa1.id,
      cash_session_id: sess!.id,
      kind: "sangria",
      amount: 10,
      operation_key: `m92-${stamp}-h1`,
      created_by_user_id: A.u.id,
    }),
  });

  // isolamento
  check("tenant B não vê CashRegister do A", (await B.db.cashRegister.count({ where: { id: caixa1.id } })) === 0);
  check("tenant B não vê CashSession do A", (await B.db.cashSession.count()) === 0);
  check("tenant B não vê CashHandover do A", (await B.db.cashHandover.count()) === 0);
  check("tenant B só tem o próprio Caixa 1", (await B.db.cashRegister.count()) === 1);
}

async function limpar() {
  const { prisma } = await import("@/lib/prisma");
  const modelos = [
    "emporioAuditLog", "cashHandover", "cashMovement", "cashSession", "cashCount", "cashRegister", "stockMovement",
    "emporioSale", "emporioCounter", "emporioSettings", "userEstablishment", "establishment", "bankAccount", "contact",
    "user", "tenantProfile", "tenantFeature",
  ];
  for (const id of tenantIds) {
    for (const m of modelos) {
      try {
        await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: id } });
      } catch {
        // modelo ausente nesta versão do schema: segue
      }
    }
    await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
  }
  const sobrou = await prisma.tenant.count({ where: { id: { in: tenantIds } } });
  check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
}

async function main() {
  try {
    await secao1();
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M92 verde" : `\n❌ M92: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
