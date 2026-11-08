import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { fazerAcordoAction, listarAcordosDoClienteAction } from "@/lib/actions/emporio-acordos";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/customers/:id/agreements
 * POST /api/v1/emporio/customers/:id/agreements  { entry_ids, installments: [{ due_date, amount }], notes? }
 * O acordo de fiado: contas em aberto do cliente viram parcelas novas (só Dono e Financeiro).
 */

const schema = z.object({
  entry_ids: z.array(z.string(), { error: "Escolha as contas que entram no acordo." }).min(1, "Escolha as contas que entram no acordo."),
  installments: z
    .array(
      z.object({
        due_date: z.string({ error: "Toda parcela precisa de um vencimento." }),
        amount: z.number({ error: "Toda parcela precisa de um valor." }),
      }),
      { error: "Informe as parcelas do acordo." },
    )
    .min(1, "O acordo tem de 1 a 48 parcelas.")
    .max(48, "O acordo tem de 1 a 48 parcelas."),
  notes: z.string().max(500, "A observação deve ter no máximo 500 caracteres.").optional(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await listarAcordosDoClienteAction(g.db, g.user, id));
}

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await fazerAcordoAction(g.db, g.user, id, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
