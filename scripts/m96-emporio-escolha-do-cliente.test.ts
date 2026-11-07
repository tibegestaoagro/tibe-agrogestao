import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M96: Módulo 39 (Meu Empório), Frente 2: a escolha do cliente e do fornecedor.
 * Roda: `npm run test:m96`
 *
 * Seção 1: a regra pura do termo de busca e do telefone (sem banco).
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
  const forn = B.ondeBuscaFornecedor(B.lerTermo("Zé")) as Dado;
  check("ondeBuscaFornecedor nome: name_busca contains", j(forn) === j({ name_busca: { contains: "ze" } }), j(forn));
  check("ondeBuscaFornecedor vazio é {}", j(B.ondeBuscaFornecedor({ modo: "vazio" })) === "{}");
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
