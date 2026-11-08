import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { definirCreditoDoClienteAction, lerCreditoDoClienteAction } from "@/lib/actions/emporio-credito";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/customers/:id/credit: a ficha de crédito do fiado do cliente.
 * PATCH: limite e prazo do cliente (chave ausente mantém, nulo limpa). A exclusão mútua
 * entre dias e dia fixo é da action.
 */

const schema = z.object({
  fiado_limit: z.number({ error: "O limite deve ser zero ou mais." }).min(0, "O limite deve ser zero ou mais.").nullish(),
  fiado_due_days: z
    .number({ error: "O prazo deve ser de 1 a 365 dias." })
    .int("O prazo deve ser de 1 a 365 dias.")
    .min(1, "O prazo deve ser de 1 a 365 dias.")
    .max(365, "O prazo deve ser de 1 a 365 dias.")
    .nullish(),
  fiado_due_day: z
    .number({ error: "O dia do mês deve ser de 1 a 31." })
    .int("O dia do mês deve ser de 1 a 31.")
    .min(1, "O dia do mês deve ser de 1 a 31.")
    .max(31, "O dia do mês deve ser de 1 a 31.")
    .nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerCreditoDoClienteAction(g.db, g.user, id));
}

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await definirCreditoDoClienteAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
