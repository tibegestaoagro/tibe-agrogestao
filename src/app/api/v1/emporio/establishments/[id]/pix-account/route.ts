import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { definirContaPixAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PUT /api/v1/emporio/establishments/:id/pix-account  { bank_account_id: string | null }: só OWNER e ADMIN (Q83). */

const schema = z.object({
  bank_account_id: z.string({ error: "Escolha a conta." }).min(1, "Escolha a conta.").nullable(),
});

type Props = { params: Promise<{ id: string }> };

async function PUTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await definirContaPixAction(g.db, g.user, id, parsed.data));
}

export const PUT = withApi(PUTHandler);
