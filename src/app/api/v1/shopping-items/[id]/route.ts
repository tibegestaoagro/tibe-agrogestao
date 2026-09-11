import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  atualizarItemAction,
  concluirItemAction,
  removerItemAction,
  repetirItemAction,
} from "@/lib/actions/shopping-items";
import { withApi } from "@/lib/route";

/**
 * PATCH  /api/v1/shopping-items/:id   edita, conclui ou repete o item
 * DELETE /api/v1/shopping-items/:id   remove da lista (§18), sem apagar
 *
 * O PATCH faz três coisas porque, do lado do produtor, são a mesma: mexer num
 * item da lista. `acao` decide qual:
 *
 * | `acao`      | o que acontece |
 * |---|---|
 * | ausente     | edita os campos que vieram (§5: a quantidade chega depois) |
 * | `concluir`  | §11 opção 1, "apenas concluir": sai da lista sem gerar nada |
 * | `repetir`   | §14: cria um item NOVO igual, sem tocar no antigo |
 *
 * ⚠️ **`concluir` NÃO registra compra.** A opção 2 do §11 é outra rota
 * (`/purchase`), porque ela cria negociação, despesa e estoque.
 */

const patchSchema = z.object({
  acao: z.enum(["concluir", "repetir"]).optional(),
  description: z.string().trim().min(1, "Diga o que precisa comprar").optional(),
  product_id: z.string().nullish(),
  quantity: z.number().positive("A quantidade precisa ser maior que zero").nullish(),
  unit: z.string().nullish(),
  property_id: z.string().nullish(),
  category_id: z.string().nullish(),
  purpose: z
    .enum(["rebanho", "pasto", "confinamento", "leite", "maquina", "cerca", "fazenda_geral", "outro"])
    .nullish(),
  priority: z.enum(["normal", "urgente"]).nullish(),
  place: z.string().nullish(),
  notes: z.string().nullish(),
});

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = patchSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const { acao, ...campos } = parsed.data;

  if (acao === "concluir") {
    const result = await concluirItemAction(g.db, params.id);
    if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
    return apiOk(result.data);
  }

  if (acao === "repetir") {
    const result = await repetirItemAction(g.db, params.id, { created_by_user_id: g.user.id });
    if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
    return apiOk(result.data, {}, { status: 201 });
  }

  const result = await atualizarItemAction(g.db, params.id, campos);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

async function DELETEHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const result = await removerItemAction(g.db, params.id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const PATCH = withApi(PATCHHandler);
export const DELETE = withApi(DELETEHandler);
