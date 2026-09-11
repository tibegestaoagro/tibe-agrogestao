import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Receitas e misturas (§18 a §21 do documento do cliente), a ferramenta que o
 * proprio documento chama de "uma das mais importantes".
 *
 * O produtor diz a receita em porcentagem e quanto quer fazer; a funcao diz
 * quanto de cada ingrediente entra. Redimensionar (§19) nao e outra conta: e
 * esta mesma, com outra quantidade final.
 *
 * Confianca: ALTA na aritmetica, que e regra de tres. A RECEITA em si vem do
 * produtor ou do tecnico dele: o §50 tira formulacao nutricional profissional
 * e balanceamento por exigencia animal da primeira versao, e o §46 e explicito
 * que "quanto devo usar" depende de assistencia tecnica, nao de formula.
 */

export type IngredienteEntrada = {
  nome: string;
  percentual: number;
  /** §20: quando vem, o custo aparece; quando nao vem, some. */
  precoPorKg?: number;
};

export type IngredienteCalculado = {
  nome: string;
  percentual: number;
  quantidadeKg: number;
  custo: number | null;
};

/**
 * Tolerancia de arredondamento na soma dos percentuais.
 *
 * Receita escrita com uma casa decimal (33,3 + 33,3 + 33,4) tem que passar, e
 * ponto flutuante sozinho ja tira alguns centesimos do total. Meio ponto
 * percentual e folga suficiente para isso sem deixar passar receita que
 * esqueceu um ingrediente, que erra por unidades.
 */
const TOLERANCIA_PERCENTUAL = 0.5;

export function calcularMistura(input: {
  ingredientes: IngredienteEntrada[];
  quantidadeFinalKg: number;
  /** §20: custo diario por animal, quando o produtor disser o consumo. */
  consumoKgDiaPorAnimal?: number;
  /** §41: "isso corresponde a N sacas". */
  pesoSacaKg?: number;
}): CalcResult<{
  ingredientes: IngredienteCalculado[];
  quantidadeFinalKg: number;
  custoTotal: number | null;
  custoPorKg: number | null;
  custoPorSaca: number | null;
  custoDiarioPorAnimal: number | null;
  sacas: number | null;
}> {
  const { ingredientes, quantidadeFinalKg, consumoKgDiaPorAnimal, pesoSacaKg } = input;

  if (ingredientes.length === 0) {
    return { ok: false, error: "Informe os ingredientes da receita." };
  }
  if (!isPositiveNumber(quantidadeFinalKg)) {
    return { ok: false, error: "Quanto voce quer fazer deve ser maior que zero." };
  }

  for (const ingrediente of ingredientes) {
    if (!ingrediente.nome.trim()) {
      return { ok: false, error: "Todo ingrediente precisa de nome." };
    }
    if (!isPositiveNumber(ingrediente.percentual)) {
      return {
        ok: false,
        error: `Informe a porcentagem de ${ingrediente.nome}.`,
      };
    }
    if (ingrediente.precoPorKg !== undefined && ingrediente.precoPorKg < 0) {
      return { ok: false, error: `Preco de ${ingrediente.nome} nao pode ser negativo.` };
    }
  }

  const soma = ingredientes.reduce((total, i) => total + i.percentual, 0);
  const diferenca = round(100 - soma, 2);
  if (Math.abs(diferenca) > TOLERANCIA_PERCENTUAL) {
    /*
     * A recusa diz o TAMANHO do buraco, e nao so que a soma esta errada: quem
     * digitou 65 + 29 + 5 precisa saber que falta 1%, senao confere os tres
     * numeros de novo procurando o erro.
     */
    return {
      ok: false,
      error:
        diferenca > 0
          ? `Os ingredientes somam ${round(soma, 2)}%, faltam ${diferenca}% para fechar a receita.`
          : `Os ingredientes somam ${round(soma, 2)}%, ${Math.abs(diferenca)}% a mais do que a receita comporta.`,
    };
  }

  const calculados: IngredienteCalculado[] = ingredientes.map((ingrediente) => {
    const quantidadeKg = round((quantidadeFinalKg * ingrediente.percentual) / 100, 2);
    return {
      nome: ingrediente.nome.trim(),
      percentual: ingrediente.percentual,
      quantidadeKg,
      custo:
        ingrediente.precoPorKg !== undefined
          ? round(quantidadeKg * ingrediente.precoPorKg, 2)
          : null,
    };
  });

  /*
   * Custo so aparece quando TODO ingrediente tem preco. Com um preco faltando,
   * o total sairia menor que o real e passaria por completo: e melhor nao
   * responder do que responder barato demais.
   */
  const todosComPreco = calculados.every((i) => i.custo !== null);
  const custoTotal = todosComPreco
    ? round(
        calculados.reduce((total, i) => total + (i.custo ?? 0), 0),
        2,
      )
    : null;

  const sacas =
    pesoSacaKg !== undefined && isPositiveNumber(pesoSacaKg)
      ? round(quantidadeFinalKg / pesoSacaKg, 2)
      : null;

  return {
    ok: true,
    data: {
      ingredientes: calculados,
      quantidadeFinalKg: round(quantidadeFinalKg, 2),
      custoTotal,
      custoPorKg: custoTotal !== null ? round(custoTotal / quantidadeFinalKg, 4) : null,
      custoPorSaca:
        custoTotal !== null && sacas !== null && sacas > 0
          ? round(custoTotal / sacas, 2)
          : null,
      custoDiarioPorAnimal:
        custoTotal !== null &&
        consumoKgDiaPorAnimal !== undefined &&
        isPositiveNumber(consumoKgDiaPorAnimal)
          ? round((custoTotal / quantidadeFinalKg) * consumoKgDiaPorAnimal, 2)
          : null,
      sacas,
    },
  };
}

/**
 * Receitas prontas (§21), em constante de codigo porque a decisao 17 mantem as
 * referencias tecnicas assim: "atualizavel pela equipe TIBE" e satisfeito por
 * um deploy.
 *
 * ⚠️ Sao PONTOS DE PARTIDA de uso corrente, nao formulacao validada para um
 * rebanho especifico. O §21 pede que toda receita oficial seja previamente
 * validada, e ate que a equipe TIBE valide as suas, estas tres ficam com o
 * aviso de que a proporcao final e do tecnico do produtor.
 */
export const RECEITAS_PADRAO: { nome: string; ingredientes: { nome: string; percentual: number }[] }[] =
  [
    {
      nome: "Racao de terminacao (exemplo do §18)",
      ingredientes: [
        { nome: "Milho", percentual: 65 },
        { nome: "Farelo de soja", percentual: 29 },
        { nome: "Nucleo", percentual: 6 },
      ],
    },
    {
      nome: "Sal proteinado de seca",
      ingredientes: [
        { nome: "Farelo de soja", percentual: 40 },
        { nome: "Milho", percentual: 30 },
        { nome: "Sal mineral", percentual: 20 },
        { nome: "Ureia", percentual: 10 },
      ],
    },
    {
      nome: "Mistura simples de cocho",
      ingredientes: [
        { nome: "Milho", percentual: 70 },
        { nome: "Farelo de soja", percentual: 30 },
      ],
    },
  ];
