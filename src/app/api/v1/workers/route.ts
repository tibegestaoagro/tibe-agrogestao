import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { listWorkers, createWorker, FUNCOES_SUGERIDAS } from "@/lib/actions/workers";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/workers   lista a equipe (§38, "Minha equipe")
 * POST /api/v1/workers   cadastra um trabalhador (§5)
 *
 * Wrapper fino: a regra vive em `src/lib/actions/workers.ts`.
 *
 * Guard `mao_de_obra`, com matriz PRÓPRIA: OWNER e ADMIN escrevem, OPERADOR e
 * VISUALIZADOR não veem. Reusar `financeiro` ou `rebanho` seria o caminho
 * óbvio, e as duas matrizes dão escrita a OPERADOR: isto guarda salário.
 * Decisão do usuário em 02/09.
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do trabalhador"),
  role: z.string().trim().min(1, "Informe a função"),
  type: z.enum(["fixo", "eventual"]),
  pay_frequency: z.enum(["mensal", "quinzenal", "semanal", "diaria", "outra"]).nullish(),
  pay_amount: z.number().positive("O valor precisa ser maior que zero").nullish(),
  pay_day: z
    .number()
    .int("O dia de pagamento precisa ser um número inteiro")
    .min(1, "O dia de pagamento precisa estar entre 1 e 31")
    .max(31, "O dia de pagamento precisa estar entre 1 e 31")
    .nullish(),
  property_id: z.string().trim().min(1).nullish(),
  phone: z.string().trim().max(40).nullish(),
  started_at: z.string().datetime().nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

async function GETHandler(request: Request) {
  const g = await guard("mao_de_obra", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const propertyId = params.get("property_id");

  const workers = await listWorkers(g.db, {
    status: status === "ativo" || status === "inativo" ? status : null,
    property_id: propertyId || null,
  });

  return apiOk(workers, { total: workers.length, funcoes_sugeridas: FUNCOES_SUGERIDAS });
}

async function POSTHandler(request: Request) {
  const g = await guard("mao_de_obra", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const d = parsed.data;
  const res = await createWorker(g.db, {
    name: d.name,
    role: d.role,
    type: d.type,
    pay_frequency: d.pay_frequency ?? null,
    pay_amount: d.pay_amount ?? null,
    pay_day: d.pay_day ?? null,
    property_id: d.property_id ?? null,
    phone: d.phone ?? null,
    started_at: d.started_at ? new Date(d.started_at) : null,
    notes: d.notes ?? null,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
