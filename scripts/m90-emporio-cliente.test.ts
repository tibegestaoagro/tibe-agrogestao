import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório): cadastro do cliente (PF/PJ), nome do produto e menu.
 * Roda: `npm run test:m90`
 *
 * Seção 1: conferência pura do cadastro (`src/lib/contatos/cadastro.ts`), sem banco.
 * As seções 2 em diante (com banco) entram nas Tarefas 3 a 5 e 7, dentro de `comBanco()`.
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

console.log("📇 M90: Módulo 39 (Meu Empório), cadastro do cliente\n");

async function secao1() {
  console.log("Seção 1: conferência pura do cadastro");
  const m = await import("@/lib/contatos/cadastro");
  const { conferirCadastro, cpfValido, cnpjValido, cadastroIncompleto } = m;

  check("CPF válido", cpfValido("52998224725") === true);
  check("CPF com dígitos iguais é inválido", cpfValido("11111111111") === false);
  check("CPF com dígito errado", cpfValido("52998224724") === false);
  check("CNPJ válido", cnpjValido("11222333000181") === true);
  check("CNPJ com dígito errado", cnpjValido("11222333000180") === false);
  // CNPJ alfanumérico da Receita (IN RFB 2.229/2024): 12 posições de letra ou número,
  // e os dois dígitos verificadores continuam números. Exemplo da própria Receita.
  check("CNPJ alfanumérico válido", cnpjValido("12ABC34501DE35") === true);
  check("CNPJ alfanumérico com dígito errado", cnpjValido("12ABC34501DE34") === false);
  check("CNPJ com letra no dígito verificador", cnpjValido("12ABC34501DE3A") === false);
  check("CNPJ minúsculo não passa cru", cnpjValido("12abc34501de35") === false);
  const alfa = conferirCadastro({ name: "Empresa Nova", person_kind: "pj", document: "12.abc.345/01de-35", phone: "3499" }, "balcao");
  check("balcão PJ alfanumérico ok, em maiúscula", alfa.ok && alfa.dados.document === "12ABC34501DE35", j(alfa));
  const alfaPf = conferirCadastro({ person_kind: "pf", document: "529.982.24A-25" }, "livre");
  check("CPF continua só números", !alfaPf.ok && alfaPf.field === "document", j(alfaPf));

  const pf = { name: "Zé", person_kind: "pf" as const, document: "529.982.247-25", phone: "34 99999-0000" };
  const r1 = conferirCadastro(pf, "balcao");
  check("balcão PF completo ok", r1.ok, j(r1));
  check("documento normalizado", r1.ok && r1.dados.document === "52998224725", j(r1));

  const r2 = conferirCadastro({ ...pf, document: null }, "balcao");
  check("balcão PF sem CPF", !r2.ok && r2.field === "document" && r2.message === "Informe o CPF.", j(r2));

  const r3 = conferirCadastro({ person_kind: "pj", document: "11.222.333/0001-81", phone: "3499" }, "balcao");
  check("balcão PJ sem nome", !r3.ok && r3.field === "name" && r3.message === "Informe o nome da empresa.", j(r3));

  const r4 = conferirCadastro({ ...pf, person_kind: null }, "balcao");
  check(
    "balcão sem tipo",
    !r4.ok && r4.field === "person_kind" && r4.message === "Escolha pessoa física ou jurídica.",
    j(r4),
  );

  const r5 = conferirCadastro({ ...pf, phone: "" }, "balcao");
  check("balcão sem telefone", !r5.ok && r5.field === "phone" && r5.message === "Informe o telefone.", j(r5));

  const r6 = conferirCadastro({ name: "Frigorífico X" }, "livre");
  check("livre só com nome ok", r6.ok, j(r6));
  check("livre: ausente continua ausente", r6.ok && !("document" in r6.dados), j(r6));

  const r7 = conferirCadastro({ name: "X", document: "52998224725" }, "livre");
  check(
    "livre com documento sem tipo",
    !r7.ok &&
      r7.field === "person_kind" &&
      r7.message === "Escolha pessoa física ou jurídica para informar o documento.",
    j(r7),
  );

  const ie = (v: string) => conferirCadastro({ state_registration: v }, "livre");
  const ie1 = ie("123.456.789.012");
  check("inscrição de 12 dígitos", ie1.ok && ie1.dados.state_registration === "123456789012", j(ie1));
  const ie2 = ie("0623079040081");
  check("inscrição de 13 dígitos", ie2.ok, j(ie2));
  const ie3 = ie("isento");
  check("isento vira ISENTO", ie3.ok && ie3.dados.state_registration === "ISENTO", j(ie3));
  const ie4 = ie("1234567");
  check(
    "inscrição curta recusa",
    !ie4.ok &&
      ie4.field === "state_registration" &&
      ie4.message === "Inscrição estadual: use só números (de 8 a 14) ou ISENTO.",
    j(ie4),
  );

  const cep1 = conferirCadastro({ address_zip: "38400-000" }, "livre");
  check("CEP normalizado", cep1.ok && cep1.dados.address_zip === "38400000", j(cep1));
  const cep2 = conferirCadastro({ address_zip: "3840" }, "livre");
  check(
    "CEP curto recusa",
    !cep2.ok && cep2.field === "address_zip" && cep2.message === "CEP inválido. Use os 8 números.",
    j(cep2),
  );
  const cep3 = conferirCadastro({ delivery_zip: "12" }, "livre");
  check("CEP de entrega recusa em delivery_zip", !cep3.ok && cep3.field === "delivery_zip", j(cep3));

  const uf1 = conferirCadastro({ address_state: "mg" }, "livre");
  check("UF em maiúscula", uf1.ok && uf1.dados.address_state === "MG", j(uf1));
  const uf2 = conferirCadastro({ delivery_state: "XX" }, "livre");
  check(
    "UF inválida recusa",
    !uf2.ok && uf2.field === "delivery_state" && uf2.message === "Escolha a UF da lista.",
    j(uf2),
  );
  check("27 UFs", m.UFS.length === 27);

  const pj = conferirCadastro(
    { name: "Empresa", person_kind: "pj", document: "11222333000181", birth_date: "1990-01-01", responsible_name: "Ana" },
    "livre",
  );
  check("PJ: nascimento vira null", pj.ok && pj.dados.birth_date === null && pj.dados.responsible_name === "Ana", j(pj));
  const pf2 = conferirCadastro(
    { name: "Zé", person_kind: "pf", document: "52998224725", birth_date: "1990-01-01", responsible_name: "Ana" },
    "livre",
  );
  check("PF: responsável vira null", pf2.ok && pf2.dados.responsible_name === null && pf2.dados.birth_date === "1990-01-01", j(pf2));

  const cpfRuim = conferirCadastro({ person_kind: "pf", document: "111.111.111-11" }, "livre");
  check(
    "CPF repetido recusa",
    !cpfRuim.ok && cpfRuim.field === "document" && cpfRuim.message === "CPF inválido. Confira os 11 números.",
    j(cpfRuim),
  );
  const cnpjRuim = conferirCadastro({ person_kind: "pj", document: "11222333000180" }, "livre");
  check(
    "CNPJ ruim recusa",
    !cnpjRuim.ok && cnpjRuim.message === "CNPJ inválido. Confira os 14 caracteres.",
    j(cnpjRuim),
  );

  const amanha = new Date(Date.now() + 86_400_000 * 2).toISOString().slice(0, 10);
  const fut = conferirCadastro({ person_kind: "pf", birth_date: amanha }, "livre");
  check(
    "nascimento no futuro recusa",
    !fut.ok && fut.field === "birth_date" && fut.message === "A data de nascimento não pode ser no futuro.",
    j(fut),
  );
  const ruim = conferirCadastro({ person_kind: "pf", birth_date: "31/02/2000" }, "livre");
  check("data inválida recusa em birth_date", !ruim.ok && ruim.field === "birth_date", j(ruim));
  const nula = conferirCadastro({ person_kind: "pf", birth_date: "2000-02-30" }, "livre");
  check("dia inexistente recusa", !nula.ok && nula.field === "birth_date", j(nula));

  const completo = { name: "Zé", person_kind: "pf", document: "52998224725", phone: "3499", system_key: null };
  check("incompleto: completo = false", cadastroIncompleto(completo) === false);
  check("incompleto: sem tipo", cadastroIncompleto({ ...completo, person_kind: null }) === true);
  check("incompleto: sem documento", cadastroIncompleto({ ...completo, document: null }) === true);
  check("incompleto: sem telefone", cadastroIncompleto({ ...completo, phone: null }) === true);
  check(
    "incompleto: system_key nunca",
    cadastroIncompleto({ name: "Consumidor final", person_kind: null, document: null, phone: null, system_key: "consumidor_final" }) === false,
  );

  check("formatarDocumento CPF", m.formatarDocumento("52998224725") === "529.982.247-25");
  check("formatarDocumento CNPJ", m.formatarDocumento("11222333000181") === "11.222.333/0001-81");
  check("formatarDocumento CNPJ alfanumérico", m.formatarDocumento("12ABC34501DE35") === "12.ABC.345/01DE-35");
  check("formatarDocumento null", m.formatarDocumento(null) === "");
  const { mascararDocumento } = await import("@/components/contatos/campos-do-cadastro");
  check("máscara CNPJ alfanumérico", mascararDocumento("12abc34501de35", "pj") === "12.ABC.345/01DE-35");
  check("máscara CNPJ numérico", mascararDocumento("11222333000181", "pj") === "11.222.333/0001-81");
  check("máscara CNPJ pela metade", mascararDocumento("12ab", "pj") === "12.AB");
  check("máscara CPF", mascararDocumento("52998224725", "pf") === "529.982.247-25");
  check("formatarCep", m.formatarCep("38400000") === "38400-000");
  check("CONSUMIDOR_FINAL", m.CONSUMIDOR_FINAL.system_key === "consumidor_final" && m.CONSUMIDOR_FINAL.name === "Consumidor final");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;

async function secao2() {
  console.log("\nSeção 2: Contatos aceita os campos novos (com banco)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const A = await import("@/lib/actions/contacts");
  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const novoTenant = async (nome: string) => {
      const t = await prisma.tenant.create({
        data: {
          name: `M90 ${nome} ${stamp}`,
          document: `M90${nome}${stamp}`.slice(0, 14),
          plan: "grupo",
          status: "trial",
          trial_ends_at: new Date(Date.now() + 86_400_000),
        },
      });
      tenantIds.push(t.id);
      return t;
    };
    const t = await novoTenant("A");
    const tB = await novoTenant("B");
    const db = prismaForTenant(t.id);
    const dbB = prismaForTenant(tB.id);

    const c1 = await A.createContact(db, { name: "Só Nome" });
    check("createContact só com nome: ok e incompleto", c1.ok && c1.data.incomplete === true, j(c1));

    const pf = await A.createContact(db, { name: "Zé CPF", person_kind: "pf", document: "529.982.247-25", phone: "3499" });
    check("PF com CPF válido grava só dígitos", pf.ok && pf.data.document === "52998224725" && pf.data.incomplete === false, j(pf));

    const ruim = await A.createContact(db, { name: "Ruim", person_kind: "pf", document: "52998224724" });
    check("CPF inválido: 422 document", !ruim.ok && ruim.status === 422 && ruim.field === "document", j(ruim));

    const dup = await A.createContact(db, { name: "Outro", person_kind: "pf", document: "52998224725" });
    check(
      "mesmo CPF: 409 DUPLICATE_DOCUMENT com nome do primeiro",
      !dup.ok && dup.code === "DUPLICATE_DOCUMENT" && dup.status === 409 && dup.field === "document" &&
        dup.message === "Já existe um contato com esse CPF: Zé CPF.",
      j(dup),
    );

    if (!pf.ok) throw new Error("pf não criou");
    const arq = await A.setContactArchived(db, pf.data.id, true);
    check("arquivar contato comum ok", arq.ok, j(arq));
    const dup2 = await A.createContact(db, { name: "Outro", person_kind: "pf", document: "52998224725" });
    check(
      "arquivado: mensagem traz o trecho do arquivado",
      !dup2.ok && dup2.message.includes("Zé CPF.") && dup2.message.includes(" Ele está arquivado: desarquive em Contatos."),
      j(dup2),
    );
    await A.setContactArchived(db, pf.data.id, false);

    const outro = await A.createContact(dbB, { name: "Zé B", person_kind: "pf", document: "52998224725" });
    check("mesmo CPF em outro tenant: ok", outro.ok, j(outro));

    // CNPJ na mensagem
    const pj = await A.createContact(db, { name: "Empresa", person_kind: "pj", document: "11.222.333/0001-81", responsible_name: "Ana" });
    const pjDup = await A.createContact(db, { name: "Outra", person_kind: "pj", document: "11222333000181" });
    check("duplicado de PJ usa CNPJ", !pjDup.ok && pjDup.message === "Já existe um contato com esse CNPJ: Empresa.", j(pjDup));

    // update parcial mantém CPF e endereço
    const comEnd = await A.createContact(db, {
      name: "Com Endereço",
      person_kind: "pf",
      document: "111.444.777-35",
      address_street: "Rua A",
      address_zip: "38400-000",
      address_state: "mg",
      phone: "1",
    });
    if (!comEnd.ok) throw new Error(`comEnd: ${j(comEnd)}`);
    const up = await A.updateContact(db, comEnd.data.id, { name: "Com Endereço 2", phone: "999" });
    check(
      "updateContact {name, phone} mantém CPF e endereço",
      up.ok && up.data.document === "11144477735" && up.data.address_street === "Rua A" &&
        up.data.address_zip === "38400000" && up.data.address_state === "MG" && up.data.phone === "999",
      j(up),
    );
    const upNull = await A.updateContact(db, comEnd.data.id, { name: "Com Endereço 2", address_street: null });
    check("campo novo nulo limpa", upNull.ok && upNull.data.address_street === null && upNull.data.document === "11144477735", j(upNull));

    // (a) PATCH só {name, document} num contato pf armazenado
    const upDoc = await A.updateContact(db, comEnd.data.id, { name: "Com Endereço 3", document: "529.982.247-25" });
    check("(a) só {name, document} em pf armazenado usa o person_kind guardado (aqui repetido)", !upDoc.ok && upDoc.code === "DUPLICATE_DOCUMENT", j(upDoc));
    const upDoc2 = await A.updateContact(db, c1.ok ? c1.data.id : "", { name: "Só Nome", person_kind: "pf" });
    check("define person_kind", upDoc2.ok, j(upDoc2));
    const upDoc3 = await A.updateContact(db, c1.ok ? c1.data.id : "", { name: "Só Nome", document: "390.533.447-05" });
    check("(a) PATCH {name, document} em contato pf funciona", upDoc3.ok && upDoc3.data.document === "39053344705", j(upDoc3));

    // update com o próprio documento não conflita consigo mesmo
    const upSelf = await A.updateContact(db, c1.ok ? c1.data.id : "", { name: "Só Nome", document: "39053344705" });
    check("regravar o próprio documento ok", upSelf.ok, j(upSelf));

    // (b) PJ -> pf zera responsible_name
    if (!pj.ok) throw new Error(`pj: ${j(pj)}`);
    const troca = await A.updateContact(db, pj.data.id, { name: "Empresa", person_kind: "pf", document: "86288366757" });
    check(
      "(b) trocar PJ para pf zera responsible_name",
      troca.ok && troca.data.person_kind === "pf" && troca.data.responsible_name === null,
      j(troca),
    );

    // Consumidor final
    const cf = await db.contact.create({ data: scoped({ name: "Consumidor final", system_key: "consumidor_final" }) });
    const lista = await A.listContacts(db);
    check("listContacts não devolve o system_key", !lista.some((c) => c.id === cf.id) && lista.length > 0, j(lista.map((c) => c.name)));
    const foc = await A.findOrCreateContact(db, "consumidor final");
    check("findOrCreateContact não reaproveita o system_key", foc.criado === true && foc.id !== cf.id, j(foc));
    const msg = "O Consumidor final é fixo e não pode ser editado nem arquivado.";
    const eCf = await A.updateContact(db, cf.id, { name: "Outro nome" });
    check("updateContact no system_key: 422", !eCf.ok && eCf.status === 422 && eCf.code === "VALIDATION_ERROR" && eCf.message === msg, j(eCf));
    const aCf = await A.setContactArchived(db, cf.id, true);
    check("setContactArchived no system_key: 422", !aCf.ok && aCf.status === 422 && aCf.message === msg, j(aCf));

    // detalhe devolve os campos novos
    const det = await A.getContactDetail(db, comEnd.data.id);
    check("getContactDetail traz campos novos", det.ok && det.data.address_zip === "38400000" && det.data.document === "11144477735" && det.data.incomplete === true, j(det));
    check("view não vaza system_key", det.ok && !("system_key" in det.data));
  } finally {
    for (const id of tenantIds) {
      await prisma.contact.deleteMany({ where: { tenant_id: id } });
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
  }
}

async function secao3() {
  console.log("\nSeção 3: cliente do balcão e o Consumidor final (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const bcrypt = (await import("bcryptjs")).default;
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const stamp = Date.now();
  const SENHA = "SenhaForte#2026";
  const hash = await bcrypt.hash(SENHA, 4);
  const tenantIds: string[] = [];
  try {
    const novoTenant = async (nome: string) => {
      const t = await prisma.tenant.create({
        data: {
          name: `M90c ${nome} ${stamp}`,
          document: `M90c${nome}${stamp}`.slice(0, 14),
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
    const t = await novoTenant("A");
    const tB = await novoTenant("B");
    const mk = async (tenantId: string, suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}) => {
      const u = await prisma.user.create({
        data: {
          tenant_id: tenantId,
          name: `M90c ${suf}`,
          email: `m90c-${suf}-${stamp}@teste.local`,
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
    const semPapel = await mk(t.id, "sem", "OPERADOR", { emporio_role: null, emporio_keys: [] });
    const db = prismaForTenant(t.id);
    const dbB = prismaForTenant(tB.id);
    const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M90c Loja" });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    await vincularTodas(prisma, t.id, [vend.id], [loja.data.id]);

    const histN = (action: string) => prisma.emporioAuditLog.count({ where: { tenant_id: t.id, action } });
    const pf = { name: "Maria Balcão", person_kind: "pf" as const, document: "529.982.247-25", phone: "34 99999-0000" };

    // rota com Bearer
    const rotaTok = await import("@/app/api/v1/auth/token/route");
    const rotaPost = await import("@/app/api/v1/emporio/customers/route");
    const rotaPatch = await import("@/app/api/v1/emporio/customers/[id]/route");
    const tok = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: vend.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
    const resPost = await withBearer(tok, () =>
      rotaPost.POST(new Request("http://localhost/api/v1/emporio/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pf),
      })),
    );
    const corpo = (await resPost.json().catch(() => ({}))) as Dado;
    check("vendedor cadastra PF pela rota: 201", resPost.status === 201 && corpo?.data?.incomplete === false && corpo?.data?.document === "52998224725", `${resPost.status} ${j(corpo)}`);
    check("1 linha cliente.cadastrar no Histórico", (await histN("cliente.cadastrar")) === 1);

    const semCpf = await C.cadastrarClienteAction(db, vend, { name: "Sem CPF", person_kind: "pf", phone: "1" });
    check("PF sem CPF: 422 document", !semCpf.ok && semCpf.status === 422 && semCpf.field === "document", j(semCpf));
    const semCnpj = await C.cadastrarClienteAction(db, vend, { name: "Sem CNPJ", person_kind: "pj", phone: "1" });
    check("PJ sem CNPJ: 422 document", !semCnpj.ok && semCnpj.status === 422 && semCnpj.field === "document", j(semCnpj));
    const dup = await C.cadastrarClienteAction(db, vend, { ...pf, name: "Outra Maria" });
    check("CPF repetido: 409 DUPLICATE_DOCUMENT", !dup.ok && dup.status === 409 && dup.code === "DUPLICATE_DOCUMENT" && dup.field === "document", j(dup));
    check("recusas não gravam Histórico", (await histN("cliente.cadastrar")) === 1);

    const neg = await C.cadastrarClienteAction(db, semPapel, { ...pf, document: "390.533.447-05" });
    check("sem papel no Empório: FORBIDDEN", !neg.ok && neg.code === "FORBIDDEN" && neg.status === 403, j(neg));

    const alfa = await C.cadastrarClienteAction(db, vend, { name: "Empresa Nova", person_kind: "pj", document: "12.abc.345/01de-35", phone: "3499" });
    check("PJ com CNPJ alfanumérico: cadastra em maiúscula", alfa.ok && alfa.data.document === "12ABC34501DE35", j(alfa));
    const alfaDup = await C.cadastrarClienteAction(db, vend, { name: "Outra Nova", person_kind: "pj", document: "12ABC34501DE35", phone: "3499" });
    check("mesmo CNPJ alfanumérico em outra caixa: 409", !alfaDup.ok && alfaDup.code === "DUPLICATE_DOCUMENT", j(alfaDup));

    // completar
    const antigo = await db.contact.create({ data: scoped({ name: "Contato Antigo" }) });
    const comp = await C.completarClienteAction(db, vend, antigo.id, {
      person_kind: "pf",
      document: "390.533.447-05",
      phone: "34 98888-7777",
    });
    check("completar contato antigo: ok e completo", comp.ok && comp.data.incomplete === false && comp.data.name === "Contato Antigo" && comp.data.document === "39053344705", j(comp));
    check("linha cliente.completar", (await histN("cliente.completar")) === 1);

    const meio = await db.contact.create({ data: scoped({ name: "Meio Cadastro", person_kind: "pf" }) });
    const soTel = await C.completarClienteAction(db, vend, meio.id, { phone: "34 97777-6666" });
    check("só o telefone num contato sem CPF: 422 document", !soTel.ok && soTel.status === 422 && soTel.field === "document", j(soTel));
    const meioDepois = await db.contact.findUnique({ where: { id: meio.id } });
    check("recusa não grava o telefone", meioDepois?.phone === null);

    const repetido = await C.completarClienteAction(db, vend, meio.id, { document: "529.982.247-25", phone: "1" });
    check("completar com CPF de outro: 409", !repetido.ok && repetido.code === "DUPLICATE_DOCUMENT", j(repetido));
    const inexistente = await C.completarClienteAction(db, vend, "nao-existe", { phone: "1" });
    check("completar inexistente: 404", !inexistente.ok && inexistente.status === 404, j(inexistente));

    const arq = await db.contact.create({ data: scoped({ name: "Arquivado", archived_at: new Date() }) });
    const eArq = await C.completarClienteAction(db, vend, arq.id, { ...pf, document: "111.444.777-35" });
    check("completar arquivado: 422", !eArq.ok && eArq.status === 422, j(eArq));

    // PATCH pela rota
    const resPatch = await withBearer(tok, () =>
      rotaPatch.PATCH(new Request(`http://localhost/api/v1/emporio/customers/${meio.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: "111.444.777-35", phone: "34 96666-5555" }),
      }), { params: Promise.resolve({ id: meio.id }) }),
    );
    const corpoPatch = (await resPatch.json().catch(() => ({}))) as Dado;
    check("PATCH pela rota: 200 completo", resPatch.status === 200 && corpoPatch?.data?.incomplete === false, `${resPatch.status} ${j(corpoPatch)}`);

    // Consumidor final
    const [a, b] = await Promise.all([C.garantirConsumidorFinal(db), C.garantirConsumidorFinal(db)]);
    const qtd = await prisma.contact.count({ where: { tenant_id: t.id, system_key: "consumidor_final" } });
    check("garantirConsumidorFinal em paralelo: mesmo id e 1 linha", a.id === b.id && qtd === 1 && a.name === "Consumidor final", `${j([a, b])} ${qtd}`);
    const c3 = await C.garantirConsumidorFinal(db);
    check("chamar de novo devolve o mesmo", c3.id === a.id);
    const cB = await C.garantirConsumidorFinal(dbB);
    check("outro tenant tem o seu", cB.id !== a.id);
    const eCf = await C.completarClienteAction(db, vend, a.id, pf);
    check(
      "completar o Consumidor final: 422 com a frase fixa",
      !eCf.ok && eCf.status === 422 && eCf.message === "O Consumidor final é fixo e não pode ser editado nem arquivado.",
      j(eCf),
    );
  } finally {
    for (const id of tenantIds) {
      await prisma.emporioAuditLog.deleteMany({ where: { tenant_id: id } });
      await prisma.contact.deleteMany({ where: { tenant_id: id } });
      await prisma.userEstablishment.deleteMany({ where: { tenant_id: id } });
      await prisma.cashRegister.deleteMany({ where: { tenant_id: id } });
      await prisma.establishment.deleteMany({ where: { tenant_id: id } });
      await prisma.user.deleteMany({ where: { tenant_id: id } });
      await prisma.tenantProfile.deleteMany({ where: { tenant_id: id } });
      await prisma.tenantFeature.deleteMany({ where: { tenant_id: id } });
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
  }
}

async function secao4() {
  console.log("\nSeção 4: a venda exige cliente; Consumidor final sem fiado nem cheque (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture } = await import("./_emporio-papel");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = await import("@/lib/actions/emporio-vendas");
  const { carregarCatalogoDeVenda } = await import("@/app/(dashboard)/emporio/_components/catalogo-venda");
  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const t = await prisma.tenant.create({
      data: {
        name: `M90v ${stamp}`,
        document: `M90v${stamp}`.slice(0, 14),
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
        name: "M90v own",
        email: `m90v-own-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
        ...papelDeFixture("OWNER"),
      },
    });
    const owner = { id: u.id, role: "OWNER" as const, email: u.email };
    const db = prismaForTenant(t.id);

    // catálogo numa conta sem Consumidor final: cria e devolve em primeiro
    const antes = await prisma.contact.count({ where: { tenant_id: t.id, system_key: "consumidor_final" } });
    const soNome = await db.contact.create({ data: scoped({ name: "Aaa Só Nome" }) });
    const completo = await db.contact.create({
      data: scoped({ name: "Zzz Completo", person_kind: "pf", document: "52998224725", phone: "3499" }),
    });
    const cat0 = await carregarCatalogoDeVenda(db, []);
    const depois = await prisma.contact.count({ where: { tenant_id: t.id, system_key: "consumidor_final" } });
    check("conta sem Consumidor final: o catálogo cria um", antes === 0 && depois === 1, `${antes} ${depois}`);
    check("Consumidor final vem primeiro, com consumidor_final true", cat0.contatos[0]?.consumidor_final === true && cat0.contatos[0]?.name === "Consumidor final", j(cat0.contatos));
    check("depois dele, por nome, sem system_key", cat0.contatos.slice(1).map((c) => c.name).join("|") === "Aaa Só Nome|Zzz Completo" && cat0.contatos.slice(1).every((c) => !c.consumidor_final), j(cat0.contatos));
    check("contato só com nome vem incomplete true, o completo false", cat0.contatos.find((c) => c.id === soNome.id)?.incomplete === true && cat0.contatos.find((c) => c.id === completo.id)?.incomplete === false, j(cat0.contatos));

    // loja, produto, preço e estoque
    const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M90v Loja" });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    const categoria = await db.productCategory.create({ data: scoped({ name: "M90v categoria" }) });
    const p = await Cat.criarProdutoEmporioAction(db, owner, { name: `M90v Ração ${stamp}`, category_id: categoria.id, base_unit: "quilograma" });
    if (!p.ok) throw new Error(`produto: ${j(p)}`);
    const pres = await Cat.criarApresentacaoAction(db, owner, p.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: loja.data.id, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: loja.data.id, emporio_product_id: p.data.id, sealed: [], loose_qty: 100, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);

    const FRASE_SEM = "Escolha o cliente da venda. Quem não quer se identificar entra como Consumidor final.";
    let seq = 0;
    const corpo = (extra: Record<string, unknown>, payments: Dado[] = [{ kind: "dinheiro", amount: 10 }]) => ({
      operation_key: `m90v-${stamp}-${(seq += 1)}`,
      establishment_id: loja.data.id,
      items: [{ emporio_product_id: p.data.id, presentation_id: pres.data.id, quantity: 1 }],
      payments,
      ...extra,
    });
    const cf = cat0.contatos[0].id;

    const semCli = await V.venderAction(db, owner, corpo({}));
    check("venderAction sem contact_id: 422 contact_id com a frase fixa", !semCli.ok && semCli.status === 422 && semCli.field === "contact_id" && semCli.message === FRASE_SEM, j(semCli));
    const nuloCli = await V.venderAction(db, owner, corpo({ contact_id: null }));
    check("contact_id null: a mesma recusa", !nuloCli.ok && nuloCli.field === "contact_id" && nuloCli.message === FRASE_SEM, j(nuloCli));
    const naoExiste = await V.venderAction(db, owner, corpo({ contact_id: "nao-existe" }));
    check("cliente desconhecido: 'Escolha um cliente ativo.'", !naoExiste.ok && naoExiste.field === "contact_id" && naoExiste.message === "Escolha um cliente ativo.", j(naoExiste));
    const arq = await db.contact.create({ data: scoped({ name: "Arquivado M90v", archived_at: new Date() }) });
    const arquivado = await V.venderAction(db, owner, corpo({ contact_id: arq.id }));
    check("cliente arquivado: 'Escolha um cliente ativo.'", !arquivado.ok && arquivado.message === "Escolha um cliente ativo.", j(arquivado));

    const din = await V.venderAction(db, owner, corpo({ contact_id: cf }));
    check("dinheiro para o Consumidor final: ok", din.ok, j(din));
    const fiado = await V.venderAction(db, owner, corpo({ contact_id: cf }, [{ kind: "fiado", amount: 10 }]));
    check(
      "fiado para o Consumidor final: 422 contact_id",
      !fiado.ok && fiado.status === 422 && fiado.field === "contact_id" && fiado.message === "Fiado precisa do cliente de verdade, não do Consumidor final.",
      j(fiado),
    );
    const cheque = await V.venderAction(
      db,
      owner,
      corpo({ contact_id: cf }, [{ kind: "cheque", amount: 10, check: { number: "1", bank: "Banco", good_for: new Date(Date.now() + 86_400_000) } }]),
    );
    check(
      "cheque para o Consumidor final: 422 contact_id",
      !cheque.ok && cheque.status === 422 && cheque.field === "contact_id" && cheque.message === "Cheque precisa do cliente de verdade, não do Consumidor final.",
      j(cheque),
    );
    const fiadoReal = await V.venderAction(db, owner, corpo({ contact_id: completo.id }, [{ kind: "fiado", amount: 10 }]));
    check("fiado para cliente de verdade: ok", fiadoReal.ok, j(fiadoReal));
    const antigo = await V.venderAction(db, owner, corpo({ contact_id: soNome.id }));
    check("venda para contato antigo só com nome: ok", antigo.ok, j(antigo));

    // troca: precisa de cliente na venda nova
    if (!din.ok) throw new Error("venda base não criou");
    const item = await db.emporioSaleItem.findFirstOrThrow({ where: { sale_id: din.data.id } });
    const troca = (extra: Record<string, unknown>) => ({
      operation_key: `m90v-troca-${stamp}-${(seq += 1)}`,
      items_devolvidos: [{ sale_item_id: item.id, quantity: 1 }],
      venda: {
        operation_key: `m90v-tv-${stamp}-${seq}`,
        establishment_id: loja.data.id,
        items: [{ emporio_product_id: p.data.id, presentation_id: pres.data.id, quantity: 1 }],
        payments: [],
        ...extra,
      },
    });
    const trSem = await V.trocarAction(db, owner, din.data.id, troca({}));
    check("trocarAction sem contact_id: 422 contact_id com a frase fixa", !trSem.ok && trSem.status === 422 && trSem.field === "contact_id" && trSem.message === FRASE_SEM, j(trSem));
    const trOk = await V.trocarAction(db, owner, din.data.id, troca({ contact_id: cf }));
    check("trocarAction com o Consumidor final: ok", trOk.ok, j(trOk));
  } finally {
    const modelos = [
      "emporioAuditLog", "cashMovement", "stockMovement", "emporioSalePayment", "emporioSaleReturnItem", "emporioSaleReturn",
      "emporioSaleItem", "emporioSale", "financialEntry", "presentationPrice", "productPresentation", "userEstablishment",
      "emporioProduct", "product", "cashRegister", "establishment", "bankAccount", "contact", "productCategory", "user", "tenantProfile", "tenantFeature",
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
    check("seção 4: a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
  }
}

async function secao5() {
  console.log("\nSeção 5: o nome do produto é editável (com banco)");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const { papelDeFixture } = await import("./_emporio-papel");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const C = await import("@/lib/actions/emporio-clientes");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const V = await import("@/lib/actions/emporio-vendas");
  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const t = await prisma.tenant.create({
      data: {
        name: `M90n ${stamp}`,
        document: `M90n${stamp}`.slice(0, 14),
        plan: "grupo",
        status: "trial",
        trial_ends_at: new Date(Date.now() + 86_400_000),
      },
    });
    tenantIds.push(t.id);
    await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
    await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
    const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}) => {
      const u = await prisma.user.create({
        data: {
          tenant_id: t.id,
          name: `M90n ${suf}`,
          email: `m90n-${suf}-${stamp}@teste.local`,
          password_hash: "x",
          role,
          ...papelDeFixture(role),
          ...extra,
        },
      });
      return { id: u.id, role, email: u.email };
    };
    const owner = await mk("own", "OWNER");
    const vendSemChave = await mk("vend", "OPERADOR", { emporio_keys: [] });
    const db = prismaForTenant(t.id);

    const loja = await Cat.criarEstabelecimentoAction(db, owner, { name: "M90n Loja" });
    if (!loja.ok) throw new Error(`loja: ${j(loja)}`);
    const categoria = await db.productCategory.create({ data: scoped({ name: "M90n categoria" }) });
    const mkProd = async (name: string) => {
      const r = await Cat.criarProdutoEmporioAction(db, owner, { name, category_id: categoria.id, base_unit: "unidade" });
      if (!r.ok) throw new Error(`produto: ${j(r)}`);
      return r.data;
    };
    const arame = await mkProd("Arame 500");
    const outro = await mkProd("Prego Comum");
    const pres = await Cat.criarApresentacaoAction(db, owner, arame.id, { name: "Rolo", base_qty: 1, is_sealed_package: false });
    if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: loja.data.id, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: loja.data.id, emporio_product_id: arame.id, sealed: [], loose_qty: 10, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
    const cf = (await C.garantirConsumidorFinal(db)).id;
    const venda = await V.venderAction(db, owner, {
      operation_key: `m90n-${stamp}`,
      establishment_id: loja.data.id,
      contact_id: cf,
      items: [{ emporio_product_id: arame.id, presentation_id: pres.data.id, quantity: 1 }],
      payments: [{ kind: "dinheiro", amount: 10 }],
    });
    if (!venda.ok) throw new Error(`venda: ${j(venda)}`);

    // recusas
    const vazio = await Cat.editarProdutoEmporioAction(db, owner, arame.id, { name: "   " });
    check("nome em branco: 422 name", !vazio.ok && vazio.status === 422 && vazio.field === "name" && vazio.message === "Informe o nome do produto.", j(vazio));
    const dup = await Cat.editarProdutoEmporioAction(db, owner, arame.id, { name: "  PREGO comum " });
    check(
      "nome de outro produto (caixa diferente): 409 DUPLICATE_NAME",
      !dup.ok && dup.status === 409 && dup.code === "DUPLICATE_NAME" && dup.field === "name" && dup.message === 'Já existe um produto chamado "Prego Comum".',
      j(dup),
    );
    const semChave = await Cat.editarProdutoEmporioAction(db, vendSemChave, arame.id, { name: "Arame Qualquer" });
    check("vendedor sem cadastrar_produto: FORBIDDEN", !semChave.ok && semChave.code === "FORBIDDEN", j(semChave));
    const intacto = await db.product.findFirstOrThrow({ where: { id: arame.product_id } });
    check("as recusas não mudaram o nome", intacto.name === "Arame 500", intacto.name);

    // renomear
    const novo = await Cat.editarProdutoEmporioAction(db, owner, arame.id, { name: "  Arame Farpado 500 m  " });
    check("renomear: ok", novo.ok, j(novo));
    const lido = await Cat.lerProdutoEmporioAction(db, owner, arame.id);
    check("lerProdutoEmporioAction devolve o nome novo, aparado", lido.ok && lido.data.name === "Arame Farpado 500 m", j(lido));
    const linhas = await db.emporioAuditLog.findMany({ where: { action: "produto.editar", target_id: arame.id } });
    const mudNome = linhas.flatMap((l) => (Array.isArray(l.changes) ? (l.changes as Dado[]) : [])).filter((m) => m.campo === "Nome");
    check(
      "histórico: uma linha produto.editar com Nome antes/depois",
      linhas.length === 1 && mudNome.length === 1 && mudNome[0].antes === "Arame 500" && mudNome[0].depois === "Arame Farpado 500 m",
      j(linhas),
    );
    check("o resumo usa o nome novo", linhas[0]?.summary.includes("Arame Farpado 500 m") === true, linhas[0]?.summary);

    // mesmo nome: sem linha "Nome"
    const igual = await Cat.editarProdutoEmporioAction(db, owner, arame.id, { name: "Arame Farpado 500 m", brand: "Belgo" });
    check("mesmo nome (com outra mudança): ok", igual.ok, j(igual));
    const linhas2 = await db.emporioAuditLog.findMany({ where: { action: "produto.editar", target_id: arame.id } });
    const nomes2 = linhas2.flatMap((l) => (Array.isArray(l.changes) ? (l.changes as Dado[]) : [])).filter((m) => m.campo === "Nome");
    check("mesmo nome não gera outra linha Nome", nomes2.length === 1, j(nomes2));

    // só a caixa, no próprio produto
    const caixa = await Cat.editarProdutoEmporioAction(db, owner, arame.id, { name: "ARAME FARPADO 500 M" });
    check("mudar só a caixa do próprio nome: ok", caixa.ok && caixa.data.name === "ARAME FARPADO 500 M", j(caixa));

    // venda feita antes mostra o nome novo
    const lidaVenda = await V.lerVendaAction(db, owner, venda.data.id);
    check(
      "a venda feita antes mostra o nome novo",
      lidaVenda.ok && lidaVenda.data.items.every((i) => i.product_name === "ARAME FARPADO 500 M"),
      j(lidaVenda),
    );
    void outro;
  } finally {
    const modelos = [
      "emporioAuditLog", "cashMovement", "stockMovement", "emporioSalePayment", "emporioSaleReturnItem", "emporioSaleReturn",
      "emporioSaleItem", "emporioSale", "financialEntry", "presentationPrice", "productPresentation", "userEstablishment",
      "emporioProduct", "product", "cashRegister", "establishment", "bankAccount", "contact", "productCategory", "user", "tenantProfile", "tenantFeature",
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
    check("seção 5: a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
  }
}

async function main() {
  await secao1();
  await secao2();
  await secao3();
  await secao4();
  await secao5();
  console.log(falhas === 0 ? "\n✅ M90 verde" : `\n❌ M90: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
