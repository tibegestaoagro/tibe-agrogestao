import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();

/**
 * Módulo 35 fase 1: pagamento parcial no Financeiro (§9/§10/§16 do documento
 * do cliente). Roda: `npm run test:m62` com o DATABASE_URL do Docker local.
 *
 * Escrita ÀS CEGAS: a partir do contrato do briefing, sem ler
 * `financial-payments.ts`, `financial-entries.ts`, `financial.ts` nem as
 * rotas em `src/app/api/v1/financial-entries/`. `createLinkedEntry` e
 * `cancelEntryAction` são usados como caixa-preta, exatamente como outras
 * suítes (`m29`) já os usam: só a assinatura, nunca o corpo.
 *
 * `globalThis.AsyncLocalStorage` precisa existir ANTES de qualquer módulo do
 * Next carregar (padrão do `m23`): por isso o resto é importado
 * dinamicamente, dentro de `main()`.
 */
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

/** Dinheiro em centavos, para nunca comparar ponto flutuante direto (contrato do briefing). */
function centavos(n: number): number {
  return Math.round(n * 100);
}

/**
 * Segunda opinião, independente da implementação: a mesma regra de derivação
 * que o contrato descreve, calculada aqui do zero. Roda sem banco, no topo do
 * módulo.
 */
type Situacao = "em_aberto" | "parcialmente_paga" | "paga" | "cancelada";
function situacaoEsperada(amountCent: number, pagoCent: number, status: string): Situacao {
  if (status === "cancelled") return "cancelada";
  if (pagoCent === 0) return "em_aberto";
  if (pagoCent < amountCent) return "parcialmente_paga";
  return "paga";
}

console.log("💳 M62: Módulo 35 fase 1, pagamento parcial no Financeiro\n");
console.log("0. Função pura: derivação de situação a partir de pago/amount/status\n");
check("em_aberto quando nada foi pago", situacaoEsperada(100000, 0, "pending") === "em_aberto");
check(
  "parcialmente_paga quando 0 < pago < valor",
  situacaoEsperada(100000, 40000, "pending") === "parcialmente_paga",
);
check("paga quando pago cobre o valor inteiro", situacaoEsperada(100000, 100000, "paid") === "paga");
check(
  "cancelada prevalece mesmo com pago parcial registrado antes do cancelamento",
  situacaoEsperada(100000, 40000, "cancelled") === "cancelada",
);

type Meta = {
  valor?: number;
  pago?: number;
  saldo?: number;
  situacao?: string;
  total?: number;
};
type ApiJson = {
  data?: unknown;
  meta?: Meta;
  error?: { code: string; message: string; field?: string };
};
async function body(res: Response): Promise<ApiJson> {
  return (await res.json()) as ApiJson;
}

async function main() {
  const bcrypt = (await import("bcryptjs")).default;
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { createLinkedEntry } = await import("@/lib/financial");
  const { cancelEntryAction } = await import("@/lib/actions/financial-entries");
  const { registrarPagamentoAction } = await import("@/lib/actions/financial-payments");

  // Rotas de negócio, importadas exatamente como estão no repositório: nunca abertas.
  const paymentsRoute = await import("@/app/api/v1/financial-entries/[id]/payments/route");
  const paymentRoute = await import(
    "@/app/api/v1/financial-entries/[id]/payments/[paymentId]/route"
  );
  const payRoute = await import("@/app/api/v1/financial-entries/[id]/pay/route");

  function reqJson(method: string, url: string, payload?: unknown): Request {
    return new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  }

  const stamp = Date.now();
  const password = "SenhaForte#2026";
  const hash = await bcrypt.hash(password, 10);

  async function makeTenant(label: string) {
    const tenant = await prisma.tenant.create({
      data: {
        name: `M62 ${label} ${stamp}`,
        document: `M62${label}${stamp}`.slice(0, 14),
        plan: "fazenda",
      },
    });
    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: `M62 User ${label}`,
        email: `m62-${label.toLowerCase()}-${stamp}@teste.local`,
        password_hash: hash,
        role: "OWNER",
      },
    });
    const db = prismaForTenant(tenant.id);
    const property = await db.property.create({ data: scoped({ name: `Fazenda M62 ${label}` }) });
    const token = signAccessToken(user.id);
    return { tenant, user, db, property, token };
  }

  const A = await makeTenant("A");
  const B = await makeTenant("B");

  function urlPayments(id: string) {
    return `http://localhost/api/v1/financial-entries/${id}/payments`;
  }
  function urlPayment(id: string, paymentId: string) {
    return `http://localhost/api/v1/financial-entries/${id}/payments/${paymentId}`;
  }
  function urlPay(id: string) {
    return `http://localhost/api/v1/financial-entries/${id}/pay`;
  }

  async function novoLancamento(db: Awaited<ReturnType<typeof makeTenant>>["db"], amount: number, categoria: string) {
    return db.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: categoria,
        amount,
        related_module: "geral",
        due_date: new Date(),
        status: "pending",
      }),
    });
  }

  try {
    // ── 1 + 2. Dois pagamentos parciais fecham o lançamento; estouro é recusado ──
    console.log("\n1+2. Dois pagamentos parciais fecham o lançamento; estourar o saldo é recusado\n");

    const entry1 = await novoLancamento(A.db, 10000, "M62 Insumo");

    let res = await withBearer(A.token, () =>
      paymentsRoute.POST(
        reqJson("POST", urlPayments(entry1.id), {
          amount: 4000,
          paid_at: "2026-01-05T12:00:00.000Z",
          method: "pix",
        }),
        { params: Promise.resolve({ id: entry1.id }) },
      ),
    );
    let json = await body(res);
    check("primeiro pagamento parcial: 201", res.status === 201, `status=${res.status} body=${JSON.stringify(json)}`);
    const payment1Id = (json.data as { id?: string } | undefined)?.id;
    check("primeiro pagamento parcial: devolve id", typeof payment1Id === "string" && payment1Id.length > 0);
    check("primeiro pagamento parcial: meta.pago = 4000", centavos(json.meta?.pago ?? -1) === centavos(4000));
    check("primeiro pagamento parcial: meta.saldo = 6000", centavos(json.meta?.saldo ?? -1) === centavos(6000));
    check(
      "primeiro pagamento parcial: situação = parcialmente_paga",
      json.meta?.situacao === "parcialmente_paga",
      `situacao=${json.meta?.situacao}`,
    );

    const entryAposPrimeiro = await A.db.financialEntry.findFirst({ where: { id: entry1.id } });
    check("status ainda pending após pagamento parcial", entryAposPrimeiro?.status === "pending");

    // Estoura o saldo por 1 centavo: 4000 pago, 6000 de saldo, 6000.01 recusado.
    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entry1.id), { amount: 6000.01 }), {
        params: Promise.resolve({ id: entry1.id }),
      }),
    );
    json = await body(res);
    check(
      "pagamento que passa do saldo (por 1 centavo) é recusado: 422 PAGAMENTO_EXCEDE_SALDO",
      res.status === 422 && json.error?.code === "PAGAMENTO_EXCEDE_SALDO",
      `status=${res.status} error=${JSON.stringify(json.error)}`,
    );
    /*
     * A frase muda com o sentido do lançamento. Até 10/09 era uma só, e dizia
     * "Falta pagar apenas R$ 12.000,00" para quem estava RECEBENDO de um
     * comprador. Achado ao vivo, contra a tela, não pela suíte.
     */
    check(
      "numa DESPESA, a recusa fala em pagar",
      typeof json.error?.message === "string" && json.error.message.includes("Falta pagar"),
      json.error?.message,
    );

    const receitaParaFrase = await A.db.financialEntry.create({
      data: scoped({
        entry_type: "income",
        category: "M62 Venda para a frase",
        amount: 20000,
        related_module: "geral",
        due_date: new Date(),
        status: "pending",
      }),
    });
    await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(receitaParaFrase.id), { amount: 8000 }), {
        params: Promise.resolve({ id: receitaParaFrase.id }),
      }),
    );
    const estouroDaReceita = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(receitaParaFrase.id), { amount: 12000.01 }), {
        params: Promise.resolve({ id: receitaParaFrase.id }),
      }),
    );
    const jsonReceita = await body(estouroDaReceita);
    check(
      "numa RECEITA, a mesma recusa fala em receber",
      typeof jsonReceita.error?.message === "string" &&
        jsonReceita.error.message.includes("Falta receber"),
      jsonReceita.error?.message,
    );
    check(
      "recusa de estouro de saldo nomeia o campo amount",
      json.error?.field === "amount",
      `field=${json.error?.field}`,
    );

    // Fecha com o segundo pagamento, exato.
    res = await withBearer(A.token, () =>
      paymentsRoute.POST(
        reqJson("POST", urlPayments(entry1.id), {
          amount: 6000,
          paid_at: "2026-01-10T12:00:00.000Z",
          method: "transferencia",
        }),
        { params: Promise.resolve({ id: entry1.id }) },
      ),
    );
    json = await body(res);
    const payment2Id = (json.data as { id?: string } | undefined)?.id;
    check("segundo pagamento fecha o lançamento: 201", res.status === 201, JSON.stringify(json));
    check("segundo pagamento fecha: situação = paga", json.meta?.situacao === "paga", `situacao=${json.meta?.situacao}`);
    check("segundo pagamento fecha: saldo = 0", centavos(json.meta?.saldo ?? -1) === 0);

    const entryFechado = await A.db.financialEntry.findFirst({ where: { id: entry1.id } });
    check("status vira paid ao fechar", entryFechado?.status === "paid");
    check(
      "paid_at é a data do SEGUNDO pagamento, não a do primeiro nem a de agora",
      entryFechado?.paid_at?.toISOString() === "2026-01-10T12:00:00.000Z",
      `paid_at=${entryFechado?.paid_at?.toISOString()}`,
    );

    // GET: lista do mais recente para o mais antigo, com os derivados em meta.
    res = await withBearer(A.token, () =>
      paymentsRoute.GET(new Request(urlPayments(entry1.id)), { params: Promise.resolve({ id: entry1.id }) }),
    );
    json = await body(res);
    const lista = (json.data as Array<{ id: string }> | undefined) ?? [];
    check("GET lista os 2 pagamentos", lista.length === 2, `len=${lista.length}`);
    check(
      "GET: mais recente primeiro (o segundo pagamento vem antes do primeiro)",
      lista[0]?.id === payment2Id && lista[1]?.id === payment1Id,
      `ordem=${lista.map((p) => p.id).join(",")}`,
    );
    check("GET meta.total = 2", json.meta?.total === 2, `total=${json.meta?.total}`);
    check("GET meta.situacao = paga", json.meta?.situacao === "paga");

    // ── 4. Desfazer pagamento devolve pending, com paid_at nulo ──────────────
    console.log("\n4. Desfazer um pagamento devolve o lançamento para pending, com paid_at nulo\n");

    res = await withBearer(A.token, () =>
      paymentRoute.DELETE(new Request(urlPayment(entry1.id, payment2Id as string), { method: "DELETE" }), {
        params: Promise.resolve({ id: entry1.id, paymentId: payment2Id as string }),
      }),
    );
    json = await body(res);
    check("desfazer pagamento: 200", res.status === 200, `status=${res.status} body=${JSON.stringify(json)}`);
    check(
      "desfazer pagamento: data.entry_id aponta para o lançamento",
      (json.data as { entry_id?: string } | undefined)?.entry_id === entry1.id,
    );
    check(
      "desfazer pagamento: situação volta a parcialmente_paga",
      json.meta?.situacao === "parcialmente_paga",
      `situacao=${json.meta?.situacao}`,
    );
    check("desfazer pagamento: pago volta a 4000", centavos(json.meta?.pago ?? -1) === centavos(4000));

    const entryAposDesfazer = await A.db.financialEntry.findFirst({ where: { id: entry1.id } });
    check("status volta a pending após desfazer o pagamento que fechava a conta", entryAposDesfazer?.status === "pending");
    check("paid_at volta a null", entryAposDesfazer?.paid_at === null, `paid_at=${entryAposDesfazer?.paid_at}`);

    const somaRestante = await A.db.financialPayment.aggregate({
      where: { entry_id: entry1.id },
      _sum: { amount: true },
    });
    check(
      "a soma dos pagamentos que restaram bate com o esperado (4000)",
      centavos(Number(somaRestante._sum.amount ?? 0)) === centavos(4000),
    );

    // ── 5. Desfazer um de dois pagamentos sem sair de "paga" ─────────────────
    console.log("\n5. Desfazer um de dois pagamentos SEM tirar a conta de \"paga\"\n");
    console.log(
      "  ⚠️ Não há tal caso, dado o restante do contrato: PAGAMENTO_EXCEDE_SALDO garante que a soma dos\n" +
        "     pagamentos nunca ultrapassa `amount`. Logo pago == amount só é alcançado exatamente na soma\n" +
        "     de todos os pagamentos vivos; remover qualquer um deles necessariamente derruba a soma abaixo\n" +
        "     de `amount`, e a situação sai de \"paga\". Não inventei um cenário para isso: reporto no lugar.",
    );

    // ── 2b. Estoura o saldo já tendo pagamento parcial, com valor da spec ─────
    console.log("\n2b. Estouro de saldo com o exemplo literal do contrato (10.000 com 4.000 pagos)\n");
    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entry1.id), { amount: 6000 }), {
        params: Promise.resolve({ id: entry1.id }),
      }),
    );
    json = await body(res);
    check(
      "6000 exatos (o saldo restante depois do desfazer) é aceito",
      res.status === 201,
      `status=${res.status} body=${JSON.stringify(json)}`,
    );

    // ── 6. PATCH .../pay quita só o saldo, nunca excede o valor ──────────────
    console.log("\n6. PATCH .../pay quita apenas o saldo restante, nunca o valor cheio\n");

    const entry5 = await novoLancamento(A.db, 1000, "M62 Saldo parcial");
    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entry5.id), { amount: 300 }), {
        params: Promise.resolve({ id: entry5.id }),
      }),
    );
    check("setup: paga 300 de 1000 antes do PATCH pay", res.status === 201);

    res = await withBearer(A.token, () =>
      payRoute.PATCH(reqJson("PATCH", urlPay(entry5.id), {}), { params: Promise.resolve({ id: entry5.id }) }),
    );
    json = await body(res);
    check("PATCH .../pay responde sucesso", res.status === 200 || res.status === 201, `status=${res.status} body=${JSON.stringify(json)}`);

    const somaPay = await A.db.financialPayment.aggregate({
      where: { entry_id: entry5.id },
      _sum: { amount: true },
    });
    check(
      "soma dos pagamentos após PATCH pay é IGUAL ao amount, nunca maior",
      centavos(Number(somaPay._sum.amount ?? 0)) === centavos(1000),
      `soma=${somaPay._sum.amount}`,
    );
    const entry5Final = await A.db.financialEntry.findFirst({ where: { id: entry5.id } });
    check("status vira paid após PATCH .../pay quitar o saldo", entry5Final?.status === "paid");

    // ── 7. paymentId de outra conta não é alcançável por esta URL ────────────
    console.log("\n7. paymentId de OUTRA conta não pode ser desfeito por uma URL que nomeia esta\n");

    const entryX = await novoLancamento(A.db, 500, "M62 Conta X");
    const entryY = await novoLancamento(A.db, 500, "M62 Conta Y");
    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entryX.id), { amount: 200 }), {
        params: Promise.resolve({ id: entryX.id }),
      }),
    );
    json = await body(res);
    const paymentXId = (json.data as { id?: string } | undefined)?.id as string;
    check("setup: paga entryX", res.status === 201 && typeof paymentXId === "string");

    res = await withBearer(A.token, () =>
      paymentRoute.DELETE(new Request(urlPayment(entryY.id, paymentXId), { method: "DELETE" }), {
        params: Promise.resolve({ id: entryY.id, paymentId: paymentXId }),
      }),
    );
    json = await body(res);
    check(
      "paymentId de X, URL de Y: 404 NOT_FOUND",
      res.status === 404 && json.error?.code === "NOT_FOUND",
      `status=${res.status} error=${JSON.stringify(json.error)}`,
    );
    const pagamentoXAindaExiste = await A.db.financialPayment.findFirst({ where: { id: paymentXId } });
    check("o pagamento de X sobrevive à tentativa cruzada", pagamentoXAindaExiste !== null);

    // ── 8. Isolamento entre tenants ───────────────────────────────────────────
    console.log("\n8. Isolamento: tenant B não enxerga nem desfaz pagamento do tenant A\n");

    const entryB1 = await novoLancamento(B.db, 700, "M62 Conta de B");
    res = await withBearer(B.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entryB1.id), { amount: 300 }), {
        params: Promise.resolve({ id: entryB1.id }),
      }),
    );
    json = await body(res);
    const paymentB1Id = (json.data as { id?: string } | undefined)?.id as string;
    check("setup: B paga a própria conta", res.status === 201 && typeof paymentB1Id === "string");

    res = await withBearer(A.token, () =>
      paymentsRoute.GET(new Request(urlPayments(entryB1.id)), { params: Promise.resolve({ id: entryB1.id }) }),
    );
    json = await body(res);
    check(
      "tenant A não enxerga (GET) o lançamento de B: 404 NOT_FOUND",
      res.status === 404 && json.error?.code === "NOT_FOUND",
      `status=${res.status} error=${JSON.stringify(json.error)}`,
    );

    res = await withBearer(A.token, () =>
      paymentRoute.DELETE(new Request(urlPayment(entryB1.id, paymentB1Id), { method: "DELETE" }), {
        params: Promise.resolve({ id: entryB1.id, paymentId: paymentB1Id }),
      }),
    );
    json = await body(res);
    check(
      "tenant A não desfaz pagamento de B: 404 NOT_FOUND",
      res.status === 404 && json.error?.code === "NOT_FOUND",
    );
    const pagamentoBSobrevive = await B.db.financialPayment.findFirst({ where: { id: paymentB1Id } });
    check("pagamento de B sobrevive à tentativa de A", pagamentoBSobrevive !== null);

    // Soma de um não contamina o outro.
    const entryA2 = await novoLancamento(A.db, 700, "M62 Conta de A (mesmo valor de B)");
    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entryA2.id), { amount: 300 }), {
        params: Promise.resolve({ id: entryA2.id }),
      }),
    );
    json = await body(res);
    check("A paga a própria conta (mesmo valor de B, lançamento diferente)", res.status === 201);
    check("meta.pago de A é 300, não 600: nenhuma soma cruzada", centavos(json.meta?.pago ?? -1) === centavos(300));

    res = await withBearer(B.token, () =>
      paymentsRoute.GET(new Request(urlPayments(entryB1.id)), { params: Promise.resolve({ id: entryB1.id }) }),
    );
    json = await body(res);
    check(
      "o pagamento de A não contaminou a soma de B (continua 300)",
      centavos(json.meta?.pago ?? -1) === centavos(300),
    );

    // ── 9. Backfill: o que createLinkedEntry garante ao nascer ───────────────
    console.log("\n9. Backfill: lançamento nascido paid já vem com o pagamento; pending e cancelled, sem nenhum\n");

    const ocorridoEm = new Date("2026-02-01T10:00:00.000Z");
    const entryPaga = await createLinkedEntry(A.db, {
      entry_type: "expense",
      category: "M62 Backfill Paga",
      amount: 950.25,
      related_module: "geral",
      related_id: "m62-backfill-paga",
      occurred_at: ocorridoEm,
      status: "paid",
      property_id: A.property.id,
    });
    const pagamentosDaPaga = await A.db.financialPayment.findMany({ where: { entry_id: entryPaga.id } });
    const somaPagamentosDaPaga = pagamentosDaPaga.reduce((s, p) => s + centavos(Number(p.amount)), 0);
    check(
      "lançamento nascido paid vem com EXATAMENTE 1 pagamento correspondente",
      pagamentosDaPaga.length === 1,
      `count=${pagamentosDaPaga.length}`,
    );
    check(
      "lançamento nascido paid: soma dos pagamentos == amount (950,25)",
      somaPagamentosDaPaga === centavos(950.25),
      `soma=${somaPagamentosDaPaga}`,
    );

    const entryPendente = await createLinkedEntry(A.db, {
      entry_type: "expense",
      category: "M62 Backfill Pendente",
      amount: 500,
      related_module: "geral",
      related_id: "m62-backfill-pendente",
      occurred_at: ocorridoEm,
      status: "pending",
      property_id: A.property.id,
    });
    const pagamentosDaPendente = await A.db.financialPayment.findMany({ where: { entry_id: entryPendente.id } });
    check("lançamento pendente nasce sem pagamento nenhum", pagamentosDaPendente.length === 0);

    /*
     * Conta cancelada NÃO nasce cancelada: o tipo de `createLinkedEntry` só
     * aceita os status que uma origem produz, e cancelar é ato posterior. Este
     * é o caminho que a aplicação realmente percorre, e é ele que precisa
     * terminar sem pagamento nenhum.
     */
    const entryCancelada = await createLinkedEntry(A.db, {
      entry_type: "expense",
      category: "M62 Backfill Cancelada",
      amount: 300,
      related_module: "geral",
      related_id: "m62-backfill-cancelada",
      occurred_at: ocorridoEm,
      status: "pending",
      property_id: A.property.id,
    });
    await cancelEntryAction(A.db, entryCancelada.id);
    const pagamentosDaCancelada = await A.db.financialPayment.findMany({
      where: { entry_id: entryCancelada.id },
    });
    check("lançamento cancelado fica sem pagamento nenhum", pagamentosDaCancelada.length === 0);

    // ── 10. Recusas adicionais da tabela ──────────────────────────────────────
    console.log("\n10. Recusas adicionais: valor inválido, lançamento inexistente, cancelado, e cancelar com pagamento\n");

    const entryValor = await novoLancamento(A.db, 500, "M62 Valor inválido");
    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entryValor.id), { amount: 0 }), {
        params: Promise.resolve({ id: entryValor.id }),
      }),
    );
    json = await body(res);
    /*
     * ⚠️ A recusa de valor tem DUAS camadas, e elas devolvem `code` diferente.
     *
     * O briefing desta suíte prometia `VALOR_INVALIDO` aqui, e a execução
     * mostrou `VALIDATION_ERROR`. O briefing é que estava errado: o schema da
     * rota recusa antes de a action ser chamada, e recusa de schema sai por
     * `apiErroDeZod` em todas as rotas deste projeto, com esse código. A
     * mensagem e o `field` são os que importam para o painel, e os dois estão
     * certos.
     *
     * A guarda da action continua existindo e é provada logo abaixo, chamada
     * direto: ela é o que protege quem não passa pela rota HTTP.
     */
    check(
      "valor zero é recusado pela ROTA: 422 VALIDATION_ERROR, campo amount",
      res.status === 422 && json.error?.code === "VALIDATION_ERROR" && json.error?.field === "amount",
      `status=${res.status} error=${JSON.stringify(json.error)}`,
    );

    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entryValor.id), { amount: -50 }), {
        params: Promise.resolve({ id: entryValor.id }),
      }),
    );
    json = await body(res);
    check(
      "valor negativo é recusado pela ROTA: 422 VALIDATION_ERROR, campo amount",
      res.status === 422 && json.error?.code === "VALIDATION_ERROR" && json.error?.field === "amount",
      `status=${res.status} error=${JSON.stringify(json.error)}`,
    );

    // A camada de baixo, sem HTTP no meio: é ela que vale para o agente do
    // WhatsApp e para qualquer action que venha a registrar pagamento.
    const recusaDaAction = await registrarPagamentoAction(A.db, entryValor.id, { amount: 0 });
    check(
      "valor zero é recusado pela ACTION: VALOR_INVALIDO, campo amount",
      !recusaDaAction.ok &&
        recusaDaAction.code === "VALOR_INVALIDO" &&
        recusaDaAction.field === "amount",
      JSON.stringify(recusaDaAction),
    );

    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments("m62-lancamento-inexistente"), { amount: 100 }), {
        params: Promise.resolve({ id: "m62-lancamento-inexistente" }),
      }),
    );
    json = await body(res);
    check(
      "lançamento inexistente: 404 NOT_FOUND",
      res.status === 404 && json.error?.code === "NOT_FOUND",
      `status=${res.status} error=${JSON.stringify(json.error)}`,
    );

    const entryCancelavel = await novoLancamento(A.db, 800, "M62 Vai ser cancelado");
    const cancelamentoSemPagamento = await cancelEntryAction(A.db, entryCancelavel.id);
    check("setup: cancela lançamento sem pagamento nenhum", cancelamentoSemPagamento.ok === true);

    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entryCancelavel.id), { amount: 100 }), {
        params: Promise.resolve({ id: entryCancelavel.id }),
      }),
    );
    json = await body(res);
    check(
      "pagamento em lançamento cancelado: 422 ENTRY_CANCELLED",
      res.status === 422 && json.error?.code === "ENTRY_CANCELLED",
      `status=${res.status} error=${JSON.stringify(json.error)}`,
    );

    const entryComPagamento = await novoLancamento(A.db, 1000, "M62 Cancelar com pagamento");
    res = await withBearer(A.token, () =>
      paymentsRoute.POST(reqJson("POST", urlPayments(entryComPagamento.id), { amount: 200 }), {
        params: Promise.resolve({ id: entryComPagamento.id }),
      }),
    );
    check("setup: paga parcialmente antes de tentar cancelar", res.status === 201);

    const cancelamentoComPagamento = await cancelEntryAction(A.db, entryComPagamento.id);
    check(
      "cancelar lançamento que já tem pagamento é recusado: ENTRY_HAS_PAYMENTS",
      cancelamentoComPagamento.ok === false && cancelamentoComPagamento.code === "ENTRY_HAS_PAYMENTS",
      JSON.stringify(cancelamentoComPagamento),
    );
  } finally {
    await prisma.tenant.delete({ where: { id: A.tenant.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: B.tenant.id } }).catch(() => {});
  }

  console.log(failuresLine());
  process.exit(falhas === 0 ? 0 : 1);

  function failuresLine(): string {
    return falhas === 0 ? "\n✅ M62: 0 falhas." : `\n❌ M62: ${falhas} falha(s).`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
