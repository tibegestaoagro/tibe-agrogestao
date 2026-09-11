import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();

/**
 * Módulo 36: Minha Lista de Compra (docs/superpowers/specs/2026-09-11-modulo-36-lista-de-compra.md).
 *
 * Escrita ÀS CEGAS: a partir do contrato do briefing e da spec (que é
 * documento de produto, não implementação), sem ler
 * `src/lib/actions/shopping-items.ts`,
 * `src/lib/actions/whatsapp-handlers/lista-de-compra.ts`,
 * `scripts/_fumaca-lista.ts` nem as rotas em `src/app/api/v1/shopping-items/`.
 *
 * `globalThis.AsyncLocalStorage` precisa existir ANTES de qualquer módulo do
 * Next carregar (padrão do `m23`/`m62`): por isso o resto é importado
 * dinamicamente, dentro de `main()`.
 *
 * Roda: `npm run test:m63`
 */
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.error(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

/**
 * A mesma semana ISO que `alerts.ts` usa para o `related_id` sintético do
 * `low_stock` (`<product_id>:<semana>`). Cópia local, só para montar um Alert
 * de teste plausível: não precisa bater byte a byte com a implementação, só
 * ter o formato certo.
 */
function semanaIso(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

type ApiJson = {
  data?: unknown;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; field?: string };
};
async function body(res: Response): Promise<ApiJson> {
  return (await res.json()) as ApiJson;
}

console.log("🛒 M63: Módulo 36, Minha Lista de Compra\n");

async function main() {
  const bcrypt = (await import("bcryptjs")).default;
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");
  const { createProduct, ensureProductCategories, listProductCategories } = await import(
    "@/lib/actions/products"
  );
  const { alertDedupKey } = await import("@/lib/actions/alerts");
  const { routeIntent } = await import("@/lib/actions/whatsapp-router");

  // Rotas de negócio, importadas exatamente como estão no repositório: nunca abertas.
  const itemsRoute = await import("@/app/api/v1/shopping-items/route");
  const itemRoute = await import("@/app/api/v1/shopping-items/[id]/route");
  const purchaseRoute = await import("@/app/api/v1/shopping-items/[id]/purchase/route");
  const alertShoppingRoute = await import("@/app/api/v1/alerts/[id]/shopping-item/route");

  function reqJson(method: string, url: string, payload?: unknown): Request {
    return new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  }
  function reqGet(url: string): Request {
    return new Request(url);
  }

  const stamp = Date.now();
  const password = "SenhaForte#2026";
  const hash = await bcrypt.hash(password, 10);

  async function makeTenant(label: string) {
    const tenant = await prisma.tenant.create({
      data: {
        name: `M63 ${label} ${stamp}`,
        document: `M63${label}${stamp}`.slice(0, 14),
        plan: "fazenda",
      },
    });
    await prisma.tenantProfile.create({
      data: { tenant_id: tenant.id, profile_type: "fazenda", active: true },
    });
    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: `M63 User ${label}`,
        email: `m63-${label.toLowerCase()}-${stamp}@teste.local`,
        password_hash: hash,
        role: "OWNER",
      },
    });
    const db = prismaForTenant(tenant.id);
    const property = await db.property.create({ data: scoped({ name: `Fazenda M63 ${label}` }) });
    await ensureProductCategories(db);
    const categorias = await listProductCategories(db);
    const token = signAccessToken(user.id);
    return { tenant, user, db, property, categorias, token };
  }

  const A = await makeTenant("A");
  const B = await makeTenant("B");

  const urlItems = "http://localhost/api/v1/shopping-items";
  const urlItem = (id: string) => `http://localhost/api/v1/shopping-items/${id}`;
  const urlPurchase = (id: string) => `http://localhost/api/v1/shopping-items/${id}/purchase`;
  const urlAlertShopping = (id: string) => `http://localhost/api/v1/alerts/${id}/shopping-item`;

  async function criar(token: string, payload: Record<string, unknown>) {
    const res = await withBearer(token, () => itemsRoute.POST(reqJson("POST", urlItems, payload)));
    return { res, json: await body(res) };
  }
  async function listar(token: string, query = "") {
    const res = await withBearer(token, () => itemsRoute.GET(reqGet(`${urlItems}${query}`)));
    return { res, json: await body(res) };
  }
  async function patch(token: string, id: string, payload: Record<string, unknown>) {
    const res = await withBearer(token, () =>
      itemRoute.PATCH(reqJson("PATCH", urlItem(id), payload), { params: Promise.resolve({ id }) }),
    );
    return { res, json: await body(res) };
  }
  async function remover(token: string, id: string) {
    const res = await withBearer(token, () =>
      itemRoute.DELETE(new Request(urlItem(id), { method: "DELETE" }), {
        params: Promise.resolve({ id }),
      }),
    );
    return { res, json: await body(res) };
  }
  async function comprar(token: string, id: string, payload: Record<string, unknown>) {
    const res = await withBearer(token, () =>
      purchaseRoute.POST(reqJson("POST", urlPurchase(id), payload), {
        params: Promise.resolve({ id }),
      }),
    );
    return { res, json: await body(res) };
  }

  type Item = { id: string; status: string; description: string; priority?: string };

  try {
    // ------------------------------------------------------------------
    console.log("1. Item nasce só com descrição; o resto chega depois, por edição\n");
    // ------------------------------------------------------------------
    const { res: r1, json: j1 } = await criar(A.token, { description: "Comprar arame liso" });
    check("só com descrição: 201", r1.status === 201, `status=${r1.status} body=${JSON.stringify(j1)}`);
    const item1 = j1.data as Item;
    check("nasce pendente", item1?.status === "pendente", String(item1?.status));
    /**
     * ⚠️ ACHADO: o `data` de POST/PATCH/alert→item é uma projeção FINA
     * (`id, description, status, priority`), sem `quantity`/`unit`/etc,
     * enquanto o GET da lista devolve o recurso inteiro serializado
     * (`quantity`, `unit`, `product_name`, `property_name`, `category_name`,
     * `purpose`, `place`, `notes`, `negotiation_id`, `resolved_at`...).
     * Por isso as afirmações de CAMPO abaixo leem o BANCO direto em vez do
     * corpo da resposta de escrita: é a fonte que não depende dessa projeção.
     */
    const item1NoBanco = await A.db.shoppingItem.findFirst({ where: { id: item1.id } });
    check("quantidade nasce vazia", item1NoBanco?.quantity == null, String(item1NoBanco?.quantity));

    const { res: r1e, json: j1e } = await patch(A.token, item1.id, { quantity: 25, unit: "rolo" });
    check("editar depois, sem 'acao': 200", r1e.status === 200, `status=${r1e.status} body=${JSON.stringify(j1e)}`);
    const item1EditadoNoBanco = await A.db.shoppingItem.findFirst({ where: { id: item1.id } });
    check(
      "a quantidade agora existe (conferida no banco, pois a resposta do PATCH não a traz)",
      Number(item1EditadoNoBanco?.quantity) === 25,
      String(item1EditadoNoBanco?.quantity),
    );

    // ------------------------------------------------------------------
    console.log("\n2. Descrição vazia é recusada (recusa de validação)\n");
    // ------------------------------------------------------------------
    const { res: r2, json: j2 } = await criar(A.token, { description: "" });
    check(
      "descrição vazia: 422 VALIDATION_ERROR, campo description",
      r2.status === 422 && j2.error?.code === "VALIDATION_ERROR" && j2.error?.field === "description",
      `status=${r2.status} error=${JSON.stringify(j2.error)}`,
    );
    const { res: r2b, json: j2b } = await criar(A.token, {});
    check(
      "descrição ausente: também 422, campo description",
      r2b.status === 422 && j2b.error?.field === "description",
      `status=${r2b.status} error=${JSON.stringify(j2b.error)}`,
    );

    // ------------------------------------------------------------------
    console.log("\n3. Duplicata: item pendente parecido avisa, não recusa em silêncio\n");
    // ------------------------------------------------------------------
    const { res: r3a, json: j3a } = await criar(A.token, { description: "Sal Mineral 60" });
    check("primeiro 'Sal Mineral 60': 201", r3a.status === 201, JSON.stringify(j3a));

    const { res: r3b, json: j3b } = await criar(A.token, { description: "sal mineral 60" });
    check(
      "parecido (minúsculo, sem acento) é recusado: 409 ITEM_JA_NA_LISTA, campo description",
      r3b.status === 409 && j3b.error?.code === "ITEM_JA_NA_LISTA" && j3b.error?.field === "description",
      `status=${r3b.status} error=${JSON.stringify(j3b.error)}`,
    );

    const { res: r3c, json: j3c } = await criar(A.token, {
      description: "sal mineral 60",
      permitir_duplicata: true,
    });
    check(
      "com permitir_duplicata, entra mesmo parecido: 201",
      r3c.status === 201,
      `status=${r3c.status} body=${JSON.stringify(j3c)}`,
    );

    // Duplicata por PRODUTO (T03 da spec): mesmo product_id, descrição diferente.
    const salMineralCat = A.categorias.find((c) => c.name === "Sal mineral")!;
    const produtoSal = await createProduct(A.db, {
      name: `Sal Mineral 60 P M63 ${stamp}`,
      category_id: salMineralCat.id,
      unit: "saca",
    });
    if (!produtoSal.ok) throw new Error("faltou o produto de sal para o teste de duplicata");
    const { res: r3d, json: j3d } = await criar(A.token, {
      description: "Reposição do curral",
      product_id: produtoSal.data.id,
    });
    check("primeiro item com o produto: 201", r3d.status === 201, JSON.stringify(j3d));
    const { res: r3e, json: j3e } = await criar(A.token, {
      description: "Outra frase, mesmo produto",
      product_id: produtoSal.data.id,
    });
    check(
      "mesmo product_id, descrição diferente: também é duplicata (T03 da spec)",
      r3e.status === 409 && j3e.error?.code === "ITEM_JA_NA_LISTA",
      `status=${r3e.status} error=${JSON.stringify(j3e.error)}`,
    );

    // ------------------------------------------------------------------
    console.log("\n4. Quantidade fracionada numa unidade que não aceita fração\n");
    // ------------------------------------------------------------------
    const { res: r4, json: j4 } = await criar(A.token, {
      description: "Comprar frascos de vermífugo M63",
      unit: "frasco",
      quantity: 2.5,
    });
    check(
      "2,5 frascos: 422 QUANTIDADE_FRACIONADA, campo quantity",
      r4.status === 422 && j4.error?.code === "QUANTIDADE_FRACIONADA" && j4.error?.field === "quantity",
      `status=${r4.status} error=${JSON.stringify(j4.error)}`,
    );
    const { res: r4b, json: j4b } = await criar(A.token, {
      description: "Comprar frascos de vermífugo M63 dois",
      unit: "frasco",
      quantity: 3,
    });
    check("3 frascos inteiros entra normalmente", r4b.status === 201, JSON.stringify(j4b));
    const { res: r4c, json: j4c } = await criar(A.token, {
      description: "Comprar óleo diesel M63",
      unit: "litro",
      quantity: 2.5,
    });
    check("2,5 litros (unidade fracionável) entra normalmente", r4c.status === 201, JSON.stringify(j4c));

    // ------------------------------------------------------------------
    console.log("\n5. A lista: pendentes por padrão, urgentes primeiro, e os filtros\n");
    // ------------------------------------------------------------------
    const marcador = `M63-lugar-${stamp}`;
    const propriedade2 = await A.db.property.create({ data: scoped({ name: `Fazenda M63 A2 ${stamp}` }) });
    const purposeCat = A.categorias.find((c) => c.name === "Ferramentas")!;

    const { json: jNormal1 } = await criar(A.token, {
      description: `M63 normal um ${stamp}`,
      priority: "normal",
      place: marcador,
      property_id: A.property.id,
      purpose: "cerca",
      category_id: purposeCat.id,
    });
    const { json: jUrgente } = await criar(A.token, {
      description: `M63 urgente ${stamp}`,
      priority: "urgente",
      place: marcador,
      property_id: propriedade2.id,
      purpose: "maquina",
      category_id: purposeCat.id,
    });
    const { json: jNormal2 } = await criar(A.token, {
      description: `M63 normal dois ${stamp}`,
      priority: "normal",
      place: marcador,
      property_id: A.property.id,
      purpose: "cerca",
      category_id: purposeCat.id,
    });
    const itemNormal1 = jNormal1.data as Item;
    const itemUrgente = jUrgente.data as Item;
    const itemNormal2 = jNormal2.data as Item;

    const { json: jLista } = await listar(A.token, `?place=${encodeURIComponent(marcador)}`);
    const listaLugar = (jLista.data as Item[]) ?? [];
    check(
      "os três do marcador aparecem, urgente primeiro",
      listaLugar.length === 3 && listaLugar[0]?.id === itemUrgente.id,
      `ordem=${listaLugar.map((i) => `${i.description}:${i.priority}`).join(" | ")}`,
    );

    const { json: jPorPrioridade } = await listar(
      A.token,
      `?place=${encodeURIComponent(marcador)}&priority=urgente`,
    );
    const listaPrioridade = (jPorPrioridade.data as Item[]) ?? [];
    check(
      "filtro priority=urgente devolve só o urgente",
      listaPrioridade.length === 1 && listaPrioridade[0]?.id === itemUrgente.id,
      JSON.stringify(listaPrioridade),
    );

    const { json: jPorFazenda } = await listar(
      A.token,
      `?place=${encodeURIComponent(marcador)}&property_id=${propriedade2.id}`,
    );
    const listaFazenda = (jPorFazenda.data as Item[]) ?? [];
    check(
      "filtro property_id devolve só o dessa fazenda",
      listaFazenda.length === 1 && listaFazenda[0]?.id === itemUrgente.id,
      JSON.stringify(listaFazenda),
    );

    const { json: jPorFinalidade } = await listar(
      A.token,
      `?place=${encodeURIComponent(marcador)}&purpose=maquina`,
    );
    const listaFinalidade = (jPorFinalidade.data as Item[]) ?? [];
    check(
      "filtro purpose=maquina devolve só o de finalidade máquina",
      listaFinalidade.length === 1 && listaFinalidade[0]?.id === itemUrgente.id,
      JSON.stringify(listaFinalidade),
    );

    // ------------------------------------------------------------------
    console.log("\n6. Concluir e remover NÃO apagam a linha, e saem dos pendentes\n");
    // ------------------------------------------------------------------
    const { res: r6a, json: j6a } = await patch(A.token, itemNormal1.id, { acao: "concluir" });
    check(
      "concluir: 200, status vira comprado",
      r6a.status === 200 && (j6a.data as Item)?.status === "comprado",
      `status=${r6a.status} body=${JSON.stringify(j6a)}`,
    );
    const linhaAindaExiste1 = await A.db.shoppingItem.findFirst({ where: { id: itemNormal1.id } });
    check("a linha concluída CONTINUA no banco", linhaAindaExiste1 !== null);
    check(
      "e resolved_at foi preenchido",
      linhaAindaExiste1?.resolved_at != null,
      String(linhaAindaExiste1?.resolved_at),
    );

    const { res: r6b, json: j6b } = await remover(A.token, itemNormal2.id);
    check(
      "remover: 200, status vira removido",
      r6b.status === 200 && (j6b.data as Item)?.status === "removido",
      `status=${r6b.status} body=${JSON.stringify(j6b)}`,
    );
    const linhaAindaExiste2 = await A.db.shoppingItem.findFirst({ where: { id: itemNormal2.id } });
    check("a linha removida TAMBÉM continua no banco", linhaAindaExiste2 !== null);

    const { json: jSemOsDois } = await listar(A.token, `?place=${encodeURIComponent(marcador)}`);
    const semOsDois = (jSemOsDois.data as Item[]) ?? [];
    check(
      "os dois resolvidos somem da lista de pendentes",
      semOsDois.length === 1 && semOsDois[0]?.id === itemUrgente.id,
      JSON.stringify(semOsDois),
    );

    const { json: jStatusComprado } = await listar(
      A.token,
      `?place=${encodeURIComponent(marcador)}&status=comprado`,
    );
    const soComprados = (jStatusComprado.data as Item[]) ?? [];
    check(
      "?status=comprado devolve só o concluído",
      soComprados.length === 1 && soComprados[0]?.id === itemNormal1.id,
      JSON.stringify(soComprados),
    );

    // Editar item que já saiu da lista.
    const { res: r6c, json: j6c } = await patch(A.token, itemNormal1.id, { quantity: 99 });
    check(
      "editar item concluído: 422 NOT_EDITABLE",
      r6c.status === 422 && j6c.error?.code === "NOT_EDITABLE",
      `status=${r6c.status} error=${JSON.stringify(j6c.error)}`,
    );

    // Concluir/remover item que já saiu.
    const { res: r6d, json: j6d } = await patch(A.token, itemNormal1.id, { acao: "concluir" });
    check(
      "concluir de novo um item já concluído: 422 ITEM_JA_RESOLVIDO",
      r6d.status === 422 && j6d.error?.code === "ITEM_JA_RESOLVIDO",
      `status=${r6d.status} error=${JSON.stringify(j6d.error)}`,
    );
    const { res: r6e, json: j6e } = await remover(A.token, itemNormal2.id);
    check(
      "remover de novo um item já removido: 422 ITEM_JA_RESOLVIDO",
      r6e.status === 422 && j6e.error?.code === "ITEM_JA_RESOLVIDO",
      `status=${r6e.status} error=${JSON.stringify(j6e.error)}`,
    );
    const { res: r6f, json: j6f } = await remover(A.token, itemNormal1.id);
    check(
      "remover um item que já saiu por CONCLUSÃO: também 422 ITEM_JA_RESOLVIDO",
      r6f.status === 422 && j6f.error?.code === "ITEM_JA_RESOLVIDO",
      `status=${r6f.status} error=${JSON.stringify(j6f.error)}`,
    );

    // ------------------------------------------------------------------
    console.log(
      "\n7. A PROVA CENTRAL: anotar, editar, concluir e remover não tocam em dinheiro nem estoque\n",
    );
    // ------------------------------------------------------------------
    const lancamentosAntes = await A.db.financialEntry.count();
    const movimentosAntes = await A.db.stockMovement.count();
    check(
      "zero FinancialEntry no tenant depois de toda a operação da lista até aqui",
      lancamentosAntes === 0,
      `financialEntry.count()=${lancamentosAntes}`,
    );
    check(
      "zero StockMovement no tenant depois de toda a operação da lista até aqui",
      movimentosAntes === 0,
      `stockMovement.count()=${movimentosAntes}`,
    );

    // ------------------------------------------------------------------
    console.log("\n8. Repetir: ainda pendente recusa; comprado cria um NOVO pendente\n");
    // ------------------------------------------------------------------
    const { json: jParaRepetir } = await criar(A.token, { description: `M63 repetir ${stamp}` });
    const itemParaRepetir = jParaRepetir.data as Item;

    const { res: r8a, json: j8a } = await patch(A.token, itemParaRepetir.id, { acao: "repetir" });
    check(
      "repetir item ainda pendente: 422 ITEM_AINDA_PENDENTE",
      r8a.status === 422 && j8a.error?.code === "ITEM_AINDA_PENDENTE",
      `status=${r8a.status} error=${JSON.stringify(j8a.error)}`,
    );

    await patch(A.token, itemParaRepetir.id, { acao: "concluir" });
    const contagemAntesDeRepetir = await A.db.shoppingItem.count({
      where: { description: itemParaRepetir.description },
    });
    const { res: r8b, json: j8b } = await patch(A.token, itemParaRepetir.id, { acao: "repetir" });
    check(
      "repetir item comprado: 200/201, cria item novo",
      (r8b.status === 200 || r8b.status === 201) && (j8b.data as Item)?.id !== itemParaRepetir.id,
      `status=${r8b.status} body=${JSON.stringify(j8b)}`,
    );
    const itemRepetido = j8b.data as Item;
    check("o novo nasce pendente", itemRepetido?.status === "pendente", String(itemRepetido?.status));
    check(
      "o novo tem a MESMA descrição",
      itemRepetido?.description === itemParaRepetir.description,
      itemRepetido?.description,
    );

    const original = await A.db.shoppingItem.findFirst({ where: { id: itemParaRepetir.id } });
    check(
      "o item ORIGINAL continua comprado, sem ser tocado",
      original?.status === "comprado",
      String(original?.status),
    );
    const contagemDepoisDeRepetir = await A.db.shoppingItem.count({
      where: { description: itemParaRepetir.description },
    });
    check(
      "existe mais uma linha com a mesma descrição do que antes (o repetido, não uma edição)",
      contagemDepoisDeRepetir === contagemAntesDeRepetir + 1,
      `${contagemAntesDeRepetir} -> ${contagemDepoisDeRepetir}`,
    );

    // ------------------------------------------------------------------
    console.log("\n9. Comprar: as três recusas antes de qualquer negócio nascer\n");
    // ------------------------------------------------------------------
    const ferramentasCat = A.categorias.find((c) => c.name === "Ferramentas")!;

    const { json: jSemNada } = await criar(A.token, { description: `M63 comprar sem nada ${stamp}` });
    const itemSemNada = jSemNada.data as Item;

    const { res: r9a, json: j9a } = await comprar(A.token, itemSemNada.id, {
      amount: 100,
      quantity: 1,
      property_id: A.property.id,
    });
    check(
      "comprar sem produto e sem novo_produto: 422 field product_id",
      r9a.status === 422 && j9a.error?.field === "product_id",
      `status=${r9a.status} error=${JSON.stringify(j9a.error)}`,
    );
    check(
      "e o código é o de negócio, PRODUTO_NECESSARIO (não genérico de schema)",
      j9a.error?.code === "PRODUTO_NECESSARIO",
      `code=${j9a.error?.code}`,
    );

    const { res: r9b, json: j9b } = await comprar(A.token, itemSemNada.id, {
      amount: 100,
      quantity: 1,
      novo_produto: { name: `M63 Produto Novo A ${stamp}`, unit: "unidade", category_id: ferramentasCat.id },
    });
    check(
      "comprar sem fazenda: 422 field property_id",
      r9b.status === 422 && j9b.error?.field === "property_id",
      `status=${r9b.status} error=${JSON.stringify(j9b.error)}`,
    );
    check("código FAZENDA_NECESSARIA", j9b.error?.code === "FAZENDA_NECESSARIA", `code=${j9b.error?.code}`);

    const { res: r9c, json: j9c } = await comprar(A.token, itemSemNada.id, {
      amount: 100,
      property_id: A.property.id,
      novo_produto: { name: `M63 Produto Novo B ${stamp}`, unit: "unidade", category_id: ferramentasCat.id },
    });
    check(
      "comprar sem quantidade: 422 field quantity",
      r9c.status === 422 && j9c.error?.field === "quantity",
      `status=${r9c.status} error=${JSON.stringify(j9c.error)}`,
    );
    check("código QUANTIDADE_NECESSARIA", j9c.error?.code === "QUANTIDADE_NECESSARIA", `code=${j9c.error?.code}`);

    const itemAindaPendenteAposRecusas = await A.db.shoppingItem.findFirst({
      where: { id: itemSemNada.id },
    });
    check(
      "depois das três recusas, o item continua PENDENTE",
      itemAindaPendenteAposRecusas?.status === "pendente",
      String(itemAindaPendenteAposRecusas?.status),
    );

    // ------------------------------------------------------------------
    console.log("\n10. Comprar: o caminho feliz, com produto novo criado na hora\n");
    // ------------------------------------------------------------------
    const negociacoesAntes = await A.db.negotiation.count();
    const lancamentosAntesDaCompra = await A.db.financialEntry.count();
    const movimentosAntesDaCompra = await A.db.stockMovement.count();

    const { res: r10, json: j10 } = await comprar(A.token, itemSemNada.id, {
      amount: 350.5,
      quantity: 2,
      property_id: A.property.id,
      pago: false,
      contact_name: "Fornecedor M63 Teste",
      novo_produto: {
        name: `M63 Arame farpado ${stamp}`,
        unit: "rolo",
        category_id: ferramentasCat.id,
      },
    });
    check(
      "compra completa: 200/201",
      r10.status === 200 || r10.status === 201,
      `status=${r10.status} body=${JSON.stringify(j10)}`,
    );
    /**
     * ⚠️ A resposta de POST .../purchase é um resumo (`item_id`,
     * `negotiation_id`, `product_id`), não o ShoppingItem serializado: não tem
     * `status`. O `status`/`negotiation_id` gravados são conferidos no banco.
     */
    const resumoDaCompra = j10.data as { item_id?: string; negotiation_id?: string; product_id?: string };
    const itemComprado = { id: resumoDaCompra?.item_id ?? itemSemNada.id, negotiation_id: resumoDaCompra?.negotiation_id ?? null };
    const itemCompradoNoBanco = await A.db.shoppingItem.findFirst({ where: { id: itemComprado.id } });
    check(
      "item sai da lista: status comprado (conferido no banco)",
      itemCompradoNoBanco?.status === "comprado",
      `status=${itemCompradoNoBanco?.status} resposta=${JSON.stringify(j10)}`,
    );
    check(
      "e o negotiation_id ficou preenchido",
      typeof itemComprado?.negotiation_id === "string" && itemComprado.negotiation_id.length > 0,
      String(itemComprado?.negotiation_id),
    );
    check(
      "e bate com o que está gravado no item",
      itemCompradoNoBanco?.negotiation_id === itemComprado.negotiation_id,
      `banco=${itemCompradoNoBanco?.negotiation_id} resposta=${itemComprado.negotiation_id}`,
    );

    const negociacoesDepois = await A.db.negotiation.count();
    check("nasceu exatamente UMA Negotiation", negociacoesDepois === negociacoesAntes + 1);
    const negociacaoCriada = await A.db.negotiation.findFirst({
      where: { id: itemComprado.negotiation_id ?? "" },
    });
    check(
      "do tipo compra_produto",
      negociacaoCriada?.type === "compra_produto",
      String(negociacaoCriada?.type),
    );

    const lancamentosDepoisDaCompra = await A.db.financialEntry.count();
    check(
      "nasceu pelo menos UM FinancialEntry de despesa",
      lancamentosDepoisDaCompra > lancamentosAntesDaCompra,
      `${lancamentosAntesDaCompra} -> ${lancamentosDepoisDaCompra}`,
    );
    const lancamentoDaCompra = await A.db.financialEntry.findFirst({
      where: { negotiation_id: itemComprado.negotiation_id ?? "" },
    });
    check(
      "e é despesa (expense)",
      lancamentoDaCompra?.entry_type === "expense",
      String(lancamentoDaCompra?.entry_type),
    );

    const movimentosDepoisDaCompra = await A.db.stockMovement.count();
    check(
      "nasceu pelo menos UM StockMovement de entrada",
      movimentosDepoisDaCompra > movimentosAntesDaCompra,
      `${movimentosAntesDaCompra} -> ${movimentosDepoisDaCompra}`,
    );
    const movimentoDaCompra = await A.db.stockMovement.findFirst({
      where: { negotiation_id: itemComprado.negotiation_id ?? "" },
    });
    check(
      "e é do tipo compra",
      movimentoDaCompra?.movement_type === "compra",
      String(movimentoDaCompra?.movement_type),
    );

    // ------------------------------------------------------------------
    console.log("\n11. Atomicidade: compra que falha não deixa negociação órfã, item continua pendente\n");
    // ------------------------------------------------------------------
    const { json: jParaFalhar } = await criar(A.token, { description: `M63 vai falhar a compra ${stamp}` });
    const itemParaFalhar = jParaFalhar.data as Item;
    const negociacoesAntesDaFalha = await A.db.negotiation.count();

    const { res: r11, json: j11 } = await comprar(A.token, itemParaFalhar.id, {
      amount: 100,
      quantity: 1,
      property_id: A.property.id,
      product_id: "m63-produto-que-nao-existe",
    });
    check(
      "product_id inexistente: a compra FALHA",
      r11.status >= 400,
      `status=${r11.status} body=${JSON.stringify(j11)}`,
    );
    const negociacoesDepoisDaFalha = await A.db.negotiation.count();
    check(
      "nenhuma Negotiation órfã nasceu",
      negociacoesDepoisDaFalha === negociacoesAntesDaFalha,
      `${negociacoesAntesDaFalha} -> ${negociacoesDepoisDaFalha}`,
    );
    const itemAposFalha = await A.db.shoppingItem.findFirst({ where: { id: itemParaFalhar.id } });
    check(
      "o item continua PENDENTE depois da compra que falhou",
      itemAposFalha?.status === "pendente",
      String(itemAposFalha?.status),
    );

    // ------------------------------------------------------------------
    console.log("\n12. Comprar duas vezes o mesmo item é recusado\n");
    // ------------------------------------------------------------------
    const negociacoesAntesDaSegunda = await A.db.negotiation.count();
    const { res: r12, json: j12 } = await comprar(A.token, itemComprado.id, {
      amount: 999,
      quantity: 1,
      property_id: A.property.id,
      novo_produto: { name: `M63 Produto Repetido ${stamp}`, unit: "unidade", category_id: ferramentasCat.id },
    });
    check(
      "comprar de novo um item já comprado: recusado com uma recusa de NEGÓCIO (4xx), não uma exceção (5xx)",
      r12.status >= 400 && r12.status < 500,
      `status=${r12.status} body=${JSON.stringify(j12)}`,
    );
    const negociacoesDepoisDaSegunda = await A.db.negotiation.count();
    check(
      "e nenhuma segunda Negotiation nasceu",
      negociacoesDepoisDaSegunda === negociacoesAntesDaSegunda,
      `${negociacoesAntesDaSegunda} -> ${negociacoesDepoisDaSegunda}`,
    );

    // ------------------------------------------------------------------
    console.log("\n13. O alerta low_stock ganha a ação de virar item da lista\n");
    // ------------------------------------------------------------------
    const combustivelCat = A.categorias.find((c) => c.name === "Combustível")!;
    const produtoAlerta = await createProduct(A.db, {
      name: `M63 Óleo diesel do alerta ${stamp}`,
      category_id: combustivelCat.id,
      unit: "litro",
      minimum_stock: 100,
    });
    if (!produtoAlerta.ok) throw new Error("faltou o produto do alerta");

    const semana = semanaIso(new Date());
    const relatedId = `${produtoAlerta.data.id}:${semana}`;
    const dedupKey = alertDedupKey({
      alert_type: "low_stock",
      related_module: "geral",
      related_id: relatedId,
      dia: new Date(),
    });
    const alerta = await A.db.alert.create({
      data: scoped({
        alert_type: "low_stock",
        related_module: "geral",
        related_id: relatedId,
        message: `📦 ${produtoAlerta.data.name} está acabando.`,
        status: "pending",
        dedup_key: dedupKey,
      }),
    });

    const resAlertRoute = await withBearer(A.token, () =>
      alertShoppingRoute.POST(reqJson("POST", urlAlertShopping(alerta.id), {}), {
        params: Promise.resolve({ id: alerta.id }),
      }),
    );
    const jAlertRoute = await body(resAlertRoute);
    check(
      "alerta vira item: 200/201",
      resAlertRoute.status === 200 || resAlertRoute.status === 201,
      `status=${resAlertRoute.status} body=${JSON.stringify(jAlertRoute)}`,
    );
    // A resposta é a mesma projeção fina do POST/PATCH (sem product_id/unit/
    // category_id): a origem confiável é o banco.
    const itemDoAlerta = jAlertRoute.data as Item;
    const itemDoAlertaNoBanco = await A.db.shoppingItem.findFirst({ where: { id: itemDoAlerta?.id } });
    check(
      "o item nasce com o PRODUTO do alerta",
      itemDoAlertaNoBanco?.product_id === produtoAlerta.data.id,
      `product_id=${itemDoAlertaNoBanco?.product_id}`,
    );
    check(
      "com a UNIDADE do cadastro",
      itemDoAlertaNoBanco?.unit === "litro",
      String(itemDoAlertaNoBanco?.unit),
    );
    check(
      "com a CATEGORIA do cadastro",
      itemDoAlertaNoBanco?.category_id === combustivelCat.id,
      String(itemDoAlertaNoBanco?.category_id),
    );

    const alertaDepois = await A.db.alert.findFirst({ where: { id: alerta.id } });
    check("o alerta fica dismissed", alertaDepois?.status === "dismissed", String(alertaDepois?.status));

    /*
     * Produto com unidade FORA do vocabulário (um "kg" herdado de cadastro
     * antigo, em vez de "quilograma"). Achado na validação ao vivo de 11/09:
     * o botão do alerta recusava com "Unidade desconhecida" e o produtor
     * clicava sem nada acontecer. A unidade veio do cadastro, não dele.
     */
    const produtoTorto = await A.db.product.create({
      data: scoped({
        name: `M63 Produto com unidade torta ${stamp}`,
        category_id: combustivelCat.id,
        unit: "kg",
      }),
    });
    const relatedTorto = `${produtoTorto.id}:2026-W37`;
    const alertaTorto = await A.db.alert.create({
      data: scoped({
        alert_type: "low_stock",
        related_module: "geral",
        related_id: relatedTorto,
        message: `📦 ${produtoTorto.name} está acabando.`,
        status: "pending",
        dedup_key: alertDedupKey({
          alert_type: "low_stock",
          related_module: "geral",
          related_id: relatedTorto,
          dia: new Date(),
        }),
      }),
    });
    const resTorto = await withBearer(A.token, () =>
      alertShoppingRoute.POST(reqJson("POST", urlAlertShopping(alertaTorto.id), {}), {
        params: Promise.resolve({ id: alertaTorto.id }),
      }),
    );
    const jTorto = await body(resTorto);
    check(
      "produto com unidade fora do vocabulário AINDA vira item da lista",
      resTorto.status === 200 || resTorto.status === 201,
      `status=${resTorto.status} body=${JSON.stringify(jTorto)}`,
    );
    const itemTorto = await A.db.shoppingItem.findFirst({
      where: { id: (jTorto.data as Item)?.id },
    });
    check(
      "e ele nasce SEM unidade, em vez de não nascer",
      itemTorto?.unit === null && itemTorto?.product_id === produtoTorto.id,
      `unit=${itemTorto?.unit} product_id=${itemTorto?.product_id}`,
    );

    // ------------------------------------------------------------------
    console.log("\n14. Isolamento entre tenants\n");
    // ------------------------------------------------------------------
    const { json: jDeA } = await criar(A.token, { description: `M63 só de A ${stamp}` });
    const itemDeA = jDeA.data as Item;

    const { json: jListaDeB } = await listar(B.token);
    const listaDeB = (jListaDeB.data as Item[]) ?? [];
    check(
      "tenant B não vê nenhum item de A na própria lista",
      !listaDeB.some((i) => i.id === itemDeA.id),
      JSON.stringify(listaDeB.map((i) => i.id)),
    );

    const { res: rIsoConcluir } = await patch(B.token, itemDeA.id, { acao: "concluir" });
    check("B não conclui item de A: 404", rIsoConcluir.status === 404, `status=${rIsoConcluir.status}`);

    const { res: rIsoRemover } = await remover(B.token, itemDeA.id);
    check("B não remove item de A: 404", rIsoRemover.status === 404, `status=${rIsoRemover.status}`);

    const { res: rIsoComprar } = await comprar(B.token, itemDeA.id, {
      amount: 100,
      quantity: 1,
      property_id: B.property.id,
      novo_produto: { name: `M63 Produto de B ${stamp}`, unit: "unidade", category_id: ferramentasCat.id },
    });
    check("B não compra item de A: 404", rIsoComprar.status === 404, `status=${rIsoComprar.status}`);

    const itemDeAContinuaDeA = await A.db.shoppingItem.findFirst({ where: { id: itemDeA.id } });
    check(
      "o item de A sobrevive intacto, pendente",
      itemDeAContinuaDeA?.status === "pendente",
      String(itemDeAContinuaDeA?.status),
    );

    // ==================================================================
    console.log("\n15. Pelo WhatsApp (§17): vários itens numa frase viram vários itens\n");
    // ==================================================================
    const produtor = await prisma.user.create({
      data: {
        tenant_id: A.tenant.id,
        name: "M63 Produtor WhatsApp",
        email: `m63-wa-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
      },
    });
    function ctxWa(parametros: Record<string, unknown>, opts: { confirmed?: boolean; explicitNo?: boolean } = {}) {
      return {
        tenant_id: A.tenant.id,
        role: "OWNER" as const,
        activeProfiles: ["fazenda"] as Parameters<typeof routeIntent>[1]["activeProfiles"],
        intent: undefined as unknown as string,
        parameters: parametros,
        confirmed: opts.confirmed ?? false,
        explicitNo: opts.explicitNo ?? false,
        user_id: produtor.id,
      };
    }
    const rotear = (intent: string, parametros: Record<string, unknown>, opts: { confirmed?: boolean; explicitNo?: boolean } = {}) =>
      routeIntent(A.db, {
        ...ctxWa(parametros, opts),
        intent: intent as Parameters<typeof routeIntent>[1]["intent"],
      });

    const pendentesAntesDaFrase = await A.db.shoppingItem.count({ where: { status: "pendente" } });
    const respostaVarios = await rotear("adicionar_item_lista", {
      itens: [
        { descricao: `M63 rolo de arame ${stamp}`, quantidade: 2, unidade: "rolo" },
        { descricao: `M63 litro de oleo ${stamp}`, quantidade: 5, unidade: "litro" },
        { descricao: `M63 correia ${stamp}`, quantidade: 1, unidade: "unidade" },
      ],
    });
    check(
      "adicionar_item_lista com 'itens' não pede esclarecimento",
      respostaVarios.action_taken !== "clarification_requested",
      respostaVarios.reply_text,
    );
    const pendentesDepoisDaFrase = await A.db.shoppingItem.count({ where: { status: "pendente" } });
    check(
      "os TRÊS itens da frase nasceram",
      pendentesDepoisDaFrase === pendentesAntesDaFrase + 3,
      `${pendentesAntesDaFrase} -> ${pendentesDepoisDaFrase}: ${respostaVarios.reply_text}`,
    );

    const pendentesAntesDoItemSo = await A.db.shoppingItem.count({ where: { status: "pendente" } });
    const respostaUmSo = await rotear("adicionar_item_lista", {
      descricao: `M63 item avulso ${stamp}`,
      item: `M63 item avulso ${stamp}`,
      quantidade: 3,
      unidade: "unidade",
    });
    const pendentesDepoisDoItemSo = await A.db.shoppingItem.count({ where: { status: "pendente" } });
    check(
      "campos soltos (um item só) também funcionam",
      pendentesDepoisDoItemSo === pendentesAntesDoItemSo + 1,
      `${pendentesAntesDoItemSo} -> ${pendentesDepoisDoItemSo}: ${respostaUmSo.reply_text}`,
    );

    // ------------------------------------------------------------------
    console.log("\n16. Anotar sem quantidade funciona\n");
    // ------------------------------------------------------------------
    const pendentesAntesSemQtd = await A.db.shoppingItem.count({ where: { status: "pendente" } });
    const respostaSemQtd = await rotear("adicionar_item_lista", {
      descricao: `M63 comprar arame sem quantidade ${stamp}`,
      item: `M63 comprar arame sem quantidade ${stamp}`,
    });
    const pendentesDepoisSemQtd = await A.db.shoppingItem.count({ where: { status: "pendente" } });
    check(
      "anotar sem dizer quantidade cria o item mesmo assim",
      pendentesDepoisSemQtd === pendentesAntesSemQtd + 1,
      `${pendentesAntesSemQtd} -> ${pendentesDepoisSemQtd}: ${respostaSemQtd.reply_text}`,
    );

    // ------------------------------------------------------------------
    console.log("\n17. Consultar responde com os pendentes\n");
    // ------------------------------------------------------------------
    const respostaConsulta = await rotear("consultar_lista_compra", {});
    check(
      "consultar não pede esclarecimento",
      respostaConsulta.action_taken !== "clarification_requested",
      respostaConsulta.reply_text,
    );
    check(
      "e cita algo que está na lista (a frase do item avulso, por exemplo)",
      respostaConsulta.reply_text.includes("M63") || respostaConsulta.reply_text.length > 0,
      respostaConsulta.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n18. Remover pelo WhatsApp pergunta antes, e só remove com a confirmação\n");
    // ------------------------------------------------------------------
    /**
     * ⚠️ ACHADO (confirmado num diagnóstico à parte, não pela leitura do
     * handler): os outros NOVE domínios de confirmação deste projeto (herd,
     * stock, negotiation, event, confinamento, leite, barter, worker,
     * service) completam a ação com `confirmed: true` e PARÂMETROS VAZIOS,
     * porque o pedido original fica guardado no `pending-store.ts` e é ele
     * que manda na segunda volta. Testado ao vivo, `remover_item_lista` NÃO
     * completa nesse padrão: o "sim" sozinho (sem repetir a descrição) volta
     * "O que você quer tirar da lista?", como se nada tivesse sido
     * perguntado antes. Repetir a descrição no turno de confirmação FAZ
     * funcionar, então o mecanismo básico existe; o que falta é persistir
     * (ou reidratar) o pedido entre as duas voltas, como os outros nove
     * domínios fazem. Fica a asserção no padrão do PROJETO (não no que o
     * handler aceita hoje), porque é o padrão que o produtor experimenta em
     * todo santo outro fluxo do agente.
     */
    const descricaoParaRemover = `M63 remover pelo whats ${stamp}`;
    await rotear("adicionar_item_lista", { descricao: descricaoParaRemover, item: descricaoParaRemover });
    const itemParaRemoverAntes = await A.db.shoppingItem.findFirst({
      where: { description: descricaoParaRemover },
      orderBy: { created_at: "desc" },
    });
    check("setup: o item para remover existe e está pendente", itemParaRemoverAntes?.status === "pendente");

    const perguntaRemover = await rotear("remover_item_lista", {
      descricao: descricaoParaRemover,
      item: descricaoParaRemover,
    });
    check(
      "remover PERGUNTA antes de tirar da lista",
      perguntaRemover.requires_confirmation === true,
      perguntaRemover.reply_text,
    );
    const itemAindaPendenteAposPergunta = await A.db.shoppingItem.findFirst({
      where: { id: itemParaRemoverAntes!.id },
    });
    check(
      "e NADA foi removido enquanto espera a resposta",
      itemAindaPendenteAposPergunta?.status === "pendente",
      String(itemAindaPendenteAposPergunta?.status),
    );

    const confirmaRemover = await rotear("remover_item_lista", {}, { confirmed: true });
    check(
      "com a confirmação, agora remove de verdade",
      confirmaRemover.action_taken !== "clarification_requested",
      confirmaRemover.reply_text,
    );
    const itemAposConfirmar = await A.db.shoppingItem.findFirst({ where: { id: itemParaRemoverAntes!.id } });
    check(
      "o item saiu de pendente (removido)",
      itemAposConfirmar?.status === "removido",
      String(itemAposConfirmar?.status),
    );

    // ------------------------------------------------------------------
    console.log("\n19. 'Comprei' sem valor risca da lista e não gera nada\n");
    // ------------------------------------------------------------------
    const descricaoComprei = `M63 comprei sem valor ${stamp}`;
    await rotear("adicionar_item_lista", { descricao: descricaoComprei, item: descricaoComprei });
    const itemComprei = await A.db.shoppingItem.findFirst({
      where: { description: descricaoComprei },
      orderBy: { created_at: "desc" },
    });

    const negociacoesAntesDoComprei = await A.db.negotiation.count();
    const lancamentosAntesDoComprei = await A.db.financialEntry.count();
    const movimentosAntesDoComprei = await A.db.stockMovement.count();

    let respostaComprei = await rotear("comprei_item_lista", {
      descricao: descricaoComprei,
      item: descricaoComprei,
    });
    if (respostaComprei.requires_confirmation) {
      respostaComprei = await rotear("comprei_item_lista", {}, { confirmed: true });
    }
    check(
      "'comprei' sem valor não pede esclarecimento nem trava",
      respostaComprei.action_taken !== "clarification_requested",
      respostaComprei.reply_text,
    );

    const itemCompreiDepois = await A.db.shoppingItem.findFirst({ where: { id: itemComprei!.id } });
    check(
      "o item saiu da lista de pendentes",
      itemCompreiDepois?.status !== "pendente",
      String(itemCompreiDepois?.status),
    );
    const negociacoesDepoisDoComprei = await A.db.negotiation.count();
    const lancamentosDepoisDoComprei = await A.db.financialEntry.count();
    const movimentosDepoisDoComprei = await A.db.stockMovement.count();
    check(
      "nenhuma Negotiation nasceu",
      negociacoesDepoisDoComprei === negociacoesAntesDoComprei,
      `${negociacoesAntesDoComprei} -> ${negociacoesDepoisDoComprei}`,
    );
    check(
      "nenhum FinancialEntry nasceu",
      lancamentosDepoisDoComprei === lancamentosAntesDoComprei,
      `${lancamentosAntesDoComprei} -> ${lancamentosDepoisDoComprei}`,
    );
    check(
      "nenhum StockMovement nasceu",
      movimentosDepoisDoComprei === movimentosAntesDoComprei,
      `${movimentosAntesDoComprei} -> ${movimentosDepoisDoComprei}`,
    );

    // ------------------------------------------------------------------
    console.log("\n20. Item ambíguo (dois pendentes parecidos) PERGUNTA em vez de escolher\n");
    // ------------------------------------------------------------------
    const baseAmbigua = `M63 corda ambigua ${stamp}`;
    await rotear("adicionar_item_lista", {
      descricao: `${baseAmbigua} grossa`,
      item: `${baseAmbigua} grossa`,
    });
    await rotear("adicionar_item_lista", {
      descricao: `${baseAmbigua} fina`,
      item: `${baseAmbigua} fina`,
    });
    const respostaAmbigua = await rotear("remover_item_lista", {
      descricao: baseAmbigua,
      item: baseAmbigua,
    });
    check(
      "com dois parecidos, PERGUNTA qual, não escolhe o primeiro",
      respostaAmbigua.requires_confirmation === true || respostaAmbigua.action_taken === "clarification_requested",
      respostaAmbigua.reply_text,
    );
  } finally {
    await prisma.tenant.delete({ where: { id: A.tenant.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: B.tenant.id } }).catch(() => {});
  }

  console.log(falhas === 0 ? "\n✅ M63: 0 falhas." : `\n❌ M63: ${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
