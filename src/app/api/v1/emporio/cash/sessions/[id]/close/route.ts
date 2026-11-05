import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { encerrarTurnoAction } from "@/lib/actions/emporio-turno";
import { guardEmporio } from "@/lib/emporio/rota";
import { chaveDeOperacao } from "@/lib/emporio/venda-schema";

/** POST /api/v1/emporio/cash/sessions/:id/close  encerra o turno: conta, separa o malote e deixa o troco. */

const schema = z.object({
  operation_key: chaveDeOperacao,
  counted: z.number({ error: "Informe quanto há na gaveta." }),
  justification: z.string().nullish(),
  malote_amount: z.number({ error: "Informe o valor do malote." }),
});

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const res = await encerrarTurnoAction(g.db, g.user, id, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  const { replayed: _replayed, ...turno } = res.data;
  return apiOk(turno);
}

export const POST = withApi(POSTHandler);
