import { negotiationCreateSchema } from "@/lib/validation/negotiation";
import { productNegotiationSchema } from "@/lib/validation/stock";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  createCattleNegotiation,
  listNegotiations,
  serializeNegotiation,
  type NegotiationFilter,
} from "@/lib/actions/negotiations";
import { createProductNegotiation } from "@/lib/actions/product-negotiations";
import type { TenantPrismaClient } from "@/lib/prisma";

/**
 * GET  /api/v1/negotiations   lista as negociações (Módulo 31, §19)
 * POST /api/v1/negotiations   registra um negócio de gado (§6 e §7) ou de
 *                             produtos (§9)
 *
 * UMA rota para comprar e vender, com `type` no corpo, pelo mesmo motivo da
 * rota única do rebanho: compra e venda são a mesma operação com o sinal
 * invertido, e duas rotas finas duplicariam validação de parcela, de custo e
 * de contato sem nada em troca. Gado e produto entram pela mesma porta pelo
 * mesmo motivo: o envelope, o parcelamento, os custos adicionais e o contato
 * são idênticos, e só muda que filho o negócio cria (`HerdMovement` ou
 * `StockMovement`).
 *
 * A rota é fina de propósito: o Zod valida FORMA de dado, e toda a regra
 * (soma das parcelas, saldo disponível, atomicidade) vive na action, onde é
 * testada por `test:m35` e `test:m37`.
 */

const TIPOS_LISTA = [
  "compra_gado",
  "venda_gado",
  "compra_produto",
  "venda_produto",
  "permuta",
  "evento",
] as const;

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const params = new URL(request.url).searchParams;
  const filter: NegotiationFilter = {};

  const tipo = params.get("type");
  if (tipo && (TIPOS_LISTA as readonly string[]).includes(tipo)) {
    filter.type = tipo as NegotiationFilter["type"];
  }
  const contato = params.get("contact_id");
  if (contato) filter.contact_id = contato;
  const fazenda = params.get("property_id");
  if (fazenda) filter.property_id = fazenda;

  filter.since = parseDate(params.get("since"));
  filter.until = parseDate(params.get("until"));

  // Canceladas aparecem por padrão: o §17.10 exige o histórico completo.
  if (params.get("include_canceled") === "false") filter.include_canceled = false;

  const limit = Number(params.get("limit"));
  const offset = Number(params.get("offset"));

  const { items, total } = await listNegotiations(g.db, filter, {
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    offset: Number.isFinite(offset) && offset > 0 ? offset : undefined,
  });

  return apiOk(items.map(serializeNegotiation), { total });
}

export async function POST(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  // O `type` decide o contrato ANTES da validação: gado e produto têm itens de
  // formas diferentes (categoria x produto), e validar os dois com um schema só
  // aceitaria um corpo de gado num negócio de produto sem ninguém reclamar.
  const tipoBruto = (body.json as { type?: unknown })?.type;
  if (tipoBruto === "compra_produto" || tipoBruto === "venda_produto") {
    return criarNegocioDeProduto(g, body.json);
  }

  const parsed = negotiationCreateSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const d = parsed.data;

  const result = await createCattleNegotiation(g.db, {
    type: d.type,
    property_id: d.property_id,
    itens: d.itens.map((i) => ({
      category_id: i.category_id,
      quantity: i.quantity,
      pasture_id: i.pasture_id ?? null,
    })),
    amount: d.amount,
    contact_id: d.contact_id ?? null,
    contact_name: d.contact_name ?? null,
    occurred_at: d.occurred_at ? new Date(d.occurred_at) : null,
    pago: d.pago ?? false,
    due_date: d.due_date ? new Date(d.due_date) : null,
    parcelas: (d.parcelas ?? []).map((p) => ({
      due_date: new Date(p.due_date),
      amount: p.amount,
    })),
    custos: d.custos ?? [],
    notes: d.notes ?? null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  return apiOk(result.data, {}, { status: 201 });
}

type GuardOk = { user: { id: string }; db: TenantPrismaClient };

/** §9: "Comprei produtos" e "Vendi produtos", no mesmo envelope do gado. */
async function criarNegocioDeProduto(g: GuardOk, json: unknown) {
  const parsed = productNegotiationSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const d = parsed.data;

  const result = await createProductNegotiation(g.db, {
    type: d.type,
    property_id: d.property_id,
    itens: d.itens.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    amount: d.amount,
    contact_id: d.contact_id ?? null,
    contact_name: d.contact_name ?? null,
    occurred_at: d.occurred_at ? new Date(d.occurred_at) : null,
    pago: d.pago ?? false,
    due_date: d.due_date ? new Date(d.due_date) : null,
    parcelas: (d.parcelas ?? []).map((p) => ({
      due_date: new Date(p.due_date),
      amount: p.amount,
    })),
    custos: d.custos ?? [],
    notes: d.notes ?? null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  return apiOk(result.data, {}, { status: 201 });
}
