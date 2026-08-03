import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { toBrazilPhoneDigits } from "@/lib/phone";

/**
 * GET/PATCH /api/v1/tenant (spec 5.3 + extensão aditiva, Onda 4): consulta e
 * edita dados cadastrais do tenant (nome, documento, telefone, email).
 *
 * O GET existe principalmente para o aplicativo mobile (Onda 2, B2), que não
 * tem como buscar o nome da fazenda como as páginas web fazem (direto no
 * Prisma, dentro de um Server Component): a tela Início do app mostrava só o
 * nome de quem logou até esta rodada (gap conhecido, registrado no README de
 * `apps/mobile`). Qualquer usuário autenticado pode ler (não é dado
 * sensível); só Owner/Admin pode editar, sem mudança na regra do PATCH.
 */

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  document: z.string().trim().min(11).optional(),
  phone: z.string().trim().nullish(),
  email: z.string().trim().email().nullish(),
});

export async function GET() {
  // "alertas" não tem relação com o conteúdo desta rota: é reusado aqui só
  // porque é o único ModuleKey com leitura liberada para TODAS as roles,
  // inclusive VISUALIZADOR (mesma escolha já feita pelo seam de notificação
  // da Onda 2). Nome/documento/telefone da própria fazenda não é dado
  // sensível por role; "usuarios" bloquearia OPERADOR/VISUALIZADOR, que é
  // exatamente quem mais precisa ver isso na tela Início do app mobile.
  const g = await guard("alertas", "read");
  if ("error" in g) return g.error;

  const tenant = await prisma.tenant.findUnique({ where: { id: g.user.tenant_id } });
  if (!tenant) return apiError("NOT_FOUND", "Tenant não encontrado", 404);

  return apiOk({
    id: tenant.id,
    name: tenant.name,
    document: tenant.document,
    phone: tenant.phone,
    email: tenant.email,
  });
}

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

  const phone = data.phone ? toBrazilPhoneDigits(data.phone) : data.phone;

  const tenant = await prisma.tenant.update({
    where: { id: g.user.tenant_id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.document !== undefined ? { document: data.document } : {}),
      ...(data.phone !== undefined ? { phone } : {}),
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
