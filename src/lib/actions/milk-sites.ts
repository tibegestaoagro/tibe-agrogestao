import type { MilkSiteType } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Onde o leite pode estar (Área Leite, fase 2, §13 e §16). Ver
 * docs/specs/module-32-area-leite.md, seção 12.2.
 *
 * Um model só com `type: proprio | terceiro`, espelhando o `ConfinementSite`,
 * porque é o mesmo conceito: um lugar que é nosso e um lugar que é dos outros.
 *
 * NÃO reusa o `ConfinementSite`, embora os campos batam: tanque de leite
 * passaria a aparecer nas consultas de confinamento, e as duas áreas ficariam
 * presas uma na outra por coincidência de forma, não por conceito comum.
 */

export type MilkSiteRecord = {
  id: string;
  name: string;
  type: MilkSiteType;
  property_id: string | null;
  counterparty_name: string | null;
  city: string | null;
  capacity: number | null;
  notes: string | null;
  archived_at: Date | null;
};

const CAMPOS = {
  id: true,
  name: true,
  type: true,
  property_id: true,
  counterparty_name: true,
  city: true,
  capacity: true,
  notes: true,
  archived_at: true,
} as const;

export type CreateMilkSiteInput = {
  name: string;
  type: MilkSiteType;
  property_id?: string | null;
  counterparty_name?: string | null;
  city?: string | null;
  capacity?: number | null;
  notes?: string | null;
};

export async function listMilkSites(
  db: TenantPrismaClient,
  filtros: { type?: MilkSiteType; include_archived?: boolean } = {},
): Promise<MilkSiteRecord[]> {
  return db.milkSite.findMany({
    where: {
      ...(filtros.type ? { type: filtros.type } : {}),
      ...(filtros.include_archived ? {} : { archived_at: null }),
    },
    orderBy: [{ archived_at: "asc" }, { type: "asc" }, { name: "asc" }],
    select: CAMPOS,
  });
}

export async function createMilkSite(
  db: TenantPrismaClient,
  input: CreateMilkSiteInput,
): Promise<ActionResult<MilkSiteRecord>> {
  const name = input.name.trim();
  if (!name) {
    return fail("VALIDATION_ERROR", "O nome é obrigatório.", 422, "name");
  }

  if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity <= 0)) {
    return fail(
      "VALIDATION_ERROR",
      "A capacidade deve ser um número inteiro maior que zero.",
      422,
      "capacity",
    );
  }

  let property_id: string | null = null;
  let counterparty_name: string | null = null;

  if (input.type === "proprio") {
    if (!input.property_id) {
      return fail(
        "VALIDATION_ERROR",
        "Informe a fazenda do tanque.",
        422,
        "property_id",
      );
    }
    const property = await db.property.findFirst({ where: { id: input.property_id } });
    if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");
    if (property.archived_at) {
      return fail(
        "PROPERTY_ARCHIVED",
        "Não é possível cadastrar tanque em fazenda arquivada.",
        422,
        "property_id",
      );
    }
    property_id = input.property_id;
  } else {
    const counterparty = input.counterparty_name?.trim();
    if (!counterparty) {
      return fail(
        "VALIDATION_ERROR",
        "Informe de quem é o ponto de coleta.",
        422,
        "counterparty_name",
      );
    }
    counterparty_name = counterparty;
  }

  const created = await db.milkSite.create({
    data: scoped({
      name,
      type: input.type,
      property_id,
      counterparty_name,
      city: input.city?.trim() || null,
      capacity: input.capacity ?? null,
      notes: input.notes?.trim() || null,
    }),
    select: CAMPOS,
  });

  return ok(created);
}

export async function setMilkSiteArchived(
  db: TenantPrismaClient,
  id: string,
  archived: boolean,
): Promise<ActionResult<MilkSiteRecord>> {
  const site = await db.milkSite.findFirst({ where: { id }, select: { id: true } });
  if (!site) return fail("NOT_FOUND", "Local não encontrado.", 404);

  const updated = await db.milkSite.update({
    where: { id },
    data: { archived_at: archived ? new Date() : null },
    select: CAMPOS,
  });

  return ok(updated);
}

/**
 * Confere que o local existe, não está arquivado e é do tipo esperado.
 *
 * O `tipoEsperado` existe porque as conversas do leite não são simétricas: a
 * produção só entra em tanque PRÓPRIO (§14), e a transferência do §16 só sai
 * para ponto de coleta de TERCEIROS. Sem esta conferência, "entreguei 600 no
 * ponto de coleta" aceitaria o próprio tanque como destino e o leite ficaria
 * parado onde já estava, com dois registros dizendo que se moveu.
 */
export async function conferirLocal(
  db: TenantPrismaClient,
  site_id: string,
  campo: string,
  tipoEsperado?: MilkSiteType,
): Promise<ActionResult<MilkSiteRecord>> {
  const site = await db.milkSite.findFirst({ where: { id: site_id }, select: CAMPOS });
  if (!site) return fail("INVALID_SITE", "Local inválido.", 422, campo);
  if (site.archived_at) {
    return fail("SITE_ARCHIVED", `"${site.name}" está arquivado.`, 422, campo);
  }
  if (tipoEsperado && site.type !== tipoEsperado) {
    return fail(
      "TIPO_DE_LOCAL_ERRADO",
      tipoEsperado === "proprio"
        ? `"${site.name}" é um ponto de coleta de terceiros, não um tanque seu.`
        : `"${site.name}" é um tanque seu, não um ponto de coleta de terceiros.`,
      422,
      campo,
    );
  }
  return ok(site);
}
