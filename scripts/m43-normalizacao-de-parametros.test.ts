import "dotenv/config";
import { lerDinheiro, lerData, lerNumeroBr } from "@/lib/actions/whatsapp-handlers/parsers";
import { itensDosParametros } from "@/lib/actions/whatsapp-handlers/herd";

/**
 * Todo handler le numero e data do MESMO jeito.
 *
 * O classificador do n8n remonta os parametros a cada volta, e o mesmo campo
 * chega ora como numero, ora como texto: esta medido em producao que `valor`
 * veio `1200` num turno e `"1200"` no seguinte, e que `vencimento` veio
 * `"dia 10"` e depois `"10/08/2026"`. Os parsers tolerantes existem por causa
 * disso, e ja custaram dois defeitos ("60 mil" ilegivel, e o frete de R$ 2.000
 * que virava R$ 2,00).
 *
 * Ate 2026-08-20 essa tolerancia nao era uniforme: negociacao e estoque
 * usavam os parsers; rebanho, financeiro e tarefas ainda usavam `Number()` e
 * `new Date()` crus. A mesma frase, portanto, funcionava por um caminho e
 * falhava por outro.
 *
 * Esta suite fixa a uniformidade. Funcao pura, sem banco.
 *
 * Roda: `npm run test:m43`.
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

function main() {
  console.log("🔢 M43: numero e data lidos igual em todo handler\n");

  console.log("1. Dinheiro, nas formas que o produtor fala");
  {
    const casos: [unknown, number][] = [
      [1200, 1200],
      ["1200", 1200],
      ["1.200", 1200],
      ["1.200,00", 1200],
      ["60.000", 60000],
      ["60 mil", 60000],
      ["R$ 1.200", 1200],
    ];
    for (const [entrada, esperado] of casos) {
      const lido = lerDinheiro({ amount: entrada }, "amount");
      assert(lido === esperado, `${JSON.stringify(entrada)} vira ${esperado} (leu ${lido})`);
    }
    assert(lerDinheiro({ amount: "" }, "amount") === null, "vazio continua sendo ausencia, para o handler perguntar");
  }

  console.log("\n2. O caso que Number() quebrava, e que agora o financeiro le");
  {
    // `num()` era `Number()` cru: estes tres davam NaN, e o handler perguntava
    // o valor que o produtor acabara de dizer.
    for (const entrada of ["1.200,00", "60 mil", "1,5 milhao"]) {
      assert(Number.isNaN(Number(entrada)), `Number("${entrada}") e NaN, como era antes`);
      assert(lerDinheiro({ amount: entrada }, "amount") != null, `mas lerDinheiro entende "${entrada}"`);
    }
  }

  console.log("\n3. Quantidade de cabecas, com separador de milhar");
  {
    // No estoque isso ja era tratado ("2.000 kg de racao" virava 2 quilos).
    // No rebanho, "2.000 cabecas" tinha o mesmo destino.
    const itens = itensDosParametros({ categoria: "bezerro_0_7", quantidade: "2.000" });
    assert(itens.length === 1 && itens[0].quantidade === 2000, `"2.000" cabecas vira 2000 (leu ${itens[0]?.quantidade})`);

    const plano = itensDosParametros({ category: "bezerro_0_7", quantity: 15 });
    assert(plano[0]?.quantidade === 15, "numero puro continua funcionando");

    const lista = itensDosParametros({ itens: [{ categoria: "bezerro_0_7", quantidade: "1.500" }] });
    assert(lista[0]?.quantidade === 1500, "a forma de lista tambem normaliza");
  }

  console.log("\n4. Data, nas formas que chegam de verdade");
  {
    const ok = (p: Record<string, unknown>) => lerData(p, "due_date", "data", "date");
    assert(ok({ due_date: "2026-12-10" }).tipo === "ok", "ISO e aceita");
    assert(ok({ due_date: "10/12/2026" }).tipo === "ok", "10/12/2026 e aceita");
    assert(ok({ due_date: "hoje" }).tipo === "ok", "'hoje' e aceita");
    assert(ok({ due_date: "dia 10" }).tipo === "ok", "'dia 10' e aceita");
    assert(ok({}).tipo === "vazio", "ausente e 'vazio', nao erro");
    assert(ok({ due_date: "sei la quando" }).tipo === "invalida", "texto sem data vira 'invalida', para PERGUNTAR");

    // O QUE `new Date` CRU FAZIA, e e pior do que falhar: ele nao recusava,
    // acertava errado e em silencio.
    //
    // "dia 10" virava 1 de OUTUBRO DE 2001, e o lembrete ia para uma data que
    // ninguem pediu, 25 anos no passado. "10/12/2026" (10 de dezembro, como o
    // brasileiro escreve) virava 12 de outubro, porque o JavaScript le
    // MM/DD/AAAA. Nenhum dos dois lancava, entao nenhum dos dois perguntava.
    // Era o handler de tarefas ate 2026-08-20.
    const antigoDia10 = new Date("dia 10");
    assert(
      !Number.isNaN(antigoDia10.getTime()) && antigoDia10.getFullYear() === 2001,
      `new Date("dia 10") nao falhava: dava ${antigoDia10.getFullYear()}, em silencio`,
    );
    const antigoBr = new Date("10/12/2026");
    assert(
      antigoBr.getMonth() === 9,
      "new Date('10/12/2026') dava 12 de OUTUBRO, lendo no formato americano",
    );
    // E o que o parser faz com a mesma entrada:
    const agora = lerData({ due_date: "10/12/2026" }, "due_date");
    assert(
      agora.tipo === "ok" && agora.data.getMonth() === 11 && agora.data.getDate() === 10,
      "lerData entende 10 de DEZEMBRO, como o produtor escreveu",
    );
  }

  console.log("\n5. Data impossivel nao passa fingindo que passou");
  {
    // 31 de fevereiro: o parser faz round-trip e recusa, em vez de deixar o
    // JavaScript deslizar para 3 de marco.
    const r = lerData({ data: "2026-02-31" }, "data");
    assert(r.tipo === "invalida", "31 de fevereiro e recusado em vez de virar 3 de marco");
  }

  console.log("\n6. lerNumeroBr nao inventa numero onde nao ha");
  {
    for (const entrada of ["", "  ", null, undefined, "abc"]) {
      assert(lerNumeroBr(entrada) === null, `${JSON.stringify(entrada)} devolve null`);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`❌ M43: ${failures} falha(s).`);
    process.exit(1);
  }
  console.log("✅ M43: 0 falhas.");
}

main();
