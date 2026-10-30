import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { receberTransferenciaAction } from "@/lib/actions/emporio-transferencias";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/transfers/:id/receive
 * { items: [{ item_id, received_qty, loss_reason? }], resolution?, reason? }
 * `resolution` e `reason` só valem para quem resolve (Gestor do destino, Gerente geral, Dono) e só quando chegou menos.
 */

const schema = z.object({
  items: z.array(
    z.object({
      item_id: z.string({ error: "Informe o item." }).min(1, "Informe o item."),
      received_qty: z.number({ error: "Informe a quantidade recebida." }),
      loss_reason: z.string().nullish(),
    }),
    { error: "Informe o que chegou de cada item." },
  ),
  resolution: z.string().nullish(),
  reason: z.string().nullish(),
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

  return respostaDaAction(await receberTransferenciaAction(g.db, g.user, id, parsed.data));
}

export const POST = withApi(POSTHandler);
