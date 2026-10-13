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
// O servidor de produção roda em UTC, e este computador em São Paulo: sem isto
// a suíte passaria aqui com o defeito do dia do servidor (seção 1b).
process.env.TZ = "UTC";

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
  const { createCattleNegotiation, cancelNegotiation, listNegotiations, situacaoDoNegocio } = await import(
    "@/lib/actions/negotiations"
  );

  console.log("\n1b. Vencida é pelo dia de São Paulo, não pelo do servidor");
  {
    const compra = { type: "compra_gado" as const, canceled_at: null };
    // Vence 14/10 (data de calendário, gravada como meia-noite UTC).
    const conta = [{ entry_type: "expense", negotiation_role: "principal", status: "pending", due_date: new Date("2026-10-14T00:00:00Z") }];
    const noite = situacaoDoNegocio(compra, conta, new Date("2026-10-15T02:30:00Z")); // 23h30 de 14/10 em SP
    assert(noite.situacao === "confirmada", "às 23h30 do dia do vencimento ainda está em aberto", noite.situacao);
    const amanha = situacaoDoNegocio(compra, conta, new Date("2026-10-15T13:00:00Z")); // 10h de 15/10 em SP
    assert(amanha.situacao === "vencida", "no dia seguinte, vencida", amanha.situacao);
  }
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

    console.log("\n4. Pasto de destino e de origem, pela rota que a tela usa (§6.2 e §7.2)");
    {
      const pasto = await db.pasture.create({ data: scoped({ property_id: fazenda.id, name: "Pasto M74", area_hectares: 5 }) });
      const outra = await db.property.create({ data: scoped({ name: "Outra M74" }) });
      const pastoAlheio = await db.pasture.create({ data: scoped({ property_id: outra.id, name: "Pasto alheio", area_hectares: 5 }) });
      const post = (corpo: unknown) =>
        withBearer(token, () =>
          rota.POST(
            new Request("http://localhost/api/v1/negotiations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(corpo),
            }),
          ),
        ).then(async (r) => ({ status: r.status, body: (await r.json()) as { data?: { id: string }; error?: { code: string; field?: string } } }));
      const item = (pasture_id: string | null, quantity: number) => [{ category_id: "macho_13_24", quantity, pasture_id }];

      const compra = await post({ type: "compra_gado", property_id: fazenda.id, itens: item(pasto.id, 10), amount: 20000, pago: true });
      const mov = compra.body.data
        ? await db.herdMovement.findFirst({ where: { negotiation_id: compra.body.data.id } })
        : null;
      assert(compra.status === 201 && mov?.to_pasture_id === pasto.id, "a compra põe o gado no pasto escolhido", `${compra.status} ${mov?.to_pasture_id}`);

      const demais = await post({ type: "venda_gado", property_id: fazenda.id, itens: item(pasto.id, 11), amount: 5000, pago: true });
      assert(demais.status === 422, "vender 11 de um pasto com 10 é recusado: o saldo é o do pasto", String(demais.status));

      const venda = await post({ type: "venda_gado", property_id: fazenda.id, itens: item(pasto.id, 4), amount: 5000, pago: true });
      const saida = venda.body.data ? await db.herdMovement.findFirst({ where: { negotiation_id: venda.body.data.id } }) : null;
      assert(venda.status === 201 && saida?.from_pasture_id === pasto.id, "a venda tira do pasto de origem", `${venda.status} ${saida?.from_pasture_id}`);

      const alheio = await post({ type: "compra_gado", property_id: fazenda.id, itens: item(pastoAlheio.id, 1), amount: 100, pago: true });
      assert(
        alheio.status === 422 && alheio.body.error?.field === "pasture_id",
        "pasto de outra fazenda é recusado embaixo do campo do pasto",
        `${alheio.status} ${alheio.body.error?.code} ${alheio.body.error?.field}`,
      );
    }

    console.log("\n5. Forma de pagamento (§13), gravada no lançamento");
    {
      const { lerFormaDePagamento } = await import("@/lib/formas-de-pagamento");
      assert(lerFormaDePagamento("paguei no pix") === "pix", "\"no pix\" vira pix");
      assert(lerFormaDePagamento("em dinheiro vivo") === "dinheiro", "\"em dinheiro\" vira dinheiro");
      assert(lerFormaDePagamento("cartão de crédito") === "cartao", "\"cartão de crédito\" vira cartão");
      assert(lerFormaDePagamento("transferência") === "transferencia", "\"transferência\" com acento vira transferencia");
      assert(lerFormaDePagamento("outro") === "outro" && lerFormaDePagamento(" Boleto ") === "boleto", "o valor canônico passa como está, inclusive outro");
      assert(lerFormaDePagamento("fiado") === null && lerFormaDePagamento(42) === null, "o que não reconhece vira nulo, nunca uma forma inventada");

      const post = (corpo: unknown) =>
        withBearer(token, () =>
          rota.POST(
            new Request("http://localhost/api/v1/negotiations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(corpo),
            }),
          ),
        ).then(async (r) => ({ status: r.status, body: (await r.json()) as { data?: { id: string }; error?: { field?: string } } }));
      const itens = [{ category_id: "bezerro_0_7", quantity: 3 }];

      const avista = await post({
        type: "compra_gado", property_id: fazenda.id, itens, amount: 3000, pago: true,
        payment_method: "pix", custos: [{ descricao: "Frete", amount: 200 }],
      });
      const contas = avista.body.data ? await db.financialEntry.findMany({ where: { negotiation_id: avista.body.data.id } }) : [];
      const principal = contas.find((e) => e.negotiation_role === "principal");
      const frete = contas.find((e) => e.negotiation_role === "custo_adicional");
      const pagamento = principal ? await db.financialPayment.findFirst({ where: { entry_id: principal.id } }) : null;
      assert(avista.status === 201 && principal?.payment_method === "pix", "à vista no pix: a conta principal guarda pix", `${avista.status} ${principal?.payment_method}`);
      assert(pagamento?.method === "pix", "e o pagamento que nasce junto também", String(pagamento?.method));
      assert(frete != null && frete.payment_method === null, "o frete fica sem forma: costuma sair de outro jeito");

      const prazo = await post({
        type: "compra_gado", property_id: fazenda.id, itens, amount: 3000, pago: false, payment_method: "boleto",
        parcelas: [
          { due_date: new Date(Date.now() + 30 * 86_400_000).toISOString(), amount: 1500 },
          { due_date: new Date(Date.now() + 60 * 86_400_000).toISOString(), amount: 1500 },
        ],
      });
      const parcelas = prazo.body.data ? await db.financialEntry.findMany({ where: { negotiation_id: prazo.body.data.id } }) : [];
      assert(parcelas.length === 2 && parcelas.every((p) => p.payment_method === "boleto"), "parcelado no boleto: as duas parcelas guardam boleto");

      const semForma = await post({ type: "compra_gado", property_id: fazenda.id, itens, amount: 100, pago: true });
      const contaSem = semForma.body.data ? await db.financialEntry.findFirst({ where: { negotiation_id: semForma.body.data.id } }) : null;
      assert(semForma.status === 201 && contaSem?.payment_method === null, "sem forma informada, o negócio entra igual: o §13 proíbe exigir");

      const lixo = await post({ type: "compra_gado", property_id: fazenda.id, itens, amount: 100, pago: true, payment_method: "bitcoin" });
      assert(lixo.status === 422 && lixo.body.error?.field === "payment_method", "forma desconhecida é recusada no campo da forma");

      const categoria = await db.productCategory.create({ data: scoped({ name: "Insumos M74" }) });
      const produto = await db.product.create({ data: scoped({ name: "Sal M74", category_id: categoria.id, unit: "saca" }) });
      const comProduto = await post({
        type: "compra_produto", property_id: fazenda.id, itens: [{ product_id: produto.id, quantity: 2 }],
        amount: 400, pago: true, payment_method: "dinheiro",
      });
      const contaProduto = comProduto.body.data ? await db.financialEntry.findFirst({ where: { negotiation_id: comProduto.body.data.id } }) : null;
      assert(comProduto.status === 201 && contaProduto?.payment_method === "dinheiro", "na compra de produto também", `${comProduto.status} ${contaProduto?.payment_method}`);
    }

    console.log("\n6. Peso e arroba (§6.2), informativos");
    {
      const detalheRota = await import("@/app/api/v1/negotiations/[id]/route");
      const post = (corpo: unknown) =>
        withBearer(token, () =>
          rota.POST(
            new Request("http://localhost/api/v1/negotiations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(corpo),
            }),
          ),
        ).then(async (r) => ({ status: r.status, body: (await r.json()) as { data?: { id: string }; error?: { field?: string } } }));
      const base = { type: "compra_gado", property_id: fazenda.id, itens: [{ category_id: "macho_25_36", quantity: 10 }], pago: true };

      const comPeso = await post({ ...base, amount: 47000, total_weight_kg: 4500, arroba_count: 150, arroba_price: 320 });
      const id = comPeso.body.data?.id ?? "";
      const detalhe = await withBearer(token, () =>
        (detalheRota.GET as unknown as (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
          new Request(`http://localhost/api/v1/negotiations/${id}`),
          { params: Promise.resolve({ id }) },
        ),
      ).then((r) => r.json() as Promise<{ data: { amount: number; total_weight_kg: number; arroba_count: number; arroba_price: number } }>);
      assert(
        comPeso.status === 201 && detalhe.data.total_weight_kg === 4500 && detalhe.data.arroba_count === 150 && detalhe.data.arroba_price === 320,
        "peso, arrobas e valor da arroba voltam no detalhe",
        JSON.stringify(detalhe.data).slice(0, 160),
      );
      assert(detalhe.data.amount === 47000, "e o valor do negócio é o digitado (47.000), não arrobas vezes preço (48.000)");

      const diferente = await post({ ...base, amount: 50000, arroba_count: 150, arroba_price: 320 });
      const neg = diferente.body.data ? await db.negotiation.findUnique({ where: { id: diferente.body.data.id } }) : null;
      assert(diferente.status === 201 && Number(neg?.amount) === 50000, "valor total diferente de arrobas vezes preço é aceito como está: os campos só informam");

      const zero = await post({ ...base, amount: 100, arroba_price: 0 });
      assert(zero.status === 422 && zero.body.error?.field === "arroba_price", "valor da arroba zero é recusado no próprio campo");
      const negativo = await post({ ...base, amount: 100, total_weight_kg: -5 });
      assert(negativo.status === 422 && negativo.body.error?.field === "total_weight_kg", "peso negativo é recusado no próprio campo");

      const sem = await post({ ...base, amount: 100 });
      const negSem = sem.body.data ? await db.negotiation.findUnique({ where: { id: sem.body.data.id } }) : null;
      assert(sem.status === 201 && negSem?.arroba_count === null && negSem?.total_weight_kg === null, "sem peso nem arroba, o negócio entra igual");
    }
  } finally {
    const where = { tenant_id: tenant.id };
    await prisma.financialEntry.deleteMany({ where });
    await prisma.herdMovement.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.negotiation.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.pasture.deleteMany({ where });
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
