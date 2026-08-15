import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma, prismaForTenant, scoped, TENANT_SCOPED_MODELS } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";

/**
 * ESTA é a suíte que motivou a trava, e foi a única a ficar sem ela.
 *
 * O docstring de `_banco-local.ts` cita, por nome, "um revisor rodou
 * `test:isolation`" como a origem dos dois tenants que nasceram em produção. A
 * trava entrou em 35 arquivos por um filtro `scripts/m*.test.ts`, e o nome
 * desta é `tenant-isolation.test.ts`: não casava. A regra escrita no arquivo
 * certo, e o arquivo certo sem a regra, que é o erro que este projeto vem
 * pagando caro. Achado por um revisor independente na terceira rodada.
 */
exigirBancoLocal();

/**
 * Teste automatizado de isolamento multi-tenant (spec tasks 0.3 / critério de
 * aceitação do Módulo 0). Prova que o client escopado de um tenant NUNCA enxerga,
 * edita ou deleta registros de outro tenant.
 *
 * Roda: `npm run test:isolation` (precisa de DATABASE_URL apontando para um Postgres).
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

/**
 * Guardrail (auditoria de arquitetura, 2026-08-04): TENANT_SCOPED_MODELS
 * (src/lib/prisma.ts) é digitado à mão, sem nada que force um model novo com
 * `tenant_id` a entrar na lista. Esquecer quebra o isolamento em silêncio
 * pra esse model (a regra mais importante do projeto). Este check lê o
 * schema.prisma real e falha se algum dos dois lados divergir.
 */
function checkTenantScopedModelsCoverage() {
  const schemaPath = join(__dirname, "..", "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf-8");

  const modelsWithTenantId = new Set<string>();
  const modelBlockRe = /^model\s+(\w+)\s*\{([\s\S]*?)\n\}/gm;
  let match: RegExpExecArray | null;
  while ((match = modelBlockRe.exec(schema)) !== null) {
    const [, name, body] = match;
    if (/^\s*tenant_id\s+String\b/m.test(body)) {
      modelsWithTenantId.add(name);
    }
  }

  const missingFromSet = Array.from(modelsWithTenantId).filter((m) => !TENANT_SCOPED_MODELS.has(m));
  const extraInSet = Array.from(TENANT_SCOPED_MODELS).filter((m) => !modelsWithTenantId.has(m));

  assert(
    missingFromSet.length === 0,
    missingFromSet.length === 0
      ? "todo model com tenant_id no schema está em TENANT_SCOPED_MODELS"
      : `TENANT_SCOPED_MODELS está faltando: ${missingFromSet.join(", ")}`,
  );
  assert(
    extraInSet.length === 0,
    extraInSet.length === 0
      ? "TENANT_SCOPED_MODELS não tem entrada sem model correspondente com tenant_id"
      : `TENANT_SCOPED_MODELS tem entrada(s) sem tenant_id no schema: ${extraInSet.join(", ")}`,
  );
}

async function main() {
  console.log("🔒 Teste de isolamento multi-tenant\n");

  checkTenantScopedModelsCoverage();

  // 1. Cria dois tenants (via client base, sem escopo).
  const tenantA = await prisma.tenant.create({
    data: { name: "Tenant A (teste)", document: "00000000000001", plan: "fazenda" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "Tenant B (teste)", document: "00000000000002", plan: "campo" },
  });

  const dbA = prismaForTenant(tenantA.id);
  const dbB = prismaForTenant(tenantB.id);

  try {
    // 2. Cada tenant cria uma Property pelo seu client escopado.
    //    O tenant_id é injetado automaticamente (não passamos manualmente).
    const propA = await dbA.property.create({ data: scoped({ name: "Fazenda A" }) });
    const propB = await dbB.property.create({ data: scoped({ name: "Fazenda B" }) });

    assert(
      (propA as { tenant_id: string }).tenant_id === tenantA.id,
      "create injeta tenant_id automaticamente (A)",
    );
    assert(
      (propB as { tenant_id: string }).tenant_id === tenantB.id,
      "create injeta tenant_id automaticamente (B)",
    );

    // 3. findMany como A: só vê a própria property.
    const listA = await dbA.property.findMany();
    assert(
      listA.length === 1 && listA[0].id === propA.id,
      "findMany do tenant A retorna apenas registros de A",
    );
    assert(
      !listA.some((p) => p.id === propB.id),
      "findMany do tenant A NÃO contém registro de B",
    );

    // 4. findUnique do registro de B usando o client de A → null.
    const crossUnique = await dbA.property.findUnique({ where: { id: propB.id } });
    assert(crossUnique === null, "findUnique de A pelo id de B retorna null");

    // 5. findFirst filtrando o id de B pelo client de A → null.
    const crossFirst = await dbA.property.findFirst({ where: { id: propB.id } });
    assert(crossFirst === null, "findFirst de A pelo id de B retorna null");

    // 6. update do registro de B pelo client de A → afeta 0 linhas.
    const upd = await dbA.property.updateMany({
      where: { id: propB.id },
      data: { name: "HACKEADO" },
    });
    assert(upd.count === 0, "updateMany de A sobre registro de B afeta 0 linhas");

    // 7. delete do registro de B pelo client de A → afeta 0 linhas.
    const del = await dbA.property.deleteMany({ where: { id: propB.id } });
    assert(del.count === 0, "deleteMany de A sobre registro de B afeta 0 linhas");

    // 8. Confirma que o registro de B continua intacto (visto pelo client de B).
    const stillThere = await dbB.property.findUnique({ where: { id: propB.id } });
    assert(
      stillThere !== null && stillThere.name === "Fazenda B",
      "registro de B permanece intacto após tentativas de A",
    );

    // 9. count escopado: A enxerga 1, B enxerga 1 (não 2).
    const countA = await dbA.property.count();
    const countB = await dbB.property.count();
    assert(countA === 1 && countB === 1, "count é escopado por tenant (A=1, B=1)");
  } finally {
    // Limpeza: remove os tenants de teste (cascade apaga as properties).
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
    });
  }

  console.log("");
  if (failures === 0) {
    console.log("✅ Isolamento multi-tenant validado: 0 falhas.");
  } else {
    console.error(`❌ Isolamento FALHOU: ${failures} verificação(ões) com erro.`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado no teste de isolamento:");
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
