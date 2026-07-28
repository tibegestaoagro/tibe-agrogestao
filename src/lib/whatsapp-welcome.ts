import { sendWhatsAppMessage } from "@/lib/whatsapp-send";

/** Texto de boas-vindas enviado ao dono de um tenant recém-criado (ainda sem plano/perfil definidos). */
export function buildWelcomeMessage(ownerName: string): string {
  return (
    `Olá, ${ownerName}! 👋 Seja bem-vindo(a) ao Tibé, a gestão da sua fazenda direto pelo WhatsApp.\n\n` +
    `Sua conta já está pronta. Acesse o painel com o email e a senha temporária que você recebeu, troque a senha ` +
    `e escolha seu plano para começar.\n\n` +
    `Depois disso, é só me chamar por aqui — eu ajudo a cadastrar animais, lavoura, ordens de serviço e muito mais.`
  );
}

/**
 * Dispara a mensagem de boas-vindas pelo provider ATIVO — melhor esforço,
 * nunca bloqueia o fluxo de criação (mesmo padrão do M4/alert-delivery: sem
 * provider configurado ou envio falho, a criação do tenant segue normal).
 * sendWhatsAppMessage já não lança (degrada pra ActionResult de erro).
 */
export async function dispatchWelcomeMessage(phone: string, ownerName: string): Promise<void> {
  await sendWhatsAppMessage(phone, buildWelcomeMessage(ownerName));
}
