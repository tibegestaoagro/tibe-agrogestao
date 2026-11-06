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
    void comBanco;
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
