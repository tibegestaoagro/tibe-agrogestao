import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

/**
 * Emissao do cookie de sessao no banco LOCAL, sem senha: o token e assinado
 * com o segredo que o proprio app usa, como o `signIn` faria depois de
 * conferir o bcrypt. Usado por `_sessao-local.ts` (linha de comando) e por
 * `navegador.ts` (roteiros do navegador). Quem chama faz o `exigirBancoLocal()`.
 */

/** Sem `__Secure-`: em http (localhost) o NextAuth usa o nome simples. */
export const NOME_DO_COOKIE = "authjs.session-token";
export const NOME_DO_COOKIE_PLATAFORMA = "tibe-platform-session";
const SETE_DIAS = 7 * 24 * 60 * 60;

export type CookieEmitido = { nome: string; valor: string; tenant_id: string | null };

export async function emitirCookieTenant(email: string): Promise<CookieEmitido> {
  const segredo = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!segredo) throw new Error("NEXTAUTH_SECRET ausente no .env.");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`Usuario ${email} nao existe no banco local.`);

  // Os mesmos campos que o callback `jwt` de auth.config.ts poe no token.
  const valor = await encode({
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
  return { nome: NOME_DO_COOKIE, valor, tenant_id: user.tenant_id };
}

/** Sem email, o primeiro MASTER_ADMIN ativo. */
export async function emitirCookiePlataforma(email?: string): Promise<CookieEmitido> {
  const segredo = process.env.PLATFORM_AUTH_SECRET;
  if (!segredo) throw new Error("PLATFORM_AUTH_SECRET ausente no .env.");
  const user = email
    ? await prisma.platformUser.findUnique({ where: { email } })
    : await prisma.platformUser.findFirst({ where: { role: "MASTER_ADMIN", active: true } });
  if (!user) throw new Error("Usuario da plataforma nao existe no banco local.");

  // Os mesmos campos que o callback `jwt` de platform-auth.config.ts poe no token.
  const valor = await encode({
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      platform_user_id: user.id,
      platform_role: user.role,
    },
    secret: segredo,
    salt: NOME_DO_COOKIE_PLATAFORMA,
    maxAge: SETE_DIAS,
  });
  return { nome: NOME_DO_COOKIE_PLATAFORMA, valor, tenant_id: null };
}
