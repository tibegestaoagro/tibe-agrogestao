import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { lerFluxoProjetadoAction } from "@/lib/actions/emporio-projecao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/projection  ?establishment_id= &days=30|60|90 (padrão 30)  o fluxo de caixa projetado, por semana. */

const schema = z.object({
  days: z.coerce
    .number({ error: "Escolha 30, 60 ou 90 dias." })
    .pipe(z.union([z.literal(30), z.literal(60), z.literal(90)], { error: "Escolha 30, 60 ou 90 dias." })),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({ days: sp.get("days") ?? 30 });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(
    await lerFluxoProjetadoAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      days: parsed.data.days,
    }),
  );
}

export const GET = withApi(GETHandler);
