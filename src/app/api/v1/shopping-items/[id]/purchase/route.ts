import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { registrarCompraDoItemAction } from "@/lib/actions/shopping-items";
import { withApi } from "@/lib/route";
import { requireFeatureApi } from "@/lib/features";
import { getActiveProfiles } from "@/lib/tenant-context";

/**
 * POST /api/v1/shopping-items/:id/purchase
 *
 * §11 opção 2 e §12: o item da lista vira uma COMPRA de verdade, com despesa,
 * conta a pagar quando não foi à vista, e entrada no estoque. Quem faz tudo
 * isso é Negociações: esta rota só traduz o item no que aquela action espera.
 *
 * ⚠️ **Item sem produto é recusado com `PRODUTO_NECESSARIO`**, e isso é o
 * desenho, não uma falta. "Comprar arame" é anotação legítima; virar estoque
 * exige dizer qual produto é. A recusa vem no campo `product_id`, e o caminho
 * é repetir a chamada com `product_id` de um produto existente ou com
 * `novo_produto` para cadastrar na hora.
 */

const schema = z.object({
  amount: z.number().positive("Informe quanto você pagou"),
  product_id: z.string().nullish(),
  novo_produto: z
    .object({
      name: z.string().nullish(),
      unit: z.string(),
      category_id: z.string(),
    })
    .nullish(),
  quantity: z.number().positive("A quantidade precisa ser maior que zero").nullish(),
  property_id: z.string().nullish(),
  /** Módulo 39 (Q68): compra numa loja do Empório (à vista, recebida). */
  establishment_id: z.string().nullish(),
  contact_id: z.string().nullish(),
  contact_name: z.string().nullish(),
  occurred_at: z.string().datetime().nullish(),
  /** §9.4 das Negociações: "a compra já foi paga?" */
  pago: z.boolean().optional(),
  due_date: z.string().datetime().nullish(),
  notes: z.string().nullish(),
});

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // O perfil emporio também entra: com loja, a compra é do Empório. Sem loja, o
  // caminho da fazenda segue exigindo o perfil fazenda (checado abaixo).
  const g = await guard("rebanho", "write", { profile: ["fazenda", "emporio"] });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const item = await g.db.shoppingItem.findFirst({
    where: { id: params.id },
    select: { establishment_id: true },
  });
  const naLoja = Boolean(parsed.data.establishment_id ?? item?.establishment_id);
  if (naLoja) {
    const recusa = await requireFeatureApi(g.user, "emporio");
    if (recusa) return recusa.error;
  } else if (!(await getActiveProfiles()).includes("fazenda")) {
    return apiError("FORBIDDEN", "Esta ação é do perfil de fazenda.", 403);
  }

  const result = await registrarCompraDoItemAction(g.db, params.id, {
    ...parsed.data,
    ator: g.user,
    occurred_at: parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : null,
    due_date: parsed.data.due_date ? new Date(parsed.data.due_date) : null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
