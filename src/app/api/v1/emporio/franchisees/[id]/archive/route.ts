import { z } from "zod";
import { apiError, apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { arquivarFranqueadoAction } from "@/lib/actions/emporio-franqueados";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * POST /api/v1/emporio/franchisees/:id/archive: arquiva (padrão) ou desarquiva (`archived: false`).
 * As vendas e o saldo continuam; ele só deixa de ser escolhido em venda nova.
 */

const schema = z.object({ archived: z.boolean().default(true) });

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  // Corpo opcional: sem corpo vale `archived: true`.
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

  return respostaDaAction(await arquivarFranqueadoAction(g.db, g.user, id, parsed.data.archived));
}

export const POST = withApi(POSTHandler);
