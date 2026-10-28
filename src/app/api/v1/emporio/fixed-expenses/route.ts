import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { criarDespesaFixaAction, listarDespesasFixasAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { dataIso } from "@/lib/emporio/venda-schema";

/**
 * GET  /api/v1/emporio/fixed-expenses  ?incluir_encerradas=1  as despesas fixas mensais: só OWNER e ADMIN.
 * POST /api/v1/emporio/fixed-expenses  cria o modelo e gera os 12 meses de contas, uma por loja e mês.
 */

const splitDaDespesaSchema = z.object({
  establishment_id: z.string({ error: "Escolha a loja de cada parte." }).min(1, "Escolha a loja de cada parte."),
  value: z.number({ error: "Informe a parte de cada loja." }),
});

const schema = z.object({
  name: z.string({ error: "Dê um nome à despesa." }),
  category: z.string().nullish(),
  amount: z.number({ error: "Informe o valor da despesa." }),
  due_day: z.number({ error: "Informe o dia do vencimento." }),
  split_kind: z.string({ error: "Escolha como dividir entre as lojas." }),
  starts_on: dataIso.nullish(),
  splits: z.array(splitDaDespesaSchema, { error: "Escolha as lojas da despesa." }),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const v = new URL(request.url).searchParams.get("incluir_encerradas");
  return respostaDaAction(
    await listarDespesasFixasAction(g.db, g.user, { incluir_encerradas: v === "1" || v === "true" }),
  );
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await criarDespesaFixaAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
