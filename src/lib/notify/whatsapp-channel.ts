import { sendWhatsAppMessage } from "@/lib/whatsapp-send";
import type { NotifyChannelResult } from "./types";

/**
 * Canal WhatsApp do seam de notificação: reusa sendWhatsAppMessage
 * (src/lib/whatsapp-send.ts, provider ATIVO em WhatsAppProviderConfig), só
 * traduzindo o resultado para o formato comum do notify(). Sem telefone
 * cadastrado, nem tenta (mesma regra que alert-delivery.ts já tinha antes
 * desta refatoração).
 */
export async function sendWhatsappChannel(
  phone: string | null,
  text: string,
): Promise<NotifyChannelResult> {
  if (!phone) return { attempted: false, ok: false };
  try {
    const res = await sendWhatsAppMessage(phone, text);
    return { attempted: true, ok: res.ok };
  } catch {
    // Provider indisponível/erro de rede: melhor esforço, nunca lança (quem
    // chama tenta de novo na próxima execução do job).
    return { attempted: true, ok: false };
  }
}
