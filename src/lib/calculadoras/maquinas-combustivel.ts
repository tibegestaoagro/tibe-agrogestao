import { type CalcResult, isPositiveNumber, round } from "./shared";

export type ModoConsumo = "por_area" | "por_hora";

export const MODOS_CONSUMO: { value: ModoConsumo; label: string }[] = [
  { value: "por_area", label: "Consumo informado em litros por hectare" },
  { value: "por_hora", label: "Consumo informado em litros por hora" },
];

/**
 * Maquinas e Combustivel: total de combustivel e custo estimado, a partir
 * do consumo que o PROPRIO usuario informa (do manual da maquina ou de
 * medicao propria em campo) e da area ou das horas trabalhadas.
 *
 * A ferramenta NAO assume nenhum consumo padrao de fabrica: consumo de
 * combustivel varia demais por marca, modelo, implemento acoplado, tipo de
 * solo e regulagem para publicar um numero universal como referencia
 * tecnica. So multiplica o consumo informado pela area ou pelas horas, e
 * converte em custo se um preco por litro for informado.
 *
 * Como contexto informativo (nao normativo, so para o usuario ter uma nocao
 * de faixa plausivel): reportagem tecnica cita consumo tipico de tratores
 * agricolas brasileiros entre aproximadamente 13 e 35 litros por hora,
 * crescendo com a potencia (CV) da maquina. Fonte: Revista Cultivar,
 * "Quanto gasta seu trator"
 * (https://revistacultivar.com.br/artigos/quanto-gasta-seu-trator).
 *
 * Confianca: ALTA para o calculo (multiplicacao e conversao de unidade
 * simples, sem nenhum coeficiente agronomico ou zootecnico embutido): o
 * unico numero que define o resultado e o consumo que o proprio usuario
 * digita, vindo da maquina real dele.
 */
export function calcularCombustivel(input: {
  modo: ModoConsumo;
  consumoLitros: number;
  quantidade: number;
  precoPorLitro?: number;
  /** §31: o operador e os outros custos, que fazem o custo da OPERACAO. */
  valorOperadorPorHora?: number;
  /** So no modo por area: no modo por hora a quantidade ja sao as horas. */
  horasTrabalhadas?: number;
  outrosCustos?: number;
}): CalcResult<{
  litrosTotais: number;
  custoCombustivel: number | null;
  custoOperador: number | null;
  custoTotal: number | null;
  custoPorHora: number | null;
}> {
  const {
    modo,
    consumoLitros,
    quantidade,
    precoPorLitro,
    valorOperadorPorHora,
    horasTrabalhadas,
    outrosCustos,
  } = input;

  if (modo !== "por_area" && modo !== "por_hora") {
    return { ok: false, error: "Modo de consumo invalido." };
  }
  if (!isPositiveNumber(consumoLitros)) {
    return { ok: false, error: "Consumo (litros) deve ser maior que zero." };
  }
  if (!isPositiveNumber(quantidade)) {
    return {
      ok: false,
      error:
        modo === "por_area"
          ? "Area trabalhada deve ser maior que zero."
          : "Horas trabalhadas devem ser maior que zero.",
    };
  }

  const litrosTotais = consumoLitros * quantidade;
  const custoCombustivel =
    precoPorLitro !== undefined && isPositiveNumber(precoPorLitro)
      ? round(litrosTotais * precoPorLitro, 2)
      : null;

  const custoOperador =
    valorOperadorPorHora !== undefined && horasTrabalhadas !== undefined
      ? round(valorOperadorPorHora * horasTrabalhadas, 2)
      : /*
         * No modo por hora a quantidade JA e o numero de horas, entao pedir o
         * mesmo numero de novo seria perguntar duas vezes a mesma coisa.
         */
        valorOperadorPorHora !== undefined && modo === "por_hora"
        ? round(valorOperadorPorHora * quantidade, 2)
        : null;

  const custoTotal =
    custoCombustivel !== null || custoOperador !== null || outrosCustos !== undefined
      ? round((custoCombustivel ?? 0) + (custoOperador ?? 0) + (outrosCustos ?? 0), 2)
      : null;

  const horas = modo === "por_hora" ? quantidade : horasTrabalhadas;

  return {
    ok: true,
    data: {
      litrosTotais: round(litrosTotais, 1),
      custoCombustivel,
      custoOperador,
      custoTotal,
      custoPorHora:
        custoTotal !== null && horas !== undefined && isPositiveNumber(horas)
          ? round(custoTotal / horas, 2)
          : null,
    },
  };
}
