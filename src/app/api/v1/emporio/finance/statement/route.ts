import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { lerExtratoAction } from "@/lib/actions/emporio-financeiro";
import { diaIso, guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/finance/statement  ?kind=conta|gaveta|gerencia (padrão conta) &id= &de= &ate= (AAAA-MM-DD) &apenas_sem_carimbo=1
 * o extrato do lugar no período, de até 92 dias. `id` é a conta, ou a loja (gaveta e gerência);
 * `bank_account_id` segue valendo como sinônimo de `kind=conta&id=`.
 */

const schema = z
  .object({
    kind: z.enum(["conta", "gaveta", "gerencia"], { error: "Escolha o lugar: conta, gaveta ou gerência." }).default("conta"),
    id: z.string().min(1, "Escolha o lugar do extrato.").optional(),
    bank_account_id: z.string().min(1, "Escolha a conta.").optional(),
    de: diaIso("de"),
    ate: diaIso("ate"),
    apenas_sem_carimbo: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.id || (v.kind === "conta" && v.bank_account_id)) return;
    const conta = v.kind === "conta";
    ctx.addIssue({
      code: "custom",
      path: [conta ? "bank_account_id" : "id"],
      message: conta ? "Escolha a conta." : "Escolha a loja.",
    });
  });

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({
    kind: sp.get("kind") ?? undefined,
    id: sp.get("id") ?? undefined,
    bank_account_id: sp.get("bank_account_id") ?? undefined,
    de: sp.get("de") ?? undefined,
    ate: sp.get("ate") ?? undefined,
    apenas_sem_carimbo: sp.get("apenas_sem_carimbo") === "1" || sp.get("apenas_sem_carimbo") === "true",
  });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const { kind, id, bank_account_id, de, ate, apenas_sem_carimbo } = parsed.data;
  return respostaDaAction(
    await lerExtratoAction(g.db, g.user, { lugar: { kind, id: (id ?? bank_account_id) as string }, de, ate, apenas_sem_carimbo }),
  );
}

export const GET = withApi(GETHandler);
