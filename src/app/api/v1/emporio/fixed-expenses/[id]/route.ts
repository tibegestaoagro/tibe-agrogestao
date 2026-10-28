import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { editarDespesaFixaAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/fixed-expenses/:id  refaz as contas dos meses do atual em diante que ainda não têm pagamento: só OWNER e ADMIN. */

const schema = z.object({
  name: z.string({ error: "Dê um nome à despesa." }).optional(),
  category: z.string().nullish(),
  amount: z.number({ error: "Informe o valor da despesa." }).optional(),
  due_day: z.number({ error: "Informe o dia do vencimento." }).optional(),
  split_kind: z.string({ error: "Escolha como dividir entre as lojas." }).optional(),
  splits: z
    .array(
      z.object({
        establishment_id: z.string({ error: "Escolha a loja de cada parte." }).min(1, "Escolha a loja de cada parte."),
        value: z.number({ error: "Informe a parte de cada loja." }),
      }),
      { error: "Escolha as lojas da despesa." },
    )
    .optional(),
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

  return respostaDaAction(await editarDespesaFixaAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
