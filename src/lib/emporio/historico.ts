import type { Prisma } from "@/generated/prisma/client";
import { scoped } from "@/lib/prisma";

/**
 * Meu Empório, F6b (Q134): o Histórico. Só de acréscimo: toda escrita do
 * Empório e da Equipe grava UMA linha aqui, na mesma transação da mudança.
 * Este arquivo tem o catálogo fixo das ações, o registro e os formatadores das
 * frases; a leitura está em `actions/emporio-historico.ts`.
 */

/** O catálogo FIXO: chave gravada no banco, rótulo que a tela mostra. */
export const ACOES_DO_HISTORICO = {
  "estabelecimento.criar": "Criou um estabelecimento",
  "estabelecimento.editar": "Editou um estabelecimento",
  "estabelecimento.arquivar": "Arquivou um estabelecimento",
  "vinculos.definir": "Definiu quem trabalha numa loja",
  "produto.criar": "Cadastrou um produto",
  "produto.editar": "Editou um produto",
  "produto.arquivar": "Arquivou um produto",
  "apresentacao.criar": "Criou uma apresentação",
  "apresentacao.editar": "Editou uma apresentação",
  "apresentacao.arquivar": "Arquivou uma apresentação",
  "preco.definir": "Mudou um preço",
  "compra.criar": "Lançou uma compra",
  "compra.receber": "Recebeu uma compra",
  "compra.cancelar": "Cancelou uma compra",
  "estoque.implantar": "Informou o estoque inicial",
  "estoque.contar": "Contou o estoque",
  "estoque.perda": "Registrou uma perda",
  "estoque.limites": "Definiu os limites de estoque",
  "estoque.reposicao": "Mandou itens para a lista de reposição",
  "transferencia.enviar": "Enviou uma transferência",
  "transferencia.receber": "Recebeu uma transferência",
  "transferencia.resolver": "Resolveu a diferença de uma transferência",
  "transferencia.cancelar": "Cancelou uma transferência",
  "producao.receita": "Definiu uma composição",
  "producao.produzir": "Registrou uma produção",
  "producao.cancelar": "Cancelou uma produção",
  "venda.criar": "Registrou uma venda",
  "venda.cancelar": "Cancelou uma venda",
  "venda.devolver": "Registrou uma devolução",
  "venda.trocar": "Registrou uma troca",
  "fiado.receber": "Recebeu um fiado",
  "caixa.transferir": "Levou dinheiro da gaveta ao banco",
  "caixa.conferir": "Conferiu a gaveta",
  "caixa.saldo_inicial": "Informou o saldo inicial do caixa",
  "cheque.depositar": "Depositou um cheque",
  "cheque.compensar": "Compensou um cheque",
  "cheque.devolvido": "Marcou um cheque como devolvido",
  "cartao.regra": "Mudou uma regra de cartão",
  "cartao.regra_remover": "Removeu uma regra de cartão",
  "despesa.fixa": "Mexeu numa despesa fixa",
  "despesa.regra_variavel": "Mexeu numa regra de despesa variável",
  "despesa.corrigir": "Corrigiu uma despesa",
  "despesa.pagar": "Pagou despesas",
  "conta_bancaria.criar": "Criou uma conta bancária",
  "conta_bancaria.editar": "Editou uma conta bancária",
  "conta_bancaria.pix": "Definiu a conta do Pix",
  "primeiros_passos.concluir": "Marcou um primeiro passo",
  "equipe.cadastrar": "Cadastrou alguém na equipe",
  "equipe.alterar": "Alterou alguém da equipe",
  "equipe.tirar": "Tirou alguém do Empório",
} as const;

export type AcaoDoHistorico = keyof typeof ACOES_DO_HISTORICO;

export const rotuloDaAcao = (action: string): string =>
  (ACOES_DO_HISTORICO as Record<string, string>)[action] ?? action;

export type MudancaDoHistorico = { campo: string; antes: unknown; depois: unknown };

/** Quem fez: o ator da action. */
export type AtorHistorico = { id: string };

/** O `tx` da transação da action, ou o próprio `db` quando ela não abre uma. */
type ClientHistorico = {
  emporioAuditLog: { create: (args: { data: Prisma.EmporioAuditLogUncheckedCreateInput }) => PromiseLike<unknown> };
};

export type EntradaDoHistorico = {
  action: AcaoDoHistorico;
  establishment_id?: string | null;
  target_type: string;
  target_id?: string | null;
  summary: string;
  changes?: MudancaDoHistorico[];
};

/** Só faz o `create`. A atomicidade é de quem chama: passe o `tx`. */
export async function registrarNoHistorico(
  tx: ClientHistorico,
  ator: AtorHistorico,
  entrada: EntradaDoHistorico,
): Promise<void> {
  await tx.emporioAuditLog.create({
    data: scoped({
      user_id: ator.id,
      establishment_id: entrada.establishment_id ?? null,
      action: entrada.action,
      target_type: entrada.target_type,
      target_id: entrada.target_id ?? null,
      summary: entrada.summary,
      ...(entrada.changes && entrada.changes.length > 0
        ? { changes: entrada.changes as unknown as Prisma.InputJsonValue }
        : {}),
    }),
  });
}

// ---------------------------------------------------------------------------
// Frases
// ---------------------------------------------------------------------------

/** "R$ 120,00", com espaço comum (o do Intl é inseparável e atrapalha a busca). */
export const dinheiro = (n: number): string =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

/** Quantidade com a unidade: "2,5 kg". Sem unidade, só o número. */
export function quantidade(n: number, unidade?: string | null): string {
  const t = n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  return unidade ? `${t} ${unidade}` : t;
}

export const itens = (n: number): string => `${n} ${n === 1 ? "item" : "itens"}`;

/** "na Loja Centro", ou vazio quando a escrita não é de uma loja. */
export const naLoja = (nome?: string | null): string => (nome ? ` na ${nome}` : "");

/** Compara antes e depois (valores simples, listas e nulos). */
function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * `[{ campo, antes, depois }]` só com o que mudou. `campos` mapeia a chave do
 * objeto para o rótulo legível ("Preço"); `formatar` opcional converte o valor
 * para a frase (dinheiro, por exemplo).
 */
export function diferencas(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  campos: Record<string, string>,
  formatar: Record<string, (v: unknown) => unknown> = {},
): MudancaDoHistorico[] {
  const saida: MudancaDoHistorico[] = [];
  for (const [chave, rotulo] of Object.entries(campos)) {
    if (!(chave in depois)) continue;
    const a = antes[chave];
    const d = depois[chave];
    if (igual(a, d)) continue;
    const f = formatar[chave];
    saida.push({ campo: rotulo, antes: f ? f(a) : (a ?? null), depois: f ? f(d) : (d ?? null) });
  }
  return saida;
}

/** O caminho do painel para o alvo, quando existe tela. */
export function linkDoAlvo(targetType: string, targetId: string | null): string | null {
  switch (targetType) {
    case "venda":
      return targetId ? `/emporio/vendas/${targetId}` : null;
    case "produto":
      return targetId ? `/emporio/produtos/${targetId}` : null;
    case "compra":
      return "/emporio/compras";
    case "transferencia":
      return "/emporio/transferencias";
    default:
      return null;
  }
}
