import crypto from "node:crypto";

/** Senha temporária: 10 caracteres alfanuméricos, fáceis de digitar/ditar por telefone. */
export function generateTempPassword(): string {
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}
