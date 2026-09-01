import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  listMilkProduction,
  recordMilkProduction,
  type MilkProductionRecord,
} from "@/lib/actions/milk-production";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/milk/production   lista registros de produção, por período e lote
 * POST /api/v1/milk/production   registra produção, até três turnos de uma vez
 *
 * O POST devolve uma LISTA, mesmo quando grava um registro só: "300 de manhã e
 * 180 à tarde" são duas linhas (§9.2, decisão 4.3 da spec), e um contrato que
 * devolvesse objeto no caso simples obrigaria o cliente a tratar duas formas.
 */

const DIA = /^\d{4}-\d{2}-\d{2}$/;

const litros = z
  .number()
  .positive("A quantidade em litros deve ser maior que zero")
  .max(1_000_000)
  .nullish();

const createSchema = z.object({
  property_id: z.string().min(1, "Informe a fazenda"),
  recorded_at: z.coerce.date().nullish(),
  dia: litros,
  manha: litros,
  tarde: litros,
  noite: litros,
  group_id: z.string().min(1).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  vacas_em_lactacao: z
    .number()
    .int("A quantidade de vacas deve ser um número inteiro")
    .min(0)
    .nullish(),
});

function serializar(registro: MilkProductionRecord) {
  return {
    id: registro.id,
    property_id: registro.property_id,
    liters: registro.liters,
    shift: registro.shift,
    recorded_at: registro.recorded_at.toISOString(),
    group_id: registro.group_id,
    notes: registro.notes,
    cancelled: registro.cancelled_at != null,
    cancelled_at: isoOrNull(registro.cancelled_at),
  };
}

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const url = new URL(request.url);
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");

  const registros = await listMilkProduction(g.db, {
    property_id: url.searchParams.get("property_id") ?? undefined,
    group_id: url.searchParams.get("group_id") ?? undefined,
    de: de && DIA.test(de) ? de : undefined,
    ate: ate && DIA.test(ate) ? ate : undefined,
    limit: Number(url.searchParams.get("limit")) || undefined,
  });

  const total_litros = registros
    .filter((r) => r.cancelled_at == null)
    .reduce((soma, r) => soma + r.liters, 0);

  return apiOk(registros.map(serializar), {
    total: registros.length,
    total_litros: Math.round(total_litros * 100) / 100,
  });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await recordMilkProduction(g.db, {
    ...parsed.data,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const total = result.data.reduce((soma, r) => soma + r.liters, 0);

  return apiOk(
    result.data.map(serializar),
    { total_litros: Math.round(total * 100) / 100 },
    { status: 201 },
  );
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
