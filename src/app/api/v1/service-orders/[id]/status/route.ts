import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeServiceOrder } from "@/lib/serializers";
import { createLinkedEntry } from "@/lib/financial";
import { decToNum } from "@/lib/serialize";

/**
 * PATCH /api/v1/service-orders/:id/status   transição manual de status (2.4).
 *
 * Sequencial estrita: scheduled → completed → invoiced (um passo, sem pular/voltar).
 * Ao chegar em 'invoiced', gera FinancialEntry de receita 'pending' (a receber),
 * com due_date = performed_at.
 */

const schema = z.object({
  status: z.enum(["scheduled", "completed", "invoiced"]),
});

// Próximo status válido a partir do atual.
const NEXT: Record<string, string | null> = {
  scheduled: "completed",
  completed: "invoiced",
  invoiced: null,
};

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("prestador", "write", { profile: "prestador" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const target = parsed.data.status;

  const order = await g.db.serviceOrder.findFirst({
    where: { id: params.id },
    include: { service: { select: { name: true } } },
  });
  if (!order) return apiError(...ApiErrors.NOT_FOUND);

  if (target === order.status) {
    return apiError("NO_CHANGE", `A ordem já está em '${target}'`, 422);
  }
  if (NEXT[order.status] !== target) {
    return apiError(
      "INVALID_TRANSITION",
      `Transição inválida: ${order.status} → ${target}. Permitido apenas o próximo passo da sequência.`,
      422,
    );
  }

  const updated = await g.db.serviceOrder.update({
    where: { id: params.id },
    data: { status: target },
  });

  // Faturamento → lançamento financeiro 'a receber'.
  if (target === "invoiced") {
    await createLinkedEntry(g.db, {
      entry_type: "income",
      category: `Serviço - ${order.service?.name ?? "ordem"}`,
      amount: decToNum(order.total_value) ?? 0,
      related_module: "servico",
      related_id: order.id,
      occurred_at: order.performed_at ?? new Date(),
      status: "pending",
      due_date: order.performed_at ?? new Date(),
    });
  }

  return apiOk(serializeServiceOrder(updated));
}
