/**
 * Templates de email (arquitetura 2026-07-29): HTML simples escrito à mão,
 * cores da marca (tailwind.config.ts: tibe.primary/dark/light), sem
 * biblioteca de template: mesmo espírito do resto do projeto (UI kit
 * feito à mão em vez de framework instalado via CLI).
 */

const COLORS = {
  primary: "#2E7D32",
  dark: "#1B5E20",
  light: "#E8F5E9",
};

function loginUrl(): string {
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/login`;
}

function wrapper(bodyHtml: string): string {
  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:${COLORS.light};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.light};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:${COLORS.dark};padding:20px 32px;">
                <span style="color:#ffffff;font-size:22px;font-weight:bold;">Tibé</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#333333;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:${COLORS.light};color:#666666;font-size:12px;">
                Tibé: gestão agropecuária direto pelo WhatsApp.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background-color:${COLORS.primary};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;margin-top:16px;">${label}</a>`;
}

/**
 * Boas-vindas. `tempPassword` presente = tenant criado manualmente pelo
 * painel (senha temporária, precisa trocar); ausente = signup público (o
 * próprio usuário escolheu a senha, já pode entrar direto).
 */
export function buildWelcomeEmailHtml(params: { ownerName: string; email: string; tempPassword?: string }): string {
  const credentialsBlock = params.tempPassword
    ? `<div style="background-color:${COLORS.light};border-radius:8px;padding:16px;margin:16px 0;">
         <p style="margin:0 0 8px 0;"><strong>Email:</strong> ${params.email}</p>
         <p style="margin:0;"><strong>Senha temporária:</strong> ${params.tempPassword}</p>
       </div>
       <p>Por segurança, você vai precisar trocar essa senha no primeiro acesso.</p>`
    : `<p>Sua conta já está pronta, é só entrar com o email e a senha que você cadastrou.</p>`;

  const body = `
    <p>Olá, ${params.ownerName}! 👋</p>
    <p>Seja bem-vindo(a) ao Tibé, a gestão da sua fazenda direto pelo WhatsApp.</p>
    ${credentialsBlock}
    ${button("Acessar o painel", loginUrl())}
    <p style="margin-top:24px;">Depois disso, é só chamar a gente pelo WhatsApp: ajudamos a cadastrar animais, lavoura, ordens de serviço e muito mais.</p>
  `;
  return wrapper(body);
}

/** Notificação de automação (mesmo conteúdo do Alert.message, os 5 tipos sem distinção de formatação). */
export function buildAlertEmailHtml(params: { message: string }): string {
  const body = `
    <p>Olá! Você tem um aviso novo no Tibé:</p>
    <div style="background-color:${COLORS.light};border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0;">${params.message}</p>
    </div>
    ${button("Ver no painel", loginUrl())}
  `;
  return wrapper(body);
}

/** Código de verificação do cadastro público (Módulo 19, 6 dígitos, 10 minutos). */
export function buildSignupCodeEmailHtml(params: { code: string; companyName: string }): string {
  const body = `
    <p>Estamos quase lá. Use o código abaixo para confirmar o email da conta <strong>${params.companyName}</strong>:</p>
    <div style="background-color:${COLORS.light};border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
      <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:${COLORS.dark};">${params.code}</span>
    </div>
    <p>Esse código expira em 10 minutos. Se não foi você que iniciou um cadastro no Tibé, pode ignorar este email com segurança.</p>
  `;
  return wrapper(body);
}

/** Senha temporária enviada na conclusão do cadastro verificado (Módulo 19). */
export function buildSignupTempPasswordEmailHtml(params: {
  ownerName: string;
  email: string;
  tempPassword: string;
}): string {
  const body = `
    <p>Olá, ${params.ownerName}. Sua conta no Tibé está criada e seus dois canais de contato foram confirmados.</p>
    <p>Acesse com:</p>
    <p style="margin:4px 0;"><strong>Email:</strong> ${params.email}</p>
    <p style="margin:4px 0;"><strong>Senha temporária:</strong>
      <span style="font-family:monospace;font-size:16px;">${params.tempPassword}</span>
    </p>
    <p>Por segurança, o Tibé vai pedir uma senha nova no primeiro acesso. Guarde esta mensagem até concluir a troca.</p>
    <p style="margin-top:24px;">
      <a href="${loginUrl()}" style="background-color:${COLORS.primary};color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Abrir o Tibé</a>
    </p>
  `;
  return wrapper(body);
}

/** Código de recuperação de senha (6 dígitos, expira em 10 minutos). */
export function buildPasswordResetEmailHtml(params: { code: string }): string {
  const body = `
    <p>Você pediu para recuperar sua senha no Tibé.</p>
    <div style="background-color:${COLORS.light};border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
      <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:${COLORS.dark};">${params.code}</span>
    </div>
    <p>Esse código expira em 10 minutos. Se você não pediu essa recuperação, pode ignorar este email com segurança.</p>
  `;
  return wrapper(body);
}
