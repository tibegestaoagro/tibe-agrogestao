import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M95: Módulo 39 (Meu Empório), Frente 1: clientes e fornecedores.
 * Roda: `npm run test:m95`
 *
 * Seção 1: a regra pura do que é obrigatório no cadastro do cliente (sem banco).
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

console.log("🧾 M95: Módulo 39 (Meu Empório), Frente 1: clientes e fornecedores\n");

const tenantIds: string[] = [];

async function secao1() {
  console.log("Seção 1: a regra pura do cadastro (sem banco)");
  const R = await import("@/lib/emporio/cliente-cadastro");
  type C = Parameters<typeof R.faltaNoCadastro>[0];
  const vazio: C = {
    name: null, person_kind: null, phone: null, document: null,
    address_zip: null, address_street: null, address_number: null, address_complement: null,
    address_district: null, city: null, address_state: null,
  };
  const pf: C = { ...vazio, name: "Zé", person_kind: "pf", phone: "34 99999-0000" };
  const pj: C = {
    ...vazio, name: "Agro Ltda", person_kind: "pj", phone: "34 3333-0000", document: "11222333000181",
    address_zip: "38400000", address_street: "Rua A", address_number: "10", address_complement: "",
    address_district: "Centro", city: "Uberlândia", address_state: "MG",
  };
  const falta = (c: C) => j(R.faltaNoCadastro(c));
  const f = (field: string, message: string) => j({ field, message });

  check("PF só com nome e telefone: completo", R.faltaNoCadastro(pf) === null);
  check("PF sem telefone", falta({ ...pf, phone: null }) === f("phone", "Informe o telefone."));
  check("telefone só com espaço conta como vazio", falta({ ...pf, phone: "   " }) === f("phone", "Informe o telefone."));
  check("sem tipo", R.faltaNoCadastro({ ...pf, person_kind: null })?.field === "person_kind");
  check("sem tipo: mensagem", R.faltaNoCadastro({ ...pf, person_kind: null })?.message === "Escolha pessoa física ou jurídica.");
  check("PF sem nome", falta({ ...pf, name: null }) === f("name", "Informe o nome do cliente."));
  check("PJ sem nome", falta({ ...pj, name: " " }) === f("name", "Informe o nome da empresa."));
  check("PJ sem CNPJ", falta({ ...pj, document: null }) === f("document", "Informe o CNPJ."));
  check("PJ completa: nulo (complemento vazio não falta)", R.faltaNoCadastro(pj) === null);
  check("PJ sem CEP", R.faltaNoCadastro({ ...pj, address_zip: null })?.field === "address_zip");
  check("PJ sem rua", R.faltaNoCadastro({ ...pj, address_street: null })?.field === "address_street");
  check("PJ sem número", R.faltaNoCadastro({ ...pj, address_number: null })?.field === "address_number");
  check("PJ sem bairro", R.faltaNoCadastro({ ...pj, address_district: null })?.field === "address_district");
  check("PJ sem cidade", R.faltaNoCadastro({ ...pj, city: null })?.field === "city");
  check("PJ sem UF", falta({ ...pj, address_state: null }) === f("address_state", "Escolha a UF do endereço principal."));
  check("PJ sem bairro: mensagem", R.faltaNoCadastro({ ...pj, address_district: null })?.message === "Informe o bairro do endereço principal.");

  const cf: C = { ...vazio, system_key: "consumidor_final", name: "Consumidor final" };
  check("Consumidor final: sem nada, completo", R.faltaNoCadastro(cf) === null);
  check("Consumidor final: ehConsumidorFinal", R.ehConsumidorFinal(cf) && !R.ehConsumidorFinal(pf));
  check(
    "Consumidor final: entrega recusa",
    R.faltaParaEntrega(cf, null)?.field === "customer_id"
      && R.faltaParaEntrega(cf, null)?.message === "Pedido para entrega precisa do cliente de verdade, não do Consumidor final.",
  );

  const end: NonNullable<Parameters<typeof R.faltaParaEntrega>[1]> = { zip: "38400000", street: "Rua B", number: "5", complement: null, district: "Bairro", city: "Uberlândia", state: "MG" };
  const ent = (c: C, e: typeof end | null) => j(R.faltaParaEntrega(c, e));
  check("entrega de PF sem CPF", ent(pf, end) === f("document", "Para entrega, informe o CPF do cliente."));
  const pfCpf: C = { ...pf, document: "52998224725" };
  check("entrega de PF com CPF e endereço completo: nulo", R.faltaParaEntrega(pfCpf, end) === null);
  check("entrega, endereço sem número", R.faltaParaEntrega(pfCpf, { ...end, number: " " })?.field === "delivery_number");
  check("entrega, endereço nulo", R.faltaParaEntrega(pfCpf, null)?.field === "delivery_zip");
  check("entrega, sem rua", R.faltaParaEntrega(pfCpf, { ...end, street: null })?.field === "delivery_street");
  check("entrega, sem bairro", R.faltaParaEntrega(pfCpf, { ...end, district: null })?.field === "delivery_district");
  check("entrega, sem cidade", R.faltaParaEntrega(pfCpf, { ...end, city: null })?.field === "delivery_city");
  check(
    "entrega, sem UF",
    ent(pfCpf, { ...end, state: null }) === f("delivery_state", "Escolha a UF do endereço de entrega."),
  );
  check("entrega, sem CEP: mensagem", R.faltaParaEntrega(pfCpf, null)?.message === "Informe o CEP do endereço de entrega.");
  check("entrega de PJ completa com o endereço principal: nulo", R.faltaParaEntrega(pj, R.enderecoPrincipalDe(pj)) === null);
  check("entrega de PJ incompleta: a falta do cadastro vem antes", R.faltaParaEntrega({ ...pj, address_zip: null }, null)?.field === "address_zip");
  check("entrega de PF sem telefone: o cadastro vem antes do CPF", R.faltaParaEntrega({ ...pf, phone: null }, end)?.field === "phone");

  check("enderecoCompleto: completo", R.enderecoCompleto(end) && !R.enderecoCompleto(null) && !R.enderecoCompleto({ ...end, state: null }));
  check("enderecoDeEntregaDe: sete campos vazios dão nulo", R.enderecoDeEntregaDe({ ...pj, delivery_zip: "", delivery_street: " " }) === null);
  const comEntrega = R.enderecoDeEntregaDe({ ...pj, delivery_zip: "38400001", delivery_street: "Rua C" });
  check("enderecoDeEntregaDe: com algum campo, devolve o endereço", comEntrega?.zip === "38400001" && comEntrega?.street === "Rua C");
  check("enderecoDeEntregaDe: só o complemento já basta", R.enderecoDeEntregaDe({ ...pj, delivery_complement: "Casa" })?.complement === "Casa");
  const principal = R.enderecoPrincipalDe(pj);
  check("enderecoPrincipalDe copia city para city", principal.city === "Uberlândia" && principal.zip === "38400000" && principal.state === "MG");

  const dup = R.recusaDocumentoRepetido("fornecedor", { name: "Agro X", archived: true }, "11222333000181") as Dado;
  check(
    "documento repetido (CNPJ, arquivado)",
    !dup.ok && dup.code === "DUPLICATE_DOCUMENT" && dup.status === 409 && dup.field === "document"
      && dup.message === "Já existe um fornecedor com esse CNPJ: Agro X. Ele está arquivado: desarquive em Fornecedores.",
    j(dup),
  );
  const dup2 = R.recusaDocumentoRepetido("cliente", { name: "Zé", archived: false }, "52998224725") as Dado;
  check("documento repetido (CPF, ativo)", !dup2.ok && dup2.message === "Já existe um cliente com esse CPF: Zé.", j(dup2));
  const dup3 = R.recusaDocumentoRepetido("cliente", { name: "Zé", archived: true }, "52998224725") as Dado;
  check("documento repetido (cliente arquivado)", dup3.message === "Já existe um cliente com esse CPF: Zé. Ele está arquivado: desarquive em Clientes.", j(dup3));
}

// As seções com banco entram nas próximas tarefas.
async function comBanco(fn: () => Promise<void>) {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await fn();
}

const stamp = Date.now().toString(36);

async function secao2() {
  console.log("\nSeção 2: as tabelas novas (isolamento, índices únicos, compra sem forma de pagamento)");
  const { prisma, prismaForTenant } = await import("@/lib/prisma");
  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: {
        name: `M95 ${rotulo} ${stamp}`,
        document: `M95${rotulo}${stamp}`.slice(0, 14),
        plan: "grupo",
        status: "trial",
        trial_ends_at: new Date(Date.now() + 86_400_000),
      },
    });
    tenantIds.push(t.id);
    return { t, db: prismaForTenant(t.id) as Dado };
  };
  const A = await mkTenant("A");
  const B = await mkTenant("B");
  const codigo = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? "erro";
    }
  };

  const joao = await A.db.emporioCustomer.create({ data: { name: "João da Ponte", person_kind: "pf", phone: "34 99999-0000" } });
  check("cliente criado pelo client escopado leva o tenant A", joao.tenant_id === A.t.id);
  check("o client do tenant B não acha o cliente do A", (await B.db.emporioCustomer.findFirst({ where: { id: joao.id } })) === null);
  const lido = await prisma.emporioCustomer.findUnique({ where: { id: joao.id } });
  check("name_busca é gerada sem acento e em minúscula", lido?.name_busca === "joao da ponte", String(lido?.name_busca));

  await A.db.emporioCustomer.create({ data: { name: "Agro 1", document: "11222333000181" } });
  check(
    "mesmo documento na mesma conta: P2002",
    (await codigo(() => A.db.emporioCustomer.create({ data: { name: "Agro 2", document: "11222333000181" } }))) === "P2002",
  );
  check(
    "mesmo documento em contas diferentes: ok",
    (await codigo(() => B.db.emporioCustomer.create({ data: { name: "Agro 3", document: "11222333000181" } }))) === null,
  );
  await A.db.emporioCustomer.create({ data: { name: "Consumidor final", system_key: "consumidor_final" } });
  check(
    "dois Consumidores finais na mesma conta: P2002",
    (await codigo(() => A.db.emporioCustomer.create({ data: { name: "Consumidor final", system_key: "consumidor_final" } }))) === "P2002",
  );
  check(
    "clientes sem documento e sem chave repetem à vontade",
    (await codigo(() => A.db.emporioCustomer.create({ data: { name: "Outro sem documento" } }))) === null,
  );

  const prop = await A.db.property.create({ data: { name: `M95 Fazenda ${stamp}` } });
  const forn = await A.db.emporioSupplier.create({ data: { kind: "propriedade", property_id: prop.id, name: prop.name } });
  check("fornecedor criado pelo client escopado leva o tenant A", forn.tenant_id === A.t.id);
  check("o client do tenant B não acha o fornecedor do A", (await B.db.emporioSupplier.findFirst({ where: { id: forn.id } })) === null);
  check(
    "dois fornecedores da mesma propriedade: P2002",
    (await codigo(() => A.db.emporioSupplier.create({ data: { kind: "propriedade", property_id: prop.id, name: "Cópia" } }))) === "P2002",
  );
  check(
    "dois fornecedores de fora sem propriedade: ok",
    (await codigo(async () => {
      await A.db.emporioSupplier.create({ data: { kind: "externo", name: "Casa Rural" } });
      await A.db.emporioSupplier.create({ data: { kind: "externo", name: "Casa Rural 2" } });
    })) === null,
  );

  const loja = await prisma.establishment.create({ data: { tenant_id: A.t.id, name: "M95 Loja" } });
  const compra = await A.db.emporioPurchase.create({
    data: {
      establishment_id: loja.id,
      supplier_id: forn.id,
      operation_key: `m95-${stamp}`,
      purchased_at: new Date(),
      freight: 0,
    },
  });
  check("compra com payment_kind nulo grava", compra.payment_kind === null, j(compra.payment_kind));
}

async function secao3() {
  console.log("\nSeção 3: o cliente do Empório na tabela nova (cadastro, edição, venda, fiado, cheque, orçamento)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = await import("@/lib/actions/emporio-vendas");
  const Cx = await import("@/lib/actions/emporio-caixa");
  const O = await import("@/lib/actions/emporio-orcamentos");
  const I = await import("@/lib/actions/emporio-impressao");
  const Ct = await import("@/lib/actions/contacts");
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);

  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: {
        name: `M95c ${rotulo} ${stamp}`,
        document: `M95c${rotulo}${stamp}`.slice(0, 14),
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
  const t = await mkTenant("A");
  const tB = await mkTenant("B");
  const mk = async (tenantId: string, suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: {
        tenant_id: tenantId,
        name: `M95c ${suf}`,
        email: `m95c-${suf}-${stamp}@teste.local`,
        password_hash: hash,
        role,
        ...papelDeFixture(role),
        ...extra,
      },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk(t.id, "own", "OWNER");
  const vend = await mk(t.id, "vend", "OPERADOR");
  const caixa = await mk(t.id, "caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const semPapel = await mk(t.id, "sem", "OPERADOR", { emporio_role: null, emporio_keys: [] });
  const db = prismaForTenant(t.id) as Dado;
  const dbB = prismaForTenant(tB.id) as Dado;
  const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M95c Loja" });
  if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
  const L = loja.data.id;
  await vincularTodas(prisma, t.id, [vend.id, caixa.id], [L]);

  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const rotaPost = await import("@/app/api/v1/emporio/customers/route");
  const rotaId = await import("@/app/api/v1/emporio/customers/[id]/route");
  const token = async (email: string) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  const postar = async (tok: string, corpo: unknown) => {
    const res = await withBearer(tok, () =>
      rotaPost.POST(new Request("http://localhost/api/v1/emporio/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      })),
    );
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  };
  const histDe = (action: string) => prisma.emporioAuditLog.findMany({ where: { tenant_id: t.id, action } });

  // --- cadastro pela rota e pela action ---------------------------------------
  const tokVend = await token(vend.email);
  const r1 = await postar(tokVend, { name: "Maria Só Telefone", person_kind: "pf", phone: "34 99999-0000" });
  check("Vendedor cadastra PF só com nome e telefone pela rota: 201", r1.status === 201 && r1.corpo?.data?.incomplete === false, `${r1.status} ${j(r1.corpo)}`);
  const linhasCad = await histDe("cliente.cadastrar");
  check("uma linha cliente.cadastrar com target_type cliente", linhasCad.length === 1 && linhasCad[0].target_type === "cliente", j(linhasCad));
  const maria = r1.corpo?.data as Dado;
  const r2 = await postar(await token(caixa.email), { name: "Cliente do Caixa", person_kind: "pf", phone: "34 98888-0000" });
  check("o Caixa cadastra: 201", r2.status === 201, `${r2.status} ${j(r2.corpo)}`);
  // Pela rota, o guard do Empório já esconde o módulo de quem não tem papel (404); a action recusa com 403.
  const r3 = await postar(await token(semPapel.email), { name: "Ninguém", person_kind: "pf", phone: "1" });
  const r3a = await C.cadastrarClienteAction(db, semPapel, { name: "Ninguém", person_kind: "pf", phone: "1" });
  check(
    "quem não tem papel no Empório: 403 na action (e a rota recusa)",
    !r3a.ok && r3a.status === 403 && r3a.code === "FORBIDDEN" && r3.status >= 400 && r3.status !== 201,
    `${r3.status} ${j(r3a)}`,
  );

  const pjSemEnd = await C.cadastrarClienteAction(db, vend, { name: "Agro Sem Endereço", person_kind: "pj", phone: "3433", document: "11.222.333/0001-81" });
  check("PJ sem endereço: 422 address_zip", !pjSemEnd.ok && pjSemEnd.status === 422 && pjSemEnd.field === "address_zip", j(pjSemEnd));
  const endereco = {
    address_zip: "38400-000", address_street: "Rua A", address_number: "10", address_district: "Centro", city: "Uberlândia", address_state: "mg",
  };
  const pjAlfa = await C.cadastrarClienteAction(db, vend, { name: "Empresa Alfa", person_kind: "pj", phone: "3433", document: "12.abc.345/01de-35", ...endereco });
  check("PJ completa com CNPJ alfanumérico: ok, documento em maiúscula", pjAlfa.ok && pjAlfa.data.document === "12ABC34501DE35" && pjAlfa.data.address_state === "MG", j(pjAlfa));

  const comCpf = await C.cadastrarClienteAction(db, vend, { name: "Zé do CPF", person_kind: "pf", phone: "3499", document: "529.982.247-25" });
  check("PF com CPF: ok", comCpf.ok && comCpf.data.document === "52998224725", j(comCpf));
  const cpfRep = await C.cadastrarClienteAction(db, vend, { name: "Outro Zé", person_kind: "pf", phone: "3499", document: "52998224725" });
  check(
    "CPF repetido: 409 com o nome de quem já tem",
    !cpfRep.ok && cpfRep.status === 409 && cpfRep.code === "DUPLICATE_DOCUMENT" && cpfRep.field === "document"
      && cpfRep.message === "Já existe um cliente com esse CPF: Zé do CPF.",
    j(cpfRep),
  );
  const arquivado = await db.emporioCustomer.create({
    data: scoped({ name: "Cliente Arquivado", person_kind: "pf", phone: "1", document: "39053344705", archived_at: new Date() }),
  });
  const cpfArq = await C.cadastrarClienteAction(db, vend, { name: "Novo", person_kind: "pf", phone: "1", document: "390.533.447-05" });
  check(
    "CPF de cliente arquivado: a frase com desarquive em Clientes",
    !cpfArq.ok && cpfArq.message === "Já existe um cliente com esse CPF: Cliente Arquivado. Ele está arquivado: desarquive em Clientes.",
    j(cpfArq),
  );

  // Review Focus 2: dois balcões ao mesmo tempo com o mesmo CPF.
  const [pa, pb] = await Promise.all([
    C.cadastrarClienteAction(db, vend, { name: "Balcão Um", person_kind: "pf", phone: "1", document: "111.444.777-35" }),
    C.cadastrarClienteAction(db, caixa, { name: "Balcão Dois", person_kind: "pf", phone: "2", document: "11144477735" }),
  ]);
  const okUm = [pa, pb].filter((r) => r.ok).length;
  const recusa = [pa, pb].find((r) => !r.ok) as Dado;
  check(
    "dois cadastros em paralelo com o mesmo CPF: um ok, o outro 409 em document",
    okUm === 1 && recusa?.code === "DUPLICATE_DOCUMENT" && recusa?.field === "document" && /^Já existe um cliente com esse CPF: Balcão (Um|Dois)\.$/.test(recusa?.message ?? ""),
    j([pa, pb]),
  );
  check("uma linha só no banco", (await prisma.emporioCustomer.count({ where: { tenant_id: t.id, document: "11144477735" } })) === 1);

  // --- edição (Review Focus 1 e 3) --------------------------------------------
  const pjVelha = await db.emporioCustomer.create({ data: scoped({ name: "PJ Migrada", person_kind: "pj", document: "11222333000181" }) });
  const soTel = await C.editarClienteAction(db, vend, pjVelha.id, { phone: "34 97777-6666" });
  check("PJ sem endereço: editar só o telefone dá 422 address_zip", !soTel.ok && soTel.status === 422 && soTel.field === "address_zip", j(soTel));
  check("e o telefone não foi gravado", (await db.emporioCustomer.findUnique({ where: { id: pjVelha.id } }))?.phone === null);

  const pfParaPj = await C.editarClienteAction(db, vend, maria.id, { person_kind: "pj", document: "11.444.777/0001-61" });
  check("PF para PJ sem endereço: 422 address_zip", !pfParaPj.ok && pfParaPj.status === 422 && pfParaPj.field === "address_zip", j(pfParaPj));

  if (!pjAlfa.ok) throw new Error("pjAlfa");
  await db.emporioCustomer.update({ where: { id: pjAlfa.data.id }, data: { responsible_name: "Fulano Responsável" } });
  const pjParaPf = await C.editarClienteAction(db, vend, pjAlfa.data.id, { person_kind: "pf", document: null });
  check("PJ para PF: ok, responsible_name nulo", pjParaPf.ok && pjParaPf.data.person_kind === "pf" && pjParaPf.data.responsible_name === null, j(pjParaPf));
  const comIe = await C.editarClienteAction(db, vend, pjAlfa.data.id, { state_registration: "ISENTO" });
  const semIe = await C.editarClienteAction(db, vend, pjAlfa.data.id, { state_registration: null });
  check(
    "null limpa, ausente mantém",
    comIe.ok && comIe.data.state_registration === "ISENTO" && semIe.ok && semIe.data.state_registration === null
      && semIe.data.phone === "3433" && semIe.data.address_street === "Rua A",
    j([comIe, semIe]),
  );
  const editaDoc = await C.editarClienteAction(db, vend, maria.id, { document: "123.456.789-09" });
  const linhasEd = (await histDe("cliente.editar")).filter((l) => l.target_id === maria.id);
  const mudDoc = linhasEd.flatMap((l) => (Array.isArray(l.changes) ? (l.changes as Dado[]) : [])).find((m) => m.campo === "CPF/CNPJ");
  check(
    "uma linha cliente.editar, com o documento como 'informado'",
    editaDoc.ok && linhasEd.length === 1 && linhasEd[0].target_type === "cliente" && mudDoc?.depois === "informado" && mudDoc?.antes === null,
    j(linhasEd),
  );

  const cf = await C.garantirConsumidorFinal(db);
  const eCf = await C.editarClienteAction(db, vend, cf.id, { phone: "1" });
  check(
    "editar o Consumidor final: 422 com a frase fixa",
    !eCf.ok && eCf.status === 422 && eCf.message === "O Consumidor final é fixo e não pode ser editado nem arquivado.",
    j(eCf),
  );
  const eArq = await C.editarClienteAction(db, vend, arquivado.id, { phone: "2" });
  check(
    "editar arquivado: a frase do arquivado",
    !eArq.ok && eArq.status === 422 && eArq.message === "Esse cliente está arquivado: desarquive em Clientes antes de editar.",
    j(eArq),
  );
  const deB = await dbB.emporioCustomer.create({ data: scoped({ name: "Cliente do B" }) });
  const eB = await C.editarClienteAction(db, vend, deB.id, { phone: "3" });
  check("editar id de outra conta: 404 Cliente não encontrado.", !eB.ok && eB.status === 404 && eB.message === "Cliente não encontrado.", j(eB));

  // --- Consumidor final e a separação de Contatos -----------------------------
  const [g1, g2] = await Promise.all([C.garantirConsumidorFinal(db), C.garantirConsumidorFinal(db)]);
  const qtdCf = await prisma.emporioCustomer.count({ where: { tenant_id: t.id, system_key: "consumidor_final" } });
  check("garantirConsumidorFinal em paralelo: mesmo id e uma linha", g1.id === g2.id && g1.id === cf.id && qtdCf === 1, `${j([g1, g2])} ${qtdCf}`);
  const [, gB] = await Promise.all([C.garantirConsumidorFinal(dbB), C.garantirConsumidorFinal(dbB)]);
  check("outra conta tem o seu", gB.id !== cf.id);
  check("garantirConsumidorFinal não cria Contact", (await prisma.contact.count({ where: { tenant_id: { in: [t.id, tB.id] } } })) === 0);
  const contatos = await Ct.listContacts(db);
  check("listContacts não traz o cliente do Empório", !contatos.some((c) => c.id === maria.id || c.name === "Maria Só Telefone"), j(contatos));
  const foc = await Ct.findOrCreateContact(db, "Maria Só Telefone");
  check("findOrCreateContact com o nome do cliente cria um Contact novo", foc.criado === true && foc.id !== maria.id, j(foc));

  // --- venda ------------------------------------------------------------------
  const categoria = await db.productCategory.create({ data: scoped({ name: "M95c categoria" }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M95c Ração ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  const preco = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
  if (!preco.ok) throw new Error(`preço: ${j(preco)}`);
  const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
  if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  await abrirTurnoDeTeste(db, owner, L);

  let seq = 0;
  const itens = [{ emporio_product_id: prod.data.id, presentation_id: pres.data.id, quantity: 1 }];
  const corpo = (extra: Record<string, unknown>, payments: Dado[] = [{ kind: "dinheiro", amount: 10 }]) => ({
    operation_key: `m95c-${stamp}-${(seq += 1)}`,
    establishment_id: L,
    items: itens,
    payments,
    ...extra,
  });
  const semCli = await V.venderAction(db, owner, corpo({}) as Dado);
  check(
    "venda sem customer_id: 422 customer_id com a frase de sempre",
    !semCli.ok && semCli.status === 422 && semCli.field === "customer_id"
      && semCli.message === "Escolha o cliente da venda. Quem não quer se identificar entra como Consumidor final.",
    j(semCli),
  );
  const umContato = await db.contact.create({ data: scoped({ name: "Contato da Fazenda" }) });
  const comContato = await V.venderAction(db, owner, corpo({ customer_id: umContato.id }) as Dado);
  check("venda com o id de um Contact: Escolha um cliente ativo.", !comContato.ok && comContato.field === "customer_id" && comContato.message === "Escolha um cliente ativo.", j(comContato));
  const vCf = await V.venderAction(db, owner, corpo({ customer_id: cf.id }) as Dado);
  check("venda com o Consumidor final e dinheiro: ok, customer_name Consumidor final", vCf.ok && vCf.data.customer_id === cf.id && vCf.data.customer_name === "Consumidor final", j(vCf));

  const fCf = await V.venderAction(db, owner, corpo({ customer_id: cf.id }, [{ kind: "fiado", amount: 10 }]) as Dado);
  check("fiado para o Consumidor final: 422 customer_id", !fCf.ok && fCf.status === 422 && fCf.field === "customer_id", j(fCf));
  const chCf = await V.venderAction(
    db,
    owner,
    corpo({ customer_id: cf.id }, [{ kind: "cheque", amount: 10, check: { number: "1", bank: "Banco", good_for: new Date(Date.now() + 86_400_000) } }]) as Dado,
  );
  check("cheque para o Consumidor final: 422 customer_id", !chCf.ok && chCf.status === 422 && chCf.field === "customer_id", j(chCf));

  const migrado = await db.emporioCustomer.create({ data: scoped({ name: "Migrado Só Nome" }) });
  const fMig = await V.venderAction(db, owner, corpo({ customer_id: migrado.id }, [{ kind: "fiado", amount: 10 }]) as Dado);
  check("fiado para o cliente migrado só com nome: ok", fMig.ok, j(fMig));
  const lanc = fMig.ok
    ? await db.financialEntry.findFirst({ where: { related_id: fMig.data.id, entry_type: "income" } })
    : null;
  check("o lançamento tem emporio_customer_id do cliente e contact_id nulo", lanc?.emporio_customer_id === migrado.id && lanc?.contact_id === null, j(lanc));

  const cheque = await V.venderAction(
    db,
    owner,
    corpo({ customer_id: maria.id }, [{ kind: "cheque", amount: 10, check: { number: "77", bank: "Banco X", good_for: new Date(Date.now() + 86_400_000) } }]) as Dado,
  );
  const cheques = await Cx.listarChequesAction(db, owner, { customer_id: maria.id } as Dado);
  check(
    "cheque do cliente: grava customer_id e a lista traz customer_name",
    cheque.ok && cheques.ok && cheques.data.length === 1 && (cheques.data[0] as Dado).customer_id === maria.id && (cheques.data[0] as Dado).customer_name === "Maria Só Telefone",
    j(cheques),
  );

  const fiados = await Cx.listarFiadoAction(db, owner);
  const doMig = fiados.ok ? (fiados.data as Dado[]).find((f) => f.customer_id === migrado.id) : null;
  check("listarFiadoAction traz customer_id e customer_name", doMig?.customer_name === "Migrado Só Nome" && doMig?.owed === 10, j(fiados));
  const rec = await Cx.receberFiadoAction(db, owner, {
    operation_key: `m95c-rec-${stamp}`,
    customer_id: migrado.id,
    establishment_id: L,
    amount: 10,
    kind: "dinheiro",
  } as Dado);
  const depois = await Cx.listarFiadoAction(db, owner);
  check(
    "receberFiadoAction({ customer_id }) quita",
    rec.ok && (rec.data as Dado).customer_id === migrado.id && depois.ok && !(depois.data as Dado[]).some((f) => f.customer_id === migrado.id),
    j([rec, depois]),
  );

  // --- orçamento --------------------------------------------------------------
  const orc = (extra: Record<string, unknown>) => O.salvarOrcamentoAction(db, owner, {
    operation_key: `m95c-orc-${stamp}-${(seq += 1)}`,
    establishment_id: L,
    items: itens,
    ...extra,
  } as Dado);
  const oCf = await orc({ customer_id: cf.id });
  check("orçamento com o Consumidor final: ok", oCf.ok && (oCf.data as Dado).customer?.id === cf.id, j(oCf));
  const soNomeTel = r2.corpo?.data as Dado; // "Cliente do Caixa": PF com nome e telefone, sem CPF
  const oSemCpf = await orc({ customer_id: soNomeTel.id });
  check("orçamento com PF só nome e telefone (sem CPF): ok", oSemCpf.ok && soNomeTel.document === null, j(oSemCpf));
  const oPf = await orc({ customer_id: maria.id });
  check("orçamento com a PF de CPF: ok", oPf.ok, j(oPf));
  const soNomePf = await db.emporioCustomer.create({ data: scoped({ name: "PF Sem Telefone", person_kind: "pf" }) });
  const oSemTel = await orc({ customer_id: soNomePf.id });
  check(
    "orçamento com PF sem telefone: QUOTE_CUSTOMER_INCOMPLETE com a falta",
    !oSemTel.ok && oSemTel.code === "QUOTE_CUSTOMER_INCOMPLETE" && oSemTel.field === "customer_id"
      && oSemTel.message === "Complete o cadastro do cliente antes de salvar o orçamento. Informe o telefone.",
    j(oSemTel),
  );
  const oMig = await orc({ customer_id: migrado.id });
  check(
    "orçamento com o cliente migrado só com nome: a falta do tipo",
    !oMig.ok && oMig.code === "QUOTE_CUSTOMER_INCOMPLETE"
      && oMig.message === "Complete o cadastro do cliente antes de salvar o orçamento. Escolha pessoa física ou jurídica.",
    j(oMig),
  );
  const oSem = await orc({});
  check(
    "orçamento sem customer_id: QUOTE_CUSTOMER_REQUIRED com a frase nova",
    !oSem.ok && oSem.code === "QUOTE_CUSTOMER_REQUIRED" && oSem.field === "customer_id"
      && oSem.message === "Escolha o cliente do orçamento. Quem não quer se identificar entra como Consumidor final.",
    j(oSem),
  );
  const fat = oCf.ok
    ? await V.venderAction(db, owner, corpo({ customer_id: cf.id, quote_id: oCf.data.id }) as Dado)
    : null;
  check("faturar o orçamento do Consumidor final: ok", fat?.ok === true, j(fat));
  const lidoOrc = oPf.ok ? await O.lerOrcamentoAction(db, owner, oPf.data.id) : null;
  check("OrcamentoView.customer traz o nome", lidoOrc?.ok === true && (lidoOrc.data as Dado).customer?.name === "Maria Só Telefone", j(lidoOrc));

  // --- devolução e papel ------------------------------------------------------
  const vMaria = await V.venderAction(db, owner, corpo({ customer_id: maria.id }) as Dado);
  if (!vMaria.ok) throw new Error(`venda da Maria: ${j(vMaria)}`);
  const papel = await I.lerImpressoDaVendaAction(db, owner, vMaria.data.id);
  check(
    "o papel da venda do cliente traz o nome e o documento formatado",
    papel.ok && papel.data.cliente?.nome === "Maria Só Telefone" && papel.data.cliente?.documento === "123.456.789-09",
    j(papel),
  );
  const papelCf = vCf.ok ? await I.lerImpressoDaVendaAction(db, owner, vCf.data.id) : null;
  check("o papel do Consumidor final sai sem cliente", papelCf?.ok === true && papelCf.data.cliente === null, j(papelCf));
  const itemMaria = await db.emporioSaleItem.findFirstOrThrow({ where: { sale_id: vMaria.data.id } });
  const dev = await V.devolverAction(db, owner, vMaria.data.id, {
    operation_key: `m95c-dev-${stamp}`,
    refund_kind: "dinheiro",
    items: [{ sale_item_id: itemMaria.id, quantity: 1 }],
  });
  const despesa = dev.ok ? await db.financialEntry.findFirst({ where: { related_id: dev.data.id, entry_type: "expense" } }) : null;
  check("a devolução grava a despesa com emporio_customer_id da venda", despesa?.emporio_customer_id === maria.id && despesa?.contact_id === null, j([dev, despesa]));

  // --- GET /customers/:id -----------------------------------------------------
  const ler = async (id: string) => {
    const res = await withBearer(tokVend, () =>
      (rotaId as Dado).GET(new Request(`http://localhost/api/v1/emporio/customers/${id}`), { params: Promise.resolve({ id }) }),
    );
    return { status: (res as Response).status, corpo: (await (res as Response).json().catch(() => ({}))) as Dado };
  };
  const proprio = await ler(maria.id);
  check("GET /customers/:id do próprio: 200 com o nome", proprio.status === 200 && proprio.corpo?.data?.name === "Maria Só Telefone", j(proprio));
  const alheio = await ler(deB.id);
  check("GET /customers/:id de outra conta: 404", alheio.status === 404, j(alheio));
}

async function secao4() {
  console.log("\nSeção 4: a lista, a ficha com o histórico de compras e o arquivar");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas, virarGestor } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = await import("@/lib/actions/emporio-vendas");
  const O = await import("@/lib/actions/emporio-orcamentos");
  const Ct = await import("@/lib/actions/contacts");
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: {
        name: `M95d ${rotulo} ${stamp}`,
        document: `M95d${rotulo}${stamp}`.slice(0, 14),
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
        name: `M95d ${suf}`,
        email: `m95d-${suf}-${stamp}@teste.local`,
        password_hash: hash,
        role,
        ...papelDeFixture(role),
      },
    });
    return { id: u.id, role, email: u.email };
  };
  const t = await mkTenant("A");
  const tB = await mkTenant("B");
  const tC = await mkTenant("C");
  const owner = await mk(t.id, "own", "OWNER");
  const vend = await mk(t.id, "vend", "OPERADOR");
  const gestor = await mk(t.id, "gest", "OPERADOR");
  await virarGestor(prisma, gestor.id);
  const ownerB = await mk(tB.id, "ownb", "OWNER");
  const ownerC = await mk(tC.id, "ownc", "OWNER");
  const db = prismaForTenant(t.id) as Dado;
  const dbB = prismaForTenant(tB.id) as Dado;
  const dbC = prismaForTenant(tC.id) as Dado;

  // --- a lista (conta C, controlada) ------------------------------------------
  const cfC = await C.garantirConsumidorFinal(dbC);
  for (const n of ["Joao Silva", "Ana Lista", "Bruno Lista"]) {
    await dbC.emporioCustomer.create({ data: scoped({ name: n, person_kind: "pf", phone: "1" }) });
  }
  await dbC.emporioCustomer.create({ data: scoped({ name: "João da Serra", person_kind: "pf", phone: "1" }) });
  const carlos = await dbC.emporioCustomer.create({ data: scoped({ name: "Carlos Arquivado", person_kind: "pf", phone: "1", archived_at: new Date() }) });
  const lista = await C.listarClientesAction(dbC, ownerC, {});
  const nomes = lista.ok ? lista.data.itens.map((i) => i.name) : [];
  check(
    "a lista traz o Consumidor final primeiro e os outros por nome, sem o arquivado",
    lista.ok && lista.data.itens[0].id === cfC.id && lista.data.itens[0].fixed === true && lista.data.total === 5
      && !nomes.includes("Carlos Arquivado"),
    j(lista),
  );
  check("a ordem dos demais é a de nome", j(nomes.slice(1, 3)) === j(["Ana Lista", "Bruno Lista"]), j(nomes));
  const qJoao = await C.listarClientesAction(dbC, ownerC, { q: "joao" });
  check("q 'joao' acha 'João da Serra' e 'Joao Silva'", qJoao.ok && qJoao.data.total === 2 && qJoao.data.itens.every((i) => /Jo[aã]o/.test(i.name)), j(qJoao));
  const pag = await C.listarClientesAction(dbC, ownerC, { por_pagina: 2 });
  check("por_pagina 2 traz 2 e o total certo", pag.ok && pag.data.itens.length === 2 && pag.data.total === 5 && pag.data.por_pagina === 2 && pag.data.pagina === 1, j(pag));
  const pag3 = await C.listarClientesAction(dbC, ownerC, { por_pagina: 2, pagina: 3 });
  check("a terceira página traz o que sobra", pag3.ok && pag3.data.itens.length === 1, j(pag3));
  const comArq = await C.listarClientesAction(dbC, ownerC, { arquivados: true });
  check("arquivado só aparece com arquivados: true", comArq.ok && comArq.data.itens.some((i) => i.id === carlos.id && i.archived) && comArq.data.total === 6, j(comArq));
  const listaB = await C.listarClientesAction(dbB, ownerB, {});
  check("a lista da conta B não traz cliente da conta C", listaB.ok && listaB.data.itens.length === 0 && listaB.data.total === 0, j(listaB));

  // --- o contrário da separação ------------------------------------------------
  const contato = await dbC.contact.create({ data: scoped({ name: "Ana Contato" }) });
  const comContato = await C.listarClientesAction(dbC, ownerC, { q: "contato" });
  check("um Contact com nome parecido não aparece na lista", comContato.ok && comContato.data.total === 0, j(comContato));
  const lerContato = await C.lerClienteAction(dbC, ownerC, contato.id);
  check("lerClienteAction com o id de um Contact: 404", !lerContato.ok && lerContato.status === 404 && lerContato.message === "Cliente não encontrado.", j(lerContato));
  const todosContatos = await Ct.listContacts(dbC);
  check("e o Contact continua em Contatos", todosContatos.some((c) => c.id === contato.id));

  // --- isolamento --------------------------------------------------------------
  const ana = (lista.ok ? lista.data.itens : []).find((i) => i.name === "Ana Lista");
  if (!ana) throw new Error("Ana Lista");
  const lB = await C.lerClienteAction(dbB, ownerB, ana.id);
  const eB = await C.editarClienteAction(dbB, ownerB, ana.id, { phone: "9" });
  const aB = await C.arquivarClienteAction(dbB, ownerB, ana.id, true);
  check(
    "ler, editar e arquivar o cliente de outra conta: 404",
    [lB, eB, aB].every((r) => !r.ok && r.status === 404 && r.message === "Cliente não encontrado."),
    j([lB, eB, aB]),
  );

  // --- arquivar ----------------------------------------------------------------
  const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M95d Loja 1" });
  const loja2 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M95d Loja 2" });
  if (!loja.ok || !loja2.ok) throw new Error(`lojas: ${j([loja, loja2])}`);
  const L1 = loja.data.id;
  const L2 = loja2.data.id;
  await vincularTodas(prisma, t.id, [vend.id, gestor.id], [L1]);

  const x = await C.cadastrarClienteAction(db, vend, { name: "Xavier Ficha", person_kind: "pf", phone: "3499" });
  if (!x.ok) throw new Error(`x: ${j(x)}`);
  const X = x.data.id;
  const arqVend = await C.arquivarClienteAction(db, vend, X, true);
  check(
    "o Vendedor arquivar: 403 com a frase do gestor",
    !arqVend.ok && arqVend.status === 403 && arqVend.message === "Só o gestor da loja pode arquivar um cliente.",
    j(arqVend),
  );
  const cf = await C.garantirConsumidorFinal(db);
  const arqCf = await C.arquivarClienteAction(db, gestor, cf.id, true);
  check(
    "arquivar o Consumidor final: 422 com a frase fixa",
    !arqCf.ok && arqCf.status === 422 && arqCf.message === "O Consumidor final é fixo e não pode ser editado nem arquivado.",
    j(arqCf),
  );

  // --- as vendas e o orçamento do X --------------------------------------------
  const categoria = await db.productCategory.create({ data: scoped({ name: "M95d categoria" }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M95d Sal ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const lj of [L1, L2]) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: lj, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const im = await Est.implantarEstoqueAction(db, owner, { establishment_id: lj, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
    if (!im.ok) throw new Error(`implantar: ${j(im)}`);
    await abrirTurnoDeTeste(db, owner, lj);
  }
  let seq = 0;
  const item = (quantity: number) => [{ emporio_product_id: prod.data.id, presentation_id: pres.data.id, quantity }];
  const venda = (lj: string, cliente: string, quantity: number, valor: number) =>
    V.venderAction(db, owner, {
      operation_key: `m95d-${stamp}-${(seq += 1)}`,
      establishment_id: lj,
      customer_id: cliente,
      items: item(quantity),
      payments: [{ kind: "dinheiro", amount: valor }],
    } as Dado);

  const v1 = await venda(L1, X, 1, 10);
  await espera(15);
  const v2 = await venda(L1, X, 1, 10);
  await espera(15);
  const v3 = await venda(L1, X, 3, 30);
  if (!v1.ok || !v2.ok || !v3.ok) throw new Error(`vendas: ${j([v1, v2, v3])}`);
  const canc = await V.cancelarVendaAction(db, owner, v2.data.id, { reason: "teste da ficha" });
  if (!canc.ok) throw new Error(`cancelar: ${j(canc)}`);
  const i3 = await db.emporioSaleItem.findFirstOrThrow({ where: { sale_id: v3.data.id } });
  const troca = await V.trocarAction(db, owner, v3.data.id, {
    operation_key: `m95d-troca-${stamp}`,
    items_devolvidos: [{ sale_item_id: i3.id, quantity: 1 }],
    venda: {
      operation_key: `m95d-trocav-${stamp}`,
      establishment_id: L1,
      customer_id: cf.id,
      items: item(2),
      payments: [{ kind: "dinheiro", amount: 10 }],
    },
  } as Dado);
  if (!troca.ok) throw new Error(`troca: ${j(troca)}`);
  await espera(15);
  const v4 = await venda(L2, X, 1, 10);
  if (!v4.ok) throw new Error(`v4: ${j(v4)}`);
  const orc = await O.salvarOrcamentoAction(db, owner, {
    operation_key: `m95d-orc-${stamp}`,
    establishment_id: L1,
    items: item(2),
    customer_id: X,
  } as Dado);
  if (!orc.ok) throw new Error(`orçamento: ${j(orc)}`);

  const ficha = await C.lerClienteAction(db, owner, X);
  if (!ficha.ok) throw new Error(`ficha: ${j(ficha)}`);
  const fv = (id: string) => ficha.data.vendas.find((v) => v.id === id);
  check(
    "a ficha traz o cadastro e as quatro vendas do cliente, a mais nova primeiro",
    ficha.data.name === "Xavier Ficha" && ficha.data.vendas.length === 4 && ficha.data.vendas[0].id === v4.data.id,
    j(ficha.data.vendas.map((v) => v.id)),
  );
  check(
    "situacao: ativa, cancelada, trocada",
    fv(v1.data.id)?.situacao === "ativa" && fv(v2.data.id)?.situacao === "cancelada" && fv(v3.data.id)?.situacao === "trocada",
    j(ficha.data.vendas.map((v) => v.situacao)),
  );
  const f1 = fv(v1.data.id);
  check(
    "a venda traz número, loja, total, formas, vendedor e o item com produto, apresentação, quantidade e total",
    f1?.loja === "M95d Loja 1" && f1.total === 10 && j(f1.formas) === j(["dinheiro"]) && f1.vendedor === "M95d own"
      && f1.itens.length === 1 && f1.itens[0].produto === `M95d Sal ${stamp}` && f1.itens[0].apresentacao === "Quilo"
      && f1.itens[0].quantity === 1 && f1.itens[0].total === 10 && /^\d+$/.test(f1.numero.replace(/\D/g, "")) && f1.numero.length > 0,
    j(f1),
  );
  const sold4 = (await db.emporioSale.findUniqueOrThrow({ where: { id: v4.data.id } })).sold_at.toISOString();
  const sold3 = (await db.emporioSale.findUniqueOrThrow({ where: { id: v3.data.id } })).sold_at.toISOString();
  check(
    "resumo do Dono: total sem a cancelada e menos o devolvido (10 + (30 - 10) + 10), última compra a mais nova, 2 ativas",
    ficha.data.resumo.total_comprado === 40 && ficha.data.resumo.ultima_compra_em === sold4 && ficha.data.resumo.vendas_ativas === 2,
    j(ficha.data.resumo),
  );
  const o = ficha.data.orcamentos[0];
  check(
    "o orçamento com número, loja, valor e situação",
    ficha.data.orcamentos.length === 1 && o.id === orc.data.id && o.loja === "M95d Loja 1" && o.valor === 20 && o.situacao === "aberto",
    j(ficha.data.orcamentos),
  );

  const fichaVend = await C.lerClienteAction(db, vend, X);
  check(
    "o Vendedor da Loja 1 não vê a venda da Loja 2",
    fichaVend.ok && fichaVend.data.vendas.length === 3 && !fichaVend.data.vendas.some((v) => v.id === v4.data.id)
      && fichaVend.data.resumo.total_comprado === 30 && fichaVend.data.resumo.ultima_compra_em === sold3,
    j(fichaVend),
  );

  // O resumo não pode depender do corte da lista: com a lista cortada em 1 venda, ele é o mesmo.
  const cortada = await C.lerFicha(db, owner, X, 1);
  check(
    "ficha com a lista cortada em 1 venda: só 1 listada, resumo igual ao da ficha inteira",
    cortada.ok && cortada.data.vendas.length === 1 && j(cortada.data.resumo) === j(ficha.data.resumo) && cortada.data.resumo.total_comprado === 40,
    j(cortada.ok ? [cortada.data.vendas.length, cortada.data.resumo] : cortada),
  );

  // Devolução parcial, sem troca: situacao "devolvida".
  const y = await C.cadastrarClienteAction(db, vend, { name: "Yara Devolveu", person_kind: "pf", phone: "3498" });
  if (!y.ok) throw new Error(`y: ${j(y)}`);
  const vy = await venda(L1, y.data.id, 2, 20);
  if (!vy.ok) throw new Error(`vy: ${j(vy)}`);
  const iy = await db.emporioSaleItem.findFirstOrThrow({ where: { sale_id: vy.data.id } });
  const devY = await V.devolverAction(db, owner, vy.data.id, {
    operation_key: `m95d-devy-${stamp}`,
    refund_kind: "dinheiro",
    items: [{ sale_item_id: iy.id, quantity: 1 }],
  });
  if (!devY.ok) throw new Error(`devY: ${j(devY)}`);
  const fichaY = await C.lerClienteAction(db, owner, y.data.id);
  check(
    "devolução parcial sem troca: situacao devolvida, total comprado 20 - 10, nenhuma ativa",
    fichaY.ok && fichaY.data.vendas.length === 1 && fichaY.data.vendas[0].situacao === "devolvida"
      && fichaY.data.resumo.total_comprado === 10 && fichaY.data.resumo.vendas_ativas === 0,
    j(fichaY),
  );

  // --- arquivar e desarquivar, com a ficha inteira ----------------------------
  const arq = await C.arquivarClienteAction(db, gestor, X, true);
  check("o Gestor arquiva: ok, archived", arq.ok && arq.data.archived === true, j(arq));
  check("com a linha cliente.arquivar", (await prisma.emporioAuditLog.count({ where: { tenant_id: t.id, action: "cliente.arquivar", target_id: X } })) === 1);
  const fArq = await C.lerClienteAction(db, owner, X);
  check("o arquivado continua com a ficha inteira", fArq.ok && fArq.data.archived === true && fArq.data.vendas.length === 4 && fArq.data.orcamentos.length === 1, j(fArq));
  const vArq = await venda(L1, X, 1, 10);
  check("venda para cliente arquivado: Escolha um cliente ativo.", !vArq.ok && vArq.message === "Escolha um cliente ativo." && vArq.field === "customer_id", j(vArq));
  const desarq = await C.arquivarClienteAction(db, gestor, X, false);
  check("o Gestor desarquiva: ok", desarq.ok && desarq.data.archived === false, j(desarq));
  check("com a linha cliente.desarquivar", (await prisma.emporioAuditLog.count({ where: { tenant_id: t.id, action: "cliente.desarquivar", target_id: X } })) === 1);

  // --- as rotas ----------------------------------------------------------------
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const rotaLista = await import("@/app/api/v1/emporio/customers/route");
  const rotaId = await import("@/app/api/v1/emporio/customers/[id]/route");
  const rotaArq = await import("@/app/api/v1/emporio/customers/[id]/archive/route");
  const token = async (email: string) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  const tokVend = await token(vend.email);
  const tokGestor = await token(gestor.email);
  const rLista = await withBearer(tokVend, () =>
    rotaLista.GET(new Request("http://localhost/api/v1/emporio/customers?per_page=1&q=xavier")),
  );
  const cLista = (await rLista.json()) as Dado;
  check(
    "GET /customers devolve a lista com meta.total",
    rLista.status === 200 && cLista.data?.length === 1 && cLista.data[0].name === "Xavier Ficha" && cLista.meta?.total === 1 && cLista.meta?.per_page === 1 && cLista.meta?.page === 1,
    j(cLista),
  );
  const rFicha = await withBearer(tokVend, () =>
    rotaId.GET(new Request(`http://localhost/api/v1/emporio/customers/${X}`), { params: Promise.resolve({ id: X }) }),
  );
  const cFicha = (await rFicha.json()) as Dado;
  check("GET /customers/:id devolve a ficha (cadastro, resumo, vendas, orcamentos)", rFicha.status === 200 && cFicha.data?.name === "Xavier Ficha" && cFicha.data?.vendas?.length === 3 && cFicha.data?.resumo?.total_comprado === 30 && cFicha.data?.orcamentos?.length === 1, j(cFicha));
  const patch = (tok: string, corpo: unknown) =>
    withBearer(tok, () =>
      rotaArq.PATCH(
        new Request(`http://localhost/api/v1/emporio/customers/${X}/archive`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(corpo),
        }),
        { params: Promise.resolve({ id: X }) },
      ),
    );
  const pVend = await patch(tokVend, { archived: true });
  check("PATCH /archive pelo Vendedor: 403", pVend.status === 403, String(pVend.status));
  const pGest = await patch(tokGestor, { archived: true });
  const cGest = (await pGest.json()) as Dado;
  check("PATCH /archive pelo Gestor: 200 archived", pGest.status === 200 && cGest.data?.archived === true, j(cGest));
  const pMal = await patch(tokGestor, { archived: "sim" });
  check("PATCH /archive com corpo inválido: 422", pMal.status === 422, String(pMal.status));
  await patch(tokGestor, { archived: false });
}

async function limpar() {
  if (tenantIds.length === 0) return;
  const { prisma } = await import("@/lib/prisma");
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
  console.log(falhas === 0 ? "\n✅ M95 verde" : `\n❌ M95: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
