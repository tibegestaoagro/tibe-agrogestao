import { z } from "zod";
import { BANDEIRAS } from "@/lib/emporio/cartao";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { criarTaxaAction, listarTaxasAction } from "@/lib/actions/emporio-cartoes";
import { diaComMensagem, guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
const BRANDS_COM_CORINGA = [...BANDEIRAS, "qualquer"] as const;

/**
 * GET /api/v1/emporio/card-fee-rates  ?establishment_id=&acquirer_id=&vigentes_em=AAAA-MM-DD&incluir_encerradas=1
 * POST /api/v1/emporio/card-fee-rates  cria uma linha da tabela de taxas: só quem gere a loja.
 */


const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  acquirer_id: z.string({ error: "Escolha a adquirente." }).min(1, "Escolha a adquirente."),
  brand: z.enum(BRANDS_COM_CORINGA, { error: "Escolha a bandeira." }),
  kind: z.string({ error: "Escolha a modalidade do cartão." }).min(1, "Escolha a modalidade do cartão."),
  installments_from: z.number({ error: "Informe a primeira parcela da faixa." }),
  installments_to: z.number({ error: "Informe a última parcela da faixa." }),
  fee_pct: z.number({ error: "Informe a taxa em porcentagem." }),
  fee_fixed: z.number({ error: "Informe o valor fixo em reais." }).optional(),
  days: z.number({ error: "Informe o prazo em dias." }),
  bank_account_id: z.string({ error: "Escolha a conta que recebe o cartão." }).min(1, "Escolha a conta que recebe o cartão."),
  valid_from: diaComMensagem("Informe a data em que a taxa começa a valer."),
  valid_to: diaComMensagem("Informe a data em que a taxa deixa de valer.").nullish(),
});

const querySchema = z.object({
  vigentes_em: diaComMensagem("Informe a data da consulta.").optional(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const q = querySchema.safeParse({ vigentes_em: sp.get("vigentes_em") ?? undefined });
  if (!q.success) return apiErroDeZod(q.error);
  const enc = sp.get("incluir_encerradas");
  return respostaDaAction(
    await listarTaxasAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      acquirer_id: sp.get("acquirer_id") ?? undefined,
      vigentes_em: q.data.vigentes_em,
      incluir_encerradas: enc === "1" || enc === "true",
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

  return respostaDaAction(await criarTaxaAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
