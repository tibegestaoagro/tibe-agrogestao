import type { Transporte } from "@/lib/agente/modelo";

/**
 * Embrulha um transporte para esperar e repetir em HTTP 429 (limite de tokens
 * por minuto da CONTA OpenAI, não do modelo): sem isso, uma rodada com
 * concorrência estoura o limite e reprova o modelo por um teto que não é dele.
 */

const TENTATIVAS_PADRAO = 8;
const TETO_ESPERA_MS = 30_000;

function calcularEspera(json: unknown, tentativa: number): number {
  const mensagem = (json as { error?: { message?: string } } | null)?.error?.message ?? "";
  // A OpenAI manda "Please try again in 1.234s" ou "...in 250ms".
  const casado = /in\s+(\d+(?:\.\d+)?)(ms|s)\b/i.exec(mensagem);
  if (casado) {
    const valor = Number(casado[1]);
    return (casado[2].toLowerCase() === "ms" ? valor : valor * 1000) + 250;
  }
  return Math.min(TETO_ESPERA_MS, 1000 * 2 ** (tentativa - 1));
}

export function comEsperaEmLimite(
  enviar: Transporte,
  opcoes?: { tentativas?: number; esperar?: (ms: number) => Promise<void>; aoEsperar?: (ms: number, tentativa: number) => void },
): Transporte {
  const tentativas = opcoes?.tentativas ?? TENTATIVAS_PADRAO;
  const esperar = opcoes?.esperar ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return async (corpo) => {
    let resposta = await enviar(corpo);
    let tentativa = 0;
    while (resposta.status === 429 && tentativa < tentativas) {
      tentativa += 1;
      const espera = calcularEspera(resposta.json, tentativa);
      opcoes?.aoEsperar?.(espera, tentativa);
      await esperar(espera);
      resposta = await enviar(corpo);
    }
    return resposta;
  };
}
