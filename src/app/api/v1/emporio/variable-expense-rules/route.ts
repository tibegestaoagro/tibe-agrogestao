import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { criarRegraVariavelAction, listarRegrasVariaveisAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, incluirArquivados, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/variable-expense-rules  ?establishment_id= &incluir_arquivados=1  as regras do "Vendeu, Pagou": só OWNER e ADMIN.
 * POST /api/v1/emporio/variable-expense-rules  cria a regra da loja: só OWNER e ADMIN.
 */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  name: z.string({ error: "Dê um nome à regra." }),
  kind: z.string({ error: "Escolha o cálculo da regra." }),
  value: z.number({ error: "Informe o valor da regra." }),
  payment_kind: z.string().nullish(),
  emporio_product_id: z.string().nullish(),
  presentation_id: z.string().nullish(),
  packaging_emporio_product_id: z.string().nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await listarRegrasVariaveisAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      incluir_arquivadas: incluirArquivados(request),
    }),
  );
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await criarRegraVariavelAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
