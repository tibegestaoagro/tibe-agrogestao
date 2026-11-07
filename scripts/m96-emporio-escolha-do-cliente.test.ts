import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M96: Módulo 39 (Meu Empório), Frente 2: a escolha do cliente e do fornecedor.
 * Roda: `npm run test:m96`
 *
 * Seção 1: a regra pura do termo de busca e do telefone (sem banco).
 * Seção 2: a coluna gerada phone_busca e a função telefone_local (com banco).
 * Seção 3: a busca de clientes (action, rota e a tela Clientes).
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

console.log("🧾 M96: Módulo 39 (Meu Empório), Frente 2: a escolha do cliente e do fornecedor\n");

const tenantIds: string[] = [];

async function secao1() {
  console.log("Seção 1: a regra pura do termo e do telefone (sem banco)");
  const T = await import("@/lib/emporio/telefone");
  const B = await import("@/lib/emporio/busca-de-cadastro");

  const local = (x: string | null) => j(T.telefoneLocal(x));
  for (const x of ["+55 (34) 99876-1234", "5534998761234", "034 99876-1234", "34998761234", "998761234", "(55) 99876-1234", "5555998761234"]) {
    check(`telefoneLocal(${x})`, local(x) === j("998761234"), local(x));
  }
  check("telefoneLocal fixo com DDD", local("34 3333-5678") === j("33335678"), local("34 3333-5678"));
  check("telefoneLocal fixo com DDI", local("553433335678") === j("33335678"), local("553433335678"));
  check("telefoneLocal com código de operadora fica com todos os dígitos sem o zero", local("0 15 34 99876 1234") === j("1534998761234"), local("0 15 34 99876 1234"));
  check("telefoneLocal com 12 dígitos que não começam com 55 fica com todos", local("123456789012") === j("123456789012"), local("123456789012"));
  check("telefoneLocal de zeros dá null", local("000") === "null", local("000"));
  check("telefoneLocal vazio", local("") === "null");
  check("telefoneLocal sem dígito", local("abc") === "null");
  check("telefoneLocal nulo", T.telefoneLocal(null) === null);
  check("telefoneLocal indefinido", T.telefoneLocal(undefined) === null);

  check("formatarTelefone com DDI e máscara", T.formatarTelefone("+55 (34) 99876-1234") === "(34) 99876-1234", T.formatarTelefone("+55 (34) 99876-1234"));
  check("formatarTelefone fixo", T.formatarTelefone("3433335678") === "(34) 3333-5678", T.formatarTelefone("3433335678"));
  check("formatarTelefone sem DDD", T.formatarTelefone("998761234") === "99876-1234", T.formatarTelefone("998761234"));
  check("formatarTelefone fixo sem DDD", T.formatarTelefone("33335678") === "3333-5678", T.formatarTelefone("33335678"));
  check("formatarTelefone texto sem dígito sai como veio", T.formatarTelefone("ramal 12") === "ramal 12", T.formatarTelefone("ramal 12"));
  check("formatarTelefone nulo", T.formatarTelefone(null) === "sem telefone", T.formatarTelefone(null));

  const termo = (q: string | null) => j(B.lerTermo(q));
  check("lerTermo só espaço: vazio", termo("  ") === j({ modo: "vazio" }), termo("  "));
  check("lerTermo só pontuação: vazio", termo("...") === j({ modo: "vazio" }), termo("..."));
  check("lerTermo nulo: vazio", termo(null) === j({ modo: "vazio" }));
  check("lerTermo 12: poucos dígitos", termo("12") === j({ modo: "poucos_digitos" }), termo("12"));
  check("lerTermo (3: poucos dígitos", termo("(3") === j({ modo: "poucos_digitos" }), termo("(3"));
  check("lerTermo 1234", termo("1234") === j({ modo: "digitos", digitos: "1234", telefone: "1234" }), termo("1234"));
  const comDdi = B.lerTermo("+55 34 99876-1234");
  check(
    "lerTermo com +55: dígitos inteiros e telefone local",
    comDdi.modo === "digitos" && comDdi.digitos === "5534998761234" && comDdi.telefone === "998761234",
    j(comDdi),
  );
  const cpf = B.lerTermo("529.982");
  check("lerTermo CPF com máscara", cpf.modo === "digitos" && cpf.digitos === "529982", j(cpf));
  check("lerTermo nome com acento e espaço duplo", termo("Zé  da Ponte") === j({ modo: "nome", nome: "ze da ponte", documento: null }), termo("Zé  da Ponte"));
  check("lerTermo letra e dígito sem espaço: também documento", termo("12AB34") === j({ modo: "nome", nome: "12ab34", documento: "12AB34" }), termo("12AB34"));
  check("lerTermo com espaço não é documento", termo("Maria 12") === j({ modo: "nome", nome: "maria 12", documento: null }), termo("Maria 12"));

  check("ondeBuscaCliente vazio é {}", j(B.ondeBuscaCliente({ modo: "vazio" })) === "{}", j(B.ondeBuscaCliente({ modo: "vazio" })));
  const dig = B.ondeBuscaCliente(B.lerTermo("34998761234")) as Dado;
  check(
    "ondeBuscaCliente digitos: OR de document e phone_busca",
    Array.isArray(dig.OR) && dig.OR.length === 2 && j(dig.OR[0]) === j({ document: { contains: "34998761234" } }) && j(dig.OR[1]) === j({ phone_busca: { contains: "998761234" } }),
    j(dig),
  );
  const curto = B.ondeBuscaCliente(B.lerTermo("1234")) as Dado;
  check("ondeBuscaCliente com menos de 10 dígitos usa os dígitos no telefone", j(curto.OR?.[1]) === j({ phone_busca: { contains: "1234" } }), j(curto));
  const nome = B.ondeBuscaCliente(B.lerTermo("Zé")) as Dado;
  check("ondeBuscaCliente nome: name_busca contains", j(nome) === j({ name_busca: { contains: "ze" } }), j(nome));
  const misto = B.ondeBuscaCliente(B.lerTermo("12AB34")) as Dado;
  check(
    "ondeBuscaCliente letra e dígito: nome ou documento",
    Array.isArray(misto.OR) && j(misto.OR[0]) === j({ name_busca: { contains: "12ab34" } }) && j(misto.OR[1]) === j({ document: { contains: "12AB34" } }),
    j(misto),
  );
  const curinga = B.ondeBuscaFornecedor(B.lerTermo("_é")) as Dado;
  check("ondeBusca escapa o _ do termo (o fornecedor herda)", j(curinga) === j({ name_busca: { contains: "\\_e" } }), j(curinga));
  const forn = B.ondeBuscaFornecedor(B.lerTermo("Zé")) as Dado;
  check("ondeBuscaFornecedor nome: name_busca contains", j(forn) === j({ name_busca: { contains: "ze" } }), j(forn));
  check("ondeBuscaFornecedor vazio é {}", j(B.ondeBuscaFornecedor({ modo: "vazio" })) === "{}");
}

const TELEFONES_DA_PARIDADE = [
  "+55 (34) 99876-1234", "5534998761234", "034 99876-1234", "34998761234", "998761234", "(55) 99876-1234", "5555998761234",
  "34 3333-5678", "553433335678", "0 15 34 99876 1234", "123456789012", "000", "", "abc",
];

async function secao2() {
  console.log("\nSeção 2: a coluna gerada phone_busca (com banco)");
  const { prisma } = await import("@/lib/prisma");
  const T = await import("@/lib/emporio/telefone");

  for (const x of TELEFONES_DA_PARIDADE) {
    const r = await prisma.$queryRaw<{ v: string | null }[]>`SELECT telefone_local(${x}) AS v`;
    check(`paridade SQL e TS para "${x}"`, j(r[0]?.v ?? null) === j(T.telefoneLocal(x)), `sql=${j(r[0]?.v)} ts=${j(T.telefoneLocal(x))}`);
  }

  const stamp = Date.now().toString(36);
  const t = await prisma.tenant.create({
    data: { name: `M96 ${stamp}`, document: `M96${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
  });
  tenantIds.push(t.id);

  const lerCliente = async (id: string) => (await prisma.emporioCustomer.findUniqueOrThrow({ where: { id } })).phone_busca;
  const c = await prisma.emporioCustomer.create({ data: { tenant_id: t.id, name: "M96 Cliente", phone: "+55 (34) 99876-1234" } });
  check("cliente: phone_busca do telefone com DDI", (await lerCliente(c.id)) === "998761234", String(await lerCliente(c.id)));
  await prisma.emporioCustomer.update({ where: { id: c.id }, data: { phone: "34 3333-5678" } });
  check("cliente: phone_busca acompanha a edição", (await lerCliente(c.id)) === "33335678", String(await lerCliente(c.id)));
  await prisma.emporioCustomer.update({ where: { id: c.id }, data: { phone: null } });
  check("cliente: telefone nulo, phone_busca nulo", (await lerCliente(c.id)) === null, String(await lerCliente(c.id)));

  const lerFornecedor = async (id: string) => (await prisma.emporioSupplier.findUniqueOrThrow({ where: { id } })).phone_busca;
  const f = await prisma.emporioSupplier.create({ data: { tenant_id: t.id, kind: "externo", name: "M96 Fornecedor", phone: "+55 (34) 99876-1234" } });
  check("fornecedor: phone_busca do telefone com DDI", (await lerFornecedor(f.id)) === "998761234", String(await lerFornecedor(f.id)));
  await prisma.emporioSupplier.update({ where: { id: f.id }, data: { phone: "34 3333-5678" } });
  check("fornecedor: phone_busca acompanha a edição", (await lerFornecedor(f.id)) === "33335678", String(await lerFornecedor(f.id)));
  await prisma.emporioSupplier.update({ where: { id: f.id }, data: { phone: null } });
  check("fornecedor: telefone nulo, phone_busca nulo", (await lerFornecedor(f.id)) === null, String(await lerFornecedor(f.id)));
}

async function secao3() {
  console.log("\nSeção 3: a busca de clientes (action, rota e a tela Clientes)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { prisma, prismaForTenant } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const bcrypt = (await import("bcryptjs")).default;
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const stamp = Date.now().toString(36);

  const mkTenant = async (rotulo: string) => {
    const t = await prisma.tenant.create({
      data: { name: `M96c ${rotulo} ${stamp}`, document: `M96c${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
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
      data: { tenant_id: tenantId, name: `M96c ${suf}`, email: `m96c-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk(t.id, "own", "OWNER");
  const vend = await mk(t.id, "vend", "OPERADOR");
  const caixa = await mk(t.id, "caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const semPapel = await mk(t.id, "sem", "OPERADOR", { emporio_role: null, emporio_keys: [] });
  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M96c Loja 1" });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: "M96c Loja 2" });
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j(l1)} ${j(l2)}`);
  await vincularTodas(prisma, t.id, [vend.id, caixa.id], [l1.data.id]);

  const novo = (tenant: string, name: string, extra: Dado = {}) => prisma.emporioCustomer.create({ data: { tenant_id: tenant, name, ...extra } });
  const cf = await novo(t.id, "Consumidor final", { system_key: "consumidor_final" });
  const souza = await novo(t.id, "Maria Souza", { person_kind: "pf", phone: "+55 (34) 99876-1234", document: "52998224725" });
  const sousa = await novo(t.id, "Maria Sousa", { person_kind: "pf", phone: "34 3333-5678" });
  const joao = await novo(t.id, "João da Ponte", { person_kind: "pf", phone: "998761111" });
  const ze = await novo(t.id, "Zé Carlos", { person_kind: "pf", phone: "(55) 99123-4567" });
  const pj = await novo(t.id, "Agro Alfa Ltda", { person_kind: "pj", document: "12ABC34501DE35", phone: "34 3000-1111" });
  const migrado = await novo(t.id, "Cliente Migrado");
  const arq = await novo(t.id, "Maria Arquivada", { person_kind: "pf", phone: "34 97777-0000", archived_at: new Date() });
  const deB = await novo(tB.id, "Maria de Outra Conta", { person_kind: "pf", phone: "+55 (34) 99876-1234" });

  const nomes = (r: Dado) => (r?.ok ? r.data.itens.map((i: Dado) => i.name) : ["ERRO " + j(r)]);
  const busca = (ator: Dado, f: Dado) => C.buscarClientesAction(db, ator, f) as Promise<Dado>;
  const acha = async (q: string, nome: string, ator: Dado = owner) => {
    const r = await busca(ator, { q });
    check(`q "${q}" acha ${nome}`, nomes(r).includes(nome), j(nomes(r)));
  };

  const rMaria = await busca(owner, { q: "maria" });
  check("q maria: as duas Marias de A, por nome, sem arquivada, sem CF, sem a de B", j(nomes(rMaria)) === j(["Maria Sousa", "Maria Souza"]), j(nomes(rMaria)));
  await acha("joao", "João da Ponte");
  await acha("PONTE", "João da Ponte");
  await acha("1234", "Maria Souza");
  await acha("9987", "Maria Souza");
  await acha("8761", "Maria Souza");
  await acha("3333", "Maria Sousa");
  check("q 553 não acha a Maria Souza (o 55 é DDI)", !nomes(await busca(owner, { q: "553" })).includes("Maria Souza"), j(nomes(await busca(owner, { q: "553" }))));
  await acha("9912", "Zé Carlos");
  await acha("34998761234", "Maria Souza");
  await acha("+55 34 99876-1234", "Maria Souza");
  await acha("99876-1234", "Maria Souza");
  await acha("(34) 9987", "Maria Souza");
  await acha("529.982", "Maria Souza");
  await acha("247", "Maria Souza");
  await acha("ABC345", "Agro Alfa Ltda");

  const curto = await busca(owner, { q: "12" });
  check("q 12: itens vazio e poucos_digitos", curto.ok && curto.data.itens.length === 0 && curto.data.poucos_digitos === true, j(curto));
  const normal = await busca(owner, { q: "maria" });
  check("busca normal: poucos_digitos false", normal.ok && normal.data.poucos_digitos === false);

  // Curinga (Review Focus 5)
  check("q _é: nada (o _ não é curinga)", nomes(await busca(owner, { q: "_é" })).length === 0, j(nomes(await busca(owner, { q: "_é" }))));
  check("q a%: nada (o % não é curinga)", nomes(await busca(owner, { q: "a%" })).length === 0, j(nomes(await busca(owner, { q: "a%" }))));
  const pontos = await busca(owner, { q: "..." });
  check("q ...: sem filtro de texto", pontos.ok && pontos.data.total === 6, j(pontos.data?.total));

  // Paginação
  const p1 = await busca(owner, { q: "", por_pagina: 2 });
  check("por_pagina 2: 2 itens, total 6 (sem CF, arquivado e B), pagina 1", p1.ok && p1.data.itens.length === 2 && p1.data.total === 6 && p1.data.pagina === 1 && p1.data.por_pagina === 2, j(p1));
  const p2 = await busca(owner, { q: "", por_pagina: 2, pagina: 2 });
  check("pagina 2 traz os seguintes", p2.ok && p2.data.itens.length === 2 && p2.data.itens[0].id !== p1.data.itens[0].id && p2.data.itens[0].id !== p1.data.itens[1].id, j(nomes(p2)));
  const p500 = await busca(owner, { q: "", por_pagina: 500 });
  check("por_pagina 500 vira 50", p500.ok && p500.data.por_pagina === 50);
  const pPadrao = await busca(owner, { q: "" });
  check("por_pagina padrão 20", pPadrao.ok && pPadrao.data.por_pagina === 20);

  // Busca por id
  const idCf = await busca(owner, { id: cf.id });
  check("id do Consumidor final: 1 item com fixed", idCf.ok && idCf.data.itens.length === 1 && idCf.data.itens[0].fixed === true && idCf.data.itens[0].system_key === "consumidor_final", j(idCf));
  check("id de cliente de B: 0 itens", (await busca(owner, { id: deB.id })).data?.itens.length === 0);
  check("id do arquivado: 0 itens", (await busca(owner, { id: arq.id })).data?.itens.length === 0);

  // Última compra
  const dia = (d: number) => new Date(Date.now() - d * 86_400_000);
  const venda = (n: number, cliente: string, loja: string, quando: Date, valor: number, status: "concluida" | "cancelada") =>
    prisma.emporioSale.create({
      data: { tenant_id: t.id, establishment_id: loja, operation_key: `m96-${stamp}-${n}`, number: n, customer_id: cliente, sold_at: quando, net_amount: valor, status },
    });
  await venda(1, souza.id, l1.data.id, dia(10), 50, "concluida");
  await venda(2, souza.id, l1.data.id, dia(5), 999, "cancelada");
  const maisNova = await venda(3, souza.id, l2.data.id, dia(1), 80, "concluida");
  const rDono = await busca(owner, { q: "Souza" });
  const uDono = rDono.data?.itens[0]?.ultima_compra;
  check("Dono vê a última compra de R$ 80 da loja 2", uDono?.valor === 80 && uDono?.em === maisNova.sold_at.toISOString(), j(uDono));
  const rVend = await busca(vend, { q: "Souza" });
  check("Vendedor da loja 1 vê a de R$ 50", rVend.data?.itens[0]?.ultima_compra?.valor === 50, j(rVend.data?.itens[0]?.ultima_compra));
  const rJoao = await busca(owner, { q: "joao" });
  check("cliente sem venda: ultima_compra nula", rJoao.data?.itens[0]?.ultima_compra === null, j(rJoao.data?.itens[0]));
  const rVarios = await busca(owner, { q: "maria" });
  check("a última compra de cada um na mesma página", rVarios.data?.itens[0]?.ultima_compra === null && rVarios.data?.itens[1]?.ultima_compra?.valor === 80, j(rVarios.data?.itens.map((i: Dado) => i.ultima_compra)));

  // Campos do item
  const rMig = await busca(owner, { q: "migrado" });
  const im = rMig.data?.itens[0];
  check("cliente migrado: incomplete true", im?.incomplete === true, j(im));
  const ie = (await busca(owner, { q: "Souza" })).data?.itens[0];
  check("o item traz os campos de endereço e fixed", ie && "address_zip" in ie && "delivery_state" in ie && "city" in ie && ie.fixed === false && "system_key" in ie, j(ie));

  // Permissão
  const rSem = await busca(semPapel, { q: "maria" });
  check("quem não tem papel no Empório: 403", !rSem.ok && rSem.status === 403, j(rSem));
  const rCaixa = await busca(caixa, { q: "maria" });
  check("o Caixa busca: ok", rCaixa.ok === true, j(rCaixa));

  // A tela Clientes busca igual
  const lista = (await C.listarClientesAction(db, owner, { q: "1234" })) as Dado;
  check("listarClientesAction q 1234 acha a Maria Souza", lista.ok && lista.data.itens.some((i: Dado) => i.name === "Maria Souza"), j(lista));
  const listaCurta = (await C.listarClientesAction(db, owner, { q: "12" })) as Dado;
  check("listarClientesAction q 12: poucos_digitos", listaCurta.ok && listaCurta.data.poucos_digitos === true && listaCurta.data.itens.length === 0, j(listaCurta));
  const listaNome = (await C.listarClientesAction(db, owner, { q: "maria" })) as Dado;
  check("listarClientesAction q maria: poucos_digitos false", listaNome.ok && listaNome.data.poucos_digitos === false);

  // A rota
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const rotaBusca = await import("@/app/api/v1/emporio/customers/search/route");
  const rotaLista = await import("@/app/api/v1/emporio/customers/route");
  const token = async (email: string) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  const get = async (tok: string, mod: Dado, caminho: string) => {
    const res: Response = await withBearer(tok, () => mod.GET(new Request(`http://localhost${caminho}`)));
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  };
  const tokOwner = await token(owner.email);
  const rr = await get(tokOwner, rotaBusca, "/api/v1/emporio/customers/search?q=12");
  check("rota: q 12 devolve meta.poucos_digitos true", rr.status === 200 && rr.corpo.meta?.poucos_digitos === true && rr.corpo.data.length === 0, j(rr));
  const rr2 = await get(tokOwner, rotaBusca, "/api/v1/emporio/customers/search?q=maria&per_page=1&page=2");
  check("rota: meta com total, page, per_page", rr2.status === 200 && rr2.corpo.meta?.total === 2 && rr2.corpo.meta?.page === 2 && rr2.corpo.meta?.per_page === 1 && rr2.corpo.data[0]?.name === "Maria Souza", j(rr2));
  const rr3 = await get(tokOwner, rotaBusca, "/api/v1/emporio/customers/search?q=maria&per_page=abc&page=-3");
  check("rota: parâmetros inválidos viram o padrão", rr3.status === 200 && rr3.corpo.meta?.page === 1 && rr3.corpo.meta?.per_page === 20, j(rr3));
  const rr4 = await get(tokOwner, rotaBusca, `/api/v1/emporio/customers/search?id=${cf.id}`);
  check("rota: por id devolve o Consumidor final", rr4.status === 200 && rr4.corpo.data[0]?.fixed === true, j(rr4));
  const rr5 = await get(await token(semPapel.email), rotaBusca, "/api/v1/emporio/customers/search?q=maria");
  check("rota: quem não tem papel não busca", rr5.status === 403 || rr5.status === 404, String(rr5.status));
  const rr6 = await get(tokOwner, rotaLista, "/api/v1/emporio/customers?q=12");
  check("rota da lista: meta.poucos_digitos true", rr6.status === 200 && rr6.corpo.meta?.poucos_digitos === true, j(rr6));
  void ze; void sousa; void joao; void pj;
}

async function comBanco(fn: () => Promise<void>) {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await fn();
}
void comBanco;

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
    await secao2();
    await secao3();
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M96 verde" : `\n❌ M96: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
