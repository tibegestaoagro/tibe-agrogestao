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
 * ponytail: só de um a vinte, dúzia e meia dúzia; "trinta", "cem" e "vinte mil" por extenso ficam de fora (o valor é removido e o handler pergunta). Ampliar a tabela quando aparecer em conversa real.
 * Limite conhecido: "um"/"uma" também é artigo, então um 1 inventado passa em "usei uma parte do sal". Mantido porque
 * "usei uma saca de sal" é o exemplo do documento do cliente (§18.4); o conjunto de avaliação da Fase 3 mede o caso.
 */
const POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, duzia: 12,
};

function numerosPorExtenso(texto: string): number[] {
  const palavras = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z]+/);
  const resultados: number[] = [];
  for (let i = 0; i < palavras.length; i++) {
    if (palavras[i] === "meia" && palavras[i + 1] === "duzia") {
      resultados.push(6);
      i++;
    } else if (Object.hasOwn(POR_EXTENSO, palavras[i])) {
      resultados.push(POR_EXTENSO[palavras[i]]);
    }
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
