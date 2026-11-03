import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { completarClienteAction } from "@/lib/actions/emporio-clientes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * PATCH /api/v1/emporio/customers/:id: completa o cadastro de um contato no balcão.
 * Chave ausente = mantém o que o contato já tem; nulo = limpa. A action confere o
 * resultado inteiro e só grava completo.
 */

const texto = z.string().trim().max(200).nullish();

const schema = z.object({
  name: z.string().trim().max(200).optional(),
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
});

type Props = { params: Promise<{ id: string }> };

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await completarClienteAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
