import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { HERD_CLOSE_TYPES } from "@/lib/actions/herd-ledger";
import { closeStay } from "@/lib/actions/herd-stays";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/herd/stays/{id}/close   encerra uma estadia (Módulo 30, fase 2)
 *
 * Os destinos vêm como LISTA por tipo de movimento, e não como três campos
 * fixos (vendidos, retornados, outros): os encerramentos do desaparecimento
 * são encontrado, morte confirmada e perda confirmada, que não cabem naqueles
 * nomes. A tela é que traduz para o que o produtor lê.
 *
 * A regra que o documento cobra, "a soma das destinações deve corresponder à
 * quantidade enviada", fica em `closeStay`, onde é testada, e a recusa vem com
 * o campo `quantity` apontado.
 */

const closeSchema = z.object({
  destinos: z
    .array(
      z.object({
        movement_type: z.enum(HERD_CLOSE_TYPES),
        quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
        value: z.number().nonnegative().nullish(),
      }),
    )
    .min(1, "Informe ao menos um destino"),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
});

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const { id } = await context.params;
  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = closeSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await closeStay(g.db, id, {
    destinos: parsed.data.destinos.map((d) => ({
      movement_type: d.movement_type,
      quantity: d.quantity,
      value: d.value ?? null,
    })),
    occurred_at: parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
