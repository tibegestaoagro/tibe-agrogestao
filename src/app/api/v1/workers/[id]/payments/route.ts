import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  confirmWorkerPayment,
  recordWorkerAdvance,
  recordWorkerExtra,
} from "@/lib/actions/workers";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/workers/:id/payments   registra dinheiro pago a um trabalhador.
 *
 * UMA rota para os quatro gestos, com `kind` no corpo, porque são a mesma
 * operação com um rótulo diferente: sai dinheiro da fazenda para a mesma
 * pessoa, e o que muda é o tipo do lançamento. Quatro rotas separadas teriam a
 * mesma validação copiada quatro vezes.
 *
 * ⚠️ `pagamento` é o único que NÃO cria lançamento novo: ele QUITA a previsão
 * pendente e faz a próxima nascer (§8 e §40.3). Os outros três criam lançamento
 * já pago, e não tocam na previsão do mês (§9: o adiantamento aparece separado).
 *
 * Guard `mao_de_obra`: ver `src/app/api/v1/workers/route.ts`.
 */

const schema = z.object({
  kind: z.enum(["pagamento", "adiantamento", "gratificacao", "beneficio", "outro"]),
  amount: z.number().positive("Informe um valor maior que zero").nullish(),
  occurred_at: z.string().datetime().nullish(),
  category: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

/** O rótulo padrão de cada tipo, quando o produtor não escreve um. */
const CATEGORIA_PADRAO: Record<string, string> = {
  adiantamento: "Adiantamento",
  gratificacao: "Gratificação",
  beneficio: "Benefício",
  outro: "Mão de obra",
};

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("mao_de_obra", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const d = parsed.data;

  const quando = d.occurred_at ? new Date(d.occurred_at) : undefined;

  if (d.kind === "pagamento") {
    const res = await confirmWorkerPayment(g.db, {
      worker_id: id,
      amount: d.amount ?? null,
      paid_at: quando,
      notes: d.notes ?? null,
    });
    if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
    return apiOk(res.data, {}, { status: 201 });
  }

  // Os outros três exigem valor: não há previsão de onde herdá-lo.
  if (d.amount === null || d.amount === undefined) {
    return apiError("VALIDATION_ERROR", "Informe um valor maior que zero.", 422, "amount");
  }

  if (d.kind === "adiantamento") {
    const res = await recordWorkerAdvance(g.db, {
      worker_id: id,
      amount: d.amount,
      occurred_at: quando,
      notes: d.notes ?? null,
    });
    if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
    return apiOk(res.data, {}, { status: 201 });
  }

  const res = await recordWorkerExtra(g.db, {
    worker_id: id,
    kind: d.kind,
    amount: d.amount,
    category: d.category?.trim() || CATEGORIA_PADRAO[d.kind] || "Mão de obra",
    occurred_at: quando,
    notes: d.notes ?? null,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
