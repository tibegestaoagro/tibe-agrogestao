import { z } from "zod";
import { apiError, apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { receberCompraAction } from "@/lib/actions/emporio-compras";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/purchases/:id/receive  { received_at? } (recebimento só total, Q63) */

const schema = z.object({
  received_at: z
    .string({ error: "Informe uma data válida." })
    .refine((v) => !Number.isNaN(Date.parse(v)), "Informe uma data válida.")
    .transform((v) => new Date(v))
    .nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  // Corpo opcional: receber "hoje" não precisa de JSON.
  const texto = await request.text();
  let json: unknown = {};
  if (texto.trim()) {
    try {
      json = JSON.parse(texto);
    } catch {
      return apiError("INVALID_JSON", "Corpo da requisição inválido", 400);
    }
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await receberCompraAction(g.db, g.user, id, { received_at: parsed.data.received_at ?? null }));
}

export const POST = withApi(POSTHandler);
