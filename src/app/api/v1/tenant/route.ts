import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/v1/tenant (spec 5.3) — edita dados cadastrais do tenant
 * (nome, documento, telefone, email). Restrito a Owner/Admin (módulo
 * "usuarios" cobre config. de conta em geral, reusa a mesma permissão).
 */

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  document: z.string().trim().min(11).optional(),
  phone: z.string().trim().nullish(),
  email: z.string().trim().email().nullish(),
});

export async function PATCH(request: Request) {
  const g = await guard("usuarios", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const data = parsed.data;

  if (data.document) {
    const documentDigits = data.document.replace(/\D/g, "");
    const dup = await prisma.tenant.findFirst({
      where: { document: documentDigits, id: { not: g.user.tenant_id } },
    });
    if (dup) return apiError("DUPLICATE_DOCUMENT", "Já existe uma conta com esse CNPJ/CPF", 409);
    data.document = documentDigits;
  }

  const tenant = await prisma.tenant.update({
    where: { id: g.user.tenant_id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.document !== undefined ? { document: data.document } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
    },
  });

  return apiOk({
    id: tenant.id,
    name: tenant.name,
    document: tenant.document,
    phone: tenant.phone,
    email: tenant.email,
  });
}
