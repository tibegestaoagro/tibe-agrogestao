import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeFinancialEntry } from "@/lib/serializers";
import { createManualEntryAction } from "@/lib/actions/financial-entries";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/financial-entries   lista com filtros (period, entry_type, category, related_module, status)
 * POST /api/v1/financial-entries   lançamento manual (contrato spec 4.2): sempre related_module: geral
 */

const createSchema = z.object({
  entry_type: z.enum(["income", "expense"]),
  category: z.string().trim().min(1, "Categoria é obrigatória"),
  amount: z.number().positive("Valor deve ser positivo"),
  due_date: z.string().datetime(),
  notes: z.string().trim().nullish(),
});

async function GETHandler(request: Request) {
  const g = await guard("financeiro", "read");
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const start = sp.get("start");
  const end = sp.get("end");
  const entry_type = sp.get("entry_type") || undefined;
  const category = sp.get("category") || undefined;
  const related_module = sp.get("related_module") || undefined;
  const status = sp.get("status") || undefined;

  const entries = await g.db.financialEntry.findMany({
    where: {
      ...(start || end
        ? {
            due_date: {
              ...(start ? { gte: new Date(start) } : {}),
              ...(end ? { lte: new Date(end) } : {}),
            },
          }
        : {}),
      ...(entry_type ? { entry_type: entry_type as "income" | "expense" } : {}),
      ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
      ...(related_module
        ? { related_module: related_module as "rebanho" | "lavoura" | "servico" | "maquinas" | "geral" }
        : {}),
      ...(status ? { status: status as "pending" | "paid" | "overdue" } : {}),
    },
    orderBy: { due_date: "desc" },
  });

  return apiOk(entries.map(serializeFinancialEntry), { total: entries.length });
}

async function POSTHandler(request: Request) {
  const g = await guard("financeiro", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { entry_type, category, amount, due_date, notes } = parsed.data;

  const result = await createManualEntryAction(g.db, {
    entry_type,
    category,
    amount,
    due_date: new Date(due_date),
    notes,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const entry = await g.db.financialEntry.findFirst({ where: { id: result.data.id } });
  return apiOk(serializeFinancialEntry(entry!), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
