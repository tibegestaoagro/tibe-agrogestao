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
 * Seção 5: mudar o pedido para entrega da venda fechada (action e rota).
 * Seção 6: o romaneio da venda (sem preço) e a linha do pedido para entrega nos papéis.
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

async function secao5() {
  console.log("\nSeção 5: mudar o pedido para entrega depois de fechada (D5)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = (await import("@/lib/actions/emporio-vendas")) as Dado;
  const { formatarNumero } = await import("@/lib/emporio/numeracao");
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const stamp = Date.now().toString(36);

  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: { name: `M97e ${rotulo} ${stamp}`, document: `M97e${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
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
      data: { tenant_id: tenantId, name: `M97e ${suf}`, email: `m97e-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk(t.id, "own", "OWNER");
  const gestor = await mk(t.id, "gestor", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const caixa = await mk(t.id, "caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const vend = await mk(t.id, "vend", "OPERADOR");
  const gestor2 = await mk(t.id, "gestor2", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const caixa2 = await mk(t.id, "caixa2", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const ownerB = await mk(tB.id, "ownb", "OWNER");
  const db = prismaForTenant(t.id) as Dado;
  const dbB = prismaForTenant(tB.id) as Dado;
  const lojaR = await Cat.criarEstabelecimentoAction(db, owner, { name: "M97e Loja" });
  const loja2R = await Cat.criarEstabelecimentoAction(db, owner, { name: "M97e Loja 2" });
  if (!lojaR.ok || !loja2R.ok) throw new Error(`lojas: ${j([lojaR, loja2R])}`);
  const L = lojaR.data.id;
  const L2 = loja2R.data.id;
  await vincularTodas(prisma, t.id, [gestor.id, caixa.id, vend.id], [L]);
  await vincularTodas(prisma, t.id, [gestor2.id, caixa2.id], [L2]);

  const categoria = await db.productCategory.create({ data: scoped({ name: "M97e categoria" }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M97e Ração ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  const preco = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
  if (!preco.ok) throw new Error(`preço: ${j(preco)}`);
  const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
  if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  const itens = [{ emporio_product_id: prod.data.id, presentation_id: pres.data.id, quantity: 1 }];
  const turno = await abrirTurnoDeTeste(db, owner, L);

  const cf = await C.garantirConsumidorFinal(db);
  const pfA = await C.cadastrarClienteAction(db, owner, {
    name: "M97e PF A", person_kind: "pf", phone: "34 99999-2001", document: "529.982.247-25",
    address_zip: "38400-000", address_street: "Rua A", address_number: "10", address_district: "Centro", city: "Uberlândia", address_state: "MG",
  });
  if (!pfA.ok) throw new Error(`cliente: ${j(pfA)}`);
  const cli = pfA.data.id;
  const OUTRO = {
    delivery_zip: "38400-200", delivery_street: "Rua B", delivery_number: "20",
    delivery_district: "Bairro Novo", delivery_city: "Uberlândia", delivery_state: "MG",
  };
  const LINHA_OUTRO = "Rua B, 20, Bairro Novo, Uberlândia/MG, CEP 38400-200";
  const LINHA_PRINCIPAL = "Rua A, 10, Centro, Uberlândia/MG, CEP 38400-000";
  const MSG_CANCELADA = "Venda cancelada não muda o pedido para entrega.";
  const MSG_TROCADA = "Venda trocada não muda o pedido para entrega: mude na venda da troca.";
  const MSG_VENDEDOR = "Só o caixa, o gestor da loja, o gerente geral e o dono podem mudar o pedido para entrega.";

  let seq = 0;
  const vender = async (customerId: string) => {
    const r = await V.venderAction(db, owner, {
      operation_key: `m97e-${stamp}-${(seq += 1)}`, establishment_id: L, cash_register_id: turno.cash_register_id,
      customer_id: customerId, items: itens, payments: [{ kind: "dinheiro", amount: 10 }],
    });
    if (!r.ok) throw new Error(`venda: ${j(r)}`);
    return r.data as Dado;
  };
  const mudar = async (dbx: Dado, ator: Dado, saleId: string, input: Dado): Promise<Dado> => {
    if (typeof V.mudarPedidoParaEntregaAction !== "function") return { ok: false, code: "AUSENTE", status: 0, message: "mudarPedidoParaEntregaAction ausente" };
    return V.mudarPedidoParaEntregaAction(dbx, ator, saleId, input);
  };
  const linhas = (saleId: string) =>
    prisma.emporioAuditLog.findMany({ where: { tenant_id: t.id, action: "venda.pedido_para_entrega", target_id: saleId }, orderBy: { created_at: "asc" } });
  const contagens = async () =>
    j([
      await prisma.stockMovement.count({ where: { tenant_id: t.id } }),
      await prisma.cashMovement.count({ where: { tenant_id: t.id } }),
      await prisma.financialEntry.count({ where: { tenant_id: t.id } }),
      await prisma.emporioSalePayment.count({ where: { tenant_id: t.id } }),
    ]);
  // O jsonb reordena as chaves: compara na ordem campo, antes, depois.
  const mudancas = (c: Dado) => (Array.isArray(c) ? c.map((m: Dado) => ({ campo: m.campo, antes: m.antes, depois: m.depois })) : c);
  const bruta = (id: string) => prisma.emporioSale.findUnique({ where: { id } }) as Promise<Dado>;
  const recusa = (r: Dado, status: number, message: string, field?: string) =>
    r?.ok === false && r.status === status && r.message === message && r.field === field;

  console.log("  quem fatura muda, e o Histórico conta");
  const s1 = await vender(cli);
  const n1 = formatarNumero(s1.number);
  const antes1 = await contagens();
  const b0 = await bruta(s1.id);

  const m1 = await mudar(db, caixa, s1.id, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
  const lida1 = await V.lerVendaAction(db, owner, s1.id);
  check(
    "o Caixa da loja muda de retirada para entrega com outro: ok e a venda lida tem a cópia",
    m1?.ok === true && lida1.ok && lida1.data.for_delivery === true && lida1.data.delivery_address_kind === "outro"
      && lida1.data.delivery_address?.street === "Rua B" && lida1.data.delivery_address?.zip === "38400200",
    j(m1),
  );
  let h = await linhas(s1.id);
  check(
    "uma linha venda.pedido_para_entrega com o resumo para entrega (linha)",
    h.length === 1 && h[0].summary === `Mudou a venda nº ${n1} para entrega (${LINHA_OUTRO})` && h[0].target_type === "venda" && h[0].establishment_id === L,
    j(h.map((x) => x.summary)),
  );
  check(
    "changes: for_delivery false -> true e delivery_address null -> linha",
    h.length === 1 && j(mudancas(h[0].changes)) === j([
      { campo: "for_delivery", antes: false, depois: true },
      { campo: "delivery_address", antes: null, depois: LINHA_OUTRO },
    ]),
    j(h[0]?.changes),
  );

  const m2 = await mudar(db, gestor, s1.id, { for_delivery: true, delivery_address_kind: "principal" });
  h = await linhas(s1.id);
  check(
    "o Gestor da loja muda para principal: ok, resumo Mudou o endereço de entrega",
    m2?.ok === true && m2.data.delivery_address_kind === "principal" && m2.data.delivery_address?.street === "Rua A"
      && h.length === 2 && h[1].summary === `Mudou o endereço de entrega da venda nº ${n1} (${LINHA_PRINCIPAL})`,
    `${j(m2)} ${j(h.map((x) => x.summary))}`,
  );
  check(
    "changes: só delivery_address, da linha antiga para a nova",
    h.length === 2 && j(mudancas(h[1].changes)) === j([{ campo: "delivery_address", antes: LINHA_OUTRO, depois: LINHA_PRINCIPAL }]),
    j(h[1]?.changes),
  );

  const m3 = await mudar(db, owner, s1.id, { for_delivery: false });
  h = await linhas(s1.id);
  const b3 = await bruta(s1.id);
  const nulas9 = ["delivery_address_kind", "delivery_zip", "delivery_street", "delivery_number", "delivery_complement", "delivery_district", "delivery_city", "delivery_state"];
  check(
    "o Dono muda para retirada: ok, colunas nulas, resumo para retirada no balcão",
    m3?.ok === true && b3.for_delivery === false && nulas9.every((c) => b3[c] === null)
      && h.length === 3 && h[2].summary === `Mudou a venda nº ${n1} para retirada no balcão`,
    `${j(m3)} ${j(h.map((x) => x.summary))}`,
  );
  check(
    "não mexe em nada mais: estoque, caixa, financeiro e pagamentos iguais",
    (await contagens()) === antes1,
    `${antes1} -> ${await contagens()}`,
  );
  check(
    "net_amount e status iguais",
    String(b3.net_amount) === String(b0.net_amount) && b3.status === b0.status && b3.status === "concluida",
    j([b0.net_amount, b3.net_amount, b0.status, b3.status]),
  );

  console.log("  sem mudança, não grava");
  const m4 = await mudar(db, owner, s1.id, { for_delivery: false });
  check("mandar a retirada de novo: ok e nenhuma linha nova", m4?.ok === true && (await linhas(s1.id)).length === 3, j(m4));
  await mudar(db, gestor, s1.id, { for_delivery: true, delivery_address_kind: "principal" });
  const m5 = await mudar(db, caixa, s1.id, { for_delivery: true, delivery_address_kind: "principal" });
  check("mandar o mesmo principal de novo: ok e nenhuma linha nova", m5?.ok === true && (await linhas(s1.id)).length === 4, `${j(m5)} ${(await linhas(s1.id)).length}`);
  const mSem = await mudar(db, owner, s1.id, {});
  const bSem = await bruta(s1.id);
  check(
    "sem for_delivery no corpo: 422 for_delivery, e a venda segue para entrega",
    mSem?.ok === false && mSem.status === 422 && mSem.field === "for_delivery" && bSem.for_delivery === true,
    j(mSem),
  );

  console.log("  quem pode, e o alcance");
  const rv = await mudar(db, vend, s1.id, { for_delivery: false });
  check("o Vendedor da loja: 403 com a frase", recusa(rv, 403, MSG_VENDEDOR) && rv.code === "FORBIDDEN", j(rv));
  const rg2 = await mudar(db, gestor2, s1.id, { for_delivery: false });
  check("o Gestor de outra loja: 404", rg2?.ok === false && rg2.status === 404, j(rg2));
  const rc2 = await mudar(db, caixa2, s1.id, { for_delivery: false });
  check("o Caixa de outra loja: 404", rc2?.ok === false && rc2.status === 404, j(rc2));
  const rB = await mudar(dbB, ownerB, s1.id, { for_delivery: false });
  check("outro tenant: 404", rB?.ok === false && rB.status === 404, j(rB));
  check("as recusas não gravaram linha", (await linhas(s1.id)).length === 4);

  const sOntem = await vender(cli);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  await prisma.emporioSale.update({ where: { id: sOntem.id }, data: { sold_at: new Date(new Date(`${ymd}T00:00:00-03:00`).getTime() - 3_600_000) } });
  const rcOntem = await mudar(db, caixa, sOntem.id, { for_delivery: true, delivery_address_kind: "principal" });
  check("o Caixa da loja numa venda de ontem: 404", rcOntem?.ok === false && rcOntem.status === 404, j(rcOntem));
  const rgOntem = await mudar(db, gestor, sOntem.id, { for_delivery: true, delivery_address_kind: "principal" });
  check("o Gestor da loja muda a mesma venda: ok", rgOntem?.ok === true && rgOntem.data.for_delivery === true, j(rgOntem));

  console.log("  cancelada, trocada e Consumidor final");
  const sCanc = await vender(cli);
  const canc = await V.cancelarVendaAction(db, gestor, sCanc.id, { reason: "teste", cash_register_id: turno.cash_register_id });
  if (!canc.ok) throw new Error(`cancelar: ${j(canc)}`);
  const rCanc = await mudar(db, caixa, sCanc.id, { for_delivery: true, delivery_address_kind: "principal" });
  check("venda cancelada: 422 com a frase, sem campo", recusa(rCanc, 422, MSG_CANCELADA) && rCanc.code === "VALIDATION_ERROR", j(rCanc));

  const sTroca = await vender(cli);
  const tr = await V.trocarAction(db, owner, sTroca.id, {
    operation_key: `m97e-troca-${stamp}`,
    cash_register_id: turno.cash_register_id,
    items_devolvidos: [{ sale_item_id: sTroca.items[0].id, quantity: 1 }],
    venda: { customer_id: cli, items: itens, payments: [] },
  });
  if (!tr.ok) throw new Error(`troca: ${j(tr)}`);
  const rTroc = await mudar(db, owner, sTroca.id, { for_delivery: true, delivery_address_kind: "principal" });
  check("venda trocada: 422 com a frase da trocada", recusa(rTroc, 422, MSG_TROCADA) && rTroc.code === "VALIDATION_ERROR", j(rTroc));
  const rNova = await mudar(db, owner, tr.data.venda.id, { for_delivery: true, delivery_address_kind: "principal" });
  check("a venda nova da troca aceita a mudança: ok", rNova?.ok === true && rNova.data.for_delivery === true, j(rNova));

  const sCf = await vender(cf.id);
  const rCf = await mudar(db, owner, sCf.id, { for_delivery: true, delivery_address_kind: "principal" });
  check("Consumidor final marcado: 422 customer_id", rCf?.ok === false && rCf.status === 422 && rCf.field === "customer_id", j(rCf));

  console.log("  Review Focus 3: mudar enquanto outro cancela");
  // A mudança sai com um atraso diferente a cada rodada, para a corrida cair em pontos diferentes do cancelamento.
  const ATRASOS = [0, 10, 20, 40, 80];
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 1; i <= ATRASOS.length; i += 1) {
    const s = await vender(cli);
    let rCancela: Dado;
    let rMuda: Dado;
    try {
      [rCancela, rMuda] = await Promise.all([
        V.cancelarVendaAction(db, gestor, s.id, { reason: `corrida ${i}`, cash_register_id: turno.cash_register_id }),
        esperar(ATRASOS[i - 1]).then(() =>
          V.mudarPedidoParaEntregaAction(db, caixa, s.id, { for_delivery: true, delivery_address_kind: "principal" })),
      ]);
    } catch (e) {
      check(`rodada ${i}: nenhuma exceção (500)`, false, e instanceof Error ? e.message : String(e));
      continue;
    }
    const final = await bruta(s.id);
    // "Antes" de verdade: a linha da mudança é de uma transação que começou antes da do cancelamento.
    // Numa corrida, a transação que perde é refeita, então o now() da linha dela é posterior ao commit da outra.
    const hCancela = await prisma.emporioAuditLog.findFirst({ where: { tenant_id: t.id, action: "venda.cancelar", target_id: s.id } });
    const hMuda = await prisma.emporioAuditLog.findFirst({ where: { tenant_id: t.id, action: "venda.pedido_para_entrega", target_id: s.id } });
    const mudouPrimeiro = !!hCancela && !!hMuda && hMuda.created_at.getTime() < hCancela.created_at.getTime();
    const antes = rMuda?.ok === true && mudouPrimeiro && final.status === "cancelada" && final.for_delivery === true && final.delivery_street === "Rua A";
    const depois = recusa(rMuda, 422, MSG_CANCELADA) && !hMuda && final.status === "cancelada" && final.for_delivery === false;
    console.log(`    rodada ${i}: ${antes ? "a mudança veio antes" : depois ? "a mudança recusou como cancelada" : "nenhum dos dois"}`);
    check(
      `rodada ${i}: o cancelamento passou e a mudança veio antes ou recusou como cancelada`,
      rCancela?.ok === true && (antes || depois),
      `${j({ cancela: rCancela?.ok ? "ok" : rCancela, muda: rMuda?.ok ? "ok" : rMuda })} status=${final.status} for_delivery=${final.for_delivery}`,
    );
  }

  console.log("  a rota");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  let rotaD: Dado = null;
  try {
    rotaD = await import("@/app/api/v1/emporio/sales/[id]/delivery/route");
  } catch (e) {
    check("a rota PATCH /sales/:id/delivery carrega", false, e instanceof Error ? e.message.split("\n")[0] : String(e));
  }
  if (rotaD) {
    const tok = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: caixa.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
    const patch = async (id: string, corpo: Dado) => {
      const res = await withBearer(tok, (): Promise<Response> =>
        rotaD.PATCH(new Request(`http://localhost/api/v1/emporio/sales/${id}/delivery`, {
          method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
        }), { params: Promise.resolve({ id }) }),
      );
      return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
    };
    const sRota = await vender(cli);
    const p1 = await patch(sRota.id, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO, delivery_zip: null });
    check("PATCH outro sem CEP: 422 field delivery_zip", p1.status === 422 && p1.corpo?.error?.field === "delivery_zip", `${p1.status} ${j(p1.corpo)}`);
    const p2 = await patch(sRota.id, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
    check("PATCH outro completo pelo Caixa: 200 com a cópia", p2.status === 200 && p2.corpo?.data?.delivery_address?.street === "Rua B", `${p2.status} ${j(p2.corpo)}`);
  }
}

async function secao6() {
  console.log("\nSeção 6: o romaneio da venda e a linha do pedido para entrega nos papéis (D7, D8)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const O = await import("@/lib/actions/emporio-orcamentos");
  const V = (await import("@/lib/actions/emporio-vendas")) as Dado;
  const I = (await import("@/lib/actions/emporio-impressao")) as Dado;
  const { linhaDoEndereco } = await import("@/lib/emporio/pedido-para-entrega");
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const stamp = Date.now().toString(36);

  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: { name: `M97f ${rotulo} ${stamp}`, document: `M97f${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
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
      data: { tenant_id: tenantId, name: `M97f ${suf}`, email: `m97f-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk(t.id, "own", "OWNER");
  const gestor = await mk(t.id, "gestor", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend = await mk(t.id, "vend", "OPERADOR");
  const vend2 = await mk(t.id, "vend2", "OPERADOR");
  const ownerB = await mk(tB.id, "ownb", "OWNER");
  const db = prismaForTenant(t.id) as Dado;
  const dbB = prismaForTenant(tB.id) as Dado;
  const lojaR = await Cat.criarEstabelecimentoAction(db, owner, { name: "M97f Loja" });
  const loja2R = await Cat.criarEstabelecimentoAction(db, owner, { name: "M97f Loja 2" });
  if (!lojaR.ok || !loja2R.ok) throw new Error(`lojas: ${j([lojaR, loja2R])}`);
  const L = lojaR.data.id;
  await vincularTodas(prisma, t.id, [gestor.id, vend.id], [L]);
  await vincularTodas(prisma, t.id, [vend2.id], [loja2R.data.id]);

  const categoria = await db.productCategory.create({ data: scoped({ name: "M97f categoria" }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M97f Ração ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  const preco = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
  if (!preco.ok) throw new Error(`preço: ${j(preco)}`);
  const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
  if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  const itens = [{ emporio_product_id: prod.data.id, presentation_id: pres.data.id, quantity: 2 }];
  const turno = await abrirTurnoDeTeste(db, owner, L);

  const cf = await C.garantirConsumidorFinal(db);
  const pf = await C.cadastrarClienteAction(db, owner, {
    name: "M97f PF", person_kind: "pf", phone: "34 99999-3001", document: "529.982.247-25",
    address_zip: "38400-000", address_street: "Rua A", address_number: "10", address_district: "Centro", city: "Uberlândia", address_state: "MG",
  });
  if (!pf.ok) throw new Error(`cliente: ${j(pf)}`);
  const cli = pf.data.id;
  const OUTRO = {
    delivery_zip: "38400-200", delivery_street: "Rua B", delivery_number: "20",
    delivery_district: "Bairro Novo", delivery_city: "Uberlândia", delivery_state: "MG",
  };
  const OUTRO2 = {
    delivery_zip: "38400-300", delivery_street: "Rua C", delivery_number: "30",
    delivery_district: "Bairro Velho", delivery_city: "Araguari", delivery_state: "MG",
  };

  let seq = 0;
  const vender = async (extra: Dado = {}) => {
    const r = await V.venderAction(db, owner, {
      operation_key: `m97f-${stamp}-${(seq += 1)}`, establishment_id: L, cash_register_id: turno.cash_register_id,
      customer_id: cli, items: itens, payments: [{ kind: "dinheiro", amount: 20 }], ...extra,
    });
    if (!r.ok) throw new Error(`venda: ${j(r)}`);
    return r.data as Dado;
  };
  const romaneio = async (dbx: Dado, ator: Dado, id: string): Promise<Dado> => {
    if (typeof I.lerRomaneioDaVendaAction !== "function") return { ok: false, code: "AUSENTE", status: 0, message: "lerRomaneioDaVendaAction ausente" };
    return I.lerRomaneioDaVendaAction(dbx, ator, id);
  };

  console.log("  sem dinheiro nenhum (D7)");
  const sFiado = await vender({
    items: [{ ...itens[0], unit_price: 8 }],
    payments: [{ kind: "dinheiro", amount: 6 }, { kind: "fiado", amount: 10, due_date: new Date(Date.now() + 5 * 86_400_000) }],
    notes: "Entregar de manhã",
  });
  const rFiado = await romaneio(db, owner, sFiado.id);
  const texto = j(rFiado.data ?? rFiado);
  check("o romaneio da venda com desconto e fiado: ok", rFiado.ok === true, texto);
  check("sem R$ no JSON", rFiado.ok === true && !texto.includes("R$"), texto);
  const proibidas = ["preco", "total", "valor", "subtotal", "desconto", "pagamentos"];
  check(
    "sem as chaves de dinheiro",
    rFiado.ok === true && proibidas.every((k) => !texto.includes(`"${k}"`)),
    proibidas.filter((k) => texto.includes(`"${k}"`)).join(","),
  );
  check(
    "itens com produto, apresentação e quantidade em pt-BR; linhas = itens",
    rFiado.ok === true && rFiado.data.itens.length === 1 && rFiado.data.itens[0].quantidade === "2"
      && rFiado.data.itens[0].apresentacao === "Quilo" && String(rFiado.data.itens[0].produto).includes("M97f Ração") && rFiado.data.linhas === 1,
    texto,
  );
  check("observacoes = notes", rFiado.ok === true && rFiado.data.observacoes === "Entregar de manhã", texto);
  check("vendedor e caixa preenchidos", rFiado.ok === true && !!rFiado.data.vendedor && /^Caixa \d+ \(/.test(String(rFiado.data.caixa)), texto);
  check(
    "situação ativa, retirada, sem endereço",
    rFiado.ok === true && rFiado.data.situacao === "ativa" && rFiado.data.pedido_para_entrega === false && rFiado.data.endereco_de_entrega === null,
    texto,
  );

  console.log("  entrega e retirada");
  const sOutro = await vender({ for_delivery: true, delivery_address_kind: "outro", ...OUTRO });
  const rOutro = await romaneio(db, owner, sOutro.id);
  const linhaOutro = "Rua B, 20, Bairro Novo, Uberlândia/MG, CEP 38400-200";
  check(
    "venda marcada com outro: pedido_para_entrega e a linha da cópia",
    rOutro.ok === true && rOutro.data.pedido_para_entrega === true && rOutro.data.endereco_de_entrega === linhaOutro
      && rOutro.data.endereco_de_entrega === linhaDoEndereco(sOutro.delivery_address),
    j(rOutro),
  );
  check(
    "o cliente sai sem o endereço do cadastro",
    rOutro.ok === true && rOutro.data.cliente?.nome === "M97f PF" && rOutro.data.cliente?.telefone && rOutro.data.cliente?.documento && !("endereco" in rOutro.data.cliente),
    j(rOutro.data?.cliente),
  );
  const sRet = await vender();
  const rRet = await romaneio(db, owner, sRet.id);
  check(
    "retirada de cliente com endereço completo no cadastro: endereco_de_entrega nulo",
    rRet.ok === true && rRet.data.pedido_para_entrega === false && rRet.data.endereco_de_entrega === null,
    j(rRet),
  );
  const sCf = await vender({ customer_id: cf.id });
  const rCf = await romaneio(db, owner, sCf.id);
  check(
    "Consumidor final: nome, telefone e documento",
    rCf.ok === true && j(rCf.data.cliente) === j({ nome: "Consumidor final", telefone: null, documento: null }),
    j(rCf.data?.cliente),
  );
  const mud = await V.mudarPedidoParaEntregaAction(db, owner, sRet.id, { for_delivery: true, delivery_address_kind: "outro", ...OUTRO2 });
  const rMud = await romaneio(db, owner, sRet.id);
  check(
    "depois de mudar o pedido, o romaneio relido traz o novo endereço",
    mud.ok === true && rMud.ok === true && rMud.data.pedido_para_entrega === true
      && rMud.data.endereco_de_entrega === "Rua C, 30, Bairro Velho, Araguari/MG, CEP 38400-300",
    j(rMud),
  );

  console.log("  venda faturada de orçamento");
  const orc = await O.salvarOrcamentoAction(db, vend, {
    operation_key: `m97f-q-${stamp}`, establishment_id: L, customer_id: cli, items: itens, for_delivery: true, delivery_address_kind: "outro", ...OUTRO,
  });
  if (!orc.ok) throw new Error(`orçamento: ${j(orc)}`);
  const sFat = await vender({ quote_id: orc.data.id });
  const rFat = await romaneio(db, owner, sFat.id);
  check(
    "orcamento_origem com 6 dígitos e vendedor preenchido",
    rFat.ok === true && /^\d{6}$/.test(String(rFat.data.orcamento_origem)) && rFat.data.orcamento_origem === orc.data.numero && !!rFat.data.vendedor,
    j(rFat),
  );
  const iOrc = await I.lerImpressoDoOrcamentoAction(db, owner, orc.data.id);
  check(
    "o papel do orçamento marcado: pedido_para_entrega true e a linha do endereço",
    iOrc.ok === true && iOrc.data.pedido_para_entrega === true && iOrc.data.endereco_de_entrega === linhaOutro,
    j(iOrc.data?.endereco_de_entrega ?? iOrc),
  );
  const iVenda = await I.lerImpressoDaVendaAction(db, owner, sFat.id);
  check(
    "o papel da venda para entrega: true e a linha",
    iVenda.ok === true && iVenda.data.pedido_para_entrega === true && iVenda.data.endereco_de_entrega === linhaOutro,
    j(iVenda.data?.endereco_de_entrega ?? iVenda),
  );
  const iRet = await I.lerImpressoDaVendaAction(db, owner, sCf.id);
  check(
    "o papel da venda de retirada: false e nulo",
    iRet.ok === true && iRet.data.pedido_para_entrega === false && iRet.data.endereco_de_entrega === null,
    j(iRet.data ?? iRet),
  );
  const orcRet = await O.salvarOrcamentoAction(db, vend, { operation_key: `m97f-q2-${stamp}`, establishment_id: L, customer_id: cli, items: itens });
  if (!orcRet.ok) throw new Error(`orçamento: ${j(orcRet)}`);
  const iOrcRet = await I.lerImpressoDoOrcamentoAction(db, owner, orcRet.data.id);
  check(
    "o papel do orçamento de retirada: false e nulo",
    iOrcRet.ok === true && iOrcRet.data.pedido_para_entrega === false && iOrcRet.data.endereco_de_entrega === null,
    j(iOrcRet.data ?? iOrcRet),
  );

  console.log("  a situação");
  const sCanc = await vender();
  const canc = await V.cancelarVendaAction(db, owner, sCanc.id, { reason: "teste", cash_register_id: turno.cash_register_id });
  if (!canc.ok) throw new Error(`cancelar: ${j(canc)}`);
  const rCanc = await romaneio(db, owner, sCanc.id);
  check("cancelada", rCanc.ok === true && rCanc.data.situacao === "cancelada", j(rCanc));
  const sTroca = await vender();
  const tr = await V.trocarAction(db, owner, sTroca.id, {
    operation_key: `m97f-troca-${stamp}`, cash_register_id: turno.cash_register_id,
    items_devolvidos: [{ sale_item_id: sTroca.items[0].id, quantity: 1 }],
    venda: { customer_id: cli, items: [{ ...itens[0], quantity: 1 }], payments: [] },
  });
  if (!tr.ok) throw new Error(`troca: ${j(tr)}`);
  const rTroc = await romaneio(db, owner, sTroca.id);
  check("trocada", rTroc.ok === true && rTroc.data.situacao === "trocada", j(rTroc));
  const sDev = await vender();
  const dev = await V.devolverAction(db, owner, sDev.id, {
    operation_key: `m97f-dev-${stamp}`, refund_kind: "dinheiro", cash_register_id: turno.cash_register_id,
    items: [{ sale_item_id: sDev.items[0].id, quantity: 1 }],
  });
  if (!dev.ok) throw new Error(`devolução: ${j(dev)}`);
  const rDev = await romaneio(db, owner, sDev.id);
  check("devolvida (devolução sem troca)", rDev.ok === true && rDev.data.situacao === "devolvida", j(rDev));

  const { avisoDaSituacao } = await import("@/components/emporio/impresso/romaneio-aviso");
  check("aviso da cancelada, texto exato", avisoDaSituacao("cancelada") === "VENDA CANCELADA: NÃO SEPARAR", String(avisoDaSituacao("cancelada")));
  check("aviso da trocada, texto exato", avisoDaSituacao("trocada") === "VENDA TROCADA: NÃO SEPARAR", String(avisoDaSituacao("trocada")));
  check(
    "aviso da devolvida, texto exato",
    avisoDaSituacao("devolvida") === "VENDA COM DEVOLUÇÃO: CONFIRA NA VENDA ANTES DE SEPARAR",
    String(avisoDaSituacao("devolvida")),
  );
  check("sem aviso na ativa", avisoDaSituacao("ativa") === null);

  console.log("  o alcance e a rota");
  const rv2 = await romaneio(db, vend2, sFiado.id);
  check("o Vendedor de outra loja: 404", rv2?.ok === false && rv2.status === 404, j(rv2));
  const rB = await romaneio(dbB, ownerB, sFiado.id);
  check("outro tenant: 404", rB?.ok === false && rB.status === 404, j(rB));
  const rg = await romaneio(db, gestor, sFiado.id);
  check("o Gestor da loja lê: ok", rg?.ok === true, j(rg));

  const rotaTok = await import("@/app/api/v1/auth/token/route");
  let rota: Dado = null;
  try {
    rota = await import("@/app/api/v1/emporio/sales/[id]/packing-list/route");
  } catch (e) {
    check("a rota GET /sales/:id/packing-list carrega", false, e instanceof Error ? e.message.split("\n")[0] : String(e));
  }
  if (rota) {
    const tok = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: gestor.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
    const res = await withBearer(tok, (): Promise<Response> =>
      rota.GET(new Request(`http://localhost/api/v1/emporio/sales/${sFiado.id}/packing-list`), { params: Promise.resolve({ id: sFiado.id }) }),
    );
    const corpo = (await res.json().catch(() => ({}))) as Dado;
    check("GET packing-list: 200 com data.itens", res.status === 200 && Array.isArray(corpo?.data?.itens), `${res.status} ${j(corpo)}`);
  }
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
    await comBanco(secao5);
    await comBanco(secao6);
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
