import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { lerExtratoDaContaAction } from "@/lib/actions/emporio-financeiro";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/statement  ?bank_account_id= &de= &ate= (AAAA-MM-DD)  o extrato da conta no período, de até 92 dias. */

const diaIso = (campo: string) =>
  z
    .string({ error: `Informe a data ${campo === "de" ? "inicial" : "final"}.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida (AAAA-MM-DD).")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Informe uma data válida (AAAA-MM-DD).")
    .transform((v) => new Date(`${v}T00:00:00Z`));

const schema = z.object({
  bank_account_id: z.string({ error: "Escolha a conta." }).min(1, "Escolha a conta."),
  de: diaIso("de"),
  ate: diaIso("ate"),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({
    bank_account_id: sp.get("bank_account_id") ?? undefined,
    de: sp.get("de") ?? undefined,
    ate: sp.get("ate") ?? undefined,
  });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(await lerExtratoDaContaAction(g.db, g.user, parsed.data));
}

export const GET = withApi(GETHandler);
