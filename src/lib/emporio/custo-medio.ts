/**
 * Custo médio ponderado móvel do Meu Empório (Módulo 39, Q64).
 *
 * Função PURA: recebe as movimentações de um produto numa loja e devolve saldo,
 * custo médio e a marca de estimado. Nada aqui é gravado: o que fica gravado é
 * o `unit_cost` de cada movimentação, como registro do momento.
 *
 * Regras:
 * - ordem de `occurred_at`, desempate por `created_at`;
 * - entrada com custo refaz a média ponderada (se o saldo antes era zero ou
 *   negativo, a média passa a ser o custo da entrada);
 * - entrada sem custo soma a quantidade pela média vigente (a média não muda)
 *   e marca `estimado`;
 * - saída mantém a média.
 *
 * Arredonda-se só na apresentação: o custo médio sai sem arredondar. O saldo é
 * fixado em 3 casas a cada passo (a coluna é Decimal(14,3)), só para a soma de
 * ponto flutuante não deixar resíduo.
 */

export type MovimentoDeCusto = {
  movement_type: string;
  /** Sempre positiva, como no livro-razão. O sinal vem de `deltaDaLoja`. */
  quantity: number;
  previous_balance?: number | null;
  corrected_balance?: number | null;
  unit_cost?: number | null;
  occurred_at: Date | string;
  created_at?: Date | string;
  /** Movimentação cancelada não conta, nem no saldo nem na média. */
  canceled_at?: Date | string | null;
};

export type ResultadoCusto = {
  saldo: number;
  custo_medio: number | null;
  estimado: boolean;
};

const SAIDAS_DA_LOJA: ReadonlySet<string> = new Set([
  "venda",
  "utilizacao",
  "permuta_saida",
  "perda",
  // F2b: a transferência sai da origem no envio; o componente sai na produção.
  "transferencia_saida",
  "producao_consumo",
]);

/**
 * Quanto a movimentação mexe no saldo, COM sinal. O ajuste vem dos dois saldos
 * guardados (corrigido menos anterior), igual ao estoque da fazenda. `perda` é
 * saída: o `deltaDoMovimento` da fazenda não a conhece, por isso a loja tem a
 * sua.
 */
export function deltaDaLoja(m: Pick<MovimentoDeCusto, "movement_type" | "quantity" | "previous_balance" | "corrected_balance">): number {
  if (m.movement_type === "ajuste") {
    const antes = m.previous_balance ?? 0;
    const depois = m.corrected_balance ?? antes;
    return depois - antes;
  }
  return SAIDAS_DA_LOJA.has(m.movement_type) ? -m.quantity : m.quantity;
}

const arred3 = (n: number) => Math.round(n * 1000) / 1000;
const tempo = (d: Date | string | undefined) => (d === undefined ? 0 : new Date(d).getTime());

export function custoMedio(movimentos: MovimentoDeCusto[]): ResultadoCusto {
  const ordenados = movimentos
    .filter((m) => m.canceled_at == null)
    .sort(
    (a, b) => tempo(a.occurred_at) - tempo(b.occurred_at) || tempo(a.created_at) - tempo(b.created_at),
  );

  let saldo = 0;
  let medio: number | null = null;
  let estimado = false;

  for (const m of ordenados) {
    const d = deltaDaLoja(m);
    if (d === 0) continue;
    if (d > 0) {
      const custo = m.unit_cost ?? null;
      if (custo === null) {
        estimado = true;
      } else if (saldo > 0 && medio !== null) {
        medio = (saldo * medio + d * custo) / (saldo + d);
      } else {
        medio = custo;
      }
    }
    saldo = arred3(saldo + d);
  }

  if (saldo > 0 && medio === null) estimado = true;
  return { saldo, custo_medio: medio, estimado };
}
