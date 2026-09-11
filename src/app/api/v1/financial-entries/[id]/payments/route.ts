import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeFinancialPayment } from "@/lib/serializers";
import {
  registrarPagamentoAction,
  listarPagamentosAction,
  resumoDePagamento,
} from "@/lib/actions/financial-payments";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/financial-entries/:id/payments  lista os pagamentos da conta
 * POST /api/v1/financial-entries/:id/payments  registra um pagamento parcial
 *
 * Módulo 35, fase 1 (§13 e §14). O valor pago é a soma destes registros, e
 * `meta` devolve o derivado para a tela não recalcular.
 */

const criarSchema = z.object({
  amount: z.number().positive("O valor do pagamento precisa ser maior que zero"),
  paid_at: z.string().datetime().nullish(),
  method: z
    .enum(["dinheiro", "pix", "transferencia", "boleto", "cheque", "cartao", "outro"])
    .nullish(),
  notes: z.string().trim().nullish(),
});

async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("financeiro", "read");
  if ("error" in g) return g.error;

  const entry = await g.db.financialEntry.findFirst({ where: { id: params.id } });
  if (!entry) return apiError("NOT_FOUND", "Lançamento não encontrado", 404);

  const pagamentos = await listarPagamentosAction(g.db, params.id);
  const resumo = await resumoDePagamento(g.db, entry);

  return apiOk(pagamentos.map(serializeFinancialPayment), {
    total: pagamentos.length,
    ...resumo,
  });
}

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("financeiro", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = criarSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await registrarPagamentoAction(g.db, params.id, {
    amount: parsed.data.amount,
    paid_at: parsed.data.paid_at ? new Date(parsed.data.paid_at) : null,
    method: parsed.data.method ?? null,
    notes: parsed.data.notes ?? null,
    created_by_user_id: g.user.id,
  });
  // `field` atravessa: a recusa de valor que estoura o saldo pertence ao campo
  // do valor, e sem isso ela cairia no rodapé do painel.
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const { id, ...resumo } = result.data;
  return apiOk({ id }, resumo, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
