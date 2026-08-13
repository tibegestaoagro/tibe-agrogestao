import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  createCattleNegotiation,
  listNegotiations,
  serializeNegotiation,
  type NegotiationFilter,
} from "@/lib/actions/negotiations";

/**
 * GET  /api/v1/negotiations   lista as negociações (Módulo 31, §19)
 * POST /api/v1/negotiations   registra um negócio de gado (§6 e §7)
 *
 * UMA rota para comprar e vender, com `type` no corpo, pelo mesmo motivo da
 * rota única do rebanho: compra e venda são a mesma operação com o sinal
 * invertido, e duas rotas finas duplicariam validação de parcela, de custo e
 * de contato sem nada em troca.
 *
 * A rota é fina de propósito: o Zod valida FORMA de dado, e toda a regra
 * (soma das parcelas, saldo disponível, atomicidade) vive na action, onde é
 * testada por `test:m35`.
 */

const itemSchema = z.object({
  category_id: z.string().min(1, "Informe a categoria dos animais"),
  quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
  pasture_id: z.string().min(1).nullish(),
});

const parcelaSchema = z.object({
  due_date: z.string().datetime({ message: "Data de vencimento inválida" }),
  amount: z.number().positive("O valor da parcela deve ser maior que zero"),
});

const custoSchema = z.object({
  descricao: z.string().trim().min(1, "Descreva o custo adicional"),
  amount: z.number().nonnegative("Custo adicional não pode ser negativo"),
});

const createSchema = z.object({
  type: z.enum(["compra_gado", "venda_gado"]),
  property_id: z.string().min(1, "Informe a fazenda"),
  itens: z.array(itemSchema).min(1, "Informe pelo menos uma categoria"),
  amount: z.number().positive("Informe o valor total do negócio"),
  contact_id: z.string().min(1).nullish(),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  /** §6.3 e §7.3: "o pagamento já foi feito?" */
  pago: z.boolean().nullish(),
  // §6.3 e §7.3: quando não foi pago, o vencimento é o primeiro dado pedido.
  // Sem ele a conta nasce vencendo hoje e o alerta de atraso dispara na hora.
  due_date: z.string().datetime({ message: "Data de vencimento inválida" }).nullish(),
  parcelas: z.array(parcelaSchema).nullish(),
  custos: z.array(custoSchema).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

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

  const parsed = createSchema.safeParse(body.json);
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
