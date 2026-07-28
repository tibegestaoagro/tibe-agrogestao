import { sendWhatsAppMessage } from "@/lib/whatsapp-send";

/**
 * URL de login usada na mensagem de boas-vindas: mesma variável que
 * report-link.ts usa pra montar link assinado (NEXTAUTH_URL). Quando o
 * domínio próprio for cadastrado, basta atualizar essa env var na Vercel;
 * nenhum código muda.
 */
function loginUrl(): string {
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/login`;
}

/** Texto de boas-vindas enviado ao dono de um tenant recém-criado (ainda sem plano/perfil definidos). */
export function buildWelcomeMessage(params: { ownerName: string; email: string; tempPassword: string }): string {
  return (
    `Olá, ${params.ownerName}! 👋 Seja bem-vindo(a) ao Tibé, a gestão da sua fazenda direto pelo WhatsApp.\n\n` +
    `Acesse o painel para trocar sua senha e escolher seu plano:\n${loginUrl()}\n\n` +
    `Email: ${params.email}\n` +
    `Senha temporária: ${params.tempPassword}\n\n` +
    `Depois disso, é só me chamar por aqui: eu ajudo a cadastrar animais, lavoura, ordens de serviço e muito mais.`
  );
}

/**
 * Dispara a mensagem de boas-vindas pelo provider ATIVO: melhor esforço,
 * nunca bloqueia o fluxo de criação (mesmo padrão do M4/alert-delivery: sem
 * provider configurado ou envio falho, a criação do tenant segue normal).
 * sendWhatsAppMessage já não lança (degrada pra ActionResult de erro).
 */
export async function dispatchWelcomeMessage(params: {
  phone: string;
  ownerName: string;
  email: string;
  tempPassword: string;
}): Promise<void> {
  await sendWhatsAppMessage(params.phone, buildWelcomeMessage(params));
}
