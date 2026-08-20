import { cookies } from "next/headers";

/**
 * O id do cadastro pendente viaja em cookie httpOnly, nunca na URL nem no
 * corpo da resposta (Módulo 19). Na URL ele ficaria no histórico do navegador
 * e em log de referrer, e quem tivesse o id poderia trocar o email de destino
 * antes da verificação, sequestrando o cadastro.
 */

const SIGNUP_COOKIE = "tibe-signup";
const MAX_AGE_SECONDS = 60 * 60; // mesma vida do PendingSignup

export function buildSignupCookie(signupId: string) {
  return {
    name: SIGNUP_COOKIE,
    value: signupId,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

export function clearSignupCookie() {
  return { ...buildSignupCookie(""), maxAge: 0 };
}

/**
 * Lê o id do cadastro em andamento (Server Component ou route handler).
 *
 * Assíncrona desde o Next 16: `cookies()` passou a devolver promessa. Os cinco
 * pontos de chamada já rodavam dentro de função assíncrona, então a mudança
 * ficou no `await`.
 */
export async function readSignupId(): Promise<string | null> {
  return (await cookies()).get(SIGNUP_COOKIE)?.value || null;
}
