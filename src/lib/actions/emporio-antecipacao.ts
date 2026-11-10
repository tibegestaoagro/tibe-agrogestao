import type { Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { exigirUma } from "@/lib/emporio/papel";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { registrarNoHistorico, dinheiro } from "@/lib/emporio/historico";
import { CATEGORIA_ANTECIPACAO, hojeEmBrasilia, pctEfetivoMes, ratearCustoCent } from "@/lib/emporio/cartao";

/**
 * Meu Empório, antecipação de recebíveis do cartão (Q262). A validação é em
 * TypeScript puro: o agente do WhatsApp chama estas funções sem o Zod da rota.
 *
 * A operação NÃO grava saldo (invariante 2): ela troca `effective_on` e
 * `effective_net` das parcelas, e o saldo da conta segue sendo a soma dos
 * líquidos efetivos que já venceram. O custo é uma despesa paga por loja, e
 * desfazer volta as parcelas ao previsto e cancela essas despesas.
 */

const DIA_MS = 86_400_000;
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const reais = (cent: number) => Math.round(cent) / 100;
const diaDe = (d: Date) => d.toISOString().slice(0, 10);
/** A meia-noite UTC do dia: o valor que uma coluna `@db.Date` guarda. */
const soODia = (d: Date) => new Date(`${diaDe(d)}T00:00:00.000Z`);
const dataValida = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

const PERMISSAO: ["gestor_da_loja", "dinheiro"] = ["gestor_da_loja", "dinheiro"];

export type AntecipacaoView = {
  id: string;
  kind: "pontual" | "automatica";
  acquirer_name: string | null;
  bank_account_id: string;
  bank_account_name: string;
  operated_on: string;
  gross_amount: number;
  expected_net: number;
  received_net: number;
  fee_amount: number;
  /** Custo / previsto, ao mês, pela média dos dias antecipados ponderada pelo líquido; nulo sem parcelas vivas ou com dias zero. */
  effective_pct_month: number | null;
  receivables_count: number;
  undone_at: string | null;
  can_undo: boolean;
};

const INCLUDE_OPERACAO = {
  acquirer: { select: { name: true } },
  bank_account: { select: { name: true } },
  receivables: {
    select: {
      establishment_id: true,
      gross_amount: true,
      expected_on: true,
      effective_net: true,
      anticipation_fee: true,
      reconciled_at: true,
      canceled_at: true,
      sale: { select: { status: true } },
    },
  },
} as const;

type OperacaoRow = Prisma.CardAnticipationGetPayload<{ include: typeof INCLUDE_OPERACAO }>;

/**
 * `lojaId` (a loja filtrada na lista) faz os totais saírem só das parcelas dela: uma operação pode juntar parcelas de
 * várias lojas, e quem vê uma loja não deve ler o dinheiro das outras. Operação desfeita não tem parcelas: fica com os
 * totais gravados nela.
 */
function viewDaOperacao(o: OperacaoRow, lojaId: string | null = null): AntecipacaoView {
  const soDaLoja = lojaId !== null && o.receivables.length > 0;
  const parcelas = soDaLoja ? o.receivables.filter((r) => r.establishment_id === lojaId) : o.receivables;
  let brutoCent = 0;
  let previstoCent = 0;
  let recebidoCent = 0;
  let feeCent = 0;
  let pesoTotal = 0;
  let pesoDias = 0;
  for (const r of parcelas) {
    const efetivo = centavos(decToNum(r.effective_net) ?? 0);
    const taxa = centavos(decToNum(r.anticipation_fee) ?? 0);
    const liquido = efetivo + taxa;
    const dias = Math.max(0, Math.round((r.expected_on.getTime() - o.operated_on.getTime()) / DIA_MS));
    brutoCent += centavos(decToNum(r.gross_amount) ?? 0);
    previstoCent += liquido;
    recebidoCent += efetivo;
    feeCent += taxa;
    pesoTotal += liquido;
    pesoDias += liquido * dias;
  }
  const fee = soDaLoja ? reais(feeCent) : (decToNum(o.fee_amount) ?? 0);
  const previsto = soDaLoja ? reais(previstoCent) : (decToNum(o.expected_net) ?? 0);
  const mediaDias = pesoTotal > 0 ? pesoDias / pesoTotal : 0;
  const pctMes = pctEfetivoMes(centavos(fee), centavos(previsto), mediaDias);
  const conciliada = o.receivables.some((r) => r.reconciled_at !== null);
  return {
    id: o.id,
    kind: o.kind,
    acquirer_name: o.acquirer?.name ?? null,
    bank_account_id: o.bank_account_id,
    bank_account_name: o.bank_account.name,
    operated_on: diaDe(o.operated_on),
    gross_amount: soDaLoja ? reais(brutoCent) : (decToNum(o.gross_amount) ?? 0),
    expected_net: previsto,
    received_net: soDaLoja ? reais(recebidoCent) : (decToNum(o.received_net) ?? 0),
    fee_amount: fee,
    effective_pct_month: pctMes,
    receivables_count: parcelas.length,
    undone_at: isoOrNull(o.undone_at),
    can_undo:
      o.kind === "pontual" &&
      o.undone_at === null &&
      !conciliada &&
      !o.receivables.some((r) => r.canceled_at !== null || r.sale.status === "cancelada"),
  };
}

/** Aborta a transação com uma recusa de negócio (o rollback desfaz o que já foi escrito). */
class AbortarAntecipacao extends Error {
  constructor(public recusa: ActionResult<never>) {
    super("antecipação abortada");
  }
}

const NAO_ACHADA = () => fail("NOT_FOUND", "Antecipação não encontrada.", 404);
const PARCELA_NAO_ACHADA = () => fail("NOT_FOUND", "Parcela não encontrada.", 404, "receivable_ids");

// ---------------------------------------------------------------------------
// Listar
// ---------------------------------------------------------------------------

export async function listarAntecipacoesAction(
  db: TenantPrismaClient,
  ator: Ator,
  filtro: {
    de?: Date | null;
    ate?: Date | null;
    establishment_id?: string | null;
    before?: { operated_on: Date; id: string } | null;
  } = {},
): Promise<ActionResult<AntecipacaoView[]>> {
  const neg = await exigirUma(db, ator, PERMISSAO, "ver as antecipações");
  if (neg) return neg;

  const visiveis = await lojasDoAtor(db, ator);
  const pedida = typeof filtro?.establishment_id === "string" && filtro.establishment_id ? filtro.establishment_id : null;
  const where: Prisma.CardAnticipationWhereInput = {};
  if (dataValida(filtro?.de) || dataValida(filtro?.ate)) {
    where.operated_on = {
      ...(dataValida(filtro?.de) ? { gte: soODia(filtro.de) } : {}),
      ...(dataValida(filtro?.ate) ? { lte: soODia(filtro.ate) } : {}),
    };
  }
  if (visiveis || pedida) {
    const lojas = pedida ? (visiveis && !visiveis.has(pedida) ? [] : [pedida]) : [...(visiveis as Set<string>)];
    // A operação desfeita já não tem parcelas: a loja dela é a da despesa (cancelada) que gerou.
    const despesas = await db.financialEntry.findMany({
      where: {
        related_module: "emporio",
        entry_type: "expense",
        category: CATEGORIA_ANTECIPACAO,
        establishment_id: { in: lojas },
      },
      select: { related_id: true },
    });
    where.OR = [
      { receivables: { some: { establishment_id: { in: lojas } } } },
      { id: { in: despesas.map((d) => d.related_id).filter((x): x is string => !!x) } },
    ];
  }

  // Cursor: o dia e o id da última operação da página anterior; o `id` desempata operações do mesmo dia.
  const antes = filtro?.before;
  if (antes != null) {
    if (typeof antes !== "object" || !dataValida(antes.operated_on) || typeof antes.id !== "string" || !antes.id) {
      return fail("VALIDATION_ERROR", "Cursor inválido: informe a data e o id da última antecipação da página.", 422, "before");
    }
    const corte: Prisma.CardAnticipationWhereInput = {
      OR: [{ operated_on: { lt: soODia(antes.operated_on) } }, { operated_on: soODia(antes.operated_on), id: { lt: antes.id } }],
    };
    where.AND = [corte];
  }

  const rows = await db.cardAnticipation.findMany({
    where,
    include: INCLUDE_OPERACAO,
    orderBy: [{ operated_on: "desc" }, { id: "desc" }],
    take: 200,
  });
  return ok(rows.map((r) => viewDaOperacao(r, pedida)));
}

// ---------------------------------------------------------------------------
// Antecipar
// ---------------------------------------------------------------------------

export type AnteciparInput = {
  receivable_ids: string[];
  operated_on: Date;
  received_net: number;
  notes?: string | null;
};

export async function anteciparAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: AnteciparInput,
): Promise<ActionResult<AntecipacaoView>> {
  const neg = await exigirUma(db, ator, PERMISSAO, "antecipar recebíveis do cartão");
  if (neg) return neg;

  const bruto = Array.isArray(input?.receivable_ids) ? input.receivable_ids : [];
  const ids = [...new Set(bruto.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))];
  if (ids.length === 0) {
    return fail("VALIDATION_ERROR", "Escolha ao menos uma parcela para antecipar.", 422, "receivable_ids");
  }
  if (!dataValida(input?.operated_on)) {
    return fail("VALIDATION_ERROR", "Informe a data da operação.", 422, "operated_on");
  }
  const dia = soODia(input.operated_on);
  if (dia.getTime() > hojeEmBrasilia().getTime()) {
    return fail("VALIDATION_ERROR", "A data da operação não pode estar no futuro.", 422, "operated_on");
  }
  if (typeof input.received_net !== "number" || !Number.isFinite(input.received_net) || input.received_net <= 0) {
    return fail("VALIDATION_ERROR", "Informe o valor que a adquirente pagou, maior que zero.", 422, "received_net");
  }
  if (input.notes != null && typeof input.notes !== "string") {
    return fail("VALIDATION_ERROR", "A observação deve ser um texto.", 422, "notes");
  }
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim().slice(0, 500) : null;
  const recebidoCent = centavos(input.received_net);

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const parcelas = await tx.cardReceivable.findMany({ where: { id: { in: ids } } });
      if (parcelas.length !== ids.length) throw new AbortarAntecipacao(PARCELA_NAO_ACHADA());

      const visiveis = await lojasDoAtor(db, ator);
      if (visiveis && parcelas.some((p) => !visiveis.has(p.establishment_id))) {
        throw new AbortarAntecipacao(PARCELA_NAO_ACHADA());
      }
      for (const lojaId of new Set(parcelas.map((p) => p.establishment_id))) {
        const negLoja = await exigirUma(db, ator, PERMISSAO, "antecipar recebíveis do cartão", lojaId);
        if (negLoja) throw new AbortarAntecipacao(negLoja);
      }

      const recusar = (msg: string) =>
        new AbortarAntecipacao(fail("VALIDATION_ERROR", msg, 422, "receivable_ids"));
      if (parcelas.some((p) => p.canceled_at !== null)) throw recusar("Há parcela cancelada na seleção.");
      if (parcelas.some((p) => p.anticipation_id !== null)) throw recusar("Há parcela já antecipada na seleção.");
      if (parcelas.some((p) => p.reconciled_at !== null)) throw recusar("Há parcela já conciliada com o extrato na seleção.");
      if (parcelas.some((p) => p.effective_on.getTime() <= dia.getTime())) {
        throw recusar("Só se antecipa parcela que cai depois da data da operação.");
      }
      if (new Set(parcelas.map((p) => p.bank_account_id)).size > 1) {
        throw recusar("As parcelas precisam cair na mesma conta bancária.");
      }

      const liquidos = parcelas.map((p) => centavos(decToNum(p.effective_net) ?? 0));
      const somaCent = liquidos.reduce((a, b) => a + b, 0);
      if (recebidoCent > somaCent) {
        throw new AbortarAntecipacao(
          fail(
            "VALIDATION_ERROR",
            `O valor recebido não pode passar da soma dos líquidos das parcelas (${dinheiro(reais(somaCent))}).`,
            422,
            "received_net",
          ),
        );
      }
      const custoCent = somaCent - recebidoCent;
      const partes = ratearCustoCent(custoCent, liquidos);
      const brutoCent = parcelas.reduce((s, p) => s + centavos(decToNum(p.gross_amount) ?? 0), 0);
      const adquirentes = new Set(parcelas.map((p) => p.acquirer_id));
      const adquirenteId = adquirentes.size === 1 ? ([...adquirentes][0] ?? null) : null;

      const op = await tx.cardAnticipation.create({
        data: scoped({
          acquirer_id: adquirenteId,
          bank_account_id: parcelas[0].bank_account_id,
          operated_on: dia,
          kind: "pontual" as const,
          gross_amount: reais(brutoCent),
          expected_net: reais(somaCent),
          received_net: reais(recebidoCent),
          fee_amount: reais(custoCent),
          notes,
          created_by_user_id: ator.id,
        }),
      });

      const porLoja = new Map<string, number>();
      for (let i = 0; i < parcelas.length; i++) {
        const p = parcelas[i];
        await tx.cardReceivable.update({
          where: { id: p.id },
          data: {
            effective_on: dia,
            effective_net: reais(liquidos[i] - partes[i]),
            anticipation_fee: reais(partes[i]),
            anticipation_id: op.id,
          },
        });
        porLoja.set(p.establishment_id, (porLoja.get(p.establishment_id) ?? 0) + partes[i]);
      }
      for (const [lojaId, c] of porLoja) {
        if (c <= 0) continue;
        await createLinkedEntry(tx, {
          entry_type: "expense",
          category: CATEGORIA_ANTECIPACAO,
          amount: reais(c),
          related_module: "emporio",
          related_id: op.id,
          occurred_at: new Date(dia.getTime() + 12 * 3_600_000),
          status: "paid",
          due_date: dia,
          establishment_id: lojaId,
        });
      }

      await registrarNoHistorico(tx, ator, {
        action: "cartao.antecipar",
        establishment_id: porLoja.size === 1 ? [...porLoja.keys()][0] : null,
        target_type: "antecipacao",
        target_id: op.id,
        summary: `Antecipou ${parcelas.length} ${parcelas.length === 1 ? "parcela" : "parcelas"} de cartão (previsto ${dinheiro(reais(somaCent))}): recebeu ${dinheiro(reais(recebidoCent))}, custo ${dinheiro(reais(custoCent))}`,
      });
      return op.id;
    });
    const row = await db.cardAnticipation.findFirst({ where: { id }, include: INCLUDE_OPERACAO });
    return row ? ok(viewDaOperacao(row)) : NAO_ACHADA();
  } catch (err) {
    if (err instanceof AbortarAntecipacao) return err.recusa;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Desfazer
// ---------------------------------------------------------------------------

export async function desfazerAntecipacaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<AntecipacaoView>> {
  const neg = await exigirUma(db, ator, PERMISSAO, "desfazer uma antecipação");
  if (neg) return neg;
  if (typeof id !== "string" || !id) return NAO_ACHADA();

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const op = await tx.cardAnticipation.findFirst({
        where: { id },
        include: {
          receivables: {
            select: {
              id: true,
              establishment_id: true,
              expected_on: true,
              net_amount: true,
              reconciled_at: true,
              canceled_at: true,
              sale: { select: { status: true } },
            },
          },
        },
      });
      if (!op) throw new AbortarAntecipacao(NAO_ACHADA());

      const despesas = await tx.financialEntry.findMany({
        where: { related_module: "emporio", entry_type: "expense", category: CATEGORIA_ANTECIPACAO, related_id: op.id },
        select: { establishment_id: true },
      });
      const lojas = new Set<string>([
        ...op.receivables.map((r) => r.establishment_id),
        ...despesas.map((d) => d.establishment_id).filter((x): x is string => !!x),
      ]);
      const visiveis = await lojasDoAtor(db, ator);
      if (visiveis && (lojas.size === 0 || [...lojas].some((l) => !visiveis.has(l)))) {
        throw new AbortarAntecipacao(NAO_ACHADA());
      }
      for (const lojaId of lojas) {
        const negLoja = await exigirUma(db, ator, PERMISSAO, "desfazer uma antecipação", lojaId);
        if (negLoja) throw new AbortarAntecipacao(negLoja);
      }

      if (op.kind === "automatica") {
        throw new AbortarAntecipacao(
          fail("VALIDATION_ERROR", "A antecipação automática se desfaz cancelando a venda.", 422),
        );
      }
      if (op.undone_at) {
        throw new AbortarAntecipacao(fail("ANTECIPACAO_DESFEITA", "Essa antecipação já foi desfeita.", 409));
      }
      if (op.receivables.some((r) => r.canceled_at !== null || r.sale.status === "cancelada")) {
        throw new AbortarAntecipacao(
          fail(
            "ANTECIPACAO_VENDA_CANCELADA",
            "Essa antecipação tem parcela de venda cancelada: o estorno já foi feito pelo valor recebido e o custo da antecipação fica. Não dá para desfazer.",
            409,
          ),
        );
      }
      if (op.receivables.some((r) => r.reconciled_at !== null)) {
        throw new AbortarAntecipacao(
          fail(
            "ANTECIPACAO_CONCILIADA",
            "Essa antecipação já foi conferida com o extrato. Tire o carimbo das parcelas antes de desfazer.",
            409,
          ),
        );
      }

      const marcada = await tx.cardAnticipation.updateMany({
        where: { id: op.id, undone_at: null },
        data: { undone_at: new Date(), undone_by_user_id: ator.id },
      });
      if (marcada.count === 0) {
        throw new AbortarAntecipacao(fail("ANTECIPACAO_DESFEITA", "Essa antecipação já foi desfeita.", 409));
      }
      for (const r of op.receivables) {
        await tx.cardReceivable.update({
          where: { id: r.id },
          data: { effective_on: r.expected_on, effective_net: r.net_amount, anticipation_fee: null, anticipation_id: null },
        });
      }
      await tx.financialEntry.updateMany({
        where: {
          related_module: "emporio",
          entry_type: "expense",
          category: CATEGORIA_ANTECIPACAO,
          related_id: op.id,
          status: { not: "cancelled" },
        },
        data: { status: "cancelled" },
      });
      await registrarNoHistorico(tx, ator, {
        action: "cartao.antecipacao.desfazer",
        establishment_id: lojas.size === 1 ? [...lojas][0] : null,
        target_type: "antecipacao",
        target_id: op.id,
        summary: `Desfez a antecipação de ${op.receivables.length} ${op.receivables.length === 1 ? "parcela" : "parcelas"} de cartão (custo ${dinheiro(decToNum(op.fee_amount) ?? 0)} cancelado)`,
      });
    });
    const row = await db.cardAnticipation.findFirst({ where: { id }, include: INCLUDE_OPERACAO });
    return row ? ok(viewDaOperacao(row)) : NAO_ACHADA();
  } catch (err) {
    if (err instanceof AbortarAntecipacao) return err.recusa;
    throw err;
  }
}
