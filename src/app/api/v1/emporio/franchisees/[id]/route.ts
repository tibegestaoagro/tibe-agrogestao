import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarFranqueadoAction, lerFranqueadoAction } from "@/lib/actions/emporio-franqueados";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/franchisees/:id: o cadastro, o saldo e o extrato (crédito por venda e pagamentos).
 * PATCH: edita. Chave ausente mantém, nulo limpa `document` e `notes`.
 */

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome do franqueado.").max(200).optional(),
  phone: z.string().trim().min(1, "Informe o telefone do franqueado.").max(40).optional(),
  document: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerFranqueadoAction(g.db, g.user, id));
}

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await editarFranqueadoAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
