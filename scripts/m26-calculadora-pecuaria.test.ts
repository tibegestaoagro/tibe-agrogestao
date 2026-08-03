import { calcularCerca } from "@/lib/calculadoras/cerca";
import { calcularTaxaLotacao } from "@/lib/calculadoras/lotacao";
import { calcularCapacidadeSuportePastagem } from "@/lib/calculadoras/pastagem";
import { calcularSalMineral } from "@/lib/calculadoras/sal-mineral";
import { calcularRacao } from "@/lib/calculadoras/racao";
import { calcularAgua } from "@/lib/calculadoras/agua";
import { calcularCocho } from "@/lib/calculadoras/cocho";
import { calcularAdubacao } from "@/lib/calculadoras/adubacao";
import { calcularCalagem } from "@/lib/calculadoras/calagem";
import { calcularMaoDeObra } from "@/lib/calculadoras/mao-de-obra";
import { calcularCombustivel } from "@/lib/calculadoras/maquinas-combustivel";
import { calcularCompraVendaGado } from "@/lib/calculadoras/compra-venda-gado";

/**
 * Testes das 12 calculadoras da "Calculadora Pecuaria" (Onda 3, agente C2).
 * Sao funcoes puras (sem banco, sem rede): cada bloco cobre pelo menos 1
 * caso conhecido/conferivel manualmente (a maioria batendo com o exemplo
 * numerico da propria fonte citada no arquivo da calculadora), mais os
 * casos de erro de validacao de entrada. Roda: `npm run test:m26`.
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
  console.log("🧮 M26: Calculadora Pecuaria (12 ferramentas)\n");

  // ── Cerca ──────────────────────────────────────────────────────────
  console.log("Cerca");
  {
    const r = calcularCerca({ comprimentoMetros: 300, espacamentoMetros: 3, numeroFios: 4 });
    assert(r.ok && r.data.mouroesNecessarios === 101, "300m/3m + 1 = 101 mouroes");
    assert(r.ok && r.data.metrosDeArameNecessarios === 1260, "300m x 4 fios x 1,05 = 1260m de arame");

    const rolos = calcularCerca({
      comprimentoMetros: 300,
      espacamentoMetros: 3,
      numeroFios: 4,
      metrosPorRoloArame: 500,
    });
    assert(rolos.ok && rolos.data.rolosDeArameNecessarios === 3, "1260m / 500m por rolo = 3 rolos (arredondado pra cima)");

    const invalido = calcularCerca({ comprimentoMetros: 0, espacamentoMetros: 3, numeroFios: 4 });
    assert(!invalido.ok, "comprimento zero e rejeitado");
  }

  // ── Lotacao ────────────────────────────────────────────────────────
  console.log("Lotacao");
  {
    const r = calcularTaxaLotacao({ numeroAnimais: 100, pesoMedioKg: 450, areaHectares: 100 });
    assert(r.ok && r.data.taxaLotacaoUaHa === 1, "100 animais de 450kg em 100ha = 1 UA/ha (conferivel de cabeca)");

    const exemploEmbrapa = calcularTaxaLotacao({ numeroAnimais: 80, pesoMedioKg: 450, areaHectares: 4.5 });
    assert(
      exemploEmbrapa.ok && Math.abs(exemploEmbrapa.data.taxaLotacaoUaHa - 17.78) < 0.01,
      "80 UA (450kg) em 4,5ha = 17,78 UA/ha (bate com exemplo publicado)",
    );

    const invalido = calcularTaxaLotacao({ numeroAnimais: -1, pesoMedioKg: 450, areaHectares: 10 });
    assert(!invalido.ok, "numero de animais negativo e rejeitado");
  }

  // ── Pastagem (capacidade de suporte) ──────────────────────────────
  console.log("Pastagem");
  {
    const r = calcularCapacidadeSuportePastagem({ producaoForragemKgMsHaAno: 25000 });
    assert(
      r.ok && Math.abs(r.data.capacidadeUaHaAno - 1.38) < 0.01,
      "25.000 kg MS/ha/ano = 1,38 UA/ha/ano (exemplo Embrapa conferido)",
    );

    const comArea = calcularCapacidadeSuportePastagem({ producaoForragemKgMsHaAno: 25000, areaHectares: 10 });
    assert(comArea.ok && comArea.data.capacidadeTotalUa === 13.84, "capacidade total = 1,38 x 10ha = 13,84 UA");

    const invalido = calcularCapacidadeSuportePastagem({ producaoForragemKgMsHaAno: 0 });
    assert(!invalido.ok, "producao de forragem zero e rejeitada");
  }

  // ── Sal mineral ────────────────────────────────────────────────────
  console.log("Sal mineral");
  {
    const r = calcularSalMineral({ pesoMedioKg: 450, numeroAnimais: 1, diasPeriodo: 1 });
    assert(r.ok && r.data.consumoMinGDiaPorAnimal === 90, "450kg -> minimo 90 g/dia (20g/100kg)");
    assert(r.ok && r.data.consumoMaxGDiaPorAnimal === 135, "450kg -> maximo 135 g/dia (30g/100kg)");

    const invalido = calcularSalMineral({ pesoMedioKg: 450, numeroAnimais: 10, diasPeriodo: 0 });
    assert(!invalido.ok, "periodo de dias zero e rejeitado");
  }

  // ── Racao / volumoso ──────────────────────────────────────────────
  console.log("Racao");
  {
    const r = calcularRacao({ pesoMedioKg: 400, numeroAnimais: 1, tipoAlimento: "silagem" });
    assert(r.ok && r.data.materiaSecaKgDiaPorAnimal === 10, "400kg -> 10kg MS/dia (2,5% do PV)");
    assert(r.ok && Math.abs(r.data.alimentoNaturalKgDiaPorAnimal - 30) < 0.01, "10kg MS em silagem = 30kg (exemplo Embrapa)");

    const feno = calcularRacao({ pesoMedioKg: 400, numeroAnimais: 1, tipoAlimento: "feno" });
    assert(feno.ok && Math.abs(feno.data.alimentoNaturalKgDiaPorAnimal - 12) < 0.01, "10kg MS em feno = 12kg (exemplo Embrapa)");

    const capim = calcularRacao({ pesoMedioKg: 400, numeroAnimais: 1, tipoAlimento: "capim_verde" });
    assert(capim.ok && Math.abs(capim.data.alimentoNaturalKgDiaPorAnimal - 40) < 0.01, "10kg MS em capim verde = 40kg (exemplo Embrapa)");
  }

  // ── Agua ───────────────────────────────────────────────────────────
  console.log("Agua");
  {
    const r = calcularAgua({ pesoMedioKg: 450, numeroAnimais: 1 });
    assert(r.ok && r.data.consumoLitrosDiaPorAnimal === 45, "450kg -> 45L/dia (10% do PV)");

    const periodo = calcularAgua({ pesoMedioKg: 450, numeroAnimais: 10, diasPeriodo: 30 });
    assert(periodo.ok && periodo.data.consumoLitrosPeriodoRebanho === 13500, "450kg x10 animais x30 dias = 13.500L");
  }

  // ── Cocho (sal mineral) ────────────────────────────────────────────
  console.log("Cocho");
  {
    const r = calcularCocho({ numeroAnimais: 100, acessoDoisLados: true });
    assert(r.ok && r.data.comprimentoCochoMetros === 2.5, "100 vacas, acesso 2 lados = 2,5m (exemplo Embrapa conferido)");

    const umLado = calcularCocho({ numeroAnimais: 100, acessoDoisLados: false });
    assert(umLado.ok && umLado.data.comprimentoCochoMetros === 5, "100 vacas, acesso 1 lado = 5m");
  }

  // ── Adubacao ───────────────────────────────────────────────────────
  console.log("Adubacao");
  {
    const r = calcularAdubacao({ doseNutrienteKgHa: 60, teorNutrientePercent: 20, areaHectares: 10, pesoSacoKg: 50 });
    assert(r.ok && r.data.kgProdutoPorHectare === 300, "60kg/ha de nutriente a 20% de teor = 300kg/ha de produto");
    assert(r.ok && r.data.kgProdutoTotal === 3000, "300kg/ha x 10ha = 3000kg de produto");
    assert(r.ok && r.data.numeroSacos === 60, "3000kg / 50kg por saco = 60 sacos");

    const invalido = calcularAdubacao({ doseNutrienteKgHa: 60, teorNutrientePercent: 150, areaHectares: 10 });
    assert(!invalido.ok, "teor de nutriente acima de 100% e rejeitado");
  }

  // ── Calagem ────────────────────────────────────────────────────────
  console.log("Calagem");
  {
    const r = calcularCalagem({ ctc: 14, saturacaoAtualPercent: 24, saturacaoDesejadaPercent: 70, prntPercent: 92 });
    assert(r.ok && r.data.necessidadeCalagemTHa === 6.44, "CTC 14, V1 24%, V2 70% = NC 6,44 t/ha (exemplo Agrolink)");
    assert(r.ok && r.data.doseCorrigidaTHa === 7, "corrigido pelo PRNT 92% = 7,0 t/ha (exemplo Agrolink)");

    const semNecessidade = calcularCalagem({ ctc: 14, saturacaoAtualPercent: 80, saturacaoDesejadaPercent: 70, prntPercent: 92 });
    assert(!semNecessidade.ok, "saturacao desejada menor que a atual e rejeitada (sem necessidade de calagem)");
  }

  // ── Mao de obra ────────────────────────────────────────────────────
  console.log("Mao de obra");
  {
    const r = calcularMaoDeObra({ numeroAnimais: 1000, capacidadePorFuncionario: 250 });
    assert(r.ok && r.data.funcionariosNecessarios === 4, "1000 animais / 250 por funcionario = 4 funcionarios");

    const arredonda = calcularMaoDeObra({ numeroAnimais: 1001, capacidadePorFuncionario: 250 });
    assert(arredonda.ok && arredonda.data.funcionariosNecessarios === 5, "1001 animais / 250 arredonda para 5 (nao trunca)");

    const semCapacidade = calcularMaoDeObra({ numeroAnimais: 1000, capacidadePorFuncionario: 0 });
    assert(!semCapacidade.ok, "capacidade por funcionario ausente/zero e rejeitada (sem valor padrao assumido)");
  }

  // ── Maquinas e combustivel ─────────────────────────────────────────
  console.log("Maquinas e combustivel");
  {
    const r = calcularCombustivel({ modo: "por_area", consumoLitros: 15, quantidade: 10, precoPorLitro: 6 });
    assert(r.ok && r.data.litrosTotais === 150, "15 L/ha x 10ha = 150L");
    assert(r.ok && r.data.custoTotal === 900, "150L x R$6 = R$900");

    const semPreco = calcularCombustivel({ modo: "por_hora", consumoLitros: 18, quantidade: 8 });
    assert(semPreco.ok && semPreco.data.litrosTotais === 144, "18 L/h x 8h = 144L");
    assert(semPreco.ok && semPreco.data.custoTotal === null, "sem preco informado, custo total fica null (nao inventa preco)");
  }

  // ── Compra e venda de gado (simulacao) ─────────────────────────────
  console.log("Compra e venda de gado");
  {
    const r = calcularCompraVendaGado({
      pesoVivoCompraKg: 350,
      rendimentoCarcacaCompraPercent: 50,
      precoArrobaCompra: 300,
      pesoVivoVendaKg: 550,
      rendimentoCarcacaVendaPercent: 54,
      precoArrobaVenda: 320,
    });
    assert(r.ok && Math.abs(r.data.arrobasCompraPorAnimal - 11.67) < 0.01, "350kg x 50% / 15 = 11,67 @ na compra");
    assert(r.ok && r.data.valorCompraPorAnimal === 3500, "11,67 @ x R$300 = R$3.500 na compra");
    assert(r.ok && r.data.arrobasVendaPorAnimal === 19.8, "550kg x 54% / 15 = 19,8 @ na venda");
    assert(r.ok && r.data.valorVendaPorAnimal === 6336, "19,8 @ x R$320 = R$6.336 na venda");
    assert(r.ok && r.data.margemBrutaPorAnimal === 2836, "margem bruta por animal = 6336 - 3500 = R$2.836");

    const comRebanho = calcularCompraVendaGado({
      pesoVivoCompraKg: 350,
      rendimentoCarcacaCompraPercent: 50,
      precoArrobaCompra: 300,
      pesoVivoVendaKg: 550,
      rendimentoCarcacaVendaPercent: 54,
      precoArrobaVenda: 320,
      numeroAnimais: 10,
    });
    assert(comRebanho.ok && comRebanho.data.margemBrutaTotal === 28360, "margem total para 10 animais = R$28.360");

    const invalido = calcularCompraVendaGado({
      pesoVivoCompraKg: 350,
      rendimentoCarcacaCompraPercent: 150,
      precoArrobaCompra: 300,
      pesoVivoVendaKg: 550,
      rendimentoCarcacaVendaPercent: 54,
      precoArrobaVenda: 320,
    });
    assert(!invalido.ok, "rendimento de carcaca acima de 100% e rejeitado");
  }

  console.log(failures === 0 ? "\n✅ M26: 0 falhas." : `\n❌ M26: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
