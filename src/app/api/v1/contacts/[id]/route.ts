import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  updateContact,
  setContactArchived,
  getContactDetail,
  CONTACT_TYPES,
} from "@/lib/actions/contacts";
import { withApi } from "@/lib/route";

/**
 * GET    /api/v1/contacts/:id   contato + histórico de negociações
 * PATCH  /api/v1/contacts/:id   edição (§5 do Módulo 31: só os campos simples)
 * DELETE /api/v1/contacts/:id   ARQUIVA, não apaga
 *
 * Wrapper fino: a regra vive em `src/lib/actions/contacts.ts`.
 *
 * Reusa o guard de "rebanho" pela mesma razão registrada em
 * `src/app/api/v1/contacts/route.ts`: o PRD §5.2 não define módulo de permissão
 * para Negociações, e as matrizes de `rebanho` e `financeiro` são idênticas
 * hoje. Manter os dois arquivos com o mesmo guard é o que impede o caso
 * esquisito de alguém poder criar um contato e não poder corrigi-lo.
 *
 * O DELETE arquiva porque `Negotiation.contact_id` é `onDelete: SetNull`:
 * apagar de verdade deixaria o histórico de negócios anônimo em silêncio.
 */

const patchSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do contato"),
  type: z.enum(CONTACT_TYPES as readonly [string, ...string[]]).nullish(),
  phone: z.string().trim().max(40).nullish(),
  city: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const params = await props.params;
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const res = await getContactDetail(g.db, params.id);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

async function PATCHHandler(request: Request, props: Props) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = patchSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const d = parsed.data;
  const res = await updateContact(g.db, params.id, {
    name: d.name,
    type: (d.type ?? null) as (typeof CONTACT_TYPES)[number] | null,
    phone: d.phone ?? null,
    city: d.city ?? null,
    notes: d.notes ?? null,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

async function DELETEHandler(_request: Request, props: Props) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const res = await setContactArchived(g.db, params.id, true);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
export const DELETE = withApi(DELETEHandler);
