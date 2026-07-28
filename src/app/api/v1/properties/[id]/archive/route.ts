import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { serializeProperty } from "@/lib/serializers";

/**
 * POST /api/v1/properties/:id/archive   arquiva a propriedade (não deleta: 1.1).
 * Idempotente: re-arquivar mantém o archived_at original.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const existing = await g.db.property.findFirst({ where: { id: params.id } });
  if (!existing) return apiError(...ApiErrors.NOT_FOUND);

  const property = existing.archived_at
    ? existing
    : await g.db.property.update({
        where: { id: params.id },
        data: { archived_at: new Date() },
      });

  return apiOk(serializeProperty(property));
}
