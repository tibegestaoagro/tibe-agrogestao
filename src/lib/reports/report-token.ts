import crypto from "node:crypto";
import { log } from "@/lib/log";

/**
 * Link de download assinado (HMAC) com expiração, usado no lugar de um upload
 * real para o Cloudflare R2 (credenciais ainda não provisionadas: spec 4.7).
 * O PDF é gerado sob demanda a cada acesso ao link, nunca armazenado. Funciona
 * tanto para quem está logado no painel quanto para quem clica vindo do
 * WhatsApp (sem sessão). Quando o R2 real entrar, troca-se apenas a "origem"
 * do arquivo: este módulo pode ser substituído sem mudar quem o consome.
 *
 * ⚠️ A chave HMAC é `REPORT_LINK_SECRET`, e NÃO mais `INTERNAL_API_SECRET`
 * (2026-08-20). Antes as duas eram a mesma, com a justificativa de "evita
 * adicionar mais uma env var só para isto". O problema disso não é teórico:
 * este link é feito para ser mandado por WhatsApp e aberto sem sessão, então
 * ele circula em conversa, em grupo, em captura de tela. Enquanto a chave era
 * a mesma, quem descobrisse o segredo por esse caminho ganhava junto a chave
 * que autentica `/api/internal/*`, ou seja, escrita em QUALQUER tenant.
 * Comprometer um passou a não comprometer o outro.
 *
 * O `INTERNAL_API_SECRET` continua servindo de reserva enquanto a variável
 * nova não estiver configurada, para a subida não derrubar relatório em
 * produção. É reserva de transição, não desenho: rodando assim, avisa no log.
 */

type ReportPayload = { tenant_id: string; start: string; end: string; exp: number };

let avisouSobreReserva = false;

function getSecret(): string {
  const proprio = process.env.REPORT_LINK_SECRET;
  if (proprio) return proprio;

  const reserva = process.env.INTERNAL_API_SECRET;
  if (reserva) {
    if (!avisouSobreReserva) {
      avisouSobreReserva = true;
      log.warn("REPORT_LINK_SECRET ausente: assinando link de relatorio com a chave interna", {
        code: "REPORT_LINK_SECRET_AUSENTE",
      });
    }
    return reserva;
  }

  throw new Error(
    "REPORT_LINK_SECRET não configurado: necessário para assinar links de relatório.",
  );
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
