import "dotenv/config";
import { converter, UNIDADES } from "@/lib/calculadoras/conversoes";
import { calcularPiquetes } from "@/lib/calculadoras/piquetes";
import { calcularMistura } from "@/lib/calculadoras/mistura";
import { calcularReservatorio } from "@/lib/calculadoras/reservatorio";
import { calcularGanhoDePeso } from "@/lib/calculadoras/ganho-de-peso";
import {
  calcularCustoPorHectare,
  calcularServicoTerceirizado,
} from "@/lib/calculadoras/custo-da-operacao";
import { calcularSementes } from "@/lib/calculadoras/sementes";
import { calcularCustoDeMaoDeObra } from "@/lib/calculadoras/custo-de-mao-de-obra";
import { calcularCerca } from "@/lib/calculadoras/cerca";
import { calcularSalMineral } from "@/lib/calculadoras/sal-mineral";
import { calcularCocho } from "@/lib/calculadoras/cocho";
import { calcularValorPorArroba } from "@/lib/calculadoras/compra-venda-gado";
import { CALCULADORAS } from "@/lib/calculadoras/catalog";

/**
 * Modulo 37: a Calculadora Pecuaria.
 *
 * Escrita A PARTIR DA SPEC (`docs/superpowers/specs/2026-09-11-modulo-37-calculadora.md`),
 * sem ler a implementacao. Funcao pura e o caso mais facil de testar e o mais
 * facil de testar MAL: o caso que discrimina e sempre o da ponta, nunca o valor
 * redondo do meio da faixa.
 *
 * Sem banco: nada nesta area persiste (decisao 6).
 *
 * Roda: `npm run test:m64`.
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
  console.log("🧮 M64: a Calculadora Pecuaria\n");

  console.log("1. Alqueire nunca tem default (§35)");
  {
    const paulista = converter({ valor: 1, de: "alqueire_paulista", para: "metro_quadrado" });
    const mineiro = converter({ valor: 1, de: "alqueire_mineiro", para: "metro_quadrado" });
    assert(paulista.ok && paulista.data.valorConvertido === 24_200, "alqueire paulista sao 24.200 m2");
    assert(mineiro.ok && mineiro.data.valorConvertido === 48_400, "alqueire mineiro sao 48.400 m2");

    /*
     * O caso que DISCRIMINA: os dois existem e valem o dobro um do outro. Uma
     * unidade "alqueire" generica passaria em qualquer teste de conversao e
     * erraria a area da fazenda pela metade.
     */
    assert(
      !Object.keys(UNIDADES).includes("alqueire"),
      "nao existe unidade 'alqueire' sem sobrenome",
    );
  }

  console.log("\n2. Saca depende do que esta dentro (§36)");
  {
    const semPeso = converter({ valor: 100, de: "quilograma", para: "saca" });
    assert(!semPeso.ok, "converter para saca sem o peso e recusado");

    const semente = converter({ valor: 100, de: "quilograma", para: "saca", pesoSacaKg: 10 });
    const adubo = converter({ valor: 100, de: "quilograma", para: "saca", pesoSacaKg: 50 });
    assert(semente.ok && semente.data.valorConvertido === 10, "100 kg sao 10 sacas de semente");
    assert(adubo.ok && adubo.data.valorConvertido === 2, "os mesmos 100 kg sao 2 sacas de adubo");

    const impossivel = converter({ valor: 1, de: "hectare", para: "quilograma" });
    assert(!impossivel.ok, "hectare em quilo e recusado, com explicacao");
  }

  console.log("\n3. Saca arredonda para CIMA, com sobra (§41)");
  {
    const r = calcularSementes({ areaHectares: 20, taxaKgPorHectare: 12, pesoEmbalagemKg: 10 });
    assert(r.ok && r.data.totalKg === 240, "20 ha a 12 kg/ha dao 240 kg (exemplo do §8)");
    assert(r.ok && r.data.sacas === 24, "240 kg em sacas de 10 kg dao 24 sacas");

    // A PONTA: 241 kg nao cabem em 24 sacas, e 24,1 nao se compra.
    const quebrado = calcularSementes({ areaHectares: 20.1, taxaKgPorHectare: 12, pesoEmbalagemKg: 10 });
    assert(quebrado.ok && quebrado.data.sacas === 25, "241,2 kg viram 25 sacas, nao 24");
    assert(
      quebrado.ok && quebrado.data.sobraKg !== null && quebrado.data.sobraKg > 8,
      "a sobra da ponta e informada",
    );
  }

  console.log("\n4. Percentual que nao fecha 100 e recusado dizendo o TAMANHO do buraco (§18)");
  {
    const faltando = calcularMistura({
      ingredientes: [
        { nome: "Milho", percentual: 65 },
        { nome: "Farelo de soja", percentual: 29 },
        { nome: "Nucleo", percentual: 5 },
      ],
      quantidadeFinalKg: 1000,
    });
    assert(!faltando.ok, "receita que soma 99% e recusada");
    assert(!faltando.ok && faltando.error.includes("1"), "a recusa diz quanto falta");

    const certa = calcularMistura({
      ingredientes: [
        { nome: "Milho", percentual: 65 },
        { nome: "Farelo de soja", percentual: 29 },
        { nome: "Nucleo", percentual: 6 },
      ],
      quantidadeFinalKg: 1000,
    });
    assert(
      certa.ok && certa.data.ingredientes[0].quantidadeKg === 650,
      "65% de 1.000 kg sao 650 kg de milho (exemplo do §18)",
    );

    // Receita com uma casa decimal precisa passar: 33,3 + 33,3 + 33,4 = 100.
    const tercos = calcularMistura({
      ingredientes: [
        { nome: "A", percentual: 33.3 },
        { nome: "B", percentual: 33.3 },
        { nome: "C", percentual: 33.4 },
      ],
      quantidadeFinalKg: 300,
    });
    assert(tercos.ok, "receita em tercos com uma casa decimal passa");
  }

  console.log("\n5. Redimensionar mantem a proporcao (§19)");
  {
    const ingredientes = [
      { nome: "Milho", percentual: 65 },
      { nome: "Farelo de soja", percentual: 29 },
      { nome: "Nucleo", percentual: 6 },
    ];
    const meia = calcularMistura({ ingredientes, quantidadeFinalKg: 500 });
    assert(meia.ok && meia.data.ingredientes[0].quantidadeKg === 325, "500 kg pedem 325 kg de milho");

    const tresToneladas = calcularMistura({ ingredientes, quantidadeFinalKg: 3000 });
    assert(
      tresToneladas.ok && tresToneladas.data.ingredientes[2].quantidadeKg === 180,
      "3 toneladas pedem 180 kg de nucleo",
    );
  }

  console.log("\n6. Custo ausente SOME, em vez de sair zerado (§20)");
  {
    const semPreco = calcularMistura({
      ingredientes: [
        { nome: "Milho", percentual: 70 },
        { nome: "Farelo", percentual: 30 },
      ],
      quantidadeFinalKg: 100,
    });
    assert(semPreco.ok && semPreco.data.custoTotal === null, "sem preco nenhum, o custo e nulo");

    // A PONTA: com UM preco faltando, o total sairia menor que o real e
    // passaria por completo. Melhor nao responder do que responder barato.
    const parcial = calcularMistura({
      ingredientes: [
        { nome: "Milho", percentual: 70, precoPorKg: 1.5 },
        { nome: "Farelo", percentual: 30 },
      ],
      quantidadeFinalKg: 100,
    });
    assert(parcial.ok && parcial.data.custoTotal === null, "com um preco faltando, o custo nao sai");

    const completo = calcularMistura({
      ingredientes: [
        { nome: "Milho", percentual: 70, precoPorKg: 1.5 },
        { nome: "Farelo", percentual: 30, precoPorKg: 2 },
      ],
      quantidadeFinalKg: 100,
    });
    assert(completo.ok && completo.data.custoTotal === 165, "com todos, 70x1,5 + 30x2 = 165");
  }

  console.log("\n7. Piquetes: o +1 do piquete ocupado (§12)");
  {
    const r = calcularPiquetes({
      areaHectares: 30,
      numeroLotes: 1,
      diasOcupacao: 3,
      diasDescanso: 30,
    });
    /*
     * 30 dias de descanso com 3 de ocupacao pedem 10 piquetes descansando MAIS
     * o que o lote ocupa. Esquecer o +1 faz o lote voltar um turno cedo, que e
     * o erro que o rotacionado existe para evitar.
     */
    assert(r.ok && r.data.piquetesSugeridos === 11, "30 de descanso e 3 de ocupacao dao 11 piquetes");
    assert(r.ok && r.data.descansoResultanteDias === 30, "o arranjo entrega os 30 dias prometidos");

    const doisLotes = calcularPiquetes({
      areaHectares: 60,
      numeroLotes: 2,
      diasOcupacao: 3,
      diasDescanso: 30,
    });
    assert(doisLotes.ok && doisLotes.data.piquetesSugeridos === 22, "dois lotes pedem o dobro");

    const semNada = calcularPiquetes({ areaHectares: 10, numeroLotes: 1, diasOcupacao: 2 });
    assert(!semNada.ok, "sem descanso e sem piquetes desejados, recusa");
  }

  console.log("\n8. Reservatorio reusa o consumo de agua (§23)");
  {
    const r = calcularReservatorio({ numeroAnimais: 100, pesoMedioKg: 450, diasAutonomia: 3 });
    // 10% do peso vivo = 45 L/dia por animal; 100 animais, 3 dias = 13.500 L.
    assert(r.ok && r.data.volumeMinimoLitros === 13_500, "100 animais de 450 kg por 3 dias sao 13.500 L");
    assert(r.ok && r.data.volumeMinimoMetrosCubicos === 13.5, "isso e 13,5 m3");

    const comFolga = calcularReservatorio({
      numeroAnimais: 100,
      pesoMedioKg: 450,
      diasAutonomia: 3,
      margemSegurancaPercent: 20,
    });
    assert(comFolga.ok && comFolga.data.volumeComMargemLitros === 16_200, "com 20% de folga, 16.200 L");
  }

  console.log("\n9. Ganho de peso arredonda o dia para cima (§27)");
  {
    const r = calcularGanhoDePeso({ pesoAtualKg: 350, pesoDesejadoKg: 450, ganhoMedioDiarioKg: 1 });
    assert(r.ok && r.data.dias === 100, "350 para 450 kg a 1 kg/dia sao 100 dias (exemplo do §27)");

    // A PONTA: no dia 90 o animal ainda nao chegou, entao sao 91.
    const quebrado = calcularGanhoDePeso({
      pesoAtualKg: 350,
      pesoDesejadoKg: 450,
      ganhoMedioDiarioKg: 1.1,
    });
    assert(quebrado.ok && quebrado.data.dias === 91, "90,9 dias viram 91");

    const paraTras = calcularGanhoDePeso({
      pesoAtualKg: 450,
      pesoDesejadoKg: 350,
      ganhoMedioDiarioKg: 1,
    });
    assert(!paraTras.ok, "peso desejado menor que o atual e recusado");
  }

  console.log("\n10. Custo por hectare e servico terceirizado (§32, §33)");
  {
    const r = calcularCustoPorHectare({ custoTotal: 4000, areaHectares: 20 });
    assert(r.ok && r.data.custoPorHectare === 200, "R$ 4.000 em 20 ha dao R$ 200/ha (exemplo do §32)");

    const servico = calcularServicoTerceirizado({
      precoPorUnidade: 150,
      quantidade: 20,
      unidade: "hectare",
    });
    assert(servico.ok && servico.data.custoTotal === 3000, "R$ 150/ha por 20 ha sao R$ 3.000");
    assert(
      servico.ok && servico.data.unidadeLabel === "hectare",
      "a resposta repete a unidade escolhida",
    );

    const porMetro = calcularServicoTerceirizado({
      precoPorUnidade: 12,
      quantidade: 1000,
      unidade: "metro",
      areaHectares: 20,
    });
    assert(porMetro.ok && porMetro.data.custoPorHectare === 600, "cerca por metro tambem da custo/ha");
  }

  console.log("\n11. Custo de mao de obra: diaria paga e inteira (§29, §30)");
  {
    const r = calcularCustoDeMaoDeObra({ numeroTrabalhadores: 3, valorDiaria: 150, numeroDias: 5 });
    assert(r.ok && r.data.custoDiarias === 2250, "3 pessoas por 5 dias a R$ 150 sao R$ 2.250");

    const comExtras = calcularCustoDeMaoDeObra({
      numeroTrabalhadores: 3,
      valorDiaria: 150,
      numeroDias: 5,
      alimentacao: 300,
      transporte: 200,
    });
    assert(comExtras.ok && comExtras.data.custoTotal === 2750, "os extras entram no total");

    // §30: 1.000 metros a 200 por dia sao 5 dias.
    const porProducao = calcularCustoDeMaoDeObra({
      numeroTrabalhadores: 2,
      valorDiaria: 100,
      producaoPorDia: 200,
      tamanhoDoServico: 1000,
    });
    assert(porProducao.ok && porProducao.data.dias === 5, "1.000 metros a 200/dia sao 5 dias");
    assert(porProducao.ok && porProducao.data.diasCalculados, "a resposta diz que o dia foi calculado");

    // A PONTA: 1.100 metros a 200/dia sao 5,5 dias, e meia diaria nao existe.
    const quebrado = calcularCustoDeMaoDeObra({
      numeroTrabalhadores: 1,
      valorDiaria: 100,
      producaoPorDia: 200,
      tamanhoDoServico: 1100,
    });
    assert(quebrado.ok && quebrado.data.dias === 6, "5,5 dias viram 6 diarias pagas");
  }

  console.log("\n12. O delta das ferramentas que ja existiam");
  {
    const cerca = calcularCerca({
      comprimentoMetros: 1000,
      espacamentoMetros: 4,
      numeroFios: 5,
      metrosPorRoloArame: 500,
    });
    assert(cerca.ok && cerca.data.mouroesNecessarios === 251, "1.000 m a cada 4 m dao 251 mouroes (§6)");
    assert(cerca.ok && cerca.data.gramposKg > 0, "o grampo do §6 passou a ser calculado");

    const semCusto = calcularCerca({ comprimentoMetros: 100, espacamentoMetros: 4, numeroFios: 3 });
    assert(semCusto.ok && semCusto.data.custoTotal === null, "sem preco, o custo nao sai zerado");

    const comCusto = calcularCerca({
      comprimentoMetros: 100,
      espacamentoMetros: 4,
      numeroFios: 3,
      maoDeObraPorMetro: 5,
    });
    assert(comCusto.ok && comCusto.data.custoMaoDeObra === 500, "mao de obra por metro entra no §7");
    assert(comCusto.ok && comCusto.data.custoPorMetro === 5, "e sai tambem por metro de cerca");

    const estacaLarga = calcularCerca({
      comprimentoMetros: 100,
      espacamentoMetros: 4,
      numeroFios: 3,
      espacamentoEstacasMetros: 6,
    });
    assert(!estacaLarga.ok, "estaca mais espacada que o mourao e recusada");

    const sal = calcularSalMineral({
      numeroAnimais: 100,
      pesoMedioKg: 450,
      diasPeriodo: 30,
      consumoGDiaPorAnimal: 100,
      pesoSacaKg: 30,
    });
    // 100 g x 100 animais x 30 dias = 300 kg, em sacas de 30 kg = 10 sacas.
    assert(sal.ok && sal.data.consumoMaxKgPeriodoRebanho === 300, "o exemplo do §16 da 300 kg");
    assert(sal.ok && sal.data.sacas === 10, "300 kg em sacas de 30 kg sao 10 sacas");
    assert(sal.ok && sal.data.consumoInformado, "a resposta marca que o consumo veio do produtor");

    const cocho = calcularCocho({
      numeroAnimais: 100,
      acessoDoisLados: true,
      comprimentoDeCadaCochoMetros: 2,
    });
    assert(cocho.ok && cocho.data.comprimentoCochoMetros === 2.5, "100 vacas pedem 2,5 m de cocho");
    assert(cocho.ok && cocho.data.quantidadeDeCochos === 2, "2,5 m em pecas de 2 m sao 2 pecas");

    const arroba = calcularValorPorArroba({
      numeroAnimais: 30,
      pesoMedioKg: 450,
      rendimentoCarcacaPercent: 50,
      valorTotal: 135_000,
    });
    // 450 kg a 50% = 225 kg de carcaca = 15 arrobas por animal; 30 animais =
    // 450 arrobas; R$ 135.000 / 450 = R$ 300 por arroba.
    assert(arroba.ok && arroba.data.valorPorArroba === 300, "R$ 135.000 por 30 bois dao R$ 300/@");
    assert(arroba.ok && arroba.data.valorPorCabeca === 4500, "e R$ 4.500 por cabeca");

    const semValor = calcularValorPorArroba({
      numeroAnimais: 30,
      pesoMedioKg: 450,
      rendimentoCarcacaPercent: 50,
    });
    assert(!semValor.ok, "sem valor total nem por cabeca, recusa");
  }

  console.log("\n13. O catalogo e fonte unica, e toda ferramenta tem tela");
  {
    const hrefs = CALCULADORAS.map((c) => c.href);
    assert(new Set(hrefs).size === hrefs.length, "nenhum href repetido no catalogo");
    assert(
      CALCULADORAS.every((c) => c.grupo !== undefined),
      "toda ferramenta declara o grupo do §47",
    );
    assert(
      hrefs.includes("/calculadoras/sementes") &&
        hrefs.includes("/calculadoras/receitas") &&
        hrefs.includes("/calculadoras/conversoes"),
      "as ferramentas novas entraram no catalogo",
    );
  }

  console.log("");
  if (failures > 0) {
    console.error(`❌ M64: ${failures} falha(s).`);
    process.exit(1);
  }
  console.log("✅ M64: 0 falhas.");
}

main();
