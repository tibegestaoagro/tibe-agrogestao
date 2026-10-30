import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import {
  editarEstabelecimentoAction,
  lerEstabelecimentoAction,
} from "@/lib/actions/emporio-catalogo";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET e PATCH /api/v1/emporio/establishments/:id */

const pct = z.number().min(0, "Use um valor entre 0 e 1000.").max(1000, "Use um valor entre 0 e 1000.");

const editarSchema = z.object({
  name: z.string({ error: "Informe o nome do estabelecimento." }).trim().min(1, "Informe o nome do estabelecimento.").optional(),
  address: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(120).nullish(),
  responsible_user_id: z.string().nullish(),
  allow_negative_stock: z.boolean().optional(),
  max_discount_pct: z.number().min(0, "Use um valor entre 0 e 100.").max(100, "Use um valor entre 0 e 100.").nullish(),
  default_expense_pct: pct.nullish(),
  default_profit_pct: pct.nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerEstabelecimentoAction(g.db, g.user, id));
}

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = editarSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await editarEstabelecimentoAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
