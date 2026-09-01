import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  storeProduction,
  transferToCollectionPoint,
  receiveFromThirdParty,
  withdrawFromSite,
  getMilkStorageSummary,
} from "@/lib/actions/milk-storage";
import { getMilkPositions, listMilkMovements } from "@/lib/actions/milk-ledger";
import type { MilkMovementRecord } from "@/lib/actions/milk-ledger";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/milk/storage   o painel de armazenamento do §34: posições
 *                             (local x dono), volume físico e o resumo.
 * POST /api/v1/milk/storage   as quatro conversas do §14 ao §21, escolhidas
 *                             pelo campo `gesto`.
 *
 * Um endpoint com `gesto` discriminado, e não quatro rotas, porque as quatro
 * escrevem no MESMO livro-razão e o cliente sempre chama uma delas a partir da
 * mesma tela. O corpo é validado por união discriminada do Zod, então cada
 * gesto continua com os próprios campos obrigatórios: a economia é de rota, não
 * de validação.
 */

const litros = z.number().positive("A quantidade em litros deve ser maior que zero").max(1_000_000);

const armazenar = z.object({
  gesto: z.literal("armazenar"),
  site_id: z.string().min(1, "Escolha o tanque"),
  liters: litros,
  occurred_at: z.coerce.date().nullish(),
  production_id: z.string().min(1).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

const transferir = z.object({
  gesto: z.literal("transferir"),
  from_site_id: z.string().min(1, "Escolha o tanque de origem"),
  to_site_id: z.string().min(1, "Escolha o ponto de coleta"),
  liters: litros,
  occurred_at: z.coerce.date().nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

const receber = z.object({
  gesto: z.literal("receber"),
  site_id: z.string().min(1, "Escolha o tanque"),
  owner_id: z.string().min(1, "Escolha o produtor"),
  liters: litros,
  occurred_at: z.coerce.date().nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

const retirar = z.object({
  gesto: z.literal("retirar"),
  site_id: z.string().min(1, "Escolha o local"),
  destination: z.enum([
    "venda",
    "laticinio",
    "cooperativa",
    "ponto_coleta",
    "fabricacao_propria",
    "alimentacao_bezerros",
    "consumo",
    "descarte",
    "outro",
  ]),
  itens: z
    .array(
      z.object({
        owner_id: z.string().min(1).nullable(),
        liters: z.number().min(0).max(1_000_000),
      }),
    )
    .min(1, "Informe quantos litros saíram"),
  occurred_at: z.coerce.date().nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

const corpo = z.discriminatedUnion("gesto", [armazenar, transferir, receber, retirar]);

function serializar(m: MilkMovementRecord) {
  return {
    id: m.id,
    movement_type: m.movement_type,
    liters: m.liters,
    occurred_at: m.occurred_at.toISOString(),
    from_site_id: m.from_site_id,
    from_owner_id: m.from_owner_id,
    to_site_id: m.to_site_id,
    to_owner_id: m.to_owner_id,
    destination: m.destination,
    production_id: m.production_id,
    notes: m.notes,
    canceled: m.canceled_at != null,
    canceled_at: isoOrNull(m.canceled_at),
  };
}

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const url = new URL(request.url);
  const site_id = url.searchParams.get("site_id") ?? undefined;

  const [posicoes, resumo, movimentos] = await Promise.all([
    getMilkPositions(g.db, { site_id }),
    getMilkStorageSummary(g.db),
    listMilkMovements(g.db, {
      site_id,
      limit: Number(url.searchParams.get("limit")) || undefined,
    }),
  ]);

  return apiOk(
    {
      posicoes,
      resumo,
      movimentos: movimentos.map(serializar),
    },
    { total_posicoes: posicoes.length },
  );
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = corpo.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const input = parsed.data;
  const autor = { recorded_by_user_id: g.user.id };

  if (input.gesto === "retirar") {
    const result = await withdrawFromSite(g.db, { ...input, ...autor });
    if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
    const total = result.data.reduce((s, m) => s + m.liters, 0);
    return apiOk(
      result.data.map(serializar),
      { total_litros: Math.round(total * 100) / 100 },
      { status: 201 },
    );
  }

  const result =
    input.gesto === "armazenar"
      ? await storeProduction(g.db, { ...input, ...autor })
      : input.gesto === "transferir"
        ? await transferToCollectionPoint(g.db, { ...input, ...autor })
        : await receiveFromThirdParty(g.db, { ...input, ...autor });

  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(serializar(result.data), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
