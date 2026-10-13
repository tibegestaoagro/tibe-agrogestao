import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";
import type { z } from "zod";

exigirBancoLocal();

/**
 * Os contratos de `packages/contracts` contra o servidor de verdade.
 * Roda: `npm run test:m73` (precisa do seed: `npm run db:seed`).
 *
 * Duas provas:
 *
 * 1. Cada rota GET coberta pelo pacote é chamada como o aplicativo a chama
 *    (handler real, `Authorization: Bearer` do dono da Da Mata), e a resposta
 *    passa no schema. Lista vazia reprova: um `[]` passa em qualquer schema e
 *    não provaria nada.
 * 2. Cada enumeração do pacote tem exatamente os valores do enum do Prisma.
 *    É a forma de falha que já aconteceu: os contratos ficaram em 5 tipos de
 *    alerta com o banco em 8, e um alerta de manutenção quebrava a lista
 *    inteira no aplicativo.
 *
 * Limite conhecido: a prova 1 só cobre o que o seed tem. Um campo que nunca
 * vem nulo no seed (a marca da máquina, por exemplo) não prova o `.nullable()`
 * do contrato, nem para mais nem para menos.
 *
 * Mesmo truque da m23: o AsyncLocalStorage precisa existir antes do Next
 * carregar, então o resto é importado dentro de `main()`.
 */
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function main() {
  console.log("📜 M73: contratos do pacote contra as rotas reais (Módulos 26, 30, 31, lavoura e serviços)\n");

  const c = await import("@tibe/contracts");
  const E = await import("@/generated/prisma/enums");
  const { prisma } = await import("@/lib/prisma");
  const { signAccessToken } = await import("@/lib/auth-token");
  const { withBearer } = await import("./_escopo-de-requisicao");

  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("Seed ausente: rode `npm run db:seed` no banco local.");
  const token = signAccessToken(owner.id);

  /** Chama o GET, confere 200, o schema e (se `lista`) que veio algo. */
  async function confere<T extends z.ZodType>(
    nome: string,
    route: { GET: unknown },
    url: string,
    schema: T,
    opts: { params?: Record<string, string>; lista?: boolean } = {},
  ): Promise<z.infer<T> | null> {
    const res = await withBearer(token, () =>
      (route.GET as Handler)(new Request(`http://localhost${url}`), {
        params: Promise.resolve(opts.params ?? {}),
      }),
    );
    const body = await res.json();
    if (res.status !== 200) {
      assert(false, `${nome}: responde 200 (veio ${res.status} ${JSON.stringify(body).slice(0, 160)})`);
      return null;
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      assert(false, `${nome}: passa no contrato (${issue?.path.join(".")}: ${issue?.message})`);
      return null;
    }
    const data = (body as { data: unknown }).data;
    if (opts.lista !== false && Array.isArray(data)) {
      assert(data.length > 0, `${nome}: passa no contrato, com ${data.length} itens`);
    } else {
      assert(true, `${nome}: passa no contrato`);
    }
    return parsed.data;
  }

  console.log("1. Rebanho");
  const animais = await confere(
    "GET /animals",
    await import("@/app/api/v1/animals/route"),
    "/api/v1/animals",
    c.listAnimalsResponseSchema,
  );
  const animal = animais?.data[0];
  if (animal) {
    await confere(
      "GET /animals/:id",
      await import("@/app/api/v1/animals/[id]/route"),
      `/api/v1/animals/${animal.id}`,
      c.getAnimalResponseSchema,
      { params: { id: animal.id } },
    );
    await confere(
      "GET /pastures",
      await import("@/app/api/v1/pastures/route"),
      `/api/v1/pastures?property_id=${animal.property_id}`,
      c.listPasturesResponseSchema,
    );
  }
  await confere(
    "GET /animal-categories",
    await import("@/app/api/v1/animal-categories/route"),
    "/api/v1/animal-categories",
    c.listAnimalCategoriesResponseSchema,
  );
  await confere(
    "GET /herd/positions",
    await import("@/app/api/v1/herd/positions/route"),
    "/api/v1/herd/positions",
    c.listHerdPositionsResponseSchema,
  );
  await confere(
    "GET /herd/movements",
    await import("@/app/api/v1/herd/movements/route"),
    "/api/v1/herd/movements",
    c.listHerdMovementsResponseSchema,
  );
  await confere(
    "GET /herd/stays",
    await import("@/app/api/v1/herd/stays/route"),
    "/api/v1/herd/stays",
    c.listHerdStaysResponseSchema,
  );

  console.log("\n2. Lavoura");
  const talhoes = await confere(
    "GET /plots",
    await import("@/app/api/v1/plots/route"),
    "/api/v1/plots",
    c.listPlotsResponseSchema,
  );
  const ciclosRoute = await import("@/app/api/v1/plots/[id]/cycles/route");
  const insumosRoute = await import("@/app/api/v1/cycles/[id]/inputs/route");
  let cicloComInsumo: string | null = null;
  for (const t of talhoes?.data ?? []) {
    const ciclos = await withBearer(token, () =>
      (ciclosRoute.GET as Handler)(new Request(`http://localhost/api/v1/plots/${t.id}/cycles`), {
        params: Promise.resolve({ id: t.id }),
      }),
    ).then((r) => r.json() as Promise<{ data: { id: string }[] }>);
    for (const ciclo of ciclos.data) {
      const insumos = await withBearer(token, () =>
        (insumosRoute.GET as Handler)(new Request(`http://localhost/api/v1/cycles/${ciclo.id}/inputs`), {
          params: Promise.resolve({ id: ciclo.id }),
        }),
      ).then((r) => r.json() as Promise<{ data: unknown[] }>);
      if (insumos.data.length > 0) {
        cicloComInsumo = ciclo.id;
        break;
      }
    }
    if (cicloComInsumo) break;
  }
  const talhao = talhoes?.data[0];
  if (talhao) {
    await confere(
      "GET /plots/:id",
      await import("@/app/api/v1/plots/[id]/route"),
      `/api/v1/plots/${talhao.id}`,
      c.getPlotResponseSchema,
      { params: { id: talhao.id } },
    );
    await confere("GET /plots/:id/cycles", ciclosRoute, `/api/v1/plots/${talhao.id}/cycles`, c.listPlotCyclesResponseSchema, {
      params: { id: talhao.id },
    });
  }
  assert(cicloComInsumo !== null, "o seed tem um ciclo com insumo para conferir");
  if (cicloComInsumo) {
    await confere("GET /cycles/:id/inputs", insumosRoute, `/api/v1/cycles/${cicloComInsumo}/inputs`, c.listCycleInputsResponseSchema, {
      params: { id: cicloComInsumo },
    });
    await confere(
      "GET /cycles/:id/summary",
      await import("@/app/api/v1/cycles/[id]/summary/route"),
      `/api/v1/cycles/${cicloComInsumo}/summary`,
      c.getCycleSummaryResponseSchema,
      { params: { id: cicloComInsumo } },
    );
  }

  console.log("\n3. Serviços");
  const clientes = await confere(
    "GET /service-clients",
    await import("@/app/api/v1/service-clients/route"),
    "/api/v1/service-clients",
    c.listServiceClientsResponseSchema,
  );
  const cliente = clientes?.data[0];
  if (cliente) {
    await confere(
      "GET /service-clients/:id/summary",
      await import("@/app/api/v1/service-clients/[id]/summary/route"),
      `/api/v1/service-clients/${cliente.id}/summary`,
      c.serviceClientSummaryResponseSchema,
      { params: { id: cliente.id } },
    );
  }
  await confere(
    "GET /services",
    await import("@/app/api/v1/services/route"),
    "/api/v1/services",
    c.listServicesResponseSchema,
  );
  await confere(
    "GET /service-orders",
    await import("@/app/api/v1/service-orders/route"),
    "/api/v1/service-orders",
    c.listServiceOrdersResponseSchema,
  );

  // O seed não tem serviço contratado. Cria um pela rota de escrita na
  // primeira execução e reaproveita nas seguintes (só banco local).
  const jobsRoute = await import("@/app/api/v1/service-jobs/route");
  const MARCA = "Contrato m73 (servico de teste)";
  const jaTem = await prisma.serviceJob.findFirst({ where: { tenant_id: owner.tenant_id, description: MARCA } });
  if (!jaTem && animal) {
    const res = await withBearer(token, () =>
      jobsRoute.POST(
        new Request("http://localhost/api/v1/service-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property_id: animal.property_id,
            occurred_at: new Date().toISOString(),
            description: MARCA,
            pricing: "fechado",
            agreed_amount: 150,
            pago: true,
          }),
        }),
      ),
    );
    assert(res.status === 201, `cria o serviço de teste (veio ${res.status})`);
  }
  const jobs = await confere("GET /service-jobs", jobsRoute, "/api/v1/service-jobs", c.listServiceJobsResponseSchema);
  const job = jobs?.data[0];
  if (job) {
    await confere(
      "GET /service-jobs/:id",
      await import("@/app/api/v1/service-jobs/[id]/route"),
      `/api/v1/service-jobs/${job.id}`,
      c.serviceJobDetailResponseSchema,
      { params: { id: job.id } },
    );
    await confere(
      "GET /service-jobs/:id/costs",
      await import("@/app/api/v1/service-jobs/[id]/costs/route"),
      `/api/v1/service-jobs/${job.id}/costs`,
      c.serviceCostsResponseSchema,
      { params: { id: job.id } },
    );
  }

  console.log("\n4. Negociações");
  const negocios = await confere(
    "GET /negotiations",
    await import("@/app/api/v1/negotiations/route"),
    "/api/v1/negotiations",
    c.listNegotiationsResponseSchema,
  );
  const negocioDetailRoute = await import("@/app/api/v1/negotiations/[id]/route");
  for (const n of negocios?.data ?? []) {
    await confere(`GET /negotiations/:id (${n.type})`, negocioDetailRoute, `/api/v1/negotiations/${n.id}`, c.getNegotiationResponseSchema, {
      params: { id: n.id },
    });
  }

  console.log("\n5. Máquinas");
  const maquinas = await confere(
    "GET /machines",
    await import("@/app/api/v1/machines/route"),
    "/api/v1/machines",
    c.listMachinesResponseSchema,
  );
  const comManutencao = await prisma.machine.findFirst({
    where: { tenant_id: owner.tenant_id, maintenances: { some: {} } },
  });
  assert(comManutencao !== null, "o seed tem máquina com manutenção para conferir");
  if (comManutencao && maquinas) {
    const det = await confere(
      "GET /machines/:id",
      await import("@/app/api/v1/machines/[id]/route"),
      `/api/v1/machines/${comManutencao.id}`,
      c.getMachineResponseSchema,
      { params: { id: comManutencao.id } },
    );
    assert((det?.data.maintenances.length ?? 0) > 0, "o detalhe trouxe manutenções");
  }

  console.log("\n6. Cada enum do pacote tem exatamente os valores do Prisma");
  const pares: [string, z.ZodEnum, Record<string, string>][] = [
    ["MachineStatus", c.machineStatusSchema, E.MachineStatus],
    ["AnimalSex", c.animalSexSchema, E.AnimalSex],
    ["HerdSituation", c.herdSituationSchema, E.HerdSituation],
    ["HerdOwner", c.herdOwnerSchema, E.HerdOwner],
    ["HerdMovementType", c.herdMovementTypeSchema, E.HerdMovementType],
    ["HerdStayType", c.herdStayTypeSchema, E.HerdStayType],
    ["HerdChargeType", c.herdChargeTypeSchema, E.HerdChargeType],
    ["CropCycleStatus", c.cropCycleStatusSchema, E.CropCycleStatus],
    ["InputType", c.inputTypeSchema, E.InputType],
    ["PricingType", c.pricingTypeSchema, E.PricingType],
    ["ServiceOrderStatus", c.serviceOrderStatusSchema, E.ServiceOrderStatus],
    ["ServiceDirection", c.serviceDirectionSchema, E.ServiceDirection],
    ["ServicePricing", c.servicePricingSchema, E.ServicePricing],
    ["ServiceJobStatus", c.serviceJobStatusSchema, E.ServiceJobStatus],
    ["ServiceCostKind", c.serviceCostKindSchema, E.ServiceCostKind],
    ["NegotiationType", c.negotiationTypeSchema, E.NegotiationType],
    ["NegotiationEntryRole", c.negotiationEntryRoleSchema, E.NegotiationEntryRole],
    ["UserRole", c.userRoleSchema, E.UserRole],
    ["EntryType", c.entryTypeSchema, E.EntryType],
    ["RelatedModule", c.relatedModuleSchema, E.RelatedModule],
    ["FinancialEntryStatus", c.financialEntryStatusSchema, E.FinancialEntryStatus],
    ["AlertType", c.alertTypeSchema, E.AlertType],
    ["AlertStatus", c.alertStatusSchema, E.AlertStatus],
    ["PasswordResetChannel", c.passwordResetChannelSchema, E.PasswordResetChannel],
    ["TenantPlan", c.tenantPlanSchema, E.TenantPlan],
  ];
  for (const [nome, contrato, prismaEnum] of pares) {
    const doContrato = contrato.options.map(String).sort();
    const doBanco = Object.values(prismaEnum).sort();
    const falta = doBanco.filter((v) => !doContrato.includes(v));
    const sobra = doContrato.filter((v) => !doBanco.includes(v));
    assert(
      falta.length === 0 && sobra.length === 0,
      `${nome}${falta.length ? `: falta ${falta.join(", ")}` : ""}${sobra.length ? `: sobra ${sobra.join(", ")}` : ""}`,
    );
  }

  await prisma.$disconnect();
  console.log(failures === 0 ? "\n✅ M73 passou." : `\n❌ M73: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
