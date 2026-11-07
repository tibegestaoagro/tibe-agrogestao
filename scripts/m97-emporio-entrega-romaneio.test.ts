import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M97: Módulo 39 (Meu Empório), Frente 3: pedido para entrega e romaneio.
 * Roda: `npm run test:m97`
 *
 * Seção 1: a regra pura do pedido para entrega (sem banco).
 * Seção 2: as colunas do pedido para entrega no orçamento e na venda (banco).
 * Seção 3: o orçamento para entrega e as opções de endereço do cliente (rotas).
 * Seção 4: a venda para entrega e o faturamento que herda do orçamento (rotas).
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

console.log("🧾 M97: Módulo 39 (Meu Empório), Frente 3: pedido para entrega e romaneio\n");

const tenantIds: string[] = [];

async function secao1() {
  console.log("Seção 1: a regra pura do pedido para entrega (sem banco)");
  const R = await import("@/lib/emporio/pedido-para-entrega");
  type C = Parameters<typeof R.resolverPedidoParaEntrega>[0];

  const vazio: C = {
    name: null, person_kind: null, phone: null, document: null,
    address_zip: null, address_street: null, address_number: null, address_complement: null,
    address_district: null, city: null, address_state: null,
  };
  const principal = {
    address_zip: "38400000", address_street: "Rua A", address_number: "10", address_complement: "",
    address_district: "Centro", city: "Uberlândia", address_state: "MG",
  };
  const PF_CPF: C = { ...vazio, ...principal, name: "Zé", person_kind: "pf", phone: "34 99999-0000", document: "52998224725" };
  const PF_SEM_CPF: C = { ...PF_CPF, document: null };
  const PF_SO_NOME_TEL_CPF: C = { ...vazio, name: "Zé", person_kind: "pf", phone: "34 99999-0000", document: "52998224725" };
  const PJ: C = {
    ...vazio, ...principal, name: "Agro Ltda", person_kind: "pj", phone: "34 3333-0000", document: "11222333000181",
    delivery_zip: "38400100", delivery_street: "Av Fazenda", delivery_number: "99", delivery_complement: "Galpão",
    delivery_district: "Industrial", delivery_city: "Uberlândia", delivery_state: "MG",
  };
  const CF: C = { ...vazio, system_key: "consumidor_final", name: "Consumidor final" };
  const OUTRO = {
    delivery_zip: "38400-000", delivery_street: "Rua B", delivery_number: "20", delivery_complement: "",
    delivery_district: "Centro", delivery_city: "Uberlândia", delivery_state: "mg",
  };

  const MSG_CF = "Pedido para entrega precisa do cliente de verdade, não do Consumidor final.";
  const MSG_ESCOLHA = "Escolha o endereço de entrega.";
  const falha = (r: Dado, code: string, field: string | undefined, message: string) =>
    r.ok === false && r.code === code && r.field === field && r.status === 422 && r.message === message;

  console.log("  retirada");
  for (const input of [{ for_delivery: false }, { for_delivery: null }, {}, { ...OUTRO, for_delivery: false, delivery_address_kind: "outro" }]) {
    const r = R.resolverPedidoParaEntrega(PF_CPF, input);
    check(`retirada com ${j(input).slice(0, 40)}`, r.ok && j(r.data) === j(R.RETIRADA));
  }
  const rCfRetirada = R.resolverPedidoParaEntrega(CF, { for_delivery: false, ...OUTRO });
  check("retirada com o Consumidor final: ok", rCfRetirada.ok && j(rCfRetirada.data) === j(R.RETIRADA));
  check(
    "RETIRADA é false e tudo nulo",
    R.RETIRADA.for_delivery === false && Object.entries(R.RETIRADA).every(([k, v]) => k === "for_delivery" || v === null),
  );

  console.log("  o cliente");
  const rCf = R.resolverPedidoParaEntrega(CF, { for_delivery: true, delivery_address_kind: "principal" });
  check("Consumidor final marcado: VALIDATION_ERROR em customer_id", falha(rCf, "VALIDATION_ERROR", "customer_id", MSG_CF), j(rCf));
  const rSemCpf = R.resolverPedidoParaEntrega(PF_SEM_CPF, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
  check(
    "PF sem CPF marcada com OUTRO: customer_id",
    falha(rSemCpf, "DELIVERY_CUSTOMER_INCOMPLETE", "customer_id", "Para entrega, informe o CPF do cliente."),
    j(rSemCpf),
  );
  const rSemTel = R.resolverPedidoParaEntrega({ ...PF_CPF, phone: null }, { for_delivery: true, delivery_address_kind: "principal" });
  check(
    "PF sem telefone: customer_id com o prefixo",
    falha(rSemTel, "DELIVERY_CUSTOMER_INCOMPLETE", "customer_id", "Para entrega, complete o cadastro do cliente: Informe o telefone."),
    j(rSemTel),
  );

  console.log("  a escolha");
  for (const input of [{ for_delivery: true }, { for_delivery: true, delivery_address_kind: null }, { for_delivery: true, delivery_address_kind: "qualquer" }]) {
    const r = R.resolverPedidoParaEntrega(PF_CPF, input);
    check(`escolha ${j(input.delivery_address_kind ?? null)}`, falha(r, "VALIDATION_ERROR", "delivery_address_kind", MSG_ESCOLHA), j(r));
  }

  console.log("  principal e cadastro_entrega");
  const rPrin = R.resolverPedidoParaEntrega(PF_CPF, { for_delivery: true, delivery_address_kind: "principal" });
  check(
    "PF_CPF + principal: ok com as sete colunas do cadastro",
    rPrin.ok && j(rPrin.data) === j({
      for_delivery: true, delivery_address_kind: "principal",
      delivery_zip: "38400000", delivery_street: "Rua A", delivery_number: "10", delivery_complement: null,
      delivery_district: "Centro", delivery_city: "Uberlândia", delivery_state: "MG",
    }),
    j(rPrin),
  );
  const rPrinIgn = R.resolverPedidoParaEntrega(PF_CPF, { for_delivery: true, delivery_address_kind: "principal", ...OUTRO });
  check("principal ignora os delivery_* do input", rPrinIgn.ok && j(rPrinIgn.data) === j(rPrin.ok ? rPrin.data : null), j(rPrinIgn));
  const rIncPrin = R.resolverPedidoParaEntrega(PF_SO_NOME_TEL_CPF, { for_delivery: true, delivery_address_kind: "principal" });
  check(
    "Review Focus 1: principal incompleto cai em delivery_address_kind",
    falha(rIncPrin, "VALIDATION_ERROR", "delivery_address_kind", "O endereço principal do cadastro está incompleto. Complete o cadastro do cliente ou escolha outro endereço."),
    j(rIncPrin),
  );
  const rSemEnt = R.resolverPedidoParaEntrega(PF_CPF, { for_delivery: true, delivery_address_kind: "cadastro_entrega" });
  check(
    "cadastro_entrega sem endereço de entrega no cadastro",
    falha(rSemEnt, "VALIDATION_ERROR", "delivery_address_kind", "Este cliente não tem endereço de entrega no cadastro. Escolha o endereço principal ou outro endereço."),
    j(rSemEnt),
  );
  const rEntInc = R.resolverPedidoParaEntrega({ ...PJ, delivery_district: null }, { for_delivery: true, delivery_address_kind: "cadastro_entrega" });
  check(
    "cadastro_entrega incompleto (sem bairro)",
    falha(rEntInc, "VALIDATION_ERROR", "delivery_address_kind", "O endereço de entrega do cadastro está incompleto. Complete o cadastro do cliente ou escolha outro endereço."),
    j(rEntInc),
  );
  const rEnt = R.resolverPedidoParaEntrega(PJ, { for_delivery: true, delivery_address_kind: "cadastro_entrega" });
  check(
    "PJ + cadastro_entrega completo: ok",
    rEnt.ok && rEnt.data.delivery_address_kind === "cadastro_entrega" && rEnt.data.delivery_street === "Av Fazenda" && rEnt.data.delivery_complement === "Galpão",
    j(rEnt),
  );

  console.log("  outro");
  const rOutro = R.resolverPedidoParaEntrega(PF_CPF, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
  check(
    "outro: CEP em dígitos, UF em maiúscula, complemento nulo",
    rOutro.ok && rOutro.data.delivery_address_kind === "outro" && rOutro.data.delivery_zip === "38400000"
      && rOutro.data.delivery_state === "MG" && rOutro.data.delivery_complement === null && rOutro.data.delivery_street === "Rua B",
    j(rOutro),
  );
  const rNum = R.resolverPedidoParaEntrega(PF_CPF, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO, delivery_number: "  " });
  check("outro sem número", falha(rNum, "VALIDATION_ERROR", "delivery_number", "Informe o número do endereço de entrega."), j(rNum));
  const rCep = R.resolverPedidoParaEntrega(PF_CPF, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO, delivery_zip: "1234" });
  check("outro com CEP curto", falha(rCep, "VALIDATION_ERROR", "delivery_zip", "CEP inválido. Use os 8 números."), j(rCep));
  const rUf = R.resolverPedidoParaEntrega(PF_CPF, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO, delivery_state: "XX" });
  check("outro com UF fora da lista", falha(rUf, "VALIDATION_ERROR", "delivery_state", "Escolha a UF da lista."), j(rUf));
  const rVazio = R.resolverPedidoParaEntrega(PF_CPF, { for_delivery: true, delivery_address_kind: "outro" });
  check("outro sem nada: pede o CEP", falha(rVazio, "VALIDATION_ERROR", "delivery_zip", "Informe o CEP do endereço de entrega."), j(rVazio));

  console.log("  herdar do orçamento");
  const herdaOutro = R.entradaHerdadaDoOrcamento(rOutro.ok ? rOutro.data : R.RETIRADA);
  check(
    "entradaHerdada de outro: as sete colunas",
    j(herdaOutro) === j({
      for_delivery: true, delivery_address_kind: "outro",
      delivery_zip: "38400000", delivery_street: "Rua B", delivery_number: "20", delivery_complement: null,
      delivery_district: "Centro", delivery_city: "Uberlândia", delivery_state: "MG",
    }),
    j(herdaOutro),
  );
  check(
    "entradaHerdada de principal: só a marca e a escolha",
    j(R.entradaHerdadaDoOrcamento(rPrin.ok ? rPrin.data : R.RETIRADA)) === j({ for_delivery: true, delivery_address_kind: "principal" }),
  );
  check("entradaHerdada de RETIRADA", j(R.entradaHerdadaDoOrcamento(R.RETIRADA)) === j({ for_delivery: false }));

  console.log("  falta no cliente, endereço das colunas, linha");
  check("faltaNoClienteParaEntrega(PF_CPF) nulo", R.faltaNoClienteParaEntrega(PF_CPF) === null);
  check(
    "faltaNoClienteParaEntrega(PF_SEM_CPF)",
    j(R.faltaNoClienteParaEntrega(PF_SEM_CPF)) === j({ code: "DELIVERY_CUSTOMER_INCOMPLETE", field: "customer_id", message: "Para entrega, informe o CPF do cliente." }),
  );
  check(
    "faltaNoClienteParaEntrega(CF)",
    j(R.faltaNoClienteParaEntrega(CF)) === j({ code: "VALIDATION_ERROR", field: "customer_id", message: MSG_CF }),
  );
  check("enderecoDasColunas(RETIRADA) nulo", R.enderecoDasColunas(R.RETIRADA) === null);
  check(
    "enderecoDasColunas de principal",
    j(R.enderecoDasColunas(rPrin.ok ? rPrin.data : R.RETIRADA)) === j({
      zip: "38400000", street: "Rua A", number: "10", complement: null, district: "Centro", city: "Uberlândia", state: "MG",
    }),
  );
  const end = { zip: "38400000", street: "Rua A", number: "10", complement: null, district: "Centro", city: "Uberlândia", state: "MG" };
  check("linhaDoEndereco", R.linhaDoEndereco(end) === "Rua A, 10, Centro, Uberlândia/MG, CEP 38400-000", String(R.linhaDoEndereco(end)));
  check(
    "linhaDoEndereco com complemento",
    R.linhaDoEndereco({ ...end, complement: "Apto 2" }) === "Rua A, 10, Apto 2, Centro, Uberlândia/MG, CEP 38400-000",
  );
  check("linhaDoEndereco nulo", R.linhaDoEndereco(null) === null);
}

async function comBanco(fn: () => Promise<void>) {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await fn();
}

async function secao2() {
  console.log("\nSeção 2: as colunas do pedido para entrega (banco)");
  const { prisma, prismaForTenant } = await import("@/lib/prisma");
  const stamp = Date.now().toString(36);
  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: { name: `M97 ${rotulo} ${stamp}`, document: `M97${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
    });
    tenantIds.push(t.id);
    const loja = await prisma.establishment.create({ data: { tenant_id: t.id, name: `M97 Loja ${rotulo}` } });
    const cli = await prisma.emporioCustomer.create({ data: { tenant_id: t.id, name: `M97 Cliente ${rotulo}` } });
    return { t, loja, cli };
  };
  const A = await mkTenant("A");
  const B = await mkTenant("B");
  const nulas = ["delivery_address_kind", "delivery_zip", "delivery_street", "delivery_number", "delivery_complement", "delivery_district", "delivery_city", "delivery_state"];

  const venda = await prisma.emporioSale.create({
    data: { tenant_id: A.t.id, establishment_id: A.loja.id, operation_key: `m97-${stamp}-v1`, number: 1, customer_id: A.cli.id, sold_at: new Date(), net_amount: 10 },
  });
  const orc = await prisma.emporioQuote.create({
    data: { tenant_id: A.t.id, establishment_id: A.loja.id, operation_key: `m97-${stamp}-q1`, number: 1, customer_id: A.cli.id, valid_until: new Date(), net_amount: 10 },
  });
  for (const [nome, linha] of [["venda", venda], ["orçamento", orc]] as const) {
    const l = linha as Dado;
    check(`${nome} sem as colunas novas: for_delivery false`, l.for_delivery === false, String(l.for_delivery));
    check(`${nome} sem as colunas novas: as outras oito nulas`, nulas.every((c) => l[c] === null), j(l));
  }

  const end = {
    for_delivery: true, delivery_address_kind: "outro", delivery_zip: "38400000", delivery_street: "Rua B", delivery_number: "20",
    delivery_complement: "Apto 2", delivery_district: "Centro", delivery_city: "Uberlândia", delivery_state: "MG",
  };
  const vend2 = await prisma.emporioSale.create({
    data: { tenant_id: A.t.id, establishment_id: A.loja.id, operation_key: `m97-${stamp}-v2`, number: 2, customer_id: A.cli.id, sold_at: new Date(), net_amount: 20, ...end } as Dado,
  });
  const orc2 = await prisma.emporioQuote.create({
    data: { tenant_id: A.t.id, establishment_id: A.loja.id, operation_key: `m97-${stamp}-q2`, number: 2, customer_id: A.cli.id, valid_until: new Date(), net_amount: 20, ...end } as Dado,
  });
  const lerV = (await prisma.emporioSale.findUnique({ where: { id: vend2.id } })) as Dado;
  const lerQ = (await prisma.emporioQuote.findUnique({ where: { id: orc2.id } })) as Dado;
  check("venda: grava e lê o endereço de entrega", Object.entries(end).every(([k, v]) => lerV[k] === v), j(lerV));
  check("orçamento: grava e lê o endereço de entrega", Object.entries(end).every(([k, v]) => lerQ[k] === v), j(lerQ));

  const dbB = prismaForTenant(B.t.id) as Dado;
  check("o client do tenant B não acha a venda do A", (await dbB.emporioSale.findFirst({ where: { id: vend2.id } })) === null);
  check("o client do tenant B não acha o orçamento do A", (await dbB.emporioQuote.findFirst({ where: { id: orc2.id } })) === null);
}

async function secao3() {
  console.log("\nSeção 3: o orçamento para entrega e as opções de endereço do cliente (rotas)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const bcrypt = (await import("bcryptjs")).default;
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const stamp = Date.now().toString(36);

  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: { name: `M97c ${rotulo} ${stamp}`, document: `M97c${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
    });
    tenantIds.push(t.id);
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    return t;
  };
  const t = await mkTenant("A");
  const tB = await mkTenant("B");
  const mk = async (tenantId: string, suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: { tenant_id: tenantId, name: `M97c ${suf}`, email: `m97c-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk(t.id, "own", "OWNER");
  const vend = await mk(t.id, "vend", "OPERADOR");
  const caixa = await mk(t.id, "caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const ownerB = await mk(tB.id, "ownb", "OWNER");
  const db = prismaForTenant(t.id) as Dado;
  const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M97c Loja" });
  if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
  const L = loja.data.id;
  await vincularTodas(prisma, t.id, [vend.id, caixa.id], [L]);

  const categoria = await db.productCategory.create({ data: scoped({ name: "M97c categoria" }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M97c Ração ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  const preco = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
  if (!preco.ok) throw new Error(`preço: ${j(preco)}`);
  const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
  if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  const itens = [{ emporio_product_id: prod.data.id, presentation_id: pres.data.id, quantity: 1 }];

  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const rotaQ = await import("@/app/api/v1/emporio/quotes/route");
  const rotaOpc = await import("@/app/api/v1/emporio/customers/[id]/delivery-options/route");
  const token = async (email: string) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  let seq = 0;
  const postar = async (tok: string, corpo: Dado) => {
    const res = await withBearer(tok, () =>
      rotaQ.POST(new Request("http://localhost/api/v1/emporio/quotes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation_key: `m97c-${stamp}-${(seq += 1)}`, establishment_id: L, items: itens, ...corpo }),
      })),
    );
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  };
  const opcoes = async (tok: string, id: string) => {
    const res = await withBearer(tok, () =>
      rotaOpc.GET(new Request(`http://localhost/api/v1/emporio/customers/${id}/delivery-options`), { params: Promise.resolve({ id }) }),
    );
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  };

  const tokVend = await token(vend.email);
  const tokCaixa = await token(caixa.email);
  const tokB = await token(ownerB.email);

  const cf = await C.garantirConsumidorFinal(db);
  const end = { address_zip: "38400-000", address_street: "Rua A", address_number: "10", address_district: "Centro", city: "Uberlândia", address_state: "MG" };
  const mkCli = async (input: Dado) => {
    const r = await C.cadastrarClienteAction(db, vend, input);
    if (!r.ok) throw new Error(`cliente: ${j(r)}`);
    return r.data;
  };
  const pfSemCpf = await mkCli({ name: "M97c PF sem CPF", person_kind: "pf", phone: "34 99999-0001", ...end });
  const pfCpf = await mkCli({ name: "M97c PF CPF", person_kind: "pf", phone: "34 99999-0002", document: "529.982.247-25", ...end });
  const pfCpfSemEnd = await mkCli({ name: "M97c PF CPF sem endereço", person_kind: "pf", phone: "34 99999-0003", document: "390.533.447-05" });
  const pj = await mkCli({
    name: "M97c Agro Ltda", person_kind: "pj", phone: "3433330000", document: "11.222.333/0001-81", ...end,
    delivery_zip: "38400-100", delivery_street: "Av Fazenda", delivery_number: "99", delivery_district: "Industrial", delivery_city: "Uberlândia", delivery_state: "MG",
  });
  const OUTRO = {
    delivery_zip: "38400-200", delivery_street: "Rua B", delivery_number: "20",
    delivery_district: "Bairro Novo", delivery_city: "Uberlândia", delivery_state: "MG",
  };
  const MSG_CF = "Pedido para entrega precisa do cliente de verdade, não do Consumidor final.";
  const nQ = () => prisma.emporioQuote.count({ where: { tenant_id: t.id } });

  console.log("  salvar o orçamento");
  const r0 = await postar(tokVend, { customer_id: cf.id });
  check(
    "sem a marca, com o Consumidor final: 201, for_delivery false, delivery_address null",
    r0.status === 201 && r0.corpo?.data?.for_delivery === false && r0.corpo?.data?.delivery_address === null && r0.corpo?.data?.delivery_address_kind === null,
    `${r0.status} ${j(r0.corpo)}`,
  );
  const antes = await nQ();
  const rCf = await postar(tokVend, { customer_id: cf.id, for_delivery: true, delivery_address_kind: "principal" });
  check(
    "marcado com o Consumidor final: 422 customer_id com a frase",
    rCf.status === 422 && rCf.corpo?.error?.field === "customer_id" && rCf.corpo?.error?.message === MSG_CF,
    `${rCf.status} ${j(rCf.corpo)}`,
  );
  check("nenhum orçamento gravado na recusa", (await nQ()) === antes);

  const rSemCpf = await postar(tokVend, { customer_id: pfSemCpf.id, for_delivery: true, delivery_address_kind: "principal" });
  check(
    "marcado, PF sem CPF: 422 DELIVERY_CUSTOMER_INCOMPLETE",
    rSemCpf.status === 422 && rSemCpf.corpo?.error?.code === "DELIVERY_CUSTOMER_INCOMPLETE" && rSemCpf.corpo?.error?.field === "customer_id",
    `${rSemCpf.status} ${j(rSemCpf.corpo)}`,
  );

  const cadastroAntes = j(await prisma.emporioCustomer.findUnique({ where: { id: pfCpf.id } }));
  const rOutro = await postar(tokVend, { customer_id: pfCpf.id, for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
  check(
    "PF com CPF e outro completo: 201, kind outro, cidade Uberlândia",
    rOutro.status === 201 && rOutro.corpo?.data?.for_delivery === true && rOutro.corpo?.data?.delivery_address_kind === "outro"
      && rOutro.corpo?.data?.delivery_address?.city === "Uberlândia" && rOutro.corpo?.data?.delivery_address?.zip === "38400200",
    `${rOutro.status} ${j(rOutro.corpo)}`,
  );
  check("o cadastro do cliente não mudou", j(await prisma.emporioCustomer.findUnique({ where: { id: pfCpf.id } })) === cadastroAntes);

  const rPrin = await postar(tokVend, { customer_id: pfCpf.id, for_delivery: true, delivery_address_kind: "principal" });
  const copia = rPrin.corpo?.data?.delivery_address;
  check(
    "principal: 201 e a cópia igual ao endereço principal",
    rPrin.status === 201 && rPrin.corpo?.data?.delivery_address_kind === "principal"
      && copia?.zip === "38400000" && copia?.street === "Rua A" && copia?.number === "10" && copia?.district === "Centro" && copia?.city === "Uberlândia" && copia?.state === "MG",
    `${rPrin.status} ${j(rPrin.corpo)}`,
  );
  const ed = await C.editarClienteAction(db, vend, pfCpf.id, { address_street: "Rua Nova" });
  check("edição do cadastro ok", ed.ok, j(ed));
  const O = await import("@/lib/actions/emporio-orcamentos");
  const lido = await O.lerOrcamentoAction(db, owner, rPrin.corpo?.data?.id);
  check("depois de editar o cadastro, a cópia continua a antiga", lido.ok && lido.data.delivery_address?.street === "Rua A", j(lido));

  const rPrinInc = await postar(tokVend, { customer_id: pfCpfSemEnd.id, for_delivery: true, delivery_address_kind: "principal" });
  check(
    "principal incompleto: 422 delivery_address_kind",
    rPrinInc.status === 422 && rPrinInc.corpo?.error?.field === "delivery_address_kind",
    `${rPrinInc.status} ${j(rPrinInc.corpo)}`,
  );
  const rSemBairro = await postar(tokVend, { customer_id: pfCpf.id, for_delivery: true, delivery_address_kind: "outro", ...OUTRO, delivery_district: "" });
  check("outro sem bairro: 422 delivery_district", rSemBairro.status === 422 && rSemBairro.corpo?.error?.field === "delivery_district", `${rSemBairro.status} ${j(rSemBairro.corpo)}`);

  const hist = await prisma.emporioAuditLog.findMany({ where: { tenant_id: t.id, action: "orcamento.criar" } });
  check("o resumo do orcamento.criar de pedido para entrega termina com , para entrega", hist.some((h) => h.summary.endsWith(", para entrega")), j(hist.map((h) => h.summary)));
  check("o da retirada não termina com , para entrega", hist.some((h) => !h.summary.endsWith(", para entrega")));

  console.log("  as opções de endereço");
  const oPj = await opcoes(tokVend, pj.id);
  const dPj = oPj.corpo?.data;
  check(
    "PJ: principal.completo e cadastro_entrega com linha",
    oPj.status === 200 && dPj?.principal?.completo === true && typeof dPj?.cadastro_entrega?.linha === "string" && dPj.cadastro_entrega.linha.includes("Av Fazenda")
      && dPj?.falta_no_cliente === null && dPj?.fixed === false,
    `${oPj.status} ${j(oPj.corpo)}`,
  );
  const oPf = await opcoes(tokVend, pfSemCpf.id);
  check(
    "PF sem CPF: falta_no_cliente com a frase",
    oPf.status === 200 && oPf.corpo?.data?.falta_no_cliente?.message === "Para entrega, informe o CPF do cliente." && oPf.corpo?.data?.cadastro_entrega === null,
    `${oPf.status} ${j(oPf.corpo)}`,
  );
  const oCf = await opcoes(tokVend, cf.id);
  check(
    "Consumidor final: fixed e a falta do Consumidor final",
    oCf.status === 200 && oCf.corpo?.data?.fixed === true && oCf.corpo?.data?.falta_no_cliente?.message === MSG_CF,
    `${oCf.status} ${j(oCf.corpo)}`,
  );
  const oB = await opcoes(tokB, pj.id);
  check("de outra conta: 404 Cliente não encontrado.", oB.status === 404 && oB.corpo?.error?.message === "Cliente não encontrado.", `${oB.status} ${j(oB.corpo)}`);
  const oCx = await opcoes(tokCaixa, pj.id);
  check("o Caixa da loja lê: 200", oCx.status === 200, `${oCx.status} ${j(oCx.corpo)}`);
}

async function secao4() {
  console.log("\nSeção 4: a venda para entrega e o faturamento que herda (rotas)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const O = await import("@/lib/actions/emporio-orcamentos");
  const V = await import("@/lib/actions/emporio-vendas");
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const stamp = Date.now().toString(36);

  const t = await prisma.tenant.create({
    data: { name: `M97d ${stamp}`, document: `M97d${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M97d ${suf}`, email: `m97d-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const vend = await mk("vend", "OPERADOR");
  const caixa = await mk("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const db = prismaForTenant(t.id) as Dado;
  const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M97d Loja" });
  if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
  const L = loja.data.id;
  await vincularTodas(prisma, t.id, [vend.id, caixa.id], [L]);

  const categoria = await db.productCategory.create({ data: scoped({ name: "M97d categoria" }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M97d Ração ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  const preco = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
  if (!preco.ok) throw new Error(`preço: ${j(preco)}`);
  const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
  if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  const itens = [{ emporio_product_id: prod.data.id, presentation_id: pres.data.id, quantity: 1 }];
  const turno = await abrirTurnoDeTeste(db, owner, L);

  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const rotaS = await import("@/app/api/v1/emporio/sales/route");
  const rotaTroca = await import("@/app/api/v1/emporio/sales/[id]/exchange/route");
  const token = async (email: string) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  const tokOwner = await token(owner.email);
  const tokCaixa = await token(caixa.email);
  let seq = 0;
  const vender = async (tok: string, corpo: Dado) => {
    const res = await withBearer(tok, () =>
      rotaS.POST(new Request("http://localhost/api/v1/emporio/sales", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation_key: `m97d-${stamp}-${(seq += 1)}`, establishment_id: L, cash_register_id: turno.cash_register_id,
          items: itens, payments: [{ kind: "dinheiro", amount: 10 }], ...corpo,
        }),
      })),
    );
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  };
  const trocar = async (saleId: string, corpo: Dado) => {
    const res = await withBearer(tokOwner, () =>
      rotaTroca.POST(new Request(`http://localhost/api/v1/emporio/sales/${saleId}/exchange`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
      }), { params: Promise.resolve({ id: saleId }) }),
    );
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  };

  const cf = await C.garantirConsumidorFinal(db);
  const end = { address_zip: "38400-000", address_street: "Rua A", address_number: "10", address_district: "Centro", city: "Uberlândia", address_state: "MG" };
  const mkCli = async (input: Dado) => {
    const r = await C.cadastrarClienteAction(db, vend, input);
    if (!r.ok) throw new Error(`cliente: ${j(r)}`);
    return r.data;
  };
  const pfA = await mkCli({ name: "M97d PF A", person_kind: "pf", phone: "34 99999-1001", document: "529.982.247-25", ...end });
  const pfB = await mkCli({
    name: "M97d PF B", person_kind: "pf", phone: "34 99999-1002", document: "390.533.447-05",
    ...end, address_street: "Rua do B", address_district: "Bairro B",
  });
  const pfC = await mkCli({ name: "M97d PF C", person_kind: "pf", phone: "34 99999-1003", document: "111.444.777-35", ...end });
  const pj = await mkCli({
    name: "M97d Agro Ltda", person_kind: "pj", phone: "3433330000", document: "11.222.333/0001-81", ...end,
    delivery_zip: "38400-100", delivery_street: "Av Fazenda", delivery_number: "99", delivery_district: "Industrial", delivery_city: "Uberlândia", delivery_state: "MG",
  });
  const OUTRO = {
    delivery_zip: "38400-200", delivery_street: "Rua B", delivery_number: "20",
    delivery_district: "Bairro Novo", delivery_city: "Uberlândia", delivery_state: "MG",
  };
  const OUTRO2 = {
    delivery_zip: "38400-300", delivery_street: "Rua C", delivery_number: "30",
    delivery_district: "Bairro Velho", delivery_city: "Araguari", delivery_state: "MG",
  };
  const MSG_CF = "Pedido para entrega precisa do cliente de verdade, não do Consumidor final.";
  const orcar = async (customerId: string, entrega: Dado) => {
    const r = await O.salvarOrcamentoAction(db, vend, {
      operation_key: `m97d-q-${stamp}-${(seq += 1)}`, establishment_id: L, customer_id: customerId, items: itens, ...entrega,
    });
    if (!r.ok) throw new Error(`orçamento: ${j(r)}`);
    return r.data.id;
  };
  const contagens = async () =>
    j([
      await prisma.emporioSale.count({ where: { tenant_id: t.id } }),
      await prisma.stockMovement.count({ where: { tenant_id: t.id, establishment_id: L } }),
      await prisma.cashMovement.count({ where: { tenant_id: t.id } }),
      await prisma.financialEntry.count({ where: { tenant_id: t.id } }),
    ]);

  console.log("  a venda direta");
  const v1 = await vender(tokCaixa, { seller_user_id: vend.id, customer_id: pj.id, for_delivery: true, delivery_address_kind: "cadastro_entrega" });
  const a1 = v1.corpo?.data?.delivery_address;
  check(
    "PJ com cadastro_entrega pelo Caixa: 201 e a cópia é o endereço de entrega do cadastro",
    v1.status === 201 && v1.corpo?.data?.for_delivery === true && v1.corpo?.data?.delivery_address_kind === "cadastro_entrega"
      && a1?.zip === "38400100" && a1?.street === "Av Fazenda" && a1?.number === "99" && a1?.district === "Industrial" && a1?.city === "Uberlândia" && a1?.state === "MG",
    `${v1.status} ${j(v1.corpo)}`,
  );
  const hist = await prisma.emporioAuditLog.findMany({ where: { tenant_id: t.id, action: "venda.criar", target_id: v1.corpo?.data?.id } });
  check("o resumo do venda.criar termina com , para entrega", hist.length === 1 && hist[0].summary.endsWith(", para entrega"), j(hist.map((h) => h.summary)));
  const antesCf = await contagens();
  const vCf = await vender(tokOwner, { customer_id: cf.id, for_delivery: true, delivery_address_kind: "principal" });
  check(
    "marcada com o Consumidor final: 422 customer_id com a frase",
    vCf.status === 422 && vCf.corpo?.error?.field === "customer_id" && vCf.corpo?.error?.message === MSG_CF,
    `${vCf.status} ${j(vCf.corpo)}`,
  );
  check("a recusa não gravou venda, estoque, caixa nem financeiro", (await contagens()) === antesCf, `${antesCf} -> ${await contagens()}`);
  const vRet = await vender(tokOwner, { customer_id: cf.id });
  check(
    "sem a marca: 201 e retirada",
    vRet.status === 201 && vRet.corpo?.data?.for_delivery === false && vRet.corpo?.data?.delivery_address_kind === null && vRet.corpo?.data?.delivery_address === null,
    `${vRet.status} ${j(vRet.corpo)}`,
  );
  const histRet = await prisma.emporioAuditLog.findFirst({ where: { tenant_id: t.id, action: "venda.criar", target_id: vRet.corpo?.data?.id } });
  check("o resumo da retirada não termina com , para entrega", !!histRet && !histRet.summary.endsWith(", para entrega"), String(histRet?.summary));

  console.log("  faturar o orçamento (D3)");
  const qOutro = await orcar(pfA.id, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
  const f1 = await vender(tokOwner, { customer_id: pfA.id, quote_id: qOutro });
  const a2 = f1.corpo?.data?.delivery_address;
  check(
    "sem for_delivery no corpo: herda a marca, outro e o endereço do orçamento",
    f1.status === 201 && f1.corpo?.data?.for_delivery === true && f1.corpo?.data?.delivery_address_kind === "outro"
      && a2?.zip === "38400200" && a2?.street === "Rua B" && a2?.number === "20" && a2?.district === "Bairro Novo",
    `${f1.status} ${j(f1.corpo)}`,
  );
  const qOutroNulo = await orcar(pfA.id, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
  const fNulo = await vender(tokOwner, { customer_id: pfA.id, quote_id: qOutroNulo, for_delivery: null });
  check(
    "for_delivery null no corpo: herda como o ausente",
    fNulo.status === 201 && fNulo.corpo?.data?.for_delivery === true && fNulo.corpo?.data?.delivery_address?.street === "Rua B",
    `${fNulo.status} ${j(fNulo.corpo)}`,
  );
  const qOutroF = await orcar(pfA.id, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
  const f2 = await vender(tokOwner, { customer_id: pfA.id, quote_id: qOutroF, for_delivery: false });
  check(
    "Review Focus 5: for_delivery false no corpo vira retirada, sem endereço",
    f2.status === 201 && f2.corpo?.data?.for_delivery === false && f2.corpo?.data?.delivery_address_kind === null && f2.corpo?.data?.delivery_address === null,
    `${f2.status} ${j(f2.corpo)}`,
  );
  const qOutroC = await orcar(pfA.id, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
  const f3 = await vender(tokOwner, { customer_id: pfA.id, quote_id: qOutroC, for_delivery: true, delivery_address_kind: "outro", ...OUTRO2 });
  check(
    "corpo marcado com outro diferente: vale o do corpo",
    f3.status === 201 && f3.corpo?.data?.delivery_address_kind === "outro" && f3.corpo?.data?.delivery_address?.street === "Rua C"
      && f3.corpo?.data?.delivery_address?.city === "Araguari",
    `${f3.status} ${j(f3.corpo)}`,
  );

  console.log("  Review Focus 2: principal copia o cadastro do cliente da venda, de agora");
  const qPrin = await orcar(pfA.id, { for_delivery: true, delivery_address_kind: "principal" });
  const ed = await C.editarClienteAction(db, vend, pfA.id, { address_street: "Rua Nova A" });
  check("edição do endereço principal ok", ed.ok, j(ed));
  const f4 = await vender(tokOwner, { customer_id: pfA.id, quote_id: qPrin });
  check(
    "faturar sem for_delivery: a venda copia o endereço principal novo",
    f4.status === 201 && f4.corpo?.data?.delivery_address_kind === "principal" && f4.corpo?.data?.delivery_address?.street === "Rua Nova A",
    `${f4.status} ${j(f4.corpo)}`,
  );
  const qPrinA = await orcar(pfA.id, { for_delivery: true, delivery_address_kind: "principal" });
  const f5 = await vender(tokOwner, { customer_id: pfB.id, quote_id: qPrinA });
  check(
    "orçamento principal do cliente A faturado com o cliente B: a cópia é o principal de B",
    f5.status === 201 && f5.corpo?.data?.customer_id === pfB.id && f5.corpo?.data?.delivery_address?.street === "Rua do B"
      && f5.corpo?.data?.delivery_address?.district === "Bairro B",
    `${f5.status} ${j(f5.corpo)}`,
  );

  console.log("  o cliente ficou sem CPF depois do orçamento");
  const qSemCpf = await orcar(pfC.id, { for_delivery: true, delivery_address_kind: "principal" });
  const tira = await C.editarClienteAction(db, vend, pfC.id, { document: null });
  check("tirar o CPF do cliente ok", tira.ok, j(tira));
  const antesSemCpf = await contagens();
  const f6 = await vender(tokOwner, { customer_id: pfC.id, quote_id: qSemCpf });
  check(
    "faturar sem for_delivery: 422 DELIVERY_CUSTOMER_INCOMPLETE em customer_id",
    f6.status === 422 && f6.corpo?.error?.code === "DELIVERY_CUSTOMER_INCOMPLETE" && f6.corpo?.error?.field === "customer_id",
    `${f6.status} ${j(f6.corpo)}`,
  );
  check("o orçamento continua aberto (sale_id nulo)", (await prisma.emporioQuote.findUnique({ where: { id: qSemCpf } }))?.sale_id === null);
  check("a recusa não gravou venda, estoque, caixa nem financeiro", (await contagens()) === antesSemCpf, `${antesSemCpf} -> ${await contagens()}`);
  const poe = await C.editarClienteAction(db, vend, pfC.id, { document: "111.444.777-35" });
  check("completar o CPF ok", poe.ok, j(poe));
  const f7 = await vender(tokOwner, { customer_id: pfC.id, quote_id: qSemCpf });
  check(
    "faturar de novo: 201 e para entrega",
    f7.status === 201 && f7.corpo?.data?.for_delivery === true && f7.corpo?.data?.quote?.id === qSemCpf,
    `${f7.status} ${j(f7.corpo)}`,
  );

  console.log("  a troca (D6)");
  const itemV1 = v1.corpo?.data?.items?.[0]?.id;
  const tr = await trocar(v1.corpo?.data?.id, {
    operation_key: `m97d-troca-${stamp}`,
    cash_register_id: turno.cash_register_id,
    items_devolvidos: [{ sale_item_id: itemV1, quantity: 1 }],
    venda: { customer_id: pj.id, items: itens, payments: [], for_delivery: true, delivery_address_kind: "cadastro_entrega" },
  });
  check(
    "a venda nova da troca nasce retirada, mesmo com for_delivery true no corpo",
    tr.status === 201 && tr.corpo?.data?.venda?.for_delivery === false && tr.corpo?.data?.venda?.delivery_address_kind === null
      && tr.corpo?.data?.venda?.delivery_address === null,
    `${tr.status} ${j(tr.corpo)}`,
  );

  console.log("  a lista de vendas");
  const lista = await V.listarVendasAction(db, owner, { establishment_id: L });
  check(
    "listarVendasAction traz for_delivery de cada venda",
    lista.ok && lista.data.length >= 8 && lista.data.every((v) => typeof v.for_delivery === "boolean" && "delivery_address" in v && "delivery_address_kind" in v)
      && lista.data.some((v) => v.for_delivery) && lista.data.some((v) => !v.for_delivery),
    j(lista.ok ? lista.data.map((v) => v.for_delivery) : lista),
  );
}

async function limpar() {
  if (tenantIds.length === 0) return;
  const { prisma } = await import("@/lib/prisma");
  // A venda aponta para o orçamento e para a devolução da troca (Restrict): solta antes de apagar.
  for (const id of tenantIds) {
    await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
  }
  const modelos = [
    "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "emporioSalePayment", "emporioSaleReturnItem", "stockMovement", "emporioSaleItem",
    "emporioSaleReturn", "emporioCheck", "emporioQuoteItem", "emporioQuote", "emporioSale", "emporioPurchase", "emporioCustomer", "emporioSupplier",
    "cashHandover", "cashSession", "cashRegister", "fixedExpenseOccurrence", "fixedExpenseSplit", "fixedExpenseTemplate", "emporioCounter",
    "emporioSettings", "financialPayment", "financialEntry", "userEstablishment", "establishment", "bankAccount", "contact", "user",
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
  check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
}

async function main() {
  try {
    await secao1();
    await comBanco(secao2);
    await comBanco(secao3);
    await comBanco(secao4);
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M97 verde" : `\n❌ M97: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
