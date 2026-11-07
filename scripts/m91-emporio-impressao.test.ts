import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M91: Módulo 39 (Meu Empório), entrega 1: configurações e impressão.
 * Roda: `npm run test:m91`
 *
 * Seção 1: o número da venda (contador por conta, atômico, sem buraco).
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

console.log("🖨️ M91: Módulo 39 (Meu Empório), entrega 1: configurações e impressão\n");

async function secao1() {
  console.log("Seção 1: o número da venda (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture } = await import("./_emporio-papel");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = await import("@/lib/actions/emporio-vendas");
  const { carregarCatalogoDeVenda } = await import("@/app/(dashboard)/emporio/_components/catalogo-venda");
  const { formatarNumero } = await import("@/lib/emporio/numeracao");
  const stamp = Date.now();
  const tenantIds: string[] = [];

  async function arranjo(rotulo: string) {
    const t = await prisma.tenant.create({
      data: {
        name: `M91 ${rotulo} ${stamp}`,
        document: `M91${rotulo}${stamp}`.slice(0, 14),
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
        name: `M91 ${rotulo}`,
        email: `m91-${rotulo}-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
        ...papelDeFixture("OWNER"),
      },
    });
    const owner = { id: u.id, role: "OWNER" as const, email: u.email };
    const db = prismaForTenant(t.id);
    const cat0 = await carregarCatalogoDeVenda(db, []);
    const cf = cat0.consumidorFinal.id;
    const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: `M91 Loja ${rotulo}` });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    const categoria = await db.productCategory.create({ data: scoped({ name: `M91 cat ${rotulo}` }) });
    const p = await Cat.criarProdutoEmporioAction(db, owner, { name: `M91 Ração ${rotulo} ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
    if (!p.ok) throw new Error(`produto: ${j(p)}`);
    const pres = await Cat.criarApresentacaoAction(db, owner, p.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: loja.data.id, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: loja.data.id, emporio_product_id: p.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
    // Entrega 2: toda venda cai num turno aberto.
    await (await import("./_emporio-turno")).abrirTurnoDeTeste(db, owner, loja.data.id);
    let seq = 0;
    const vender = (chave?: string) =>
      V.venderAction(db, owner, {
        operation_key: chave ?? `m91-${rotulo}-${stamp}-${(seq += 1)}`,
        establishment_id: loja.data.id,
        customer_id: cf,
        items: [{ emporio_product_id: p.data.id, presentation_id: pres.data.id, quantity: 1 }],
        payments: [{ kind: "dinheiro", amount: 10 }],
      });
    return { db, owner, vender };
  }

  try {
    const A = await arranjo("A");
    const B = await arranjo("B");

    const a1 = await A.vender();
    const a2 = await A.vender();
    check("A: primeira venda é a 1", a1.ok && a1.data.number === 1, j(a1));
    check("A: segunda venda é a 2", a2.ok && a2.data.number === 2, j(a2));

    const b1 = await B.vender();
    check("B: a primeira venda da outra conta também é a 1", b1.ok && b1.data.number === 1, j(b1));

    // Vendas simultâneas do MESMO produto já esgotam as 3 tentativas da transação
    // serializável (P2034), com ou sem contador (conferido sem ele). Não há repetição
    // automática no cliente: a pessoa vê o 409 e repete com a mesma operation_key; aqui cada
    // venda faz o mesmo. A venda que perde a corrida desfaz tudo, inclusive o incremento: por isso nenhum número
    // some, e é isso que o `[3,4,5,6,7]` exato prova.
    const venderRepetindo = async (C: typeof A = A): Promise<Awaited<ReturnType<typeof A.vender>>> => {
      const chave = `m91-lote-${stamp}-${Math.random()}`;
      for (let t = 0; t < 15; t += 1) {
        try {
          return await C.vender(chave);
        } catch (e) {
          if ((e as { code?: string })?.code !== "P2034") throw e;
        }
      }
      throw new Error("excedeu as tentativas");
    };
    const lote = await Promise.all([1, 2, 3, 4, 5].map(() => venderRepetindo()));
    check("5 vendas ao mesmo tempo: todas ok", lote.every((r) => r.ok), j(lote.filter((r) => !r.ok)));
    const nums = lote.flatMap((r) => (r.ok ? [r.data.number] : [])).sort((x, y) => x - y);
    check("5 vendas ao mesmo tempo: números 3 a 7, sem repetir nem pular", j(nums) === "[3,4,5,6,7]", j(nums));

    // Conta nova: as três primeiras vendas disputam a CRIAÇÃO da linha do contador.
    const Cc = await arranjo("C");
    const novo = await Promise.all([1, 2, 3].map(() => venderRepetindo(Cc)));
    const numsC = novo.flatMap((r) => (r.ok ? [r.data.number] : [])).sort((x, y) => x - y);
    check("conta nova, 3 vendas ao mesmo tempo: números 1 a 3", j(numsC) === "[1,2,3]", j(numsC));

    if (!a1.ok) throw new Error("venda base não criou");
    const lida = await V.lerVendaAction(A.db, A.owner, a1.data.id);
    check("lerVendaAction devolve number", lida.ok && lida.data.number === 1, j(lida));

    const lista = await V.listarVendasAction(A.db, A.owner, {});
    check("a lista de vendas traz number", lista.ok && lista.data.length === 7 && lista.data.every((v) => typeof v.number === "number"), j(lista));

    const contador = await A.db.emporioCounter.findFirst({ where: { key: "venda" } });
    check("o contador da conta A parou em 7", contador?.value === 7, j(contador));

    check("formatarNumero(4581) === '004581'", formatarNumero(4581) === "004581");
    check("formatarNumero(1234567) === '1234567'", formatarNumero(1234567) === "1234567");
  } finally {
    const modelos = [
      "emporioAuditLog", "cashMovement", "cashCount", "stockMovement", "emporioSalePayment", "emporioSaleReturnItem", "emporioSaleReturn",
      "emporioSaleItem", "emporioSale", "emporioCounter", "emporioSettings", "financialEntry", "presentationPrice", "productPresentation",
      "userEstablishment", "emporioProduct", "product", "establishment", "bankAccount", "emporioCustomer", "contact", "productCategory", "user",
      "tenantProfile", "tenantFeature",
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
    check("seção 1: a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
  }
}

async function secao2() {
  console.log("\nSeção 2: configurações, logo e cabeçalho da loja (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture, vincularTodas, virarGestor, virarVendedor } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { prisma, prismaForTenant } = await import("@/lib/prisma");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const S = await import("@/lib/actions/emporio-configuracoes");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const rotaSet = await import("@/app/api/v1/emporio/settings/route");
  const rotaLogo = await import("@/app/api/v1/emporio/settings/logo/route");
  const stamp = Date.now();
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const tenantIds: string[] = [];

  try {
    const novoTenant = async (nome: string) => {
      const t = await prisma.tenant.create({
        data: {
          name: `M91s2 ${nome} ${stamp}`,
          document: `M91s${nome}${stamp}`.slice(0, 14),
          plan: "grupo",
          status: "trial",
          trial_ends_at: new Date(Date.now() + 86_400_000),
        },
      });
      tenantIds.push(t.id);
      await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
      await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
      return t;
    };
    const tA = await novoTenant("A");
    const tB = await novoTenant("B");
    const mk = async (tenantId: string, suf: string, role: "OWNER" | "OPERADOR") => {
      const u = await prisma.user.create({
        data: {
          tenant_id: tenantId,
          name: `M91s2 ${suf}`,
          email: `m91s2-${suf}-${stamp}@teste.local`,
          password_hash: hash,
          role,
          ...papelDeFixture(role),
        },
      });
      return { id: u.id, role, email: u.email };
    };
    const donoA = await mk(tA.id, "donoA", "OWNER");
    const donoB = await mk(tB.id, "donoB", "OWNER");
    const gestor = await mk(tA.id, "gestor", "OPERADOR");
    const vend = await mk(tA.id, "vend", "OPERADOR");
    const db = prismaForTenant(tA.id);
    const loja = await Cat.criarEstabelecimentoAction(db, donoA, { name: "M91s2 Loja" });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    await vincularTodas(prisma, tA.id, [gestor.id, vend.id], [loja.data.id]);
    await virarGestor(prisma, gestor.id);
    await virarVendedor(prisma, vend.id);
    const histN = (action: string) => prisma.emporioAuditLog.count({ where: { tenant_id: tA.id, action } });

    // padrões, sem linha
    const p0 = await S.lerConfiguracoesAction(db, donoA);
    check("padrões sem linha: 7 dias, bobina 80, sem logo", p0.ok && p0.data.quote_validity_days === 7 && p0.data.receipt_width === 80 && p0.data.has_logo === false, j(p0));
    check("ler não cria a linha", (await prisma.emporioSettings.count({ where: { tenant_id: tA.id } })) === 0);

    // dono salva e lê
    const sv = await S.salvarConfiguracoesAction(db, donoA, { quote_validity_days: 10, quote_footer: "Pague no Pix", receipt_width: 58 });
    check("dono salva", sv.ok, j(sv));
    const lido = await S.lerConfiguracoesAction(db, donoA);
    check("lê de volta", lido.ok && lido.data.quote_validity_days === 10 && lido.data.quote_footer === "Pague no Pix" && lido.data.receipt_width === 58 && lido.data.sale_footer === null, j(lido));
    check("1 linha configuracoes.editar no Histórico", (await histN("configuracoes.editar")) === 1);

    // permissão
    const g403 = await S.salvarConfiguracoesAction(db, gestor, { quote_validity_days: 3 });
    const v403 = await S.salvarConfiguracoesAction(db, vend, { quote_validity_days: 3 });
    check("gestor: 403", !g403.ok && g403.status === 403, j(g403));
    check("vendedor: 403", !v403.ok && v403.status === 403, j(v403));
    const vLe = await S.lerConfiguracoesAction(db, vend);
    check("vendedor lê: ok", vLe.ok, j(vLe));

    // recusas
    const recusa = async (nome: string, input: Dado, field: string, msg: string) => {
      const r = await S.salvarConfiguracoesAction(db, donoA, input);
      check(nome, !r.ok && r.status === 422 && r.field === field && r.message === msg, j(r));
    };
    const msgVal = "A validade deve ser de 1 a 365 dias.";
    await recusa("validade 0", { quote_validity_days: 0 }, "quote_validity_days", msgVal);
    await recusa("validade 366", { quote_validity_days: 366 }, "quote_validity_days", msgVal);
    await recusa("validade 7,5", { quote_validity_days: 7.5 }, "quote_validity_days", msgVal);
    await recusa("rodapé de 501 caracteres", { sale_footer: "x".repeat(501) }, "sale_footer", "O rodapé aceita até 500 caracteres.");
    await recusa("largura 70", { receipt_width: 70 }, "receipt_width", "Escolha a largura da bobina: 80 ou 58 mm.");
    const depoisRecusas = await S.lerConfiguracoesAction(db, donoA);
    check("recusas não gravam", depoisRecusas.ok && depoisRecusas.data.quote_validity_days === 10 && depoisRecusas.data.sale_footer === null);
    const vazio = await S.salvarConfiguracoesAction(db, donoA, { quote_footer: "   " });
    check("rodapé vazio vira null", vazio.ok && vazio.data.quote_footer === null, j(vazio));

    // logo
    const png = (n: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n - 8, 1)]);
    const lg = await S.salvarLogoAction(db, donoA, { data_base64: png(1024).toString("base64"), mime: "image/png" });
    check("logo PNG de 1 KB aceito, has_logo true", lg.ok && lg.data.has_logo === true, j(lg));
    const pdf = await S.salvarLogoAction(db, donoA, { data_base64: Buffer.from("%PDF-1.4 conteudo").toString("base64"), mime: "image/png" });
    check("PDF com mime image/png: recusado", !pdf.ok && pdf.status === 422 && pdf.message === "O logo deve ser PNG ou JPEG.", j(pdf));
    const grande = await S.salvarLogoAction(db, donoA, { data_base64: png(201 * 1024).toString("base64"), mime: "image/png" });
    check("PNG de 201 KB: recusado", !grande.ok && grande.status === 422 && grande.message === "O logo deve ter até 200 KB.", j(grande));
    const aindaLogo = await S.lerConfiguracoesAction(db, donoA);
    check("recusas mantêm o logo anterior", aindaLogo.ok && aindaLogo.data.has_logo === true);
    const gLogo = await S.salvarLogoAction(db, gestor, { data_base64: png(1024).toString("base64"), mime: "image/png" });
    check("gestor não troca o logo: 403", !gLogo.ok && gLogo.status === 403, j(gLogo));
    check("1 linha configuracoes.logo até aqui", (await histN("configuracoes.logo")) === 1);
    const rm = await S.removerLogoAction(db, donoA);
    check("remover volta has_logo false", rm.ok && rm.data.has_logo === false, j(rm));
    check("remover grava no Histórico", (await histN("configuracoes.logo")) === 2);

    // rotas com Bearer e isolamento
    const token = async (email: string) =>
      String(
        ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password: SENHA }),
        }))).json()) as Dado)?.data?.access_token ?? "",
      );
    const tokA = await token(donoA.email);
    const tokB = await token(donoB.email);
    await S.salvarLogoAction(db, donoA, { data_base64: png(1024).toString("base64"), mime: "image/png" });
    const logoA = await withBearer(tokA, () => rotaLogo.GET());
    check("rota GET do logo de A: 200 image/png", logoA.status === 200 && logoA.headers.get("content-type") === "image/png" && logoA.headers.get("cache-control") === "private, max-age=300", `${logoA.status} ${logoA.headers.get("content-type")}`);
    const setB = await withBearer(tokB, () => rotaSet.GET());
    const setBj = (await setB.json().catch(() => ({}))) as Dado;
    check("B lê as configurações de B: padrões, sem logo", setB.status === 200 && setBj?.data?.quote_validity_days === 7 && setBj?.data?.has_logo === false, `${setB.status} ${j(setBj)}`);
    const logoB = await withBearer(tokB, () => rotaLogo.GET());
    check("B não vê o logo de A: 404", logoB.status === 404, String(logoB.status));
    const patch = await withBearer(tokA, () =>
      rotaSet.PATCH(new Request("http://localhost/api/v1/emporio/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quote_validity_days: 0 }),
      })),
    );
    const patchJ = (await patch.json().catch(() => ({}))) as Dado;
    check("PATCH pela rota com validade 0: 422 no campo", patch.status === 422 && patchJ?.error?.field === "quote_validity_days", `${patch.status} ${j(patchJ)}`);
    const put = await withBearer(tokA, () =>
      rotaLogo.PUT(new Request("http://localhost/api/v1/emporio/settings/logo", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data_base64: Buffer.from("%PDF-1.4").toString("base64"), mime: "image/png" }),
      })),
    );
    check("PUT do logo falso pela rota: 422", put.status === 422, String(put.status));
    const del = await withBearer(tokA, () => rotaLogo.DELETE());
    check("DELETE do logo pela rota: 200", del.status === 200, String(del.status));

    // cabeçalho da loja
    const ed = await Cat.editarEstabelecimentoAction(db, gestor, loja.data.id, {
      document: "12.abc.345/01de-35",
      state: "mg",
      zip: "39400-000",
      phone: "(38) 3221-0000",
    });
    check("gestor grava o cabeçalho", ed.ok && ed.data.document === "12ABC34501DE35" && ed.data.state === "MG" && ed.data.zip === "39400000" && ed.data.phone === "(38) 3221-0000", j(ed));
    const rlida = await Cat.lerEstabelecimentoAction(db, gestor, loja.data.id);
    check("lê de volta", rlida.ok && rlida.data.document === "12ABC34501DE35" && rlida.data.state === "MG" && rlida.data.zip === "39400000" && rlida.data.whatsapp === null, j(rlida));
    const rec = async (nome: string, input: Dado, field: string, msg: string) => {
      const r = await Cat.editarEstabelecimentoAction(db, gestor, loja.data.id, input);
      check(nome, !r.ok && r.status === 422 && r.field === field && r.message === msg, j(r));
    };
    await rec("CNPJ inválido recusado em document", { document: "11222333000180" }, "document", "CNPJ inválido. Confira os 14 caracteres.");
    await rec("UF XX recusada em state", { state: "XX" }, "state", "Escolha a UF da lista.");
    await rec("CEP 3940 recusado em zip", { zip: "3940" }, "zip", "CEP inválido. Use os 8 números.");
    const ediHist = await prisma.emporioAuditLog.findFirst({ where: { tenant_id: tA.id, action: "estabelecimento.editar" }, orderBy: { created_at: "desc" } });
    const campos = ((ediHist?.changes as Dado[]) ?? []).map((m) => m.campo);
    check("Histórico estabelecimento.editar traz CNPJ, Telefone, UF e CEP", ["CNPJ", "Telefone", "UF", "CEP"].every((c) => campos.includes(c)), j(campos));
    const ed2 = await Cat.editarEstabelecimentoAction(db, gestor, loja.data.id, { whatsapp: "38 99999-0000" });
    const ediHist2 = await prisma.emporioAuditLog.findFirst({ where: { tenant_id: tA.id, action: "estabelecimento.editar" }, orderBy: { created_at: "desc" } });
    check("rótulo WhatsApp no Histórico", ed2.ok && j(ediHist2?.changes).includes("WhatsApp"), j(ediHist2?.changes));
  } finally {
    const modelos = [
      "emporioAuditLog", "emporioSettings", "emporioCounter", "userEstablishment", "establishment", "user", "tenantProfile", "tenantFeature",
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
    check("seção 2: a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
  }
}

async function secao3() {
  console.log("\nSeção 3: o papel da venda (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture, vincularTodas, virarGestor, virarVendedor } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = await import("@/lib/actions/emporio-vendas");
  const S = await import("@/lib/actions/emporio-configuracoes");
  const I = await import("@/lib/actions/emporio-impressao");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const rotaRecibo = await import("@/app/api/v1/emporio/sales/[id]/receipt/route");
  const { carregarCatalogoDeVenda } = await import("@/app/(dashboard)/emporio/_components/catalogo-venda");
  const stamp = Date.now();
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const tenantIds: string[] = [];

  try {
    const novoTenant = async (nome: string) => {
      const t = await prisma.tenant.create({
        data: {
          name: `M91s3 ${nome} ${stamp}`,
          document: `M91t${nome}${stamp}`.slice(0, 14),
          plan: "grupo",
          status: "trial",
          trial_ends_at: new Date(Date.now() + 86_400_000),
        },
      });
      tenantIds.push(t.id);
      await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
      await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
      return t;
    };
    const mk = async (tenantId: string, suf: string, role: "OWNER" | "OPERADOR") => {
      const u = await prisma.user.create({
        data: {
          tenant_id: tenantId,
          name: `M91s3 ${suf}`,
          email: `m91s3-${suf}-${stamp}@teste.local`,
          password_hash: hash,
          role,
          ...papelDeFixture(role),
        },
      });
      return { id: u.id, role, email: u.email, name: u.name };
    };
    const tA = await novoTenant("A");
    const tB = await novoTenant("B");
    const donoA = await mk(tA.id, "donoA", "OWNER");
    const donoB = await mk(tB.id, "donoB", "OWNER");
    const vend = await mk(tA.id, "vend", "OPERADOR");
    const db = prismaForTenant(tA.id);

    const loja = await Cat.criarEstabelecimentoAction(db, donoA, { name: "M91s3 Loja Completa" });
    const lojaSo = await Cat.criarEstabelecimentoAction(db, donoA, { name: "M91s3 Loja So Nome" });
    if (!loja.ok || !lojaSo.ok) throw new Error(`lojas: ${j([loja, lojaSo])}`);
    await vincularTodas(prisma, tA.id, [vend.id], [lojaSo.data.id]);
    await virarVendedor(prisma, vend.id);
    void virarGestor;
    const ed = await Cat.editarEstabelecimentoAction(db, donoA, loja.data.id, {
      document: "12.abc.345/01de-35",
      address: "Rua das Flores, 100",
      city: "Montes Claros",
      state: "mg",
      zip: "39400-000",
      phone: "(38) 3221-0000",
      whatsapp: "38 99999-0000",
    });
    if (!ed.ok) throw new Error(`cabeçalho: ${j(ed)}`);
    const cfg = await S.salvarConfiguracoesAction(db, donoA, { sale_footer: "Obrigado pela preferência", receipt_width: 58 });
    if (!cfg.ok) throw new Error(`config: ${j(cfg)}`);

    const categoria = await db.productCategory.create({ data: scoped({ name: `M91s3 cat ${stamp}` }) });
    const p = await Cat.criarProdutoEmporioAction(db, donoA, { name: `M91s3 Ração ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
    if (!p.ok) throw new Error(`produto: ${j(p)}`);
    const pres = await Cat.criarApresentacaoAction(db, donoA, p.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
    for (const l of [loja.data.id, lojaSo.data.id]) {
      const pr = await Cat.definirPrecoAction(db, donoA, { establishment_id: l, presentation_id: pres.data.id, price: 10 });
      if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
      const imp = await Est.implantarEstoqueAction(db, donoA, { establishment_id: l, emporio_product_id: p.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
      if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
      // Entrega 2: toda venda cai num turno aberto.
      await (await import("./_emporio-turno")).abrirTurnoDeTeste(db, donoA, l);
    }
    const cat0 = await carregarCatalogoDeVenda(db, []);
    const cf = cat0.consumidorFinal.id;
    const pj = await db.emporioCustomer.create({
      data: scoped({
        name: "M91s3 Agro PJ",
        person_kind: "pj",
        document: "12ABC34501DE35",
        phone: "(38) 3000-1111",
        address_street: "Av. Central",
        address_number: "50",
        address_district: "Centro",
        city: "Janaúba",
        address_state: "MG",
        address_zip: "39440000",
      }),
    });

    let seq = 0;
    const vender = (lojaId: string, contactId: string, quantity: number) =>
      V.venderAction(db, donoA, {
        operation_key: `m91s3-${stamp}-${(seq += 1)}`,
        establishment_id: lojaId,
        customer_id: contactId,
        items: [{ emporio_product_id: p.data.id, presentation_id: pres.data.id, quantity }],
        payments: [{ kind: "dinheiro", amount: quantity * 10 }],
      });
    const vPj = await vender(loja.data.id, pj.id, 2);
    const vDec = await vender(loja.data.id, cf, 12.5);
    const vSo = await vender(lojaSo.data.id, cf, 1);
    const vCan = await vender(loja.data.id, cf, 1);
    if (!vPj.ok || !vDec.ok || !vSo.ok || !vCan.ok) throw new Error(`vendas: ${j([vPj, vDec, vSo, vCan])}`);
    const can = await V.cancelarVendaAction(db, donoA, vCan.data.id, { reason: "teste" });
    if (!can.ok) throw new Error(`cancelar: ${j(can)}`);

    const r = await I.lerImpressoDaVendaAction(db, donoA, vPj.data.id);
    check("venda a cliente PJ: ok", r.ok, j(r));
    if (r.ok) {
      const d = r.data;
      check("numero com 6 dígitos", d.numero === "000001", d.numero);
      check("loja.documento formatado", d.loja.documento === "12.ABC.345/01DE-35", String(d.loja.documento));
      check("loja.endereco numa linha, sem vírgula sobrando", d.loja.endereco === "Rua das Flores, 100, Montes Claros, MG, 39400-000", String(d.loja.endereco));
      check("loja telefone e whatsapp como digitados", d.loja.telefone === "(38) 3221-0000" && d.loja.whatsapp === "38 99999-0000", j(d.loja));
      check("cliente.documento formatado", d.cliente?.documento === "12.ABC.345/01DE-35", j(d.cliente));
      check("cliente com nome, telefone e endereço", d.cliente?.nome === "M91s3 Agro PJ" && d.cliente.telefone === "(38) 3000-1111" && (d.cliente.endereco ?? "").includes("Av. Central") && (d.cliente.endereco ?? "").includes("39440-000"), j(d.cliente));
      check("rodape é o sale_footer", d.rodape === "Obrigado pela preferência", String(d.rodape));
      check("largura_bobina da configuração", d.largura_bobina === 58, String(d.largura_bobina));
      check("itens[0].produto na apresentação", d.itens[0]?.produto === `M91s3 Ração ${stamp} (Quilo)`, j(d.itens));
      check("itens[0].quantidade '2'", d.itens[0]?.quantidade === "2", j(d.itens));
      check("totais: preço 10, total 20, subtotal 20, desconto 0", d.itens[0]?.preco === 10 && d.itens[0]?.total === 20 && d.total === 20 && d.subtotal === 20 && d.desconto === 0, j(d));
      check("pagamento dinheiro 20", d.pagamentos.length === 1 && d.pagamentos[0].forma === "Dinheiro" && d.pagamentos[0].valor === 20, j(d.pagamentos));
      check("vendedor é o nome de quem vendeu", d.vendedor === donoA.name, String(d.vendedor));
      check("caixa traz o número do caixa e quem registrou", /^Caixa \d+ \(.+\)$/.test(d.caixa ?? ""), String(d.caixa));
      check("não cancelada, sem logo", d.cancelada === false && d.tem_logo === false);
    }

    const rDec = await I.lerImpressoDaVendaAction(db, donoA, vDec.data.id);
    check("quantidade 12,5", rDec.ok && rDec.data.itens[0]?.quantidade === "12,5", j(rDec));
    check("Consumidor final: cliente null", rDec.ok && rDec.data.cliente === null, j(rDec));

    const rSo = await I.lerImpressoDaVendaAction(db, donoA, vSo.data.id);
    check(
      "loja só com o nome: documento, endereco, telefone e whatsapp null",
      rSo.ok && rSo.data.loja.nome === "M91s3 Loja So Nome" && rSo.data.loja.documento === null && rSo.data.loja.endereco === null && rSo.data.loja.telefone === null && rSo.data.loja.whatsapp === null,
      j(rSo),
    );

    const rCan = await I.lerImpressoDaVendaAction(db, donoA, vCan.data.id);
    check("venda cancelada: cancelada true", rCan.ok && rCan.data.cancelada === true, j(rCan));

    const vFora = await I.lerImpressoDaVendaAction(db, vend, vPj.data.id);
    check("Vendedor de outra loja: 404", !vFora.ok && vFora.status === 404, j(vFora));
    const vDentro = await I.lerImpressoDaVendaAction(db, vend, vSo.data.id);
    check("Vendedor da própria loja lê: ok", vDentro.ok, j(vDentro));

    // Desconto: o papel mostra as linhas pelo preco sugerido, para a conta fechar.
    const vDesc = await V.venderAction(db, donoA, {
      operation_key: `m91s3-${stamp}-desc`,
      establishment_id: loja.data.id,
      customer_id: cf,
      items: [
        { emporio_product_id: p.data.id, presentation_id: pres.data.id, quantity: 3, unit_price: 9 },
        { emporio_product_id: p.data.id, presentation_id: pres.data.id, quantity: 2 },
      ],
      payments: [{ kind: "dinheiro", amount: 47 }],
    });
    check("venda com desconto: criada", vDesc.ok, j(vDesc));
    if (vDesc.ok) {
      const rD = await I.lerImpressoDaVendaAction(db, donoA, vDesc.data.id);
      check("venda com desconto: lida", rD.ok, j(rD));
      if (rD.ok) {
        const d = rD.data;
        const cent = (x: number) => Math.round(x * 100);
        const somaLinhas = d.itens.reduce((t, i) => t + cent(i.total), 0);
        check("desconto: o item com desconto sai no preço sugerido (10 x 3 = 30)", d.itens[0]?.preco === 10 && d.itens[0]?.total === 30, j(d.itens));
        check("desconto: o item sem desconto segue no praticado (10 x 2 = 20)", d.itens[1]?.preco === 10 && d.itens[1]?.total === 20, j(d.itens));
        check("desconto: subtotal 50, desconto 3, total 47", d.subtotal === 50 && d.desconto === 3 && d.total === 47, j([d.subtotal, d.desconto, d.total]));
        check("desconto: soma das linhas = subtotal", somaLinhas === cent(d.subtotal), `${somaLinhas} x ${d.subtotal}`);
        check("desconto: subtotal - desconto = total", cent(d.subtotal) - cent(d.desconto) === cent(d.total), j([d.subtotal, d.desconto, d.total]));
      }
    }

    // Granel fracionado: 0,5 a 9,99 grava total 5,00 e desconto 0,01 (meio centavo
    // arredondado para cima). Arredondar 10 x 0,5 na linha daria 5,00 - 0,01 = 4,99.
    const vFrac = await V.venderAction(db, donoA, {
      operation_key: `m91s3-${stamp}-frac`,
      establishment_id: loja.data.id,
      customer_id: cf,
      items: [{ emporio_product_id: p.data.id, presentation_id: pres.data.id, quantity: 0.5, unit_price: 9.99 }],
      payments: [{ kind: "dinheiro", amount: 5 }],
    });
    check("granel fracionado com desconto: criada", vFrac.ok, j(vFrac));
    if (vFrac.ok) {
      const rF = await I.lerImpressoDaVendaAction(db, donoA, vFrac.data.id);
      if (rF.ok) {
        const d = rF.data;
        const cent = (x: number) => Math.round(x * 100);
        check(
          "granel fracionado: soma das linhas = subtotal e subtotal - desconto = total",
          d.itens.reduce((t, i) => t + cent(i.total), 0) === cent(d.subtotal) && cent(d.subtotal) - cent(d.desconto) === cent(d.total),
          j([d.itens, d.subtotal, d.desconto, d.total]),
        );
      } else check("granel fracionado: lida", false, j(rF));
    }

    // Troca: o valor devolvido já é um pagamento gravado ("Valor da troca"); o papel tem que fechar.
    const itemOrigem = await db.emporioSaleItem.findFirstOrThrow({ where: { sale_id: vPj.data.id } });
    const troca = await V.trocarAction(db, donoA, vPj.data.id, {
      operation_key: `m91s3-${stamp}-troca`,
      items_devolvidos: [{ sale_item_id: itemOrigem.id, quantity: 1 }],
      venda: {
        operation_key: `m91s3-${stamp}-trocav`,
        establishment_id: loja.data.id,
        customer_id: pj.id,
        items: [{ emporio_product_id: p.data.id, presentation_id: pres.data.id, quantity: 2 }],
        payments: [{ kind: "dinheiro", amount: 10 }],
      },
    });
    check("troca: criada", troca.ok, j(troca));
    if (troca.ok) {
      const rT = await I.lerImpressoDaVendaAction(db, donoA, troca.data.venda.id);
      check("troca: lida", rT.ok, j(rT));
      if (rT.ok) {
        const soma = Math.round(rT.data.pagamentos.reduce((t, x) => t + x.valor, 0) * 100);
        check("troca: o papel tem a linha do valor da troca (10)", rT.data.pagamentos.some((x) => x.forma === "Valor da troca" && x.valor === 10), j(rT.data.pagamentos));
        check("troca: soma dos pagamentos do papel = total", soma === Math.round(rT.data.total * 100), `${soma} x ${rT.data.total}`);
      }
    }
    const rVenda = await I.lerImpressoDaVendaAction(db, donoA, vPj.data.id);
    check("venda comum: nenhuma linha de troca", rVenda.ok && !rVenda.data.pagamentos.some((x) => x.forma === "Valor da troca"), j(rVenda));

    const token = async (email: string) =>
      String(
        ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password: SENHA }),
        }))).json()) as Dado)?.data?.access_token ?? "",
      );
    const tokA = await token(donoA.email);
    const tokB = await token(donoB.email);
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const url = (id: string) => new Request(`http://localhost/api/v1/emporio/sales/${id}/receipt`);
    const rotaA = await withBearer(tokA, () => rotaRecibo.GET(url(vPj.data.id), ctx(vPj.data.id)));
    const rotaAj = (await rotaA.json().catch(() => ({}))) as Dado;
    check("rota receipt de A: 200 com número", rotaA.status === 200 && /^\d{6}$/.test(rotaAj?.data?.numero ?? ""), `${rotaA.status} ${j(rotaAj)}`);
    const rotaB = await withBearer(tokB, () => rotaRecibo.GET(url(vPj.data.id), ctx(vPj.data.id)));
    check("rota receipt: tenant B não vê a venda de A: 404", rotaB.status === 404, String(rotaB.status));
  } finally {
    const modelos = [
      "emporioAuditLog", "cashMovement", "cashCount", "stockMovement", "emporioSalePayment", "emporioSaleReturnItem", "emporioSaleReturn",
      "emporioSaleItem", "emporioSale", "emporioCounter", "emporioSettings", "financialEntry", "presentationPrice", "productPresentation",
      "userEstablishment", "emporioProduct", "product", "establishment", "bankAccount", "emporioCustomer", "contact", "productCategory", "user",
      "tenantProfile", "tenantFeature",
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
    check("seção 3: a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
  }
}

async function main() {
  await secao1();
  await secao2();
  await secao3();
  console.log(falhas === 0 ? "\n✅ M91 verde" : `\n❌ M91: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
