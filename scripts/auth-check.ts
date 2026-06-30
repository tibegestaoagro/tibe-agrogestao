import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Valida o caminho de credenciais do NextAuth sem subir HTTP: confirma que o
 * usuário do seed existe e que a senha confere via bcrypt (mesma lógica do
 * authorize() em lib/auth.ts). Roda: `npm run auth:check`
 */
const EMAIL = "owner@damata.com.br";
const PASSWORD = "tibe123";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`Usuário ${EMAIL} não encontrado (rode npm run db:seed).`);
  const ok = await bcrypt.compare(PASSWORD, user.password_hash);
  if (!ok) throw new Error("Senha não confere.");
  console.log("✅ Credenciais OK:");
  console.log(`   ${user.email} · role=${user.role} · tenant_id=${user.tenant_id}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌", err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
