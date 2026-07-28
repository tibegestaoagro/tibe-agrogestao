import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard } from "@/lib/api-guard";

/**
 * PATCH /api/v1/alerts/:id/dismiss (spec 4.12)
 * Marca um alerta como resolvido manualmente. Operador só tem leitura em
 * Alertas (PRD 5.2): dismiss exige escrita (Owner/Admin).
 */
export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("alertas", "write");
  if ("error" in g) return g.error;

  const existing = await g.db.alert.findFirst({ where: { id: params.id } });
  if (!existing) return apiError(...ApiErrors.NOT_FOUND);

  const alert = await g.db.alert.update({
    where: { id: params.id },
    data: { status: "dismissed" },
  });

  return apiOk({ id: alert.id, status: alert.status });
}
