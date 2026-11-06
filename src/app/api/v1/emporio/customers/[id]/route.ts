import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarClienteAction, lerClienteAction } from "@/lib/actions/emporio-clientes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/customers/:id: o cadastro do cliente do Empório.
 * PATCH: edita (e completa) o cadastro. Chave ausente = mantém o que o cliente já tem;
 * nulo = limpa. A action confere o resultado inteiro e só grava completo para o tipo.
 */

const texto = z.string().trim().max(200).nullish();

const schema = z.object({
  name: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(40).nullish(),
  city: z.string().trim().max(120).nullish(),
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
  notes: z.string().trim().max(1000).nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerClienteAction(g.db, g.user, id));
}

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await editarClienteAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
