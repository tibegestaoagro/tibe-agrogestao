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
  "venda.editar": "Editou uma venda",
  "venda.devolver": "Registrou uma devolução",
  "venda.trocar": "Registrou uma troca",
  "venda.pedido_para_entrega": "Mudou o pedido para entrega de uma venda",
  "orcamento.criar": "Salvou um orçamento",
  "orcamento.editar": "Editou um orçamento",
  "orcamento.cancelar": "Cancelou um orçamento",
  "fiado.receber": "Recebeu um fiado",
  "fiado.limite": "Mudou o limite de fiado de um cliente",
  "fiado.prazo": "Mudou o prazo de fiado",
  "fiado.liberar": "Liberou o crédito de um cliente bloqueado",
  "fiado.cobrar": "Cobrou um fiado atrasado",
  "fiado.acordo": "Acordo de fiado",
  "fiado.acordo.desfazer": "Acordo de fiado desfeito",
  "pagamento.pedir": "Pedido de aprovação de pagamento",
  "pagamento.aprovar": "Pagamento aprovado",
  "pagamento.recusar": "Pagamento recusado",
  "conciliacao.carimbar": "Carimbo de conciliação",
  "conciliacao.descarimbar": "Carimbo retirado",
  "caixa.transferir": "Transferiu dinheiro",
  "caixa.conferir": "Conferiu a gaveta",
  "caixa.saldo_inicial": "Informou o saldo inicial do caixa",
  "caixa.criar": "Criou um caixa",
  "caixa.abrir": "Abriu o caixa",
  "caixa.sangria": "Fez uma sangria",
  "caixa.encerrar": "Encerrou o caixa",
  "caixa.confirmar_entrega": "Confirmou o dinheiro recebido",
  "cheque.depositar": "Depositou um cheque",
  "cheque.compensar": "Compensou um cheque",
  "cheque.devolvido": "Marcou um cheque como devolvido",
  "boleto.pagar": "Marcou um boleto como pago",
  "boleto.fiado": "Mandou um boleto para o fiado",
  "cartao.regra": "Mudou uma regra de cartão",
  "cartao.regra_remover": "Removeu uma regra de cartão",
  "cartao.adquirente.criar": "Cadastrou uma adquirente",
  "cartao.adquirente.editar": "Editou uma adquirente",
  "cartao.antecipar": "Antecipou recebíveis do cartão",
  "cartao.antecipacao.desfazer": "Desfez uma antecipação de recebíveis",
  "cartao.adquirente.arquivar": "Arquivou uma adquirente",
  "cartao.adquirente.reativar": "Reativou uma adquirente",
  "cartao.taxa.criar": "Criou uma taxa de cartão",
  "cartao.taxa.renovar": "Mudou uma taxa de cartão por nova vigência",
  "cartao.taxa.editar": "Editou uma taxa de cartão",
  "cartao.taxa.remover": "Removeu ou encerrou uma taxa de cartão",
  "despesa.fixa": "Mexeu numa despesa fixa",
  "despesa.fixa.recalcular": "Recalculou o mês de uma despesa fixa",
  "despesa.regra_variavel": "Mexeu numa regra de despesa variável",
  "despesa.corrigir": "Corrigiu uma despesa",
  "despesa.pagar": "Pagou despesas",
  "despesa.avulsa.criar": "Criou uma conta avulsa",
  "despesa.adiar": "Adiou o vencimento de uma conta",
  "despesa.cancelar": "Cancelou uma conta",
  "conta_bancaria.criar": "Criou uma conta bancária",
  "conta_bancaria.editar": "Editou uma conta bancária",
  "conta_bancaria.pix": "Definiu a conta do Pix",
  "primeiros_passos.concluir": "Marcou um primeiro passo",
  "cliente.cadastrar": "Cadastrou um cliente",
  "cliente.completar": "Completou o cadastro de um cliente",
  "cliente.editar": "Editou um cliente",
  "cliente.arquivar": "Arquivou um cliente",
  "cliente.desarquivar": "Desarquivou um cliente",
  "fornecedor.cadastrar": "Cadastrou um fornecedor",
  "fornecedor.editar": "Editou um fornecedor",
  "fornecedor.arquivar": "Arquivou um fornecedor",
  "fornecedor.desarquivar": "Desarquivou um fornecedor",
  "equipe.cadastrar": "Cadastrou alguém na equipe",
  "equipe.alterar": "Alterou alguém da equipe",
  // Antes da Q190 (06/11/2026), tirar zerava a função; as linhas antigas ficam com este rótulo.
  "equipe.tirar": "Tirou alguém do Empório",
  "equipe.desativar": "Desativou alguém da equipe",
  "equipe.reativar": "Reativou alguém da equipe",
  "configuracoes.editar": "Editou as configurações do Empório",
  "configuracoes.logo": "Mexeu no logo do Empório",
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
    case "orcamento":
      return targetId ? `/emporio/orcamentos/${targetId}` : null;
    case "produto":
      return targetId ? `/emporio/produtos/${targetId}` : null;
    case "compra":
      return "/emporio/compras";
    case "transferencia":
      return "/emporio/transferencias";
    // As linhas antigas apontam para o contato; a migração preserva o id no cliente.
    case "cliente":
    case "contato":
      return targetId ? `/emporio/clientes/${targetId}` : null;
    case "fornecedor":
      return targetId ? `/emporio/fornecedores/${targetId}` : null;
    case "pedido_pagamento":
      return "/emporio/financeiro/aprovacoes";
    case "conta":
    case "conta_bancaria":
      return targetId ? `/emporio/financeiro/caixa?lugar=conta:${targetId}` : null;
    default:
      return null;
  }
}
