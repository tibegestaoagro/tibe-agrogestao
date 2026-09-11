import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { criarItemAction, listarItensAction } from "@/lib/actions/shopping-items";
import { serializeShoppingItem } from "@/lib/serializers";
import { STOCK_UNITS } from "@/lib/stock/units";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/shopping-items   a lista (Módulo 36, §10)
 * POST /api/v1/shopping-items   anota um item (§4)
 *
 * Sem `?status=`, devolve os PENDENTES: "a lista" do produtor é o que falta
 * comprar, e o histórico do §18 é uma consulta explícita.
 *
 * Permissão `rebanho` com perfil `fazenda`, a mesma do Estoque, porque a
 * categoria do item é a categoria de produto e quem compra insumo é quem mexe
 * no estoque. Não existe `ModuleKey` próprio para estoque neste projeto.
 *
 * `meta.units` viaja junto pelo mesmo motivo da rota de produtos: as unidades
 * são constante de código, e a tela monta o seletor sem uma segunda chamada.
 */

const PURPOSES = [
  "rebanho",
  "pasto",
  "confinamento",
  "leite",
  "maquina",
  "cerca",
  "fazenda_geral",
  "outro",
] as const;

const createSchema = z.object({
  description: z.string().trim().min(1, "Diga o que precisa comprar"),
  product_id: z.string().nullish(),
  quantity: z.number().positive("A quantidade precisa ser maior que zero").nullish(),
  unit: z.string().nullish(),
  property_id: z.string().nullish(),
  category_id: z.string().nullish(),
  purpose: z.enum(PURPOSES).nullish(),
  priority: z.enum(["normal", "urgente"]).nullish(),
  place: z.string().nullish(),
  notes: z.string().nullish(),
  /**
   * §19.7: a resposta do produtor a "já existe sal na sua lista, quer
   * adicionar mais?". Sem isto, um item parecido é recusado com
   * `ITEM_JA_NA_LISTA` para que a pergunta possa ser feita.
   */
  permitir_duplicata: z.boolean().optional(),
});

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const priority = sp.get("priority");
  const purpose = sp.get("purpose");

  const itens = await listarItensAction(g.db, {
    status:
      status === "comprado" || status === "removido" || status === "pendente" ? status : undefined,
    property_id: sp.get("property_id") ?? undefined,
    priority: priority === "urgente" || priority === "normal" ? priority : undefined,
    place: sp.get("place") ?? undefined,
    purpose: (PURPOSES as readonly string[]).includes(purpose ?? "")
      ? (purpose as (typeof PURPOSES)[number])
      : undefined,
  });

  return apiOk(itens.map(serializeShoppingItem), {
    total: itens.length,
    units: STOCK_UNITS,
  });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const { permitir_duplicata, ...input } = parsed.data;
  const result = await criarItemAction(g.db, input, {
    created_by_user_id: g.user.id,
    permitirDuplicata: permitir_duplicata,
  });
  // O `field` atravessa: a recusa de duplicata pertence à descrição, e a de
  // quantidade fracionada ao campo da quantidade.
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
