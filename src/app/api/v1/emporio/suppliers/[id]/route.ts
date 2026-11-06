import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarFornecedorAction, lerFornecedorAction } from "@/lib/actions/emporio-fornecedores";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/suppliers/:id: o cadastro do fornecedor.
 * PATCH: edita. Chave ausente mantém, nulo limpa. O fornecedor de propriedade só muda `notes`.
 */

const texto = z.string().trim().max(200).nullish();

const schema = z.object({
  name: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(40).nullish(),
  city: z.string().trim().max(120).nullish(),
  person_kind: z.enum(["pf", "pj"]).nullish(),
  document: texto,
  state_registration: texto,
  address_zip: texto,
  address_street: texto,
  address_number: texto,
  address_complement: texto,
  address_district: texto,
  address_state: texto,
  notes: z.string().trim().max(1000).nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerFornecedorAction(g.db, g.user, id));
}

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await editarFornecedorAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
