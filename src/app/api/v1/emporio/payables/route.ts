import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { criarContaAvulsaAction, listarContasAPagarAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { caixaDoTurno, dataIso } from "@/lib/emporio/venda-schema";

/** GET /api/v1/emporio/payables: contas de vendas, despesas fixas, compras, fretes e avulsas, no alcance do papel do Empório. Filtros: establishment_id, status, de, ate (vencimento) e limit. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const de = sp.get("de") ? dataIso.safeParse(sp.get("de")) : null;
  const ate = sp.get("ate") ? dataIso.safeParse(sp.get("ate")) : null;
  if ((de && !de.success) || (ate && !ate.success)) {
    return apiErroDeZod((de && !de.success ? de : (ate as { error: z.ZodError })).error);
  }
  const limit = Number(sp.get("limit"));
  return respostaDaAction(
    await listarContasAPagarAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      status: status === "pending" || status === "paid" || status === "cancelled" || status === "all" ? status : undefined,
      de: de?.success ? de.data : undefined,
      ate: ate?.success ? ate.data : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : undefined,
    }),
  );
}

export const GET = withApi(GETHandler);

const criarSchema = z.object({
  establishment_id: z.string({ error: "Escolha a loja." }),
  description: z.string({ error: "Informe a descrição." }),
  amount: z.number({ error: "Informe um valor positivo válido." }),
  due_date: dataIso,
  status: z.enum(["pending", "paid"], { error: "Escolha Pendente ou Paga." }),
  emporio_supplier_id: z.string().nullish(),
  emporio_other_name: z.string().nullish(),
  paid_at: dataIso.nullish(),
  from: z.object({
    establishment_id: z.string().nullish(),
    bank_account_id: z.string().nullish(),
  }, { error: "Diga de onde sai o dinheiro." }).optional(),
  cash_register_id: caixaDoTurno,
});

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = criarSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(await criarContaAvulsaAction(g.db, g.user, parsed.data), 201);
}

export const POST = withApi(POSTHandler);
