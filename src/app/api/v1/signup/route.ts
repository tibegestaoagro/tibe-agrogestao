import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiOk, apiError } from "@/lib/api";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";

/**
 * POST /api/v1/signup — cadastro público de novo tenant (self-service).
 *
 * ⚠️ Fora do escopo original do MVP (PRD §12 marca signup público como v1.1);
 * construído a pedido explícito do Dilton para destravar testes do painel
 * antes do Módulo 4/5, sem esperar a integração real de cobrança (Asaas).
 * Cria Tenant (status=trial) + User (role=OWNER) de verdade. Sem rate limiting
 * (não há infra de fila/Redis conectada ainda) — nota conhecida, não bloqueante
 * para uso controlado de testes.
 *
 * Única rota de negócio que roda sem sessão por natureza (ainda não existe
 * usuário) — mesmo assim segue o contrato { data, meta } / { error } do PRD.
 */

const schema = z.object({
  company_name: z.string().trim().min(1, "Nome da empresa é obrigatório"),
  document: z.string().trim().min(11, "CNPJ ou CPF inválido"),
  phone: z.string().trim().min(8, "Telefone é obrigatório"),
  plan: z.enum(["campo", "fazenda", "grupo"]),
  owner_name: z.string().trim().min(1, "Nome do responsável é obrigatório"),
  owner_email: z.string().trim().email("Email inválido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { company_name, phone, plan, owner_name, owner_email, password } = parsed.data;
  const document = parsed.data.document.replace(/\D/g, "");
  if (document.length < 11) {
    return apiError("VALIDATION_ERROR", "CNPJ ou CPF inválido", 422);
  }

  const [dupDoc, dupEmail] = await Promise.all([
    prisma.tenant.findUnique({ where: { document } }),
    prisma.user.findUnique({ where: { email: owner_email } }),
  ]);
  if (dupDoc) {
    return apiError("DUPLICATE_DOCUMENT", "Já existe uma conta com esse CNPJ/CPF", 409);
  }
  if (dupEmail) {
    return apiError("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: company_name,
      document,
      phone,
      email: owner_email,
      plan,
      status: "trial",
    },
  });

  try {
    const password_hash = await bcrypt.hash(password, 10);
    await prismaForTenant(tenant.id).user.create({
      data: scoped({
        name: owner_name,
        email: owner_email,
        password_hash,
        role: "OWNER",
        phone,
      }),
    });
  } catch (e) {
    // Compensação: remove o tenant órfão se o usuário não pôde ser criado
    // (ex: corrida de email duplicado entre a checagem e o create).
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    if ((e as { code?: string }).code === "P2002") {
      return apiError("DUPLICATE_EMAIL", "Já existe uma conta com esse email", 409);
    }
    throw e;
  }

  return apiOk({ tenant_id: tenant.id, email: owner_email }, {}, { status: 201 });
}
