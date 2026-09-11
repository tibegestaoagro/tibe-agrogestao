import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Conversoes rurais (§35 e §36 do documento do cliente): area, massa, volume
 * e comprimento, para eliminar as contas simples que geram duvida.
 *
 * ⚠️ ALQUEIRE NAO E UMA UNIDADE SO, e e por isso que esta funcao nunca aceita
 * "alqueire" sem sobrenome. O paulista tem 24.200 m2, o mineiro (tambem
 * chamado geometrico) 48.400 m2, e o do norte 27.225 m2: a diferenca entre o
 * primeiro e o segundo e de 100%, entao assumir um deles significa errar a
 * area da fazenda pela metade ou pelo dobro. O §35 manda "sempre identificar
 * qual medida esta sendo utilizada", e o jeito de obedecer e nao ter default.
 *
 * ⚠️ SACA DEPENDE DO QUE ESTA DENTRO. Saca de semente costuma ter 10 kg e a de
 * adubo 50 kg, com a mesma palavra. Por isso o peso da saca e ENTRADA, nunca
 * constante: converter para saca sem informar o peso e recusado.
 *
 * Confianca: ALTA. Sao equivalencias legais e de uso consagrado, nao
 * estimativa tecnica. A arroba brasileira de 15 kg e a unidade de comercio de
 * boi gordo usada em todo o pais.
 */

export type Dimensao = "area" | "massa" | "volume" | "comprimento";

export type Unidade = {
  /** Nome que aparece na tela e na resposta do WhatsApp. */
  label: string;
  dimensao: Dimensao;
  /**
   * Quanto vale 1 desta unidade na unidade BASE da dimensao (metro quadrado,
   * quilograma, litro e metro). `null` quer dizer que o fator e informado pelo
   * produtor, o que hoje vale so para a saca.
   */
  emBase: number | null;
};

export const UNIDADES = {
  hectare: { label: "hectare", dimensao: "area", emBase: 10_000 },
  metro_quadrado: { label: "metro quadrado", dimensao: "area", emBase: 1 },
  alqueire_paulista: { label: "alqueire paulista", dimensao: "area", emBase: 24_200 },
  alqueire_mineiro: { label: "alqueire mineiro (geometrico)", dimensao: "area", emBase: 48_400 },
  alqueire_do_norte: { label: "alqueire do norte", dimensao: "area", emBase: 27_225 },

  quilograma: { label: "quilograma", dimensao: "massa", emBase: 1 },
  tonelada: { label: "tonelada", dimensao: "massa", emBase: 1_000 },
  arroba: { label: "arroba", dimensao: "massa", emBase: 15 },
  grama: { label: "grama", dimensao: "massa", emBase: 0.001 },
  saca: { label: "saca", dimensao: "massa", emBase: null },

  litro: { label: "litro", dimensao: "volume", emBase: 1 },
  metro_cubico: { label: "metro cubico", dimensao: "volume", emBase: 1_000 },

  metro: { label: "metro", dimensao: "comprimento", emBase: 1 },
  quilometro: { label: "quilometro", dimensao: "comprimento", emBase: 1_000 },
} as const satisfies Record<string, Unidade>;

export type UnidadeKey = keyof typeof UNIDADES;

export const UNIDADES_POR_DIMENSAO: Record<Dimensao, UnidadeKey[]> = {
  area: ["hectare", "metro_quadrado", "alqueire_paulista", "alqueire_mineiro", "alqueire_do_norte"],
  massa: ["quilograma", "tonelada", "arroba", "grama", "saca"],
  volume: ["litro", "metro_cubico"],
  comprimento: ["metro", "quilometro"],
};

/**
 * Quanto vale 1 unidade na base, resolvendo a saca pelo peso informado.
 */
function fatorDe(chave: UnidadeKey, pesoSacaKg?: number): number | null {
  const unidade = UNIDADES[chave];
  if (unidade.emBase !== null) return unidade.emBase;
  return pesoSacaKg !== undefined && isPositiveNumber(pesoSacaKg) ? pesoSacaKg : null;
}

export function converter(input: {
  valor: number;
  de: UnidadeKey;
  para: UnidadeKey;
  /** Obrigatorio quando a saca aparece de um dos lados. */
  pesoSacaKg?: number;
}): CalcResult<{
  valorConvertido: number;
  deLabel: string;
  paraLabel: string;
}> {
  const { valor, de, para, pesoSacaKg } = input;

  if (!Number.isFinite(valor) || valor < 0) {
    return { ok: false, error: "Informe um valor a converter." };
  }

  const origem = UNIDADES[de];
  const destino = UNIDADES[para];

  if (origem.dimensao !== destino.dimensao) {
    return {
      ok: false,
      error: `Nao da para converter ${origem.label} em ${destino.label}: sao medidas de coisas diferentes.`,
    };
  }

  const fatorOrigem = fatorDe(de, pesoSacaKg);
  const fatorDestino = fatorDe(para, pesoSacaKg);
  if (fatorOrigem === null || fatorDestino === null) {
    return { ok: false, error: "Diga quantos quilos tem a saca." };
  }

  return {
    ok: true,
    data: {
      valorConvertido: round((valor * fatorOrigem) / fatorDestino, 4),
      deLabel: origem.label,
      paraLabel: destino.label,
    },
  };
}
