import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { setContactArchived } from "@/lib/actions/contacts";
import { withApi } from "@/lib/route";

/**
 * PATCH /api/v1/contacts/:id/archive   arquiva ou desarquiva o contato.
 *
 * Um `PATCH` com `{ archived }` em vez de um `DELETE`, seguindo o desenho do
 * Módulo 32 (`/milk/sites/:id/archive`): `DELETE` cobriria só o arquivamento e
 * deixaria o desarquivamento sem porta.
 *
 * Arquivar NÃO exige que o contato esteja sem negócios. Um comprador com quem
 * o produtor não trabalha mais é exatamente o caso de uso, e recusar obrigaria
 * a apagar o histórico para poder arquivar. O que o arquivamento faz é tirar o
 * contato das listas e da busca da conversa: os negócios antigos continuam
 * apontando para ele, e continuam legíveis.
 *
 * ⚠️ Efeito no WhatsApp: `findOrCreateContact` ignora o arquivado, então um
 * negócio novo com o mesmo nome CRIA um contato novo. É deliberado (arquivar
 * significa "saiu de circulação"), mas é a consequência que surpreende quem
 * arquivou por engano.
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

  const res = await setContactArchived(g.db, id, parsed.data.archived);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);

  return apiOk(res.data);
}

export const PATCH = withApi(PATCHHandler);
