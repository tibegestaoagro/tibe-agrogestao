import "dotenv/config";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";

/**
 * Emite o cookie de sessao do NextAuth para o owner do seed, no banco LOCAL.
 *
 * Existe porque validar tela autenticada exige uma sessao, e a unica outra
 * forma de obter uma e digitar a senha no formulario de login. Este agente nao
 * digita senha em campo nenhum, em ambiente nenhum: a regra e categorica, e
 * "e so o local" e exatamente como ela se perde. Aqui nenhuma senha em claro
 * aparece, nem no codigo nem na saida: o token e assinado com o segredo que o
 * proprio app usa, como o `signIn` faria depois de conferir o bcrypt.
 *
 * Vale so para `npm run dev` contra o Postgres de dev. `exigirBancoLocal()`
 * recusa rodar apontando para producao.
 */
exigirBancoLocal();

/** Sem `__Secure-`: em http (localhost) o NextAuth usa o nome simples. */
const NOME_DO_COOKIE = "authjs.session-token";
const SETE_DIAS = 7 * 24 * 60 * 60;

async function main() {
  const segredo = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!segredo) {
    console.error("❌ NEXTAUTH_SECRET ausente no .env.");
    process.exit(1);
  }

  const email = process.argv[2] ?? "owner@damata.com.br";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`❌ Usuario ${email} nao existe no banco local.`);
    process.exit(1);
  }

  // Os mesmos tres campos que o callback `jwt` de auth.config.ts poe no token.
  const cookie = await encode({
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      tenant_id: user.tenant_id,
      role: user.role,
    },
    secret: segredo,
    salt: NOME_DO_COOKIE,
    maxAge: SETE_DIAS,
  });

  console.log(`${NOME_DO_COOKIE}=${cookie}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
