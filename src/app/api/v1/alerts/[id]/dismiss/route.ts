import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { withApi } from "@/lib/route";

/**
 * PATCH /api/v1/alerts/:id/dismiss (spec 4.12)
 * Marca um alerta como resolvido manualmente. Operador só tem leitura em
 * Alertas (PRD 5.2): dismiss exige escrita (Owner/Admin).
 */
async function PATCHHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

export const PATCH = withApi(PATCHHandler);
