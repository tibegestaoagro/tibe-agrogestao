import crypto from "node:crypto";

/** Senha temporária: 10 caracteres alfanuméricos, fáceis de digitar/ditar por telefone. */
export function generateTempPassword(): string {
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}

/**
 * Regra de senha forte (arquitetura 2026-07-29): recuperação de senha e
 * troca obrigatória (changeOwnPasswordAction). Deliberadamente NÃO aplicada
 * no signup público — decisão de produto adiada, não assumida aqui.
 */
export function isStrongPassword(password: string): { ok: true } | { ok: false; message: string } {
  if (password.length < 8) {
    return { ok: false, message: "A senha deve ter ao menos 8 caracteres" };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: "A senha deve ter ao menos 1 letra maiúscula" };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "A senha deve ter ao menos 1 número" };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, message: "A senha deve ter ao menos 1 símbolo (ex: !@#$%)" };
  }
  return { ok: true };
}
