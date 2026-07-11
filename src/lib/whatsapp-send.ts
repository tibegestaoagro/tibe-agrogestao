import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decryptConfig } from "@/lib/crypto-config";
import type { EvolutionCredentials, MetaCredentials } from "@/lib/actions/platform-whatsapp-config";

/**
 * Envio de mensagem WhatsApp pelo provider ATIVO (spec 2026-07-11).
 * Desvio deliberado da regra "N8N é o único intermediário" (CLAUDE.md): o
 * envio agora é do Tibé — o N8N chama POST /api/internal/whatsapp/send-message
 * e este módulo decide se entrega via Evolution ou Meta, pela config do
 * painel da plataforma. O RECEBIMENTO continua no N8N (payloads de entrada
 * diferem por provider; não existe /api/webhooks/whatsapp no Tibé).
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
): Promise<ActionResult<{ provider: string; message_id: string | null }>> {
  const config = await prisma.whatsAppProviderConfig.findFirst({ where: { active: true } });
  if (!config) {
    return fail(
      "NO_PROVIDER_ACTIVE",
      "Nenhum provider de WhatsApp ativo — configure em /plataforma/configuracoes/whatsapp",
      503,
    );
  }

  try {
    if (config.provider === "evolution") {
      const creds = decryptConfig<EvolutionCredentials>(config.credentials_encrypted);
      const res = await fetch(
        `${creds.base_url.replace(/\/+$/, "")}/message/sendText/${creds.instance}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: creds.api_key },
          body: JSON.stringify({ number: to, text }),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return fail("PROVIDER_ERROR", `Evolution respondeu ${res.status}: ${body.slice(0, 300)}`, 502);
      }
      const json = (await res.json().catch(() => ({}))) as { key?: { id?: string } };
      return ok({ provider: "evolution", message_id: json.key?.id ?? null });
    }

    // meta_cloud_api
    const creds = decryptConfig<MetaCredentials>(config.credentials_encrypted);
    const res = await fetch(`https://graph.facebook.com/v21.0/${creds.phone_number_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.access_token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return fail("PROVIDER_ERROR", `Meta respondeu ${res.status}: ${body.slice(0, 300)}`, 502);
    }
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
    return ok({ provider: "meta_cloud_api", message_id: json.messages?.[0]?.id ?? null });
  } catch (e) {
    return fail("PROVIDER_ERROR", e instanceof Error ? e.message : "Falha ao contactar o provider", 502);
  }
}
