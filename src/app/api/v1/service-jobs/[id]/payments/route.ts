import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { recordServiceJobPayment } from "@/lib/actions/service-jobs";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/service-jobs/:id/payments   registra um pagamento (§21, §22).
 *
 * Cada chamada cria um lançamento quitado e ENCOLHE a conta a pagar. Quando ela
 * zera, é apagada: conta a pagar de R$ 0,00 seria ruído no Financeiro.
 *
 * ⚠️ Pagar mais que o restante devolve 422 no campo `amount`, com a mensagem
 * dizendo quanto falta. Sem essa recusa, um dedo pesado transforma R$ 700 em
 * R$ 7.000, e os R$ 6.300 a mais viram despesa fantasma.
 *
 * Guard `servicos`: ver `src/app/api/v1/service-jobs/route.ts`.
 */

const schema = z.object({
  amount: z.number().positive("Informe um valor maior que zero"),
  paid_at: z.string().datetime("Informe uma data válida").nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("servicos", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const d = parsed.data;

  const res = await recordServiceJobPayment(g.db, {
    service_job_id: id,
    amount: d.amount,
    paid_at: d.paid_at ? new Date(d.paid_at) : undefined,
    notes: d.notes ?? null,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
