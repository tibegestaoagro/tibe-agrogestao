import { primeiroInvalido, aplicarErroDoServidor } from "@/lib/erros-de-formulario";

/**
 * As duas decisoes de formulario que nao podem morar dentro do componente.
 *
 * Motivo: este repositorio nao tem runner de DOM. Regra escrita dentro do JSX
 * e regra sem prova, e a fase 1 mostrou o preco disso: os 27 paineis de
 * escrita estavam sem `<form>` de verdade, e ninguem descobriu por teste, foi
 * por medicao manual em 2026-08-20.
 *
 * Entao o componente nao decide nada aqui. Ele pergunta.
 *
 * Roda: `npm run test:m46` (sem banco).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const ORDEM = ["tipo", "categoria", "valor", "vencimento"] as const;
type Campo = (typeof ORDEM)[number];

console.log("🧾 M46: as duas decisoes de formulario\n");

console.log("1. primeiroInvalido segue a ordem da TELA, nao a do objeto");
{
  // O produtor le de cima para baixo. Mandar o foco para o terceiro campo
  // quando o primeiro tambem esta errado o faz corrigir na ordem errada, e
  // descobrir o de cima so no proximo submit.
  const erros: Partial<Record<Campo, string>> = { valor: "x", tipo: "y" };
  assert(primeiroInvalido(erros, ORDEM) === "tipo", "escolhe o que aparece primeiro na tela");
}
assert(primeiroInvalido({ vencimento: "x" }, ORDEM) === "vencimento", "com um erro so, escolhe ele");
assert(primeiroInvalido({}, ORDEM) === null, "sem erro, nao ha o que focar");
{
  // Chave que a tela nao tem (veio de um estado antigo, ou de um campo
  // removido): nao pode roubar o foco para um elemento que nao existe, senao
  // o painel fica com o foco no nada e o teclado do celular fecha.
  const orfao = { inexistente: "x" } as unknown as Partial<Record<Campo, string>>;
  assert(primeiroInvalido(orfao, ORDEM) === null, "campo fora da ordem nao rouba o foco");
}
{
  // String vazia nao e erro. Um `setErros({ valor: "" })` acontece quando a
  // mensagem vem de uma variavel que ainda nao foi preenchida.
  assert(primeiroInvalido({ valor: "" }, ORDEM) === null, "mensagem vazia nao conta como erro");
}

console.log("\n2. aplicarErroDoServidor separa erro de campo de erro global");
{
  const r = aplicarErroDoServidor(
    { code: "SALDO_INSUFICIENTE", message: "Existem apenas 3 animais.", field: "valor" },
    ORDEM,
  );
  assert(r.erros.valor === "Existem apenas 3 animais.", "erro com field vira erro do campo");
  assert(r.global === null, "e nao se repete no rodape");
}
{
  const r = aplicarErroDoServidor({ code: "NETWORK", message: "Falha de rede" }, ORDEM);
  assert(r.global === "Falha de rede", "erro sem field fica no rodape");
  assert(Object.keys(r.erros).length === 0, "e nao inventa campo");
}
{
  // O caso que mais importa: o servidor cita um campo que ESTA tela nao
  // mostra. A mensagem nao pode sumir. Erro que desaparece e pior que erro no
  // lugar errado, porque o produtor fica sem nada para ler.
  const r = aplicarErroDoServidor(
    { code: "X", message: "Campo que a tela nao tem", field: "fazenda" },
    ORDEM,
  );
  assert(r.global === "Campo que a tela nao tem", "field desconhecido cai no rodape em vez de sumir");
  assert(Object.keys(r.erros).length === 0, "e nao cria campo fantasma");
}
{
  // Recusa de campo com mensagem vazia: o servidor errou, mas o produtor nao
  // pode ficar sem aviso nenhum na tela.
  const r = aplicarErroDoServidor({ code: "VALIDATION_ERROR", message: "", field: "valor" }, ORDEM);
  assert(
    r.erros.valor === undefined && typeof r.global === "string" && r.global.length > 0,
    "mensagem vazia vira aviso generico no rodape, nunca silencio",
  );
}

console.log("");
if (failures === 0) console.log("✅ M46: erros de formulario, 0 falhas.");
else {
  console.error(`❌ M46: ${failures} falha(s).`);
  process.exit(1);
}
