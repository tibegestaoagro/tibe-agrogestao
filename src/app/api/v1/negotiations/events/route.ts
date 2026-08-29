import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { openEventConsignment } from "@/lib/actions/event-consignments";
import { eventConsignmentSchema } from "@/lib/validation/negotiation";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/negotiations/events   abre a remessa para leilão, feira ou
 *                                    evento (Módulo 31, missão 3, §8)
 *
 * Rota PRÓPRIA, e não mais um `type` dentro de `POST /api/v1/negotiations`,
 * porque o corpo é de outra natureza: a remessa não tem valor nem forma de
 * pagamento, e tem os campos do evento. Aceitá-la na rota geral significaria
 * um schema em que `amount` é obrigatório para uns tipos e proibido para
 * outros, e é justamente `amount` que o §17.8 proíbe aqui.
 *
 * O envio NÃO gera lançamento financeiro nenhum. Quem confere isso é o
 * `test:m48`, no primeiro caso.
 */

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = eventConsignmentSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const d = parsed.data;

  const result = await openEventConsignment(g.db, {
    property_id: d.property_id,
    category_id: d.category_id,
    quantity: d.quantity,
    pasture_id: d.pasture_id ?? null,
    event_name: d.event_name,
    event_type: d.event_type ?? null,
    city: d.city ?? null,
    organizer_name: d.organizer_name ?? null,
    contact_id: d.contact_id ?? null,
    occurred_at: d.occurred_at ? new Date(d.occurred_at) : null,
    expected_end_at: d.expected_end_at ? new Date(d.expected_end_at) : null,
    notes: d.notes ?? null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
