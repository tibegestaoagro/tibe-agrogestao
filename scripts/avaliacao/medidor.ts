import fs from "node:fs";
import path from "node:path";
import { transporteHttp, type Transporte } from "@/lib/agente/modelo";

/** US$ por 1 milhão de tokens, página oficial de preços da OpenAI em 15/09/2026. */
export const PRECOS: Record<string, { entrada: number; cache: number; saida: number }> = {
  "gpt-4o-mini": { entrada: 0.15, cache: 0.075, saida: 0.6 },
  "gpt-4.1-mini": { entrada: 0.4, cache: 0.1, saida: 1.6 },
  "gpt-5-nano": { entrada: 0.05, cache: 0.005, saida: 0.4 },
  "gpt-5-mini": { entrada: 0.25, cache: 0.025, saida: 2 },
  "gpt-5.6-luna": { entrada: 0.2, cache: 0.02, saida: 1.2 },
  "gpt-5.6-terra": { entrada: 2, cache: 0.2, saida: 12 },
};

/** Decisão do usuário, 15/09: somando todas as rodadas. */
export const TETO_USD = 30;

export type Uso = { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };

export function custoDaChamada(modelo: string, uso: Uso): number {
  const preco = PRECOS[modelo];
  if (!preco) throw new Error(`modelo sem preço na tabela da avaliação: ${modelo}`);
  const cache = uso.prompt_tokens_details?.cached_tokens ?? 0;
  const entrada = Math.max(0, (uso.prompt_tokens ?? 0) - cache);
  // Tokens de raciocínio vêm dentro de completion_tokens e são cobrados como saída.
  return (entrada * preco.entrada + cache * preco.cache + (uso.completion_tokens ?? 0) * preco.saida) / 1_000_000;
}

export class OrcamentoEsgotado extends Error {
  constructor(total: number, teto: number) {
    super(`orçamento da avaliação esgotado: US$ ${total.toFixed(2)} de US$ ${teto}`);
    this.name = "OrcamentoEsgotado";
  }
}

export type Medidor = { transporte: Transporte; gastoTotal(): number; chamadas(): number };

/**
 * O acumulado vive em `resultados/gasto.json`, e `resultados/` está no
 * `.gitignore`: o teto não viaja entre máquinas, e apagar a pasta zera o que
 * já foi gasto. Antes de rodar, confira o valor impresso pelo `rodar.ts`.
 */

export function criarMedidor(opcoes: { arquivo: string; teto?: number; enviar?: Transporte }): Medidor {
  const teto = opcoes.teto ?? TETO_USD;
  const enviar = opcoes.enviar ?? transporteHttp;
  let total = fs.existsSync(opcoes.arquivo) ? Number(JSON.parse(fs.readFileSync(opcoes.arquivo, "utf8")).total_usd) || 0 : 0;
  let chamadas = 0;

  const gravar = () => {
    fs.mkdirSync(path.dirname(opcoes.arquivo), { recursive: true });
    fs.writeFileSync(opcoes.arquivo, JSON.stringify({ total_usd: total, atualizado_em: new Date().toISOString() }, null, 2));
  };

  return {
    transporte: async (corpo) => {
      if (total >= teto) throw new OrcamentoEsgotado(total, teto);
      const modelo = String(corpo.model);
      if (!PRECOS[modelo]) throw new Error(`modelo sem preço na tabela da avaliação: ${modelo}`);
      const resposta = await enviar(corpo);
      chamadas += 1;
      const uso = (resposta.json as { usage?: Uso } | null)?.usage;
      if (uso) {
        total += custoDaChamada(modelo, uso);
        gravar();
      }
      return resposta;
    },
    gastoTotal: () => total,
    chamadas: () => chamadas,
  };
}
