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
    !cnpjRuim.ok && cnpjRuim.message === "CNPJ inválido. Confira os 14 números.",
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
  check("formatarDocumento null", m.formatarDocumento(null) === "");
  check("formatarCep", m.formatarCep("38400000") === "38400-000");
  check("CONSUMIDOR_FINAL", m.CONSUMIDOR_FINAL.system_key === "consumidor_final" && m.CONSUMIDOR_FINAL.name === "Consumidor final");
}

async function main() {
  await secao1();
  console.log(falhas === 0 ? "\n✅ M90 verde" : `\n❌ M90: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
