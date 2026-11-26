import { pode, type PapelContexto } from "@/lib/emporio/papel";

/**
 * Meu Empório, onda 2 da UX: o Início. Parte pura da leitura (tipos, colunas por
 * papel, ordem dos avisos e a conta da comparação do mês). A leitura em si, com
 * banco, está em `src/lib/actions/emporio-inicio.ts`.
 */

export type ColunaDoAviso = "gestor" | "dinheiro";

export type AvisoDoInicio = {
  chave: string;
  coluna: ColunaDoAviso;
  quantidade: number;
  valor: number | null;
  texto: string;
  href: string;
  /** O rótulo do link: "Ver", "Cobrar", "Pagar", "Fechar", "Conferir". */
  acao: string;
};

export type NumerosDoDia = {
  vendas_hoje: { total: number; quantidade: number };
  vendas_mes: { total: number; variacao_pct: number | null };
  entra_hoje: { total: number; detalhe: string } | null;
  sai_hoje: { total: number; quantidade: number } | null;
};

/** A ordem dos avisos no Início (a da tabela do desenho). */
export const ORDEM_DOS_AVISOS = [
  "estoque_baixo",
  "orcamento_vencendo",
  "caixa_de_ontem",
  "fiado_vencido",
  "pagar_hoje",
  "aprovacao_pendente",
  "boleto_cheque_vencido",
  "conferir_banco",
] as const;

/** Quantos dias à frente um orçamento em aberto conta como "vencendo". */
export const DIAS_DO_ORCAMENTO_VENCENDO = 3;

/**
 * Quais colunas de aviso o papel enxerga. O `gestor` passa se ele é gestor em
 * alguma loja do alcance (Dono e Gerente geral passam sempre); o `dinheiro` é a
 * ação `dinheiro`. Quem tem as duas vê as duas.
 */
export function colunasDoInicio(c: PapelContexto): { gestor: boolean; dinheiro: boolean } {
  const gestor =
    c.papel === "dono" || c.papel === "gerente_geral"
      ? true
      : c.lojas
        ? [...c.lojas].some((id) => pode(c, "gestor_da_loja", id))
        : pode(c, "gestor_da_loja");
  return { gestor, dinheiro: pode(c, "dinheiro") };
}

/** Variação em % do mês até hoje sobre o mesmo trecho do anterior; nulo com o anterior em zero. */
export function variacaoDoMes(atualCent: number, anteriorCent: number): number | null {
  if (!(anteriorCent > 0)) return null;
  return Math.round(((atualCent - anteriorCent) / anteriorCent) * 100);
}

/** Ordena os avisos pela ordem do desenho (estável: a ordem de entrada decide dentro da mesma chave). */
export function ordenarAvisos(avisos: AvisoDoInicio[]): AvisoDoInicio[] {
  const pos = (chave: string) => ORDEM_DOS_AVISOS.indexOf(chave as (typeof ORDEM_DOS_AVISOS)[number]);
  return avisos
    .map((a, i) => ({ a, i }))
    .sort((x, y) => pos(x.a.chave) - pos(y.a.chave) || x.i - y.i)
    .map((x) => x.a);
}

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export const reaisTexto = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
