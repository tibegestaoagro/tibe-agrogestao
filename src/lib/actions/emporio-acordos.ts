import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir, exigirUma, papelDoEmporio, pode } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { diaUtc } from "@/lib/emporio/fiado";
import { CATEGORIA_ACORDO, validarParcelas, type ParcelaDoAcordo } from "@/lib/emporio/acordo";
import { dinheiro, registrarNoHistorico, type MudancaDoHistorico } from "@/lib/emporio/historico";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { entradasAbertas, ehParcelaExtra } from "@/lib/actions/emporio-caixa";
import { dataBr } from "@/lib/emporio/datas";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { CATEGORIA_VENDAS } from "@/lib/actions/emporio-vendas";

/**
 * Meu Empório, financeiro, entrega 3: o acordo de fiado. Várias contas em aberto do cliente
 * viram N parcelas novas. As contas de origem ficam `cancelled` (com `agreement_id`) e os
 * pagamentos que já receberam ficam onde estão; a parcela nasce com o que faltava. O saldo
 * nunca é gravado (invariante 2): pago, aberto e situação são calculados na leitura.
 * Validação em TypeScript puro: o agente do WhatsApp chama estas funções sem o Zod.
 */

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const brl = (cent: number) => dinheiro(cent / 100);
const diaMes = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const diaCompleto = (d: Date) => `${diaMes(d)}/${d.getUTCFullYear()}`;

export type AcordoParcelaView = {
  entry_id: string;
  number: number;
  due_date: string;
  amount: number;
  paid: number;
  open: number;
  /** `abatida`: parcela zerada por devolução abatida no fiado (cancelada, sem nada pago): não é paga nem aberta. */
  status: "paga" | "em_dia" | "vencida" | "abatida";
};

/**
 * `total` é o combinado e nunca muda; `open_total` é o que falta (a soma do aberto das parcelas,
 * extras de cheque devolvido inclusas): é por ele que "o total diminui" aparece.
 */
export type AcordoView = {
  id: string;
  customer_id: string;
  created_at: string;
  created_by: string;
  total: number;
  notes: string | null;
  installments: AcordoParcelaView[];
  origins: { entry_id: string; sale_id: string | null; sold_at: string | null; amount: number }[];
  open_total: number;
  status: "ativo" | "quitado" | "desfeito";
  /** Q275: quando foi desfeito e por quê (nulos num acordo vivo). */
  undone_at: string | null;
  undone_reason: string | null;
  /** Vivo e sem movimento (nada pago, abatido nem parcela extra de cheque): pode ser desfeito. */
  can_undo: boolean;
};

export type DesfazerAcordoInput = { reason: string };

export type FazerAcordoInput = {
  entry_ids: string[];
  installments: { due_date: string; amount: number }[];
  notes?: string;
};

/** Recusa lançada de dentro da transação para desfazê-la e devolver o `fail` pronto. */
class RecusaAcordo extends Error {
  constructor(public recusa: ActionResult<never>) {
    super("recusa do acordo");
  }
}

function lerData(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v)) return null;
  const [a, m, d] = v.slice(0, 10).split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d ? data : null;
}

/** Os acordos pedidos, com tudo calculado na leitura (pago, aberto, situação da parcela). */
async function montarAcordos(db: TenantPrismaClient, where: Record<string, unknown>): Promise<AcordoView[]> {
  const acordos = await db.emporioCreditAgreement.findMany({
    where,
    orderBy: { created_at: "desc" },
    include: { created_by: { select: { name: true } } },
  });
  if (acordos.length === 0) return [];
  const ids = acordos.map((a) => a.id);
  const lancamentos = await db.financialEntry.findMany({
    where: { agreement_id: { in: ids } },
    select: { id: true, agreement_id: true, category: true, related_id: true, amount: true, due_date: true, created_at: true, status: true, notes: true },
  });
  const pagos = await db.financialPayment.findMany({
    where: { entry_id: { in: lancamentos.map((l) => l.id) } },
    select: { entry_id: true, amount: true },
  });
  const pagoDe = new Map<string, number>();
  for (const p of pagos) pagoDe.set(p.entry_id, (pagoDe.get(p.entry_id) ?? 0) + centavos(decToNum(p.amount) ?? 0));
  const origensVendas = lancamentos.filter((l) => l.category === CATEGORIA_VENDAS && l.related_id);
  const vendas = await db.emporioSale.findMany({
    where: { id: { in: origensVendas.map((l) => l.related_id as string) } },
    select: { id: true, sold_at: true },
  });
  const vendidoEm = new Map(vendas.map((v) => [v.id, v.sold_at]));
  const hoje = hojeEmBrasilia().getTime();

  return acordos.map((a) => {
    const meus = lancamentos.filter((l) => l.agreement_id === a.id);
    const parcelas = meus
      .filter((l) => l.category === CATEGORIA_ACORDO)
      .sort(
        (x, y) =>
          Number(ehParcelaExtra(x.notes)) - Number(ehParcelaExtra(y.notes)) ||
          (x.due_date?.getTime() ?? 0) - (y.due_date?.getTime() ?? 0) ||
          x.created_at.getTime() - y.created_at.getTime(),
      )
      .map((l, i): AcordoParcelaView => {
        const valor = centavos(decToNum(l.amount) ?? 0);
        const pago = pagoDe.get(l.id) ?? 0;
        const aberto = Math.max(valor - pago, 0);
        const venc = l.due_date ?? l.created_at;
        return {
          entry_id: l.id,
          number: i + 1,
          due_date: venc.toISOString(),
          amount: valor / 100,
          paid: pago / 100,
          open: aberto / 100,
          status: l.status === "cancelled" ? "abatida" : aberto === 0 ? "paga" : diaUtc(venc) < hoje ? "vencida" : "em_dia",
        };
      });
    const desfeito = a.undone_at !== null;
    const abertoTotal = desfeito ? 0 : parcelas.reduce((s, p) => s + centavos(p.open), 0);
    const doAcordo = meus.filter((l) => l.category === CATEGORIA_ACORDO);
    // Sem movimento: nada pago, nenhuma parcela cancelada ou reduzida (devolução abatida) e nenhuma extra de cheque.
    const semMovimento =
      !desfeito &&
      doAcordo.length > 0 &&
      doAcordo.every((l) => l.status === "pending" && !ehParcelaExtra(l.notes) && (pagoDe.get(l.id) ?? 0) === 0) &&
      doAcordo.reduce((s, l) => s + centavos(decToNum(l.amount) ?? 0), 0) === centavos(decToNum(a.total) ?? 0);
    return {
      id: a.id,
      customer_id: a.customer_id,
      created_at: a.created_at.toISOString(),
      created_by: a.created_by.name,
      total: decToNum(a.total) ?? 0,
      notes: a.notes,
      installments: parcelas,
      origins: meus
        .filter((l) => l.category !== CATEGORIA_ACORDO)
        .map((l) => ({
          entry_id: l.id,
          sale_id: l.related_id,
          sold_at: (l.related_id ? vendidoEm.get(l.related_id) : null)?.toISOString() ?? null,
          // O que a origem ainda devia quando foi absorvida: o valor menos o que já tinha recebido.
          amount: (centavos(decToNum(l.amount) ?? 0) - (pagoDe.get(l.id) ?? 0)) / 100,
        })),
      open_total: abertoTotal / 100,
      status: desfeito ? "desfeito" : abertoTotal === 0 ? "quitado" : "ativo",
      undone_at: a.undone_at?.toISOString() ?? null,
      undone_reason: a.undone_reason,
      can_undo: semMovimento,
    };
  });
}

export async function fazerAcordoAction(
  db: TenantPrismaClient,
  ator: Ator,
  customerId: string,
  input: FazerAcordoInput,
): Promise<ActionResult<AcordoView>> {
  const neg = await exigir(db, ator, "acordo", "fazer acordo");
  if (neg) return neg;

  if (typeof customerId !== "string" || !customerId) return fail("NOT_FOUND", "Cliente não encontrado.", 404, "customer_id");
  const cliente = await db.emporioCustomer.findFirst({
    where: { id: customerId },
    select: { id: true, name: true, system_key: true },
  });
  if (!cliente || cliente.system_key === "consumidor_final") return fail("NOT_FOUND", "Cliente não encontrado.", 404, "customer_id");

  const idsBrutos = Array.isArray(input?.entry_ids) ? input.entry_ids : [];
  const entryIds = [...new Set(idsBrutos.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (entryIds.length === 0) return fail("VALIDATION_ERROR", "Escolha as contas que entram no acordo.", 422, "entry_ids");

  const brutas = Array.isArray(input?.installments) ? input.installments : [];
  const parcelas: ParcelaDoAcordo[] = [];
  for (const p of brutas) {
    const data = lerData(p?.due_date);
    if (!data) return fail("VALIDATION_ERROR", "Toda parcela precisa de uma data de vencimento válida.", 422, "installments");
    if (typeof p.amount !== "number" || !Number.isFinite(p.amount)) {
      return fail("VALIDATION_ERROR", "Toda parcela precisa ter valor maior que zero.", 422, "installments");
    }
    parcelas.push({ due_date: data, amount_cent: centavos(p.amount) });
  }
  const notas = typeof input?.notes === "string" ? input.notes.trim() : "";
  if (notas.length > 500) return fail("VALIDATION_ERROR", "A observação deve ter no máximo 500 caracteres.", 422, "notes");

  try {
    const idAcordo = await runSerializableTenantTransaction(db, async (tx) => {
      const txDb = tx as unknown as TenantPrismaClient;
      const origens = await entradasAbertas(txDb, { emporio_customer_id: cliente.id, id: { in: entryIds } });
      if (origens.length !== entryIds.length || origens.some((o) => o.agreement_id)) {
        throw new RecusaAcordo(
          fail("ACORDO_SEM_ORIGEM", "Alguma das contas escolhidas não está mais em aberto, ou já está em um acordo.", 422, "entry_ids"),
        );
      }
      const totalCent = origens.reduce((s, o) => s + o.open_cent, 0);
      const hoje = hojeEmBrasilia();
      const valida = validarParcelas(parcelas, totalCent, hoje);
      if (!valida.ok) throw new RecusaAcordo(fail(valida.code, valida.message, 422, valida.field));

      const agora = new Date();
      const lojaId = origens[0].establishment_id;
      const acordo = await tx.emporioCreditAgreement.create({
        data: scoped({
          customer_id: cliente.id,
          created_by_user_id: ator.id,
          total: totalCent / 100,
          installments: parcelas.length,
          notes: notas || null,
        }),
      });
      for (let i = 0; i < parcelas.length; i++) {
        await createLinkedEntry(tx, {
          entry_type: "income",
          category: CATEGORIA_ACORDO,
          amount: parcelas[i].amount_cent / 100,
          related_module: "emporio",
          related_id: acordo.id,
          occurred_at: agora,
          status: "pending",
          due_date: parcelas[i].due_date,
          agreement_id: acordo.id,
          emporio_customer_id: cliente.id,
          establishment_id: lojaId,
          notes: `Acordo de fiado, parcela ${i + 1}/${parcelas.length}`,
        });
      }
      await tx.financialEntry.updateMany({
        where: { id: { in: origens.map((o) => o.id) } },
        data: { status: "cancelled", agreement_id: acordo.id },
      });

      const mudancas: MudancaDoHistorico[] = [
        ...origens.map((o) => ({
          campo: `Conta de ${dataBr(o.sold_at.toISOString()).slice(0, 5)}`,
          antes: `${brl(o.open_cent)} em aberto`,
          depois: "entrou no acordo",
        })),
        ...parcelas.map((p, i) => ({
          campo: `Parcela ${i + 1}/${parcelas.length}`,
          antes: null,
          depois: `${brl(p.amount_cent)}, vence ${diaCompleto(p.due_date)}`,
        })),
      ];
      await registrarNoHistorico(tx, ator, {
        action: "fiado.acordo",
        establishment_id: lojaId,
        target_type: "cliente",
        target_id: cliente.id,
        summary: `Acordo com ${cliente.name}: ${brl(totalCent)} em ${parcelas.length} ${parcelas.length === 1 ? "parcela" : "parcelas"}, de ${diaMes(parcelas[0].due_date)} a ${diaMes(parcelas[parcelas.length - 1].due_date)}`,
        changes: mudancas,
      });
      return acordo.id;
    });
    const [view] = await montarAcordos(db, { id: idAcordo });
    return ok(view);
  } catch (err) {
    if (err instanceof RecusaAcordo) return err.recusa;
    throw err;
  }
}

export async function listarAcordosDoClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  customerId: string,
): Promise<ActionResult<AcordoView[]>> {
  const neg = await exigirUma(db, ator, ["vendedor_da_loja", "dinheiro"], "ver os acordos do cliente");
  if (neg) return neg;
  if (typeof customerId !== "string" || !customerId) return fail("NOT_FOUND", "Cliente não encontrado.", 404, "customer_id");
  const cliente = await db.emporioCustomer.findFirst({ where: { id: customerId }, select: { id: true, system_key: true } });
  if (!cliente || cliente.system_key === "consumidor_final") return fail("NOT_FOUND", "Cliente não encontrado.", 404, "customer_id");

  const acordos = await montarAcordos(db, { customer_id: cliente.id });
  // Quem não mexe no dinheiro só enxerga o acordo das lojas dele (mesma regra da ficha de crédito).
  if (pode(await papelDoEmporio(db, ator), "dinheiro")) return ok(acordos);
  const visiveis = await lojasDoAtor(db, ator);
  if (!visiveis) return ok(acordos);
  const lojas = await db.financialEntry.findMany({
    where: { agreement_id: { in: acordos.map((a) => a.id) }, category: CATEGORIA_ACORDO },
    select: { agreement_id: true, establishment_id: true },
  });
  const permitidos = new Set(lojas.filter((l) => l.establishment_id && visiveis.has(l.establishment_id)).map((l) => l.agreement_id));
  return ok(acordos.filter((a) => permitidos.has(a.id)));
}

/**
 * Q275, dívida 2.39: desfaz um acordo SEM movimento. As parcelas ficam canceladas, as origens voltam a pendentes
 * (com o mesmo vencimento e o que já tinham recebido) e o acordo guarda quem desfez, quando e por quê.
 * Parcela paga, abatida por devolução ou extra de cheque devolvido: recusa (409), porque desfazer mentiria sobre o caixa.
 */
export async function desfazerAcordoAction(
  db: TenantPrismaClient,
  ator: Ator,
  acordoId: string,
  input: DesfazerAcordoInput,
): Promise<ActionResult<AcordoView>> {
  const neg = await exigir(db, ator, "acordo", "desfazer acordo");
  if (neg) return neg;

  if (typeof acordoId !== "string" || !acordoId) return fail("NOT_FOUND", "Acordo não encontrado.", 404, "agreement_id");
  const motivo = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!motivo) return fail("VALIDATION_ERROR", "Diga por que o acordo está sendo desfeito.", 422, "reason");
  if (motivo.length > 500) return fail("VALIDATION_ERROR", "O motivo deve ter no máximo 500 caracteres.", 422, "reason");

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const txDb = tx as unknown as TenantPrismaClient;
      const acordo = await tx.emporioCreditAgreement.findFirst({
        where: { id: acordoId },
        include: { customer: { select: { name: true } } },
      });
      if (!acordo) throw new RecusaAcordo(fail("NOT_FOUND", "Acordo não encontrado.", 404, "agreement_id"));
      if (acordo.undone_at) throw new RecusaAcordo(fail("ACORDO_DESFEITO", "Esse acordo já foi desfeito.", 409));

      const [view] = await montarAcordos(txDb, { id: acordo.id });
      if (!view.can_undo) {
        throw new RecusaAcordo(
          fail(
            "ACORDO_COM_MOVIMENTO",
            "Esse acordo já tem movimento (parcela paga, abatida por devolução ou parcela extra de cheque devolvido) e não pode ser desfeito.",
            409,
          ),
        );
      }

      const lancamentos = await tx.financialEntry.findMany({
        where: { agreement_id: acordo.id },
        select: { id: true, category: true, establishment_id: true, amount: true, due_date: true },
      });
      const parcelasIds = lancamentos.filter((l) => l.category === CATEGORIA_ACORDO).map((l) => l.id);
      const origensIds = lancamentos.filter((l) => l.category !== CATEGORIA_ACORDO).map((l) => l.id);
      await tx.financialEntry.updateMany({ where: { id: { in: parcelasIds } }, data: { status: "cancelled" } });
      await tx.financialEntry.updateMany({
        where: { id: { in: origensIds } },
        data: { status: "pending", agreement_id: null },
      });
      await tx.emporioCreditAgreement.update({
        where: { id: acordo.id },
        data: { undone_at: new Date(), undone_by_user_id: ator.id, undone_reason: motivo },
      });

      await registrarNoHistorico(tx, ator, {
        action: "fiado.acordo.desfazer",
        establishment_id: lancamentos.find((l) => l.establishment_id)?.establishment_id ?? null,
        target_type: "cliente",
        target_id: acordo.customer_id,
        summary: `Acordo de ${acordo.customer.name} desfeito: ${brl(centavos(decToNum(acordo.total) ?? 0))} voltam ao fiado (${motivo})`,
        changes: [
          { campo: "Acordo", antes: `${acordo.installments} ${acordo.installments === 1 ? "parcela" : "parcelas"}`, depois: "desfeito" },
          { campo: "Contas de origem", antes: "no acordo", depois: `${origensIds.length} de volta ao fiado em aberto` },
          { campo: "Motivo", antes: null, depois: motivo },
        ],
      });
    });
    const [view] = await montarAcordos(db, { id: acordoId });
    return ok(view);
  } catch (err) {
    if (err instanceof RecusaAcordo) return err.recusa;
    throw err;
  }
}
