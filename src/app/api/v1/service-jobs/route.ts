import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  listServiceJobs,
  createServiceJob,
  SERVICOS_SUGERIDOS,
} from "@/lib/actions/service-jobs";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/service-jobs   lista os serviços contratados (§38)
 * POST /api/v1/service-jobs   registra um serviço (§13 a §18)
 *
 * Wrapper fino: a regra vive em `src/lib/actions/service-jobs.ts`.
 *
 * Guard `servicos`, com matriz OPERACIONAL, e a diferença para o guard de
 * `mao_de_obra` é deliberada: a diária de um serviço não tem a sensibilidade
 * de um salário, e quem viu o trabalho acontecer é quem está no curral. Um
 * OPERADOR registra "vieram 3 homens hoje" e continua sem enxergar quanto o
 * vaqueiro ganha por mês.
 */

const PRICINGS = [
  "hora",
  "hectare",
  "dia",
  "viagem",
  "tonelada",
  "metro",
  "quilometro",
  "cabeca",
  "fechado",
] as const;

const createSchema = z.object({
  property_id: z.string().trim().min(1, "Escolha a fazenda"),
  occurred_at: z.string().datetime("Informe uma data válida"),
  description: z.string().trim().min(1, "Informe qual serviço foi feito"),
  pricing: z.enum(PRICINGS),
  unit_price: z.number().positive("O valor precisa ser maior que zero").nullish(),
  agreed_amount: z.number().positive("O valor precisa ser maior que zero").nullish(),
  quantity: z.number().positive("A quantidade precisa ser maior que zero").nullish(),
  worker_count: z.number().int().positive("Informe quantas pessoas trabalharam").nullish(),
  contact_id: z.string().trim().min(1).nullish(),
  contact_name: z.string().trim().max(200).nullish(),
  worker_id: z.string().trim().min(1).nullish(),
  pasture_id: z.string().trim().min(1).nullish(),
  confinement_stay_id: z.string().trim().min(1).nullish(),
  milk_site_id: z.string().trim().min(1).nullish(),
  machine_id: z.string().trim().min(1).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  pago: z.boolean().nullish(),
  due_date: z.string().datetime("Informe uma data válida").nullish(),
});

async function GETHandler(request: Request) {
  const g = await guard("servicos", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const valido = ["agendado", "em_andamento", "concluido", "cancelado"];

  const jobs = await listServiceJobs(g.db, {
    status: status && valido.includes(status) ? (status as never) : null,
    property_id: params.get("property_id") || null,
    contact_id: params.get("contact_id") || null,
    incluir_cancelados: params.get("incluir_cancelados") === "true",
  });

  return apiOk(jobs, { total: jobs.length, servicos_sugeridos: SERVICOS_SUGERIDOS });
}

async function POSTHandler(request: Request) {
  const g = await guard("servicos", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const d = parsed.data;

  const res = await createServiceJob(g.db, {
    property_id: d.property_id,
    occurred_at: new Date(d.occurred_at),
    description: d.description,
    pricing: d.pricing,
    unit_price: d.unit_price ?? null,
    agreed_amount: d.agreed_amount ?? null,
    quantity: d.quantity ?? null,
    worker_count: d.worker_count ?? null,
    contact_id: d.contact_id ?? null,
    contact_name: d.contact_name ?? null,
    worker_id: d.worker_id ?? null,
    pasture_id: d.pasture_id ?? null,
    confinement_stay_id: d.confinement_stay_id ?? null,
    milk_site_id: d.milk_site_id ?? null,
    machine_id: d.machine_id ?? null,
    notes: d.notes ?? null,
    pago: d.pago ?? false,
    due_date: d.due_date ? new Date(d.due_date) : null,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
