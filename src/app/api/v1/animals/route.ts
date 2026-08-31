import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeAnimal } from "@/lib/serializers";
import { isoOrNull } from "@/lib/serialize";
import { createBatchAction } from "@/lib/actions/animal-batches";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/animals    lista o rebanho (filtros: property_id, category_id, breed, q=brinco)
 * POST /api/v1/animals     cadastra rebanho
 *
 * Desde 2026-08-04 o rebanho é sempre lote por categoria, com brinco
 * OPCIONAL: quem trabalha com brinco manda `quantity: 1` e `ear_tag`. O
 * caminho paralelo `/api/v1/animal-batches` foi de fato removido em
 * 2026-08-05 (o comentário anterior dizia que já não existia, mas as três
 * rotas continuavam lá, sem nenhum consumidor).
 *
 * O filtro `status` saiu: no modelo de lote é `quantity` que diz o que
 * resta, então "quantos bezerros eu tenho" (filtro por categoria) passou a
 * ser a pergunta que a listagem responde.
 *
 * ⚠️ Módulo 30: o SALDO do rebanho passou a ser o livro-razão
 * (`GET /api/v1/herd/positions`), não o `quantity` destes lotes. Esta rota
 * ainda lê e escreve `AnimalBatch` porque é onde vivem brinco, raça, peso e
 * vacinação (§4 da spec do Módulo 30, anexo opcional que não se joga fora).
 * Enquanto as duas escritas não forem unificadas, um lote criado aqui NÃO
 * aparece no saldo: unificar depende de traduzir `AnimalCategory.name` para
 * uma das 12 faixas de idade, e `resolveCategoryTerm` devolve `ambiguous`
 * (ou `unknown`, como em "Não classificado") justamente onde não dá para
 * chutar. Essa desambiguação é a tarefa 6 do módulo.
 */

const createSchema = z.object({
  category_id: z.string().min(1, "Categoria é obrigatória"),
  property_id: z.string().min(1, "Propriedade é obrigatória"),
  quantity: z.number().int().positive("Quantidade deve ser um inteiro positivo"),
  ear_tag: z.string().trim().min(1).nullish(),
  breed: z.string().trim().min(1).nullish(),
  sex: z.enum(["male", "female"]).nullish(),
  birth_date: z.string().datetime().nullish(),
  initial_weight: z.number().positive().nullish(),
  acquisition_cost: z.number().nonnegative().nullish(),
  acquired_at: z.string().datetime().nullish(),
});

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const property_id = sp.get("property_id") || undefined;
  const category_id = sp.get("category_id") || undefined;
  const breed = sp.get("breed") || undefined;
  const q = sp.get("q")?.trim() || undefined;

  const batches = await g.db.animalBatch.findMany({
    where: {
      ...(property_id ? { property_id } : {}),
      ...(category_id ? { category_id } : {}),
      ...(breed ? { breed: { contains: breed, mode: "insensitive" } } : {}),
      ...(q ? { ear_tag: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { created_at: "desc" },
    include: {
      property: { select: { name: true } },
      category: { select: { name: true } },
      vaccinations: {
        orderBy: { applied_at: "desc" },
        take: 1,
        select: { applied_at: true },
      },
    },
  });

  const data = batches.map((b) => ({
    ...serializeAnimal(b),
    property_name: b.property?.name ?? null,
    category_name: b.category?.name ?? null,
    last_vaccination_at: b.vaccinations[0] ? isoOrNull(b.vaccinations[0].applied_at) : null,
  }));

  return apiOk(data, { total: data.length });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const d = parsed.data;

  const result = await createBatchAction(g.db, {
    category_id: d.category_id,
    property_id: d.property_id,
    quantity: d.quantity,
    ear_tag: d.ear_tag,
    breed: d.breed,
    sex: d.sex,
    birth_date: d.birth_date ? new Date(d.birth_date) : null,
    average_weight: d.initial_weight,
    acquisition_cost: d.acquisition_cost,
    acquired_at: d.acquired_at ? new Date(d.acquired_at) : null,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const batch = await g.db.animalBatch.findFirst({ where: { id: result.data.id } });
  return apiOk(serializeAnimal(batch!), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
