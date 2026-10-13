import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();

/**
 * Os filtros da tela de Negociações (Módulo 31, §19 do documento do cliente).
 * Roda: `npm run test:m74`
 *
 * 1. O período em São Paulo: a fronteira do dia é a meia-noite de lá, não a de
 *    UTC. Um negócio das 22h de segunda em São Paulo é 01h de terça em UTC, e
 *    cortar o dia em UTC o mandaria para a terça.
 * 2. A situação, que não é gravada: a action filtra depois de calcular, e a
 *    contagem e a página saem do conjunto filtrado, não do período inteiro.
 * 3. A rota aceita `situacao` e o tipo `venda_leite` (antes ignorado em
 *    silêncio, dívida 5.14).
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
  console.log("🔎 M74: filtros de Negociações (Módulo 31, §19)\n");

  const { periodoEmSaoPaulo, periodoDeDatasEmSaoPaulo } = await import("@/lib/dia-calendario");

  console.log("1. Período no fuso da fazenda");
  {
    // Quarta, 14/10/2026, 22h em São Paulo = quinta 01h UTC.
    const agora = new Date("2026-10-15T01:00:00Z");
    const hoje = periodoEmSaoPaulo("hoje", agora);
    assert(hoje.since.toISOString() === "2026-10-14T03:00:00.000Z", "hoje começa à meia-noite de São Paulo", hoje.since.toISOString());
    assert(hoje.until.toISOString() === "2026-10-15T02:59:59.999Z", "e termina no último milissegundo do dia de lá", hoje.until.toISOString());
    assert(agora >= hoje.since && agora <= hoje.until, "as 22h de quarta caem em hoje, embora já seja quinta em UTC");

    const semana = periodoEmSaoPaulo("semana", agora);
    assert(semana.since.toISOString() === "2026-10-12T03:00:00.000Z", "a semana começa na segunda", semana.since.toISOString());
    assert(semana.until.toISOString() === "2026-10-19T02:59:59.999Z", "e vai até o fim do domingo", semana.until.toISOString());

    const domingo = periodoEmSaoPaulo("semana", new Date("2026-10-18T15:00:00Z"));
    assert(domingo.since.toISOString() === "2026-10-12T03:00:00.000Z", "no domingo, a semana ainda é a que começou na segunda");

    const mes = periodoEmSaoPaulo("mes", agora);
    assert(
      mes.since.toISOString() === "2026-10-01T03:00:00.000Z" && mes.until.toISOString() === "2026-11-01T02:59:59.999Z",
      "o mês vai do dia 1 ao último dia",
      `${mes.since.toISOString()} a ${mes.until.toISOString()}`,
    );
    const virada = periodoEmSaoPaulo("mes", new Date("2026-11-01T02:00:00Z"));
    assert(virada.since.toISOString() === "2026-10-01T03:00:00.000Z", "23h de 31/10 em São Paulo ainda é outubro, embora já seja novembro em UTC");

    const ano = periodoEmSaoPaulo("ano", agora);
    assert(
      ano.since.toISOString() === "2026-01-01T03:00:00.000Z" && ano.until.toISOString() === "2027-01-01T02:59:59.999Z",
      "o ano vai de 1/1 a 31/12",
    );

    const datas = periodoDeDatasEmSaoPaulo("2026-10-01", "2026-10-05");
    assert(
      datas.since?.toISOString() === "2026-10-01T03:00:00.000Z" && datas.until?.toISOString() === "2026-10-06T02:59:59.999Z",
      "período escolhido inclui o dia final inteiro",
    );
    const aberto = periodoDeDatasEmSaoPaulo("", "lixo");
    assert(aberto.since === undefined && aberto.until === undefined, "data vazia ou inválida deixa a ponta aberta");
  }

  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { createCattleNegotiation, cancelNegotiation, listNegotiations } = await import("@/lib/actions/negotiations");
  const bcrypt = (await import("bcryptjs")).default;
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const rota = await import("@/app/api/v1/negotiations/route");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M74 ${stamp}`, document: `M74${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "M74 Dono",
      email: `m74-${stamp}@teste.local`,
      password_hash: await bcrypt.hash("SenhaForte#2026", 4),
      role: "OWNER",
    },
  });
  const db = prismaForTenant(tenant.id);
  await db.tenantProfile.create({ data: scoped({ profile_type: "fazenda", active: true }) });
  const token = signAccessToken(user.id);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M74" }) });
    const base = { type: "compra_gado" as const, property_id: fazenda.id, itens: [{ category_id: "bezerro_0_7", quantity: 2 }] };
    const futuro = new Date(Date.now() + 30 * 86_400_000);
    const passado = new Date(Date.now() - 30 * 86_400_000);

    const criados: Record<string, string> = {};
    for (const [nome, extra] of [
      ["paga", { amount: 1000, pago: true }],
      ["aberta1", { amount: 2000, pago: false, due_date: futuro }],
      ["aberta2", { amount: 3000, pago: false, due_date: futuro }],
      ["aberta3", { amount: 4000, pago: false, due_date: futuro }],
      ["vencida", { amount: 5000, pago: false, due_date: passado }],
      ["cancelada", { amount: 6000, pago: false, due_date: futuro }],
    ] as const) {
      const r = await createCattleNegotiation(db, { ...base, ...extra });
      if (!r.ok) throw new Error(`cenário ${nome}: ${r.message}`);
      criados[nome] = r.data.id;
    }
    const cancel = await cancelNegotiation(db, criados.cancelada, "teste m74");
    if (!cancel.ok) throw new Error(`cancelar: ${cancel.message}`);

    console.log("\n2. Situação, calculada e filtrada na action");
    {
      const abertas = await listNegotiations(db, { situacao: "confirmada" });
      assert(abertas.total === 3, "3 negócios em aberto", String(abertas.total));
      assert(abertas.items.every((n) => n.situacao === "confirmada"), "todos os itens vêm em aberto");

      const vencidas = await listNegotiations(db, { situacao: "vencida" });
      assert(vencidas.total === 1 && vencidas.items[0]?.id === criados.vencida, "a vencida aparece sozinha");

      const pagas = await listNegotiations(db, { situacao: "paga" });
      assert(pagas.total === 1 && pagas.items[0]?.id === criados.paga, "a paga aparece sozinha");

      const canceladas = await listNegotiations(db, { situacao: "cancelada" });
      assert(canceladas.total === 1 && canceladas.items[0]?.id === criados.cancelada, "a cancelada aparece sozinha");

      const pagina = await listNegotiations(db, { situacao: "confirmada" }, { limit: 2, offset: 0 });
      const resto = await listNegotiations(db, { situacao: "confirmada" }, { limit: 2, offset: 2 });
      assert(pagina.items.length === 2 && pagina.total === 3, "a página corta no limite, e o total é o do filtro, não o do período");
      assert(resto.items.length === 1, "a segunda página traz o que sobrou");
      const ids = new Set([...pagina.items, ...resto.items].map((n) => n.id));
      assert(ids.size === 3, "as duas páginas não repetem negócio");

      const semFiltro = await listNegotiations(db, {});
      assert(semFiltro.total === 6, "sem filtro, os seis aparecem", String(semFiltro.total));
    }

    console.log("\n3. A rota");
    {
      const chama = (qs: string) =>
        withBearer(token, () => rota.GET(new Request(`http://localhost/api/v1/negotiations?${qs}`))).then(
          async (r) => ({ status: r.status, body: (await r.json()) as { data: { id: string; situacao: string }[]; meta: { total: number } } }),
        );
      const v = await chama("situacao=vencida");
      assert(v.status === 200 && v.body.meta.total === 1 && v.body.data[0]?.situacao === "vencida", "situacao=vencida filtra pela rota");
      const lixo = await chama("situacao=inventada");
      assert(lixo.status === 200 && lixo.body.meta.total === 6, "situação desconhecida é ignorada, como os outros filtros");
      const leite = await chama("type=venda_leite");
      assert(leite.status === 200 && leite.body.meta.total === 0, "type=venda_leite filtra (antes devolvia os seis)", String(leite.body.meta.total));
    }
  } finally {
    const where = { tenant_id: tenant.id };
    await prisma.financialEntry.deleteMany({ where });
    await prisma.herdMovement.deleteMany({ where });
    await prisma.negotiation.deleteMany({ where });
    await prisma.property.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\n✅ M74 passou." : `\n❌ M74: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
