import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Cliente Prisma do Tibé.
 *
 * - `prisma`            → client base, SEM escopo de tenant. Uso restrito:
 *                         autenticação (lookup por email global), seed, scripts e
 *                         o painel da plataforma (PlatformUser, PRD 10.4).
 * - `prismaForTenant()` → client estendido que injeta `tenant_id` automaticamente
 *                         em toda query de modelos tenant-scoped (PRD 10.4). É a
 *                         ÚNICA fonte de verdade do isolamento. Nunca construa
 *                         filtro de tenant manualmente em query de negócio.
 *
 * Prisma 7 exige driver adapter no runtime; usamos @prisma/adapter-pg (funciona
 * tanto com Postgres local quanto com Neon via TCP/pooler).
 */

/**
 * Conjunto de modelos que carregam a coluna `tenant_id` e, portanto, são cobertos
 * pelo middleware de isolamento. Modelos que no PRD original eram "filhos" sem
 * tenant_id próprio (AnimalWeightLog, AnimalVaccination, AnimalMovement, CropCycle,
 * PlotInput) TAMBÉM entram aqui: decisão deliberada de defense-in-depth (desvio
 * do PRD, aprovado pelo usuário; ver CLAUDE.md). Não remova. PlatformUser fica de
 * fora, por desenho (PRD 10.4): não pertence a tenant algum.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  "TenantProfile",
  "User",
  "Property",
  "AnimalCategory",
  "AnimalBatch",
  "Machine",
  "MachineMaintenance",
  "Task",
  "FinancialCategory",
  "AlertPreference",
  "AnimalWeightLog",
  "Vaccine",
  "AnimalVaccination",
  "AnimalMovement",
  "HerdMovement",
  "HerdStay",
  "ConfinementSite",
  "Contact",
  "Negotiation",
  "ProductCategory",
  "Product",
  "StockMovement",
  "Plot",
  "Pasture",
  "CropCycle",
  "PlotInput",
  "ServiceClient",
  "Service",
  "ServiceOrder",
  "FinancialEntry",
  "WhatsAppContact",
  "AgentConversationLog",
  "AgentRequest",
  "Alert",
  "Subscription",
  "EmailLog",
  "PasswordResetCode",
  "AgentFlowState",
  "RefreshToken",
  "PushSubscription",
  "MilkGroup",
  "LactationEntry",
  "MilkProduction",
]);

function createBaseClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não definida. Configure o .env (veja .env.example).",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Singleton: evita esgotar conexões em hot-reload (dev) e reusa em serverless.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  tenantClients?: Map<string, ReturnType<typeof buildTenantClient>>;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createBaseClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Extensão que injeta `tenant_id` em todas as operações de leitura e escrita dos
 * modelos tenant-scoped. Cobre: findUnique(OrThrow), findFirst(OrThrow), findMany,
 * count, aggregate, groupBy, create, createMany(AndReturn), update, updateMany,
 * upsert, delete, deleteMany. (`extendedWhereUnique`, GA desde o Prisma 5, permite
 * adicionar `tenant_id` ao where de findUnique/update/delete por id.)
 */
function buildTenantClient(tenantId: string) {
  return prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          type Dict = Record<string, unknown>;
          const a = (args ?? {}) as {
            where?: Dict;
            data?: Dict | Dict[];
            create?: Dict;
            update?: Dict;
          };

          switch (operation) {
            case "findUnique":
            case "findUniqueOrThrow":
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "deleteMany": {
              a.where = { ...(a.where ?? {}), tenant_id: tenantId };
              return query(a);
            }

            case "update":
            case "delete": {
              // where precisa de um campo único (ex: id) + tenant_id (extendedWhereUnique).
              a.where = { ...(a.where ?? {}), tenant_id: tenantId };
              // Impede mover o registro para outro tenant via data do update.
              if (operation === "update" && a.data && !Array.isArray(a.data)) {
                delete (a.data as Dict).tenant_id;
              }
              return query(a);
            }

            case "create": {
              a.data = { ...((a.data as Dict) ?? {}), tenant_id: tenantId };
              return query(a);
            }

            case "createMany":
            case "createManyAndReturn": {
              const data = a.data;
              a.data = Array.isArray(data)
                ? data.map((d) => ({ ...d, tenant_id: tenantId }))
                : { ...((data as Dict) ?? {}), tenant_id: tenantId };
              return query(a);
            }

            case "upsert": {
              a.where = { ...(a.where ?? {}), tenant_id: tenantId };
              a.create = { ...(a.create ?? {}), tenant_id: tenantId };
              if (a.update) delete (a.update as Dict).tenant_id;
              return query(a);
            }

            default:
              return query(a);
          }
        },
      },
    },
  });
}

/**
 * Marca de tipo (branded type, Onda 4): sem o `[tenantScopedBrand]`, o client
 * base `PrismaClient` é estruturalmente idêntico ao que `$extends()` devolve
 * (a extensão só muda comportamento em runtime, não o formato do tipo), então
 * `TenantPrismaClient` era assignable a partir de `prisma` (base, sem
 * escopo) sem erro de compilação: a garantia de isolamento dependia só de
 * disciplina humana, não do compilador. A marca é só de TIPO (o objeto em
 * runtime nunca tem essa propriedade de verdade); `prismaForTenant()` é o
 * ÚNICO lugar que pode produzir o cast. Passar `prisma` onde se espera
 * `TenantPrismaClient` agora é erro de tipo, não só uma regra a lembrar.
 */
declare const tenantScopedBrand: unique symbol;

export type TenantPrismaClient = ReturnType<typeof buildTenantClient> & {
  readonly [tenantScopedBrand]: true;
};

/**
 * Retorna o client Prisma escopado a um tenant. Cacheado por tenantId para reuso.
 * Toda query de negócio em rotas autenticadas deve usar este client (ou o helper
 * de sessão `getTenantDb()` em tenant-context.ts).
 */
export function prismaForTenant(tenantId: string): TenantPrismaClient {
  if (!tenantId) throw new Error("prismaForTenant: tenantId vazio.");
  const cache =
    globalForPrisma.tenantClients ??
    (globalForPrisma.tenantClients = new Map());
  let client = cache.get(tenantId);
  if (!client) {
    client = buildTenantClient(tenantId);
    cache.set(tenantId, client);
  }
  return client as TenantPrismaClient;
}

/**
 * Marca um objeto de `data` de create como já escopado por tenant. O client
 * escopado injeta o `tenant_id` real em runtime; este helper apenas satisfaz o
 * tipo gerado (que exige `tenant_id`) SEM perder a checagem dos demais campos.
 * Nunca passe um `tenant_id` manualmente aqui: o middleware é a fonte de verdade.
 *
 * Uso: `db.property.create({ data: scoped({ name: "Fazenda A" }) })`
 */
export function scoped<T extends object>(data: T): T & { tenant_id: string } {
  return data as T & { tenant_id: string };
}
