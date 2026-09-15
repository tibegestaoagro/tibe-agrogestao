import type { CampoDef } from "./intencoes";

/**
 * Conferência anti-alucinação: um campo `numero` só sobrevive se o dígito que
 * o modelo devolveu aparece de fato no trecho da mensagem. Valor por extenso
 * ("sessenta mil") não tem dígito para conferir, então é mantido por padrão.
 */

function apenasDigitos(valor: unknown): string {
  return String(valor).replace(/\D/g, "");
}

/** Tira o separador de milhar entre dígitos ("1.200" e "1,200" viram "1200"), sem mexer no resto do texto. */
function semSeparadorDeMilhar(texto: string): string {
  return texto.replace(/(?<=\d)[.,](?=\d)/g, "");
}

function apareceNoTrecho(valor: unknown, texto: string): boolean {
  const digitos = apenasDigitos(valor);
  if (!digitos) return true;
  return semSeparadorDeMilhar(texto).includes(digitos);
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
      if (!apareceNoTrecho(resultado[campo.nome], texto)) {
        delete resultado[campo.nome];
        removidos.push(campo.nome);
      }
      continue;
    }

    if (campo.tipo === "lista" && campo.itens && Array.isArray(resultado[campo.nome])) {
      const itens = (resultado[campo.nome] as Record<string, unknown>[]).map((item) => {
        const itemLimpo = { ...item };
        for (const subcampo of campo.itens!) {
          if (subcampo.tipo === "numero" && subcampo.nome in itemLimpo) {
            if (!apareceNoTrecho(itemLimpo[subcampo.nome], texto)) {
              delete itemLimpo[subcampo.nome];
              removidos.push(`${campo.nome}.${subcampo.nome}`);
            }
          }
        }
        return itemLimpo;
      });
      resultado[campo.nome] = itens;
    }
  }

  return { parameters: resultado, removidos };
}
