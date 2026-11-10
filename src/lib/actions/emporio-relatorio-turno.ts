import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import type { Ator } from "@/lib/actions/emporio-catalogo";
import { lerEstabelecimentoAction } from "@/lib/actions/emporio-catalogo";
import { lerConfiguracoesAction } from "@/lib/actions/emporio-configuracoes";
import { lerTurnoAction } from "@/lib/actions/emporio-turno";
import { formatarCep, formatarDocumento } from "@/lib/contatos/cadastro";
import { FORMA_ROTULO } from "@/app/(dashboard)/emporio/_components/venda-rotulos";

/**
 * Meu Empório, entrega 2: o relatório do encerramento do turno (A4 e bobina),
 * que vai junto com o malote. Só compõe leituras; nada é gravado. Quem pode ler
 * é quem pode ler o turno (`lerTurnoAction`): loja fora do vínculo e turno de
 * outra conta são 404.
 *
 * Dinheiro da gaveta é sempre o movimento COM `cash_register_id`: o PIX para a
 * conta bancária também carrega o turno, mas não passou pela gaveta.
 */

export type RelatorioTurno = {
  loja: { nome: string; documento: string | null; endereco: string | null; telefone: string | null };
  caixa: string;
  operador: string;
  encerrado_por: string | null;
  aberto_em: string;
  encerrado_em: string | null;
  /** O troco contado na abertura (já com o reforço da gerência, se houve). */
  troco_inicial: number;
  /** Quanto do troco inicial veio da gerência. */
  reforco: number;
  vendas_por_forma: { forma: string; valor: number }[];
  fiado_recebido: { forma: string; valor: number }[];
  sangrias: { em: string; valor: number; confirmada: boolean }[];
  /** Líquido dos ajustes das contagens livres do turno (a de abertura já está no troco inicial). */
  ajustes_conferencia: number;
  devolucoes_dinheiro: number;
  cancelamentos_dinheiro: number;
  despesas_dinheiro: number;
  esperado: number | null;
  contado: number | null;
  diferenca: number | null;
  justificativa: string | null;
  malote: number | null;
  /** Aditivo: o gerente já confirmou o malote. Nulo sem malote. */
  malote_confirmado: boolean | null;
  troco_que_ficou: number | null;
  largura_bobina: 80 | 58;
};

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const vazioParaNull = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

export async function lerRelatorioDoTurnoAction(
  db: TenantPrismaClient,
  ator: Ator,
  sessionId: string,
): Promise<ActionResult<RelatorioTurno>> {
  const turno = await lerTurnoAction(db, ator, sessionId);
  if (!turno.ok) return turno;
  const t = turno.data;
  const loja = await lerEstabelecimentoAction(db, ator, t.establishment_id);
  if (!loja.ok) return loja;
  const cfg = await lerConfiguracoesAction(db, ator);
  if (!cfg.ok) return cfg;
  const l = loja.data;

  // Vendas do turno por forma: toda venda entra (a cancelada também; o
  // cancelamento tem linha própria, para o esperado fechar).
  const pagamentos = await db.emporioSalePayment.groupBy({
    by: ["kind"],
    where: { sale: { cash_session_id: t.id } },
    _sum: { amount: true },
  });
  // O rótulo do boleto é local: o mapa da tela (`FORMA_ROTULO`) ainda não o tem.
  const rotulos: Record<string, string> = { ...FORMA_ROTULO, boleto: "Boleto" };
  const ordem = Object.keys(rotulos);
  const vendas_por_forma = pagamentos
    .map((p) => ({ chave: p.kind as string, cent: centavos(decToNum(p._sum.amount) ?? 0) }))
    .filter((p) => p.cent !== 0)
    .sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave))
    .map((p) => ({ forma: p.chave === "troca" ? "Valor da troca (crédito, não é dinheiro)" : (rotulos[p.chave] ?? p.chave), valor: p.cent / 100 }));

  const movs = await db.cashMovement.groupBy({
    by: ["origin", "direction", "cash_register_id"],
    where: { cash_session_id: t.id, origin: { in: ["recebimento_fiado", "devolucao", "cancelamento_venda", "pagamento_despesa"] } },
    _sum: { amount: true },
  });
  const soma = (origin: string, direction: "entrada" | "saida", gaveta: boolean) =>
    movs
      .filter((m) => m.origin === origin && m.direction === direction && (m.cash_register_id !== null) === gaveta)
      .reduce((s, m) => s + centavos(decToNum(m._sum.amount) ?? 0), 0);

  // Só as contagens livres: a de abertura já entrou no troco inicial e a de
  // encerramento é gravada depois do esperado ser calculado.
  const livres = await db.cashCount.findMany({ where: { cash_session_id: t.id, kind: "livre" }, select: { id: true } });
  const ajustes = livres.length
    ? await db.cashMovement.groupBy({
        by: ["direction"],
        where: { origin: "conferencia", cash_register_id: { not: null }, cash_count_id: { in: livres.map((c) => c.id) } },
        _sum: { amount: true },
      })
    : [];
  const ajustes_conferencia =
    ajustes.reduce((s, m) => s + (m.direction === "entrada" ? 1 : -1) * centavos(decToNum(m._sum.amount) ?? 0), 0) / 100;

  const fiado_recebido: { forma: string; valor: number }[] = [];
  const fiadoDinheiro = soma("recebimento_fiado", "entrada", true);
  const fiadoPix = soma("recebimento_fiado", "entrada", false);
  if (fiadoDinheiro > 0) fiado_recebido.push({ forma: FORMA_ROTULO.dinheiro, valor: fiadoDinheiro / 100 });
  if (fiadoPix > 0) fiado_recebido.push({ forma: "Em conta (fora da gaveta)", valor: fiadoPix / 100 });

  const sangrias = t.handovers
    .filter((h) => h.kind === "sangria")
    .map((h) => ({ em: h.created_at, valor: h.amount, confirmada: h.status === "confirmed" }));
  const malote = t.handovers.find((h) => h.kind === "malote") ?? null;

  const encerrado = t.status === "closed";
  const contagem = encerrado
    ? await db.cashCount.findFirst({ where: { cash_session_id: t.id, kind: "encerramento" }, select: { difference: true, justification: true } })
    : null;
  const contado = t.closing_counted;
  const maloteValor = encerrado ? (t.malote_amount ?? 0) : null;

  return ok({
    loja: {
      nome: l.name,
      documento: vazioParaNull(formatarDocumento(l.document)),
      endereco: [l.address, l.city, l.state, vazioParaNull(formatarCep(l.zip))]
        .map((p) => (p ?? "").trim())
        .filter((p) => p.length > 0)
        .join(", ") || null,
      telefone: vazioParaNull(l.phone),
    },
    caixa: t.nome,
    operador: t.opened_by.name,
    encerrado_por: t.closed_by?.name ?? null,
    aberto_em: t.opened_at,
    encerrado_em: t.closed_at,
    troco_inicial: t.opening_counted,
    reforco: t.reinforcement,
    vendas_por_forma,
    fiado_recebido,
    sangrias,
    ajustes_conferencia,
    devolucoes_dinheiro: soma("devolucao", "saida", true) / 100,
    cancelamentos_dinheiro: soma("cancelamento_venda", "saida", true) / 100,
    despesas_dinheiro: soma("pagamento_despesa", "saida", true) / 100,
    esperado: t.closing_expected,
    contado,
    diferenca: contagem ? (decToNum(contagem.difference as never) ?? 0) : null,
    justificativa: contagem?.justification ?? null,
    malote: maloteValor,
    malote_confirmado: encerrado && malote ? malote.status === "confirmed" : null,
    troco_que_ficou: contado !== null && maloteValor !== null ? Math.round((centavos(contado) - centavos(maloteValor))) / 100 : null,
    largura_bobina: cfg.data.receipt_width,
  });
}
