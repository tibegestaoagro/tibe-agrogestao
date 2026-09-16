import { lerNumeroBr } from "@/lib/numero-br";
import type { CampoDef } from "./intencoes";

/**
 * Conferência anti-alucinação: um campo `numero` só sobrevive se o modelo
 * devolveu um número que existe DE FATO no trecho, como número (não como
 * substring de dígito: "200" não pode casar com o "1200" de "1200 kg", nem
 * "1200" com o "12,00" de "paguei 12,00", que é cem vezes menor).
 *
 * Valor por extenso ("sessenta mil"), sem nenhum dígito, não tem o que
 * conferir e é sempre mantido.
 */

/**
 * O registro manda o modelo converter por extenso ("duas vira 2"), então a palavra também é número do texto.
 * Lê composto ("vinte e dois", "cento e trinta mil", "dois mil e quinhentos", "um milhão e duzentos mil"),
 * unindo palavras vizinhas com "e" só quando as duas pontas são número; qualquer outra palavra no meio
 * ("vinte bois... sessenta mil") corta a sequência em dois números separados.
 * ponytail: sem fração ("meio quilo") e sem ordinal ("vigésimo"); o valor fica de fora e o handler pergunta.
 * Limite conhecido: "um"/"uma" também é artigo, então um 1 inventado passa em "usei uma parte do sal". Mantido porque
 * "usei uma saca de sal" é o exemplo do documento do cliente (§18.4); o conjunto de avaliação da Fase 3 mede o caso.
 */
const UNIDADES: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
const DEZ_A_DEZENOVE: Record<string, number> = {
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
};
const DEZENAS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const CENTENAS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};
const ESCALAS: Record<string, number> = { mil: 1_000, milhao: 1_000_000, milhoes: 1_000_000 };

function valorDaPalavra(palavra: string): { valor: number; escala?: number } | null {
  if (Object.hasOwn(UNIDADES, palavra)) return { valor: UNIDADES[palavra] };
  if (Object.hasOwn(DEZ_A_DEZENOVE, palavra)) return { valor: DEZ_A_DEZENOVE[palavra] };
  if (Object.hasOwn(DEZENAS, palavra)) return { valor: DEZENAS[palavra] };
  if (Object.hasOwn(CENTENAS, palavra)) return { valor: CENTENAS[palavra] };
  if (Object.hasOwn(ESCALAS, palavra)) return { valor: 0, escala: ESCALAS[palavra] };
  return null;
}

function numerosPorExtenso(texto: string): number[] {
  const palavras = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z]+/);
  const resultados: number[] = [];
  let i = 0;
  while (i < palavras.length) {
    if (palavras[i] === "meia" && palavras[i + 1] === "duzia") {
      resultados.push(6);
      i += 2;
      continue;
    }
    if (palavras[i] === "duzia") {
      resultados.push(12);
      i += 1;
      continue;
    }
    if (!valorDaPalavra(palavras[i])) {
      i += 1;
      continue;
    }

    // sequência composta: junta o que é número, e só atravessa um "e" quando os dois lados também são número.
    let j = i;
    let total = 0;
    let grupoAtual = 0;
    while (j < palavras.length) {
      if (palavras[j] === "e") {
        if (!valorDaPalavra(palavras[j + 1])) break;
        j++;
        continue;
      }
      const parte = valorDaPalavra(palavras[j]);
      if (!parte) break;
      if (parte.escala) {
        if (grupoAtual > 0) resultados.push(grupoAtual); // "sessenta mil": 60 também é aceito, sem o multiplicador.
        grupoAtual = (grupoAtual === 0 ? 1 : grupoAtual) * parte.escala;
        total += grupoAtual;
        grupoAtual = 0;
      } else {
        grupoAtual += parte.valor;
      }
      j++;
    }
    resultados.push(total + grupoAtual);
    i = j;
  }
  return resultados;
}

/** Todo número que aparece no texto, lido como o produtor escreve (BR): "1.200" é 1200, "12,00" é 12, "60 mil" é 60000 (e 60 também entra, sem o multiplicador), "duas" é 2. */
function numerosDoTexto(texto: string): number[] {
  const resultados: number[] = numerosPorExtenso(texto);
  const tokenNumerico = /\d+(?:[.,]\d+)*/g;
  let m: RegExpExecArray | null;
  while ((m = tokenNumerico.exec(texto))) {
    const valorBase = lerNumeroBr(m[0]);
    if (valorBase === null) continue;
    const resto = texto.slice(m.index + m[0].length);
    const multiplicador = /^\s*milh(ao|ão|oes|ões)\b/i.test(resto) ? 1_000_000 : /^\s*mil\b/i.test(resto) ? 1_000 : null;
    if (multiplicador) resultados.push(valorBase * multiplicador);
    resultados.push(valorBase);
  }
  return resultados;
}

function apareceComoNumero(valor: unknown, texto: string): boolean {
  if (typeof valor === "number") return numerosDoTexto(texto).includes(valor);

  const bruto = String(valor);
  if (!/\d/.test(bruto)) return true; // por extenso, sem dígito: mantém

  const comoNumero = lerNumeroBr(bruto);
  if (comoNumero !== null) return numerosDoTexto(texto).includes(comoNumero);

  // lerNumeroBr não deu conta do formato: cai para o grupo de dígitos cru, com fronteira (\d+ já é o maior grupo contíguo).
  const gruposDoValor: string[] = bruto.match(/\d+/g) ?? [];
  const gruposDoTexto: string[] = texto.match(/\d+/g) ?? [];
  return gruposDoValor.every((grupo) => gruposDoTexto.includes(grupo));
}

export function conferirTrechoLiteral(
  parameters: Record<string, unknown>,
  texto: string,
  campos: CampoDef[],
): { parameters: Record<string, unknown>; removidos: string[] } {
  const resultado: Record<string, unknown> = { ...parameters };
  const removidos: string[] = [];

  for (const campo of campos) {
    if (!(campo.nome in resultado)) continue;

    if (campo.tipo === "numero") {
      if (!apareceComoNumero(resultado[campo.nome], texto)) {
        delete resultado[campo.nome];
        removidos.push(campo.nome);
      }
      continue;
    }

    if (campo.tipo === "lista" && campo.itens && Array.isArray(resultado[campo.nome])) {
      const itens = (resultado[campo.nome] as Record<string, unknown>[])
        .map((item) => {
          const itemLimpo = { ...item };
          for (const subcampo of campo.itens!) {
            if (subcampo.tipo === "numero" && subcampo.nome in itemLimpo) {
              if (!apareceComoNumero(itemLimpo[subcampo.nome], texto)) {
                delete itemLimpo[subcampo.nome];
                removidos.push(`${campo.nome}.${subcampo.nome}`);
              }
            }
          }
          return itemLimpo;
        })
        // item que perdeu o único campo que tinha sai da lista; lista que fica vazia sai de `parameters`.
        .filter((item) => Object.keys(item).length > 0);

      if (itens.length > 0) resultado[campo.nome] = itens;
      else delete resultado[campo.nome];
    }
  }

  return { parameters: resultado, removidos };
}
