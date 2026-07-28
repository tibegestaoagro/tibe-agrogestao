import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";

/**
 * Wrapper fino sobre a Evolution API (spec 2026-07-24): usado só pelo fluxo
 * de conexão via QR direto no painel. Nunca lança: erro de rede/HTTP vira
 * um estado degradado (state "close"/"not_found", qrcode null), porque quem
 * chama sempre precisa devolver uma resposta HTTP normal ao client.
 */

export type EvolutionInstanceState = "open" | "connecting" | "close" | "not_found";

function baseUrl(creds: EvolutionCredentials): string {
  return creds.base_url.replace(/\/+$/, "");
}

export async function getInstanceStatus(
  creds: EvolutionCredentials,
): Promise<{ state: EvolutionInstanceState }> {
  try {
    const res = await fetch(`${baseUrl(creds)}/instance/connectionState/${creds.instance}`, {
      headers: { apikey: creds.api_key },
    });
    if (res.status === 404) return { state: "not_found" };
    if (!res.ok) return { state: "close" };
    const json = (await res.json()) as { instance?: { state?: string } };
    const state = json.instance?.state;
    if (state === "open" || state === "connecting") return { state };
    return { state: "close" };
  } catch {
    return { state: "close" };
  }
}

/** Extrai o QR code da resposta da Evolution, tolerando os dois formatos conhecidos. */
function extractQrcode(json: unknown): string | null {
  const j = json as { qrcode?: { base64?: string }; base64?: string };
  return j.qrcode?.base64 ?? j.base64 ?? null;
}

export async function createInstance(
  creds: EvolutionCredentials,
): Promise<{ state: string; qrcode_base64: string | null }> {
  try {
    const res = await fetch(`${baseUrl(creds)}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: creds.api_key },
      body: JSON.stringify({
        instanceName: creds.instance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    if (!res.ok) return { state: "close", qrcode_base64: null };
    const json = await res.json();
    const j = json as { instance?: { state?: string } };
    return { state: j.instance?.state ?? "connecting", qrcode_base64: extractQrcode(json) };
  } catch {
    return { state: "close", qrcode_base64: null };
  }
}

export async function connectInstance(
  creds: EvolutionCredentials,
): Promise<{ state: string; qrcode_base64: string | null }> {
  try {
    const res = await fetch(`${baseUrl(creds)}/instance/connect/${creds.instance}`, {
      headers: { apikey: creds.api_key },
    });
    if (!res.ok) return { state: "close", qrcode_base64: null };
    const json = await res.json();
    const j = json as { instance?: { state?: string } };
    return { state: j.instance?.state ?? "connecting", qrcode_base64: extractQrcode(json) };
  } catch {
    return { state: "close", qrcode_base64: null };
  }
}

/**
 * Aponta o webhook da instância pro workflow N8N (spec 2026-07-28): é o
 * passo que faltava pra criar/conectar uma instância 100% pelo painel, sem
 * precisar mexer na Evolution direto. Idempotente (reenviar o mesmo payload
 * não tem efeito colateral); chamada depois de create/connect, quando a
 * instância já existe de verdade. Nunca lança: falha vira `ok: false`, quem
 * chama decide se isso deve travar o fluxo ou só avisar.
 */
export async function setInstanceWebhook(
  creds: EvolutionCredentials,
): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(`${baseUrl(creds)}/webhook/set/${creds.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: creds.api_key },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: creds.n8n_webhook_url,
          webhookByEvents: false,
          webhookBase64: true,
          events: ["MESSAGES_UPSERT"],
        },
      }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
