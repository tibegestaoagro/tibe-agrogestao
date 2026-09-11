import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Custo de mao de obra (§29) e produtividade (§30) do documento do cliente.
 *
 * ⚠️ **Nao e a mesma pergunta da calculadora de mao de obra que ja existia.**
 * Aquela responde "quantos funcionarios a minha operacao precisa", a partir da
 * capacidade de cada um. Esta responde "quanto vou gastar com este servico",
 * a partir da diaria. Entradas diferentes, saidas diferentes, e juntar as duas
 * numa tela so faria o produtor preencher campo que nao tem a ver com o que
 * ele quer saber.
 *
 * A produtividade do §30 entra aqui, e nao numa terceira ferramenta, porque e
 * a mesma conversa: "faco 200 metros por dia e preciso de 1.000" responde
 * quantos dias, e dias vezes diaria e o custo. Uma pergunta so, em duas
 * metades.
 *
 * Confianca: ALTA. Nao ha coeficiente tecnico: diaria, dias e producao vem do
 * produtor.
 */
export function calcularCustoDeMaoDeObra(input: {
  numeroTrabalhadores: number;
  valorDiaria: number;
  /** Informe os dias, ou deixe a producao do §30 calcular quantos sao. */
  numeroDias?: number;
  /** §30: quanto a equipe inteira faz por dia (metros, hectares, o que for). */
  producaoPorDia?: number;
  /** §30: o tamanho total do servico, na mesma unidade da producao. */
  tamanhoDoServico?: number;
  alimentacao?: number;
  transporte?: number;
  hospedagem?: number;
  outros?: number;
}): CalcResult<{
  dias: number;
  custoDiarias: number;
  custosAdicionais: number;
  custoTotal: number;
  custoPorDia: number;
  /** Verdadeiro quando os dias sairam da producao, nao do campo de dias. */
  diasCalculados: boolean;
}> {
  const {
    numeroTrabalhadores,
    valorDiaria,
    numeroDias,
    producaoPorDia,
    tamanhoDoServico,
    alimentacao,
    transporte,
    hospedagem,
    outros,
  } = input;

  if (!isPositiveNumber(numeroTrabalhadores)) {
    return { ok: false, error: "Numero de trabalhadores deve ser maior que zero." };
  }
  if (!isPositiveNumber(valorDiaria)) {
    return { ok: false, error: "Valor da diaria deve ser maior que zero." };
  }

  const temProducao = producaoPorDia !== undefined && tamanhoDoServico !== undefined;
  if (numeroDias === undefined && !temProducao) {
    return {
      ok: false,
      error: "Informe os dias de servico, ou quanto a equipe faz por dia e o tamanho do servico.",
    };
  }
  if (numeroDias !== undefined && !isPositiveNumber(numeroDias)) {
    return { ok: false, error: "Numero de dias deve ser maior que zero." };
  }
  if (temProducao && (!isPositiveNumber(producaoPorDia) || !isPositiveNumber(tamanhoDoServico))) {
    return { ok: false, error: "Producao por dia e tamanho do servico devem ser maiores que zero." };
  }

  /*
   * Dia de servico e unidade inteira, e arredonda para CIMA: 4,3 dias sao 5
   * diarias pagas, porque ninguem contrata meia diaria para terminar o
   * ultimo trecho.
   */
  const diasCalculados = numeroDias === undefined;
  const dias = diasCalculados
    ? Math.ceil(tamanhoDoServico! / producaoPorDia!)
    : Math.ceil(numeroDias);

  const custoDiarias = round(numeroTrabalhadores * valorDiaria * dias, 2);
  const custosAdicionais = round(
    (alimentacao ?? 0) + (transporte ?? 0) + (hospedagem ?? 0) + (outros ?? 0),
    2,
  );
  const custoTotal = round(custoDiarias + custosAdicionais, 2);

  return {
    ok: true,
    data: {
      dias,
      custoDiarias,
      custosAdicionais,
      custoTotal,
      custoPorDia: round(custoTotal / dias, 2),
      diasCalculados,
    },
  };
}
