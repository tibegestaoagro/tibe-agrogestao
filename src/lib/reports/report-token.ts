import crypto from "node:crypto";

/**
 * Link de download assinado (HMAC) com expiração, usado no lugar de um upload
 * real para o Cloudflare R2 (credenciais ainda não provisionadas — spec 4.7).
 * O PDF é gerado sob demanda a cada acesso ao link, nunca armazenado. Funciona
 * tanto para quem está logado no painel quanto para quem clica vindo do
 * WhatsApp (sem sessão). Quando o R2 real entrar, troca-se apenas a "origem"
 * do arquivo — este módulo pode ser substituído sem mudar quem o consome.
 *
 * Reusa INTERNAL_API_SECRET como chave HMAC (evita adicionar mais uma env var
 * só para isto).
 */

type ReportPayload = { tenant_id: string; start: string; end: string; exp: number };

function getSecret(): string {
  const s = process.env.INTERNAL_API_SECRET;
  if (!s) {
    throw new Error(
      "INTERNAL_API_SECRET não configurado — necessário para assinar links de relatório.",
    );
  }
  return s;
}

export function signReportToken(
  payload: { tenant_id: string; start: string; end: string },
  ttlSeconds = 3600,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const full: ReportPayload = { ...payload, exp };
  const b64 = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyReportToken(token: string): ReportPayload | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8")) as ReportPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
