import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { setMilkGroupArchived } from "@/lib/actions/milk-groups";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * PATCH /api/v1/milk/groups/:id/archive   arquiva ou desarquiva o lote (§6).
 *
 * Aceita `{ archived: false }` para desarquivar, diferente do
 * `/confinement/sites/:id/archive`, que só arquiva: aqui o lote leiteiro muda
 * de estação ("recém-paridas" volta a existir todo ano), e obrigar o produtor a
 * cadastrar de novo perderia o histórico que aponta para o lote antigo.
 */

const schema = z.object({ archived: z.boolean().default(true) });

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await setMilkGroupArchived(g.db, id, parsed.data.archived);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk({
    id: result.data.id,
    property_id: result.data.property_id,
    name: result.data.name,
    notes: result.data.notes,
    archived: result.data.archived_at != null,
    archived_at: isoOrNull(result.data.archived_at),
  });
}

export const PATCH = withApi(PATCHHandler);
