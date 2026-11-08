import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir, exigirUma, papelDoEmporio, pode } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { diaUtc } from "@/lib/emporio/fiado";
import { CATEGORIA_ACORDO, validarParcelas, type ParcelaDoAcordo } from "@/lib/emporio/acordo";
import { dinheiro, registrarNoHistorico, type MudancaDoHistorico } from "@/lib/emporio/historico";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { entradasAbertas } from "@/lib/actions/emporio-caixa";
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
  status: "paga" | "em_dia" | "vencida";
};

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
  status: "ativo" | "quitado";
};

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
    select: { id: true, agreement_id: true, category: true, related_id: true, amount: true, due_date: true, created_at: true, status: true },
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
      .sort((x, y) => (x.due_date?.getTime() ?? 0) - (y.due_date?.getTime() ?? 0) || x.created_at.getTime() - y.created_at.getTime())
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
          status: aberto === 0 ? "paga" : diaUtc(venc) < hoje ? "vencida" : "em_dia",
        };
      });
    const abertoTotal = parcelas.reduce((s, p) => s + centavos(p.open), 0);
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
      status: abertoTotal === 0 ? "quitado" : "ativo",
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
          campo: `Conta de ${diaMes(o.sold_at)}`,
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
