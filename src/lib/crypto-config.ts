import crypto from "node:crypto";

/**
 * Criptografia em repouso das credenciais de provider WhatsApp
 * (WhatsAppProviderConfig.credentials_encrypted). AES-256-GCM com chave em
 * CONFIG_ENCRYPTION_KEY (32 bytes, base64). Formato armazenado:
 * `iv.ciphertext.authTag` (base64url: mesmo estilo do report-token.ts).
 *
 * Lança Error quando a chave falta/é inválida ou o payload está corrompido:
 * isso é misconfiguração de servidor, não fluxo de usuário; a camada de cima
 * (action/rota) converte para o erro HTTP adequado.
 */

function getKey(): Buffer {
  const b64 = process.env.CONFIG_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "CONFIG_ENCRYPTION_KEY não configurada: necessária para criptografar credenciais de provider (veja .env.example).",
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("CONFIG_ENCRYPTION_KEY inválida: precisa ter exatamente 32 bytes em base64.");
  }
  return key;
}

export function encryptConfig(obj: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(obj), "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptConfig<T = unknown>(encrypted: string): T {
  const [ivB64, ctB64, tagB64] = encrypted.split(".");
  if (!ivB64 || !ctB64 || !tagB64) {
    throw new Error("Credencial criptografada em formato inválido.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf-8")) as T;
}
