import "dotenv/config";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GROUPS } from "@/app/(public)/docs/api/page";

/**
 * Guardrail (auditoria de arquitetura, 2026-08-04): /docs/api (GROUPS em
 * src/app/(public)/docs/api/page.tsx) é uma cópia manual das rotas reais,
 * sem nada que force a sincronia. Achado concreto no mesmo dia deste teste:
 * o Módulo 29 criou /api/v1/pastures e não atualizou GROUPS. Este teste
 * compara os arquivos route.ts reais (v1, internal, webhooks, platform)
 * contra GROUPS e falha em qualquer divergência, nos dois sentidos.
 *
 * Roda: `npm run test:docs-api` (sem DB necessário).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const API_ROOT = join(__dirname, "..", "src", "app", "api");
// api/auth e api/platform-auth são os catch-alls do NextAuth ([...nextauth]):
// máquina do framework, não endpoint de negócio, fora do escopo de /docs/api.
const SCAN_DIRS = ["v1", "internal", "webhooks", "platform"];
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Débito conhecido, descoberto por este mesmo teste em 2026-08-04: rotas
 * reais que já existiam ANTES desta rodada e nunca foram documentadas em
 * /docs/api (a divergência não é nova, só ficou visível agora). Escrever a
 * documentação de cada uma é trabalho de conteúdo, não de arquitetura;
 * fora do escopo desta rodada (candidato 2 da auditoria de arquitetura).
 * Cada linha removida daqui, sem adicionar de volta em outro lugar, é uma
 * rota que passou a estar documentada de verdade.
 */
const KNOWN_UNDOCUMENTED_GAPS = new Set<string>([
  "DELETE /api/v1/notifications/subscribe",
  "GET /api/internal/jobs/daily-digest",
  "GET /api/platform/whatsapp-config/evolution/status",
  "GET /api/v1/animal-batches",
  "GET /api/v1/animal-batches/:id",
  "GET /api/v1/animal-categories",
  "GET /api/v1/notifications/public-key",
  "PATCH /api/platform/tenants/:id",
  "PATCH /api/platform/tenants/:id/owner-email",
  "PATCH /api/v1/animal-batches/:id",
  "PATCH /api/v1/animal-categories/:id",
  "PATCH /api/v1/auth/profile",
  "POST /api/internal/whatsapp/buffer",
  "POST /api/internal/whatsapp/fetch-media",
  "POST /api/internal/whatsapp/pending-flows",
  "POST /api/platform/tenants",
  "POST /api/platform/tenants/:id/archive",
  "POST /api/platform/tenants/:id/welcome-message",
  "POST /api/platform/whatsapp-config/evolution/connect",
  "POST /api/v1/animal-batches",
  "POST /api/v1/animal-batches/sell",
  "POST /api/v1/animal-categories",
  "POST /api/v1/auth/token",
  "POST /api/v1/auth/token/refresh",
  "POST /api/v1/auth/token/revoke",
  "POST /api/v1/notifications/subscribe",
  "POST /api/v1/tenant/active-property",
  "POST /api/v1/tenant/plan",
]);

function findRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...findRouteFiles(full));
    } else if (entry === "route.ts") {
      files.push(full);
    }
  }
  return files;
}

function toUrlPath(routeFilePath: string): string {
  const relative = routeFilePath
    .slice(API_ROOT.length)
    .replace(/\\/g, "/")
    .replace(/\/route\.ts$/, "");
  const segments = relative
    .split("/")
    .filter(Boolean)
    .map((seg) => (seg.startsWith("[") && seg.endsWith("]") ? `:${seg.slice(1, -1)}` : seg));
  return `/api/${segments.join("/")}`;
}

function extractMethods(fileContent: string): string[] {
  return HTTP_METHODS.filter((m) =>
    new RegExp(`^export\\s+async\\s+function\\s+${m}\\b`, "m").test(fileContent),
  );
}

function main() {
  console.log("📄 Teste de completude: /docs/api vs rotas reais\n");

  const actualPairs = new Set<string>();
  for (const dir of SCAN_DIRS) {
    const routeFiles = findRouteFiles(join(API_ROOT, dir));
    for (const file of routeFiles) {
      const path = toUrlPath(file);
      const methods = extractMethods(readFileSync(file, "utf-8"));
      for (const method of methods) {
        actualPairs.add(`${method} ${path}`);
      }
    }
  }

  const documentedPairs = new Set<string>();
  for (const group of GROUPS) {
    for (const endpoint of group.endpoints) {
      documentedPairs.add(`${endpoint.method} ${endpoint.path}`);
    }
  }

  const missingFromDocs = Array.from(actualPairs)
    .filter((p) => !documentedPairs.has(p) && !KNOWN_UNDOCUMENTED_GAPS.has(p))
    .sort();
  const closedGaps = Array.from(KNOWN_UNDOCUMENTED_GAPS).filter((p) => documentedPairs.has(p));
  const staleInDocs = Array.from(documentedPairs)
    .filter((p) => !actualPairs.has(p))
    .sort();

  assert(
    missingFromDocs.length === 0,
    missingFromDocs.length === 0
      ? "nenhuma rota NOVA sem documentação em /docs/api (além do débito já conhecido)"
      : `rotas reais sem documentação em /docs/api: ${missingFromDocs.join(", ")}`,
  );
  if (closedGaps.length > 0) {
    console.log(
      `  ℹ️  ${closedGaps.length} gap(s) de KNOWN_UNDOCUMENTED_GAPS já documentado(s): remova da lista (${closedGaps.join(", ")})`,
    );
  }
  assert(
    staleInDocs.length === 0,
    staleInDocs.length === 0
      ? "/docs/api não documenta rota que não existe mais"
      : `/docs/api documenta rota que não existe mais: ${staleInDocs.join(", ")}`,
  );

  console.log("");
  if (failures === 0) {
    console.log("✅ /docs/api sincronizado com as rotas reais: 0 falhas.");
  } else {
    console.error(`❌ /docs/api divergiu das rotas reais: ${failures} verificação(ões) com erro.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
