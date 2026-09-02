import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { getWorkerDetail, updateWorker, setWorkerStatus } from "@/lib/actions/workers";
import { withApi } from "@/lib/route";

/**
 * GET   /api/v1/workers/:id   o trabalhador e o histórico dele (§37)
 * PATCH /api/v1/workers/:id   edita o cadastro, ou muda a situação (§39)
 *
 * Um `PATCH` para as duas coisas porque a situação é um campo do cadastro,
 * não um recurso à parte: `{ "status": "inativo" }` sozinho muda só ela.
 * Mudar a situação NÃO é inócuo, e a action cuida disso: inativar apaga as
 * previsões pendentes e preserva as pagas (§40.8).
 *
 * Guard `mao_de_obra`: ver `src/app/api/v1/workers/route.ts`.
 */

const patchSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do trabalhador").optional(),
    role: z.string().trim().min(1, "Informe a função").optional(),
    type: z.enum(["fixo", "eventual"]).optional(),
    pay_frequency: z.enum(["mensal", "quinzenal", "semanal", "diaria", "outra"]).nullish(),
    pay_amount: z.number().positive("O valor precisa ser maior que zero").nullish(),
    pay_day: z
      .number()
      .int("O dia de pagamento precisa ser um número inteiro")
      .min(1, "O dia de pagamento precisa estar entre 1 e 31")
      .max(31, "O dia de pagamento precisa estar entre 1 e 31")
      .nullish(),
    property_id: z.string().trim().min(1).nullish(),
    phone: z.string().trim().max(40).nullish(),
    started_at: z.string().datetime().nullish(),
    notes: z.string().trim().max(1000).nullish(),
    status: z.enum(["ativo", "inativo"]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nada para alterar" });

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guard("mao_de_obra", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const res = await getWorkerDetail(g.db, id);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guard("mao_de_obra", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = patchSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const d = parsed.data;

  // A mudança de situação vem primeiro e sozinha quando é a única coisa no
  // corpo: ela tem efeito colateral (apagar previsão pendente), e misturá-la
  // com a edição num caminho só faria a ordem das duas escritas importar sem
  // ninguém decidir qual é.
  if (d.status !== undefined) {
    const res = await setWorkerStatus(g.db, id, d.status);
    if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
    if (Object.keys(d).length === 1) return apiOk(res.data);
  }

  const atual = await getWorkerDetail(g.db, id);
  if (!atual.ok) return apiError(atual.code, atual.message, atual.status, atual.field);

  const res = await updateWorker(g.db, id, {
    name: d.name ?? atual.data.name,
    role: d.role ?? atual.data.role,
    type: d.type ?? atual.data.type,
    pay_frequency: d.pay_frequency !== undefined ? d.pay_frequency : atual.data.pay_frequency,
    pay_amount: d.pay_amount !== undefined ? d.pay_amount : atual.data.pay_amount,
    pay_day: d.pay_day !== undefined ? d.pay_day : atual.data.pay_day,
    property_id: d.property_id !== undefined ? d.property_id : atual.data.property_id,
    phone: d.phone !== undefined ? d.phone : atual.data.phone,
    started_at:
      d.started_at !== undefined
        ? d.started_at
          ? new Date(d.started_at)
          : null
        : atual.data.started_at
          ? new Date(atual.data.started_at)
          : null,
    notes: d.notes !== undefined ? d.notes : atual.data.notes,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
