import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { updateContact, getContactDetail, CONTACT_TYPES } from "@/lib/actions/contacts";
import { withApi } from "@/lib/route";

/**
 * GET   /api/v1/contacts/:id   contato + histórico de negociações
 * PATCH /api/v1/contacts/:id   edição (§5 do Módulo 31: só os campos simples)
 *
 * Arquivar e desarquivar ficam em `:id/archive`, seguindo o desenho do Módulo
 * 32 (`/milk/sites/:id/archive`): um `PATCH` com `{ archived }` cobre os dois
 * sentidos, e um `DELETE` cobriria só um, deixando o desarquivamento sem porta.
 *
 * Wrapper fino: a regra vive em `src/lib/actions/contacts.ts`.
 *
 * Reusa o guard de "rebanho" pela mesma razão registrada em
 * `src/app/api/v1/contacts/route.ts`: o PRD §5.2 não define módulo de permissão
 * para Negociações, e as matrizes de `rebanho` e `financeiro` são idênticas
 * hoje. Manter os dois arquivos com o mesmo guard é o que impede o caso
 * esquisito de alguém poder criar um contato e não poder corrigi-lo.
 */

// §5 do Módulo 31: "sem CPF obrigatório" vale FORA do balcão do Empório. Os campos PF/PJ
// são aceitos e opcionais; ausente no corpo = mantém, null = limpa (a action decide).
const texto = z.string().trim().max(200).nullish();

const patchSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do contato"),
  type: z.enum(CONTACT_TYPES as readonly [string, ...string[]]).nullish(),
  phone: z.string().trim().max(40).nullish(),
  city: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  person_kind: z.enum(["pf", "pj"]).nullish(),
  document: texto,
  state_registration: texto,
  birth_date: texto,
  responsible_name: texto,
  address_zip: texto,
  address_street: texto,
  address_number: texto,
  address_complement: texto,
  address_district: texto,
  address_state: texto,
  delivery_zip: texto,
  delivery_street: texto,
  delivery_number: texto,
  delivery_complement: texto,
  delivery_district: texto,
  delivery_city: texto,
  delivery_state: texto,
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const params = await props.params;
  const g = await guard("rebanho", "read", { profile: ["fazenda", "emporio"], lojaOk: true });
  if ("error" in g) return g.error;

  const res = await getContactDetail(g.db, params.id);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

async function PATCHHandler(request: Request, props: Props) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: ["fazenda", "emporio"], lojaOk: true });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = patchSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  // Chaves ausentes do corpo seguem ausentes (o Zod as omite): é isso que a action lê como "mantém".
  const { name, type, phone, city, notes, ...cadastro } = parsed.data;
  const res = await updateContact(g.db, params.id, {
    ...cadastro,
    name,
    type: (type ?? null) as (typeof CONTACT_TYPES)[number] | null,
    phone: phone ?? null,
    city: city ?? null,
    notes: notes ?? null,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
