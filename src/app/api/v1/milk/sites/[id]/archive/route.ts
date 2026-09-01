import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { setMilkSiteArchived } from "@/lib/actions/milk-sites";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * PATCH /api/v1/milk/sites/:id/archive   arquiva ou desarquiva o local.
 *
 * Arquivar NÃO exige saldo zero. Um tanque desativado com leite dentro é uma
 * situação real (o produtor parou de usar e ainda não esvaziou), e recusar
 * obrigaria a inventar uma retirada que não aconteceu. O que o arquivamento
 * faz é tirar o local da lista de destinos novos; o saldo continua aparecendo
 * até alguém dar a baixa de verdade.
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

  const result = await setMilkSiteArchived(g.db, id, parsed.data.archived);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk({
    id: result.data.id,
    name: result.data.name,
    type: result.data.type,
    archived: result.data.archived_at != null,
    archived_at: isoOrNull(result.data.archived_at),
  });
}

export const PATCH = withApi(PATCHHandler);
