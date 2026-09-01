import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  contagemAtual,
  listLactationEntries,
  recordLactationEntry,
} from "@/lib/actions/milk-lactation";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/milk/lactation   histórico dos registros, com a contagem vigente
 * POST /api/v1/milk/lactation   registra `definir`, `entrada` ou `saida` (§4, §7)
 *
 * A contagem vem no `meta` da listagem, e não como recurso próprio, porque ela
 * NÃO é um registro: é o dobramento das linhas listadas logo abaixo. Endpoint
 * separado sugeriria uma linha guardada em algum lugar, que é exatamente o que
 * o invariante 2 proíbe.
 */

const DIA = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  property_id: z.string().min(1, "Informe a fazenda"),
  type: z.enum(["definir", "entrada", "saida"]),
  quantity: z.number().int("A quantidade deve ser um número inteiro").min(0),
  recorded_at: z.coerce.date().nullish(),
  pasture_id: z.string().min(1).nullish(),
  group_id: z.string().min(1).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

type Registro = Awaited<ReturnType<typeof listLactationEntries>>[number];

function serializar(entrada: Registro) {
  return {
    id: entrada.id,
    property_id: entrada.property_id,
    type: entrada.type,
    quantity: entrada.quantity,
    recorded_at: entrada.recorded_at.toISOString(),
    pasture_id: entrada.pasture_id,
    group_id: entrada.group_id,
    notes: entrada.notes,
    cancelled: entrada.cancelled_at != null,
    cancelled_at: isoOrNull(entrada.cancelled_at),
  };
}

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const url = new URL(request.url);
  const property_id = url.searchParams.get("property_id") ?? undefined;
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");

  const registros = await listLactationEntries(g.db, {
    property_id,
    group_id: url.searchParams.get("group_id") ?? undefined,
    de: de && DIA.test(de) ? de : undefined,
    ate: ate && DIA.test(ate) ? ate : undefined,
    limit: Number(url.searchParams.get("limit")) || undefined,
  });

  // A contagem só existe por fazenda (decisão 4.2 da spec): sem `property_id`
  // a listagem é histórico puro, e devolver um número aqui seria inventar a
  // soma de fazendas que ninguém pediu.
  const vacas_em_lactacao = property_id ? await contagemAtual(g.db, property_id) : null;

  return apiOk(registros.map(serializar), {
    total: registros.length,
    vacas_em_lactacao,
  });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await recordLactationEntry(g.db, {
    ...parsed.data,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const vacas_em_lactacao = await contagemAtual(g.db, result.data.property_id);

  return apiOk(serializar(result.data), { vacas_em_lactacao }, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
