import { type CalcResult, isPositiveNumber } from "./shared";

/**
 * Mao de Obra: quantos funcionarios (vaqueiros/tratadores) sao necessarios
 * para tocar um rebanho, a partir de uma capacidade de manejo por pessoa
 * que o PROPRIO usuario informa.
 *
 * A ferramenta so faz a conta (rebanho / capacidade por pessoa, arredondada
 * para cima): ela NAO assume nenhuma capacidade padrao por conta propria,
 * porque nao existe um numero fixo e consensual na literatura tecnica
 * brasileira para "cabecas por funcionario" (varia mais de 10x entre
 * sistemas de producao, ver fontes abaixo).
 *
 * Fontes (contexto informativo, NAO norma tecnica validada por instituto de
 * pesquisa): Giro do Boi / Canal Rural, "Dimensionando a equipe: saiba a
 * quantidade ideal de gado por vaqueiro na fazenda"
 * (https://girodoboi.canalrural.com.br/pecuaria/dimensionando-a-equipe-saiba-a-quantidade-ideal-de-gado-por-vaqueiro-na-fazenda/),
 * que cita faixas de aproximadamente 100-200 cabecas/pessoa em manejo
 * tradicional manual, 700-1.200 na cria, 1.500-3.000 na recria e ate 3.500
 * na terminacao a pasto extensiva/mecanizada; Acrissul, materia
 * equivalente.
 *
 * Confianca: MEDIA. A conta em si (divisao com arredondamento para cima)
 * esta correta por definicao: nao ha erro matematico possivel. O que e
 * fraco e a referencia de "cabecas por pessoa": nao existe uma fonte
 * Embrapa/zootecnica consolidada para isso, so reportagem de imprensa
 * especializada com faixas muito amplas. Por isso o campo de capacidade
 * por funcionario e OBRIGATORIO e sem valor padrao preenchido: o usuario
 * deve informar a capacidade real da sua operacao (as faixas acima servem
 * so como ponto de partida grosseiro). Recomenda-se revisao de um
 * consultor de gestao rural antes de usar isso como base de contratacao
 * real.
 */
export function calcularMaoDeObra(input: {
  numeroAnimais: number;
  capacidadePorFuncionario: number;
}): CalcResult<{
  funcionariosNecessarios: number;
  cabecasPorFuncionarioInformada: number;
}> {
  const { numeroAnimais, capacidadePorFuncionario } = input;

  if (!isPositiveNumber(numeroAnimais)) {
    return { ok: false, error: "Numero de animais deve ser maior que zero." };
  }
  if (!isPositiveNumber(capacidadePorFuncionario)) {
    return {
      ok: false,
      error: "Informe quantas cabecas um funcionario da sua operacao consegue tocar (nao ha valor padrao).",
    };
  }

  const funcionariosNecessarios = Math.ceil(numeroAnimais / capacidadePorFuncionario);

  return {
    ok: true,
    data: { funcionariosNecessarios, cabecasPorFuncionarioInformada: capacidadePorFuncionario },
  };
}
