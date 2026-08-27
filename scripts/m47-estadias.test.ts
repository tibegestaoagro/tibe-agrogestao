import {
  situacaoDaEstadia,
  donoDaEstadia,
  tipoDeEnvio,
  encerramentosPermitidos,
  permiteEncerramento,
} from "@/lib/herd/stay-rules";

/**
 * As estadias temporárias do rebanho (Módulo 30, fase 2).
 *
 * Este bloco é FUNÇÃO PURA, sem banco: são as regras que o documento do
 * cliente escreve por tipo, e elas precisam valer para todo caminho de
 * escrita, inclusive os que ainda não existem. Deixá-las dentro da action
 * significaria testá-las só pelo caminho que a action expõe.
 *
 * Roda: `npm run test:m47`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🐄 M47: estadias temporárias do rebanho\n");

console.log("1. Cada tipo sabe onde o animal fica e de quem ele é");
check("pasto de terceiro leva à situação homônima", situacaoDaEstadia("pasto_terceiro") === "pasto_terceiro");
check("boitel idem", situacaoDaEstadia("boitel") === "boitel");
check("evento idem, e ele já existe para a missão 3", situacaoDaEstadia("evento") === "evento");
check("desaparecimento vai para desaparecido", situacaoDaEstadia("desaparecimento") === "desaparecido");
check(
  "animal de terceiro está PRESENTE na fazenda, não fora dela",
  situacaoDaEstadia("terceiro_na_fazenda") === "presente",
);
check("e o dono dele é terceiro", donoDaEstadia("terceiro_na_fazenda") === "terceiro");
check("no boitel o animal continua sendo do produtor", donoDaEstadia("boitel") === "proprio");
check("no desaparecimento também", donoDaEstadia("desaparecimento") === "proprio");

console.log("\n2. O envio de cada tipo tem o seu movimento");
check("pasto de terceiro: envio_pasto_terceiro", tipoDeEnvio("pasto_terceiro") === "envio_pasto_terceiro");
check("boitel: envio_boitel", tipoDeEnvio("boitel") === "envio_boitel");
check("terceiro na fazenda: entrada_terceiro", tipoDeEnvio("terceiro_na_fazenda") === "entrada_terceiro");
check("desaparecimento: desaparecimento", tipoDeEnvio("desaparecimento") === "desaparecimento");
// Sem um `envio_evento` proprio, a remessa para um leilao ficaria gravada no
// livro-razao como envio para pasto de terceiro: mentira no registro contabil,
// e so descoberta na missao 3.
check("evento tem envio próprio, e não empresta o de outro", tipoDeEnvio("evento") === "envio_evento");

console.log("\n3. O desaparecimento só sai pelos três caminhos do documento");
{
  const permitidos = encerramentosPermitidos("desaparecimento");
  check("encontrado: volta para presente", permitidos.includes("retorno_estadia"));
  check("morte confirmada reusa o tipo `morte`", permitidos.includes("morte"));
  check("perda confirmada sai definitivamente", permitidos.includes("perda_confirmada"));
  check("e mais nada", permitidos.length === 3, permitidos.join(","));

  // A regra escrita: "nao podera ser vendido, transferido ou movimentado".
  check("vender animal desaparecido é recusado", !permiteEncerramento("desaparecimento", "venda"));
  check("transferir também", !permiteEncerramento("desaparecimento", "transferencia_pasto"));
  check("mudar de categoria também", !permiteEncerramento("desaparecimento", "mudanca_categoria"));
  check("morte confirmada passa", permiteEncerramento("desaparecimento", "morte"));
}

console.log("\n4. Boitel e pasto de terceiro permitem venda direta");
{
  // "permitir retorno, venda direta ou morte", diz o documento sobre o boitel.
  check("boitel permite venda", permiteEncerramento("boitel", "venda"));
  check("boitel permite morte", permiteEncerramento("boitel", "morte"));
  check("boitel permite retorno", permiteEncerramento("boitel", "retorno_estadia"));
  check("pasto de terceiro permite retorno", permiteEncerramento("pasto_terceiro", "retorno_estadia"));
  check("pasto de terceiro permite venda", permiteEncerramento("pasto_terceiro", "venda"));
}

console.log("\n5. Animal de terceiro sai, mas nunca vira rebanho próprio");
{
  check("sai por saida_terceiro", permiteEncerramento("terceiro_na_fazenda", "saida_terceiro"));
  check(
    "e NÃO pode ser vendido pelo produtor: não é dele",
    !permiteEncerramento("terceiro_na_fazenda", "venda"),
  );
  check(
    "nem virar retorno para o rebanho próprio",
    !permiteEncerramento("terceiro_na_fazenda", "retorno_estadia"),
  );
}

console.log(
  falhas === 0
    ? `\n✅ M47: estadias temporárias, 0 falhas.`
    : `\n❌ M47: ${falhas} falha(s).`,
);
process.exit(falhas === 0 ? 0 : 1);
