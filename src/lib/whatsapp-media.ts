import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decryptConfig } from "@/lib/crypto-config";
import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";

/**
 * Busca o base64 de uma mídia (áudio/imagem/documento) recebida pelo agente
 * WhatsApp (spec 2026-07-28). Necessário porque `webhookBase64: true` não é
 * confiável pra áudio/imagem na Evolution API em produção (comportamento
 * documentado do projeto — o campo às vezes não vem no payload do webhook,
 * mesmo configurado): então buscamos sob demanda em vez de depender dele.
 * Só suporta Evolution por enquanto (Meta Cloud API tem outro mecanismo de
 * download de mídia, não implementado aqui — ver CLAUDE.md se for adicionar).
 */
export async function fetchEvolutionMediaBase64(
  messageId: string,
): Promise<ActionResult<{ base64: string; mimetype: string }>> {
  const config = await prisma.whatsAppProviderConfig.findFirst({ where: { active: true } });
  if (!config) {
    return fail("NO_PROVIDER_ACTIVE", "Nenhum provider de WhatsApp ativo", 503);
  }
  if (config.provider !== "evolution") {
    return fail("NOT_SUPPORTED", "Busca de mídia só é suportada com o provider Evolution", 422);
  }

  const creds = decryptConfig<EvolutionCredentials>(config.credentials_encrypted);
  try {
    const res = await fetch(
      `${creds.base_url.replace(/\/+$/, "")}/chat/getBase64FromMediaMessage/${creds.instance}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: creds.api_key },
        body: JSON.stringify({ message: { key: { id: messageId } } }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return fail("PROVIDER_ERROR", `Evolution respondeu ${res.status}: ${body.slice(0, 300)}`, 502);
    }
    const json = (await res.json().catch(() => ({}))) as { base64?: string; mimetype?: string };
    if (!json.base64) {
      return fail("PROVIDER_ERROR", "Evolution não devolveu base64 para esta mensagem", 502);
    }
    return ok({ base64: json.base64, mimetype: json.mimetype ?? "application/octet-stream" });
  } catch (e) {
    return fail("PROVIDER_ERROR", e instanceof Error ? e.message : "Falha ao contactar o provider", 502);
  }
}
