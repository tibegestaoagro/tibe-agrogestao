import type { Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { exigir } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { proximoDiaUtil } from "@/lib/emporio/dia-util";
import { dinheiro, registrarNoHistorico } from "@/lib/emporio/historico";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import type { CartaoAReceberView } from "@/lib/actions/emporio-financeiro";

/**
 * Meu Empório, conferir o cartão (frente B, Q349 a Q353). A validação é em
 * TypeScript puro: o agente do WhatsApp chama estas funções sem o Zod da rota.
 *
 * O saldo da conta segue automático (a parcela conta no `effective_on`). A
 * conferência informa o que caiu de fato, e a diferença vira um `CashMovement`
 * `ajuste_cartao` ligado à parcela: nada de saldo é gravado (invariante 2).
 */

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const reais = (cent: number) => Math.round(cent) / 100;
const diaDe = (d: Date) => d.toISOString().slice(0, 10);

export type EstadoDaParcela = "prevista" | "a_conferir" | "atrasada" | "conferida";

/**
 * O estado calculado da parcela (nada é gravado além da conferência). `hoje` é o dia de calendário
 * (meia-noite UTC, como `hojeEmBrasilia()`). Atrasada: hoje é depois do primeiro dia útil estritamente
 * posterior à data (Q351, "1 dia útil depois").
 */
export function estadoDaParcela(p: { effective_on: Date; reconciled_at: Date | null }, hoje: Date): EstadoDaParcela {
  if (p.reconciled_at) return "conferida";
  if (p.effective_on.getTime() > hoje.getTime()) return "prevista";
  // O primeiro dia útil ESTRITAMENTE depois da data: sexta e sábado atrasam na terça, quando a segunda é útil.
  const limite = proximoDiaUtil(new Date(p.effective_on.getTime() + 86_400_000));
  return hoje.getTime() > limite.getTime() ? "atrasada" : "a_conferir";
}

export const INCLUDE_CARTAO = {
  establishment: { select: { name: true } },
  bank_account: { select: { name: true } },
  acquirer: { select: { name: true } },
  sale: { select: { number: true, customer_id: true, customer: { select: { name: true } } } },
} as const;

export type ParcelaComJuncoes = Prisma.CardReceivableGetPayload<{ include: typeof INCLUDE_CARTAO }>;

/** A parcela como o A receber a devolve; `adjustment` é com sinal (negativo: caiu menos) e 0 quando conferida sem diferença. */
export function viewDoCartao(p: ParcelaComJuncoes, hoje: Date): CartaoAReceberView {
  const efetivoCent = centavos(decToNum(p.effective_net) ?? 0);
  const conferidoCent = p.confirmed_net === null ? null : centavos(decToNum(p.confirmed_net) ?? 0);
  return {
    id: p.id,
    sale_id: p.sale_id,
    establishment_id: p.establishment_id,
    establishment_name: p.establishment.name,
    bank_account_id: p.bank_account_id,
    bank_account_name: p.bank_account.name,
    installment: p.installment,
    installments: p.installments,
    gross_amount: decToNum(p.gross_amount) ?? 0,
    net_amount: decToNum(p.net_amount) ?? 0,
    expected_on: diaDe(p.expected_on),
    effective_on: diaDe(p.effective_on),
    effective_net: reais(efetivoCent),
    fee_amount: decToNum(p.fee_amount) ?? 0,
    anticipated: p.anticipation_id !== null,
    received: p.effective_on.getTime() <= hoje.getTime(),
    acquirer_id: p.acquirer_id,
    acquirer_name: p.acquirer?.name ?? null,
    brand: p.brand,
    sale_number: p.sale.number,
    customer_id: p.sale.customer_id,
    customer_name: p.sale.customer?.name ?? null,
    status: estadoDaParcela(p, hoje),
    confirmed_net: conferidoCent === null ? null : reais(conferidoCent),
    adjustment: p.reconciled_at ? reais((conferidoCent ?? efetivoCent) - efetivoCent) : null,
  };
}

/** Aborta a transação com uma recusa de negócio (o rollback desfaz o que já foi escrito). */
class AbortarConferencia extends Error {
  constructor(public recusa: ActionResult<never>) {
    super("conferência abortada");
  }
}

const NAO_ACHADA = () => fail("NOT_FOUND", "Parcela não encontrada.", 404, "id");
const JA_CONFERIDA = () => fail("JA_CONFERIDA", "Esta parcela já está conferida.", 409, "id");
const VENDA_CANCELADA = () => fail("VENDA_CANCELADA", "A venda desta parcela foi cancelada.", 409, "id");

/** A reparte de `diferencaCent` (com sinal) pelas parcelas, proporcional ao líquido; a sobra de centavos vai para a maior. */
export function repartirDiferencaCent(diferencaCent: number, liquidosCent: number[]): number[] {
  if (liquidosCent.length === 0) return [];
  const abs = Math.abs(diferencaCent);
  const total = liquidosCent.reduce((a, b) => a + b, 0);
  const partes = liquidosCent.map((l) => (total > 0 ? Math.floor((abs * l) / total) : 0));
  let maior = 0;
  liquidosCent.forEach((l, i) => {
    if (l > liquidosCent[maior]) maior = i;
  });
  partes[maior] += abs - partes.reduce((a, b) => a + b, 0);
  return partes.map((p) => (diferencaCent < 0 ? -p : p));
}

function lerValor(v: unknown, campo: string, msg: string): { cent: number } | { erro: ActionResult<never> } {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return { erro: fail("VALIDATION_ERROR", msg, 422, campo) };
  return { cent: centavos(v) };
}

function lerNotas(v: unknown): { notes: string | null } | { erro: ActionResult<never> } {
  if (v == null) return { notes: null };
  if (typeof v !== "string") return { erro: fail("VALIDATION_ERROR", "A observação deve ser um texto.", 422, "notes") };
  return { notes: v.trim() ? v.trim().slice(0, 500) : null };
}

/**
 * O ajuste cai na data em que o dinheiro devia ter entrado (o `effective_on` da parcela, ao meio-dia UTC, o mesmo
 * dia de São Paulo), porque é assim que o extrato do banco o mostra: a conta passa a bater linha a linha. Nasce
 * carimbada por quem conferiu: ela é o próprio resultado de uma conferência, e sem carimbo viraria uma pendência
 * falsa no "sem carimbo" do extrato. A loja não vai no movimento (a conta bancária não é de loja, CHECK
 * `CashMovement_exactly_one_place`): ela vem da parcela ligada.
 */
function ajusteDoMovimento(
  cent: number,
  parcela: { id: string; bank_account_id: string; sale_id: string; effective_on: Date },
  ator: Ator,
  agora: Date,
  notes: string | null,
) {
  return scoped({
    establishment_id: null,
    bank_account_id: parcela.bank_account_id,
    direction: cent < 0 ? ("saida" as const) : ("entrada" as const),
    amount: reais(Math.abs(cent)),
    origin: "ajuste_cartao" as const,
    occurred_at: new Date(parcela.effective_on.getTime() + 12 * 3_600_000),
    sale_id: parcela.sale_id,
    card_receivable_id: parcela.id,
    notes,
    created_by_user_id: ator.id,
    reconciled_at: agora,
    reconciled_by_user_id: ator.id,
  });
}

const sinal = (cent: number) => `${cent < 0 ? "-" : "+"}${dinheiro(reais(Math.abs(cent)))}`;

export type ParcelaConferida = CartaoAReceberView & { reconciled_at: string; reconciled_by: string | null };

// ---------------------------------------------------------------------------
// Conferir uma parcela
// ---------------------------------------------------------------------------

export async function conferirParcelaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { received_amount: number; notes?: string },
): Promise<ActionResult<ParcelaConferida>> {
  const neg = await exigir(db, ator, "dinheiro", "conferir o cartão");
  if (neg) return neg;
  if (typeof id !== "string" || !id.trim()) return NAO_ACHADA();
  const valor = lerValor(input?.received_amount, "received_amount", "Informe o valor que caiu, zero ou mais.");
  if ("erro" in valor) return valor.erro;
  const nt = lerNotas(input?.notes);
  if ("erro" in nt) return nt.erro;
  const visiveis = await lojasDoAtor(db, ator);
  const hoje = hojeEmBrasilia();
  const agora = new Date();

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const p = await tx.cardReceivable.findFirst({ where: { id: id.trim() }, include: { sale: { select: { status: true } } } });
      if (!p || p.canceled_at !== null || (visiveis && !visiveis.has(p.establishment_id))) throw new AbortarConferencia(NAO_ACHADA());
      if (p.sale.status === "cancelada") throw new AbortarConferencia(VENDA_CANCELADA());
      if (p.reconciled_at) throw new AbortarConferencia(JA_CONFERIDA());
      if (p.effective_on.getTime() > hoje.getTime()) {
        throw new AbortarConferencia(fail("VALIDATION_ERROR", "Só se confere a parcela que já caiu.", 422, "id"));
      }
      const previstoCent = centavos(decToNum(p.effective_net) ?? 0);
      const ajusteCent = valor.cent - previstoCent;
      const marcou = await tx.cardReceivable.updateMany({
        where: { id: p.id, reconciled_at: null },
        data: { reconciled_at: agora, reconciled_by_user_id: ator.id, confirmed_net: reais(valor.cent) },
      });
      if (marcou.count === 0) throw new AbortarConferencia(JA_CONFERIDA());
      if (ajusteCent !== 0) await tx.cashMovement.create({ data: ajusteDoMovimento(ajusteCent, p, ator, agora, nt.notes) });
      await registrarNoHistorico(tx, ator, {
        action: "cartao.conferir",
        establishment_id: p.establishment_id,
        target_type: "parcela_cartao",
        target_id: p.id,
        summary: `Conferiu a parcela ${p.installment}/${p.installments} do cartão: previsto ${dinheiro(reais(previstoCent))}, caiu ${dinheiro(reais(valor.cent))}${ajusteCent !== 0 ? `, ajuste ${sinal(ajusteCent)}` : ""}${nt.notes ? ` (${nt.notes})` : ""}`,
      });
    });
  } catch (err) {
    if (err instanceof AbortarConferencia) return err.recusa;
    throw err;
  }
  const row = await db.cardReceivable.findFirst({ where: { id: id.trim() }, include: INCLUDE_CARTAO });
  if (!row) return NAO_ACHADA();
  const quem = row.reconciled_by_user_id
    ? await db.user.findFirst({ where: { id: row.reconciled_by_user_id }, select: { name: true } })
    : null;
  return ok({ ...viewDoCartao(row, hoje), reconciled_at: (row.reconciled_at ?? agora).toISOString(), reconciled_by: quem?.name ?? null });
}

// ---------------------------------------------------------------------------
// Conferir o dia (conta, adquirente e data)
// ---------------------------------------------------------------------------

export type ConferenciaDoDia = {
  receivables: CartaoAReceberView[];
  adjustments: { receivable_id: string; amount: number }[];
  expected_total: number;
  received_total: number;
  difference: number;
};

export async function conferirDiaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: {
    bank_account_id: string;
    acquirer_id: string;
    effective_on: string;
    received_total: number;
    /** Só as parcelas desta loja: a tela filtrada por loja confere exatamente o que mostra. */
    establishment_id?: string;
    notes?: string;
  },
): Promise<ActionResult<ConferenciaDoDia>> {
  const neg = await exigir(db, ator, "dinheiro", "conferir o cartão");
  if (neg) return neg;
  const contaId = typeof input?.bank_account_id === "string" ? input.bank_account_id.trim() : "";
  if (!contaId) return fail("VALIDATION_ERROR", "Escolha a conta.", 422, "bank_account_id");
  const adquirenteId = typeof input?.acquirer_id === "string" ? input.acquirer_id.trim() : "";
  if (!adquirenteId) return fail("VALIDATION_ERROR", "Escolha a adquirente.", 422, "acquirer_id");
  const dataTxt = typeof input?.effective_on === "string" ? input.effective_on.trim() : "";
  const data = /^\d{4}-\d{2}-\d{2}$/.test(dataTxt) ? new Date(`${dataTxt}T00:00:00.000Z`) : null;
  if (!data || Number.isNaN(data.getTime()) || diaDe(data) !== dataTxt) {
    return fail("VALIDATION_ERROR", "Informe uma data válida (AAAA-MM-DD).", 422, "effective_on");
  }
  const valor = lerValor(input?.received_total, "received_total", "Informe o total que caiu, zero ou mais.");
  if ("erro" in valor) return valor.erro;
  const nt = lerNotas(input?.notes);
  if ("erro" in nt) return nt.erro;
  const hoje = hojeEmBrasilia();
  if (data.getTime() > hoje.getTime()) {
    return fail("VALIDATION_ERROR", "Só se confere o dia que já passou ou é hoje.", 422, "effective_on");
  }
  const conta = await db.bankAccount.findFirst({ where: { id: contaId }, select: { id: true, name: true } });
  if (!conta) return fail("NOT_FOUND", "Conta não encontrada.", 404, "bank_account_id");
  const adquirente = await db.cardAcquirer.findFirst({ where: { id: adquirenteId }, select: { id: true, name: true } });
  if (!adquirente) return fail("NOT_FOUND", "Adquirente não encontrada.", 404, "acquirer_id");
  const lojaTxt = input?.establishment_id == null ? "" : String(input.establishment_id).trim();
  const visiveis = await lojasDoAtor(db, ator);
  if (lojaTxt) {
    const loja = await db.establishment.findFirst({ where: { id: lojaTxt }, select: { id: true } });
    if (!loja || (visiveis && !visiveis.has(loja.id))) return fail("NOT_FOUND", "Loja não encontrada.", 404, "establishment_id");
  }
  const agora = new Date();

  try {
    const feito = await runSerializableTenantTransaction(db, async (tx) => {
      // As parcelas vivas do recorte que ainda não foram conferidas: a mesma lista que a tela soma.
      const parcelas = await tx.cardReceivable.findMany({
        where: {
          bank_account_id: conta.id,
          acquirer_id: adquirente.id,
          effective_on: data,
          canceled_at: null,
          reconciled_at: null,
          sale: { status: { not: "cancelada" } },
          ...(lojaTxt ? { establishment_id: lojaTxt } : visiveis ? { establishment_id: { in: [...visiveis] } } : {}),
        },
        orderBy: [{ installment: "asc" }, { id: "asc" }],
      });
      if (parcelas.length === 0) {
        throw new AbortarConferencia(
          fail("SEM_PARCELA_A_CONFERIR", "Não há parcela a conferir nesta conta, adquirente e data.", 409, "effective_on"),
        );
      }
      const liquidos = parcelas.map((p) => centavos(decToNum(p.effective_net) ?? 0));
      const previstoCent = liquidos.reduce((a, b) => a + b, 0);
      const diferencaCent = valor.cent - previstoCent;
      const partes = repartirDiferencaCent(diferencaCent, liquidos);
      const ajustes: { receivable_id: string; cent: number }[] = [];
      for (let i = 0; i < parcelas.length; i++) {
        const p = parcelas[i];
        const marcou = await tx.cardReceivable.updateMany({
          where: { id: p.id, reconciled_at: null },
          data: { reconciled_at: agora, reconciled_by_user_id: ator.id, confirmed_net: reais(liquidos[i] + partes[i]) },
        });
        if (marcou.count === 0) throw new AbortarConferencia(JA_CONFERIDA());
        if (partes[i] !== 0) {
          await tx.cashMovement.create({ data: ajusteDoMovimento(partes[i], p, ator, agora, nt.notes) });
          ajustes.push({ receivable_id: p.id, cent: partes[i] });
        }
      }
      await registrarNoHistorico(tx, ator, {
        action: "cartao.conferir_dia",
        target_type: "conta",
        target_id: conta.id,
        summary: `Conferiu ${parcelas.length} ${parcelas.length === 1 ? "parcela" : "parcelas"} de ${adquirente.name} em ${conta.name} de ${dataTxt.slice(8, 10)}/${dataTxt.slice(5, 7)}: previsto ${dinheiro(reais(previstoCent))}, caiu ${dinheiro(reais(valor.cent))}${diferencaCent !== 0 ? `, ajuste ${sinal(diferencaCent)}` : ""}${nt.notes ? ` (${nt.notes})` : ""}`,
      });
      return { ids: parcelas.map((p) => p.id), ajustes, previstoCent, diferencaCent };
    });
    const rows = await db.cardReceivable.findMany({
      where: { id: { in: feito.ids } },
      include: INCLUDE_CARTAO,
      orderBy: [{ installment: "asc" }, { id: "asc" }],
    });
    return ok({
      receivables: rows.map((r) => viewDoCartao(r, hoje)),
      adjustments: feito.ajustes.map((a) => ({ receivable_id: a.receivable_id, amount: reais(a.cent) })),
      expected_total: reais(feito.previstoCent),
      received_total: reais(valor.cent),
      difference: reais(feito.diferencaCent),
    });
  } catch (err) {
    if (err instanceof AbortarConferencia) return err.recusa;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Desfazer a conferência
// ---------------------------------------------------------------------------

/**
 * `reconciled_at` que a antecipação pontual grava nas parcelas dela: exatamente o `created_at` da operação.
 * É o que separa a conferência feita pela antecipação (some ao desfazê-la) de qualquer outro carimbo
 * (o do extrato, antes da frente B), que continua barrando o desfazer da antecipação.
 */
export const conferidaPelaAntecipacao = (p: { reconciled_at: Date | null }, op: { created_at: Date }): boolean =>
  p.reconciled_at !== null && p.reconciled_at.getTime() === op.created_at.getTime();

export async function desfazerConferenciaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
): Promise<ActionResult<CartaoAReceberView>> {
  const neg = await exigir(db, ator, "dinheiro", "desfazer a conferência do cartão");
  if (neg) return neg;
  if (typeof id !== "string" || !id.trim()) return NAO_ACHADA();
  const motivo = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (motivo.length < 3 || motivo.length > 300) {
    return fail("VALIDATION_ERROR", "Diga o motivo, de 3 a 300 caracteres.", 422, "reason");
  }
  const visiveis = await lojasDoAtor(db, ator);
  const hoje = hojeEmBrasilia();

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const p = await tx.cardReceivable.findFirst({
        where: { id: id.trim() },
        include: { sale: { select: { status: true } }, anticipation: { select: { kind: true, undone_at: true, created_at: true } } },
      });
      if (!p || p.canceled_at !== null || (visiveis && !visiveis.has(p.establishment_id))) throw new AbortarConferencia(NAO_ACHADA());
      if (p.sale.status === "cancelada") throw new AbortarConferencia(VENDA_CANCELADA());
      if (!p.reconciled_at) {
        throw new AbortarConferencia(fail("NAO_CONFERIDA", "Esta parcela não está conferida.", 409, "id"));
      }
      if (p.anticipation && p.anticipation.kind === "pontual" && p.anticipation.undone_at === null && conferidaPelaAntecipacao(p, p.anticipation)) {
        throw new AbortarConferencia(
          fail(
            "CONFERIDA_PELA_ANTECIPACAO",
            "Esta parcela foi conferida pela antecipação: desfaça a antecipação para desfazer a conferência.",
            409,
            "id",
          ),
        );
      }
      const antesCent = centavos(decToNum(p.confirmed_net) ?? decToNum(p.effective_net) ?? 0);
      const limpou = await tx.cardReceivable.updateMany({
        where: { id: p.id, reconciled_at: { not: null } },
        data: { reconciled_at: null, reconciled_by_user_id: null, confirmed_net: null },
      });
      if (limpou.count === 0) {
        throw new AbortarConferencia(fail("NAO_CONFERIDA", "Esta parcela não está conferida.", 409, "id"));
      }
      const apagou = await tx.cashMovement.deleteMany({ where: { card_receivable_id: p.id, origin: "ajuste_cartao" } });
      await registrarNoHistorico(tx, ator, {
        action: "cartao.desfazer_conferencia",
        establishment_id: p.establishment_id,
        target_type: "parcela_cartao",
        target_id: p.id,
        summary: `Desfez a conferência da parcela ${p.installment}/${p.installments} do cartão (conferido ${dinheiro(reais(antesCent))}${apagou.count > 0 ? ", ajuste apagado" : ""}): ${motivo}`,
      });
    });
  } catch (err) {
    if (err instanceof AbortarConferencia) return err.recusa;
    throw err;
  }
  const row = await db.cardReceivable.findFirst({ where: { id: id.trim() }, include: INCLUDE_CARTAO });
  return row ? ok(viewDoCartao(row, hoje)) : NAO_ACHADA();
}
