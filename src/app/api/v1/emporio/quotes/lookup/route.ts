import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { buscarOrcamentoPorNumeroAction } from "@/lib/actions/emporio-orcamentos";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/quotes/lookup  ?establishment_id= &number=  o orçamento pelo número impresso (aceita 000012 ou 12). */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  number: z
    .string({ error: "Informe o número do orçamento." })
    .regex(/^\d{1,9}$/, "Informe o número do orçamento, só com dígitos.")
    .transform(Number),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({
    establishment_id: sp.get("establishment_id") ?? undefined,
    number: sp.get("number") ?? undefined,
  });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(await buscarOrcamentoPorNumeroAction(g.db, g.user, parsed.data.establishment_id, parsed.data.number));
}

export const GET = withApi(GETHandler);
