import { z } from "zod";
import { apiOkSchema } from "./envelope";
import {
  emailSchema,
  idSchema,
  passwordResetChannelSchema,
  tenantPlanSchema,
  trimmedNonEmptySchema,
  trimmedNullishSchema,
} from "./primitives";

/**
 * Autenticacao e conta.
 *
 * Rotas cobertas:
 *   POST /api/v1/auth/change-password         (obrigatoria, sem senha atual)
 *   POST /api/v1/auth/change-password-self    (voluntaria, com senha atual)
 *   POST /api/v1/password-reset/request
 *   POST /api/v1/password-reset/verify
 *   POST /api/v1/password-reset/confirm
 *   POST /api/v1/signup/start
 *   POST /api/v1/signup/verify
 *   POST /api/v1/signup/resend
 *   GET  /api/v1/signup/state
 *
 * O LOGIN nao esta aqui porque nao e uma rota `/api/v1`: e o fluxo padrao do
 * NextAuth (`signIn("credentials", ...)` contra
 * `/api/auth/callback/credentials`), cujo formato e do NextAuth e nao deste
 * contrato. A autenticacao por token para o aplicativo esta sendo construida
 * em paralelo (agente A1) e entra aqui quando existir.
 */

// ─────────────────────────────────────────────────────────────
// Regra de senha forte
// ─────────────────────────────────────────────────────────────

/**
 * Espelha `isStrongPassword()` (`src/lib/passwords.ts`): 8+ caracteres, ao
 * menos 1 maiuscula, 1 numero e 1 simbolo.
 *
 * Exportado a parte de proposito, e NAO embutido nos schemas de requisicao.
 * As rotas validam o comprimento no corpo e delegam a forca a action, que
 * recusa depois com `VALIDATION_ERROR` (422). Embutir a regra aqui faria o
 * schema recusar corpos que a rota aceita, ou seja, mudaria o contrato. Use
 * para validar o formulario antes de enviar e poupar uma viagem ao servidor.
 */
export const strongPasswordSchema = z
  .string()
  .min(8)
  .refine((v) => /[A-Z]/.test(v), { message: "A senha deve ter ao menos 1 letra maiuscula" })
  .refine((v) => /[0-9]/.test(v), { message: "A senha deve ter ao menos 1 numero" })
  .refine((v) => /[^A-Za-z0-9]/.test(v), {
    message: "A senha deve ter ao menos 1 simbolo (ex: !@#$%)",
  });

// ─────────────────────────────────────────────────────────────
// POST /api/v1/auth/change-password
// ─────────────────────────────────────────────────────────────

/**
 * Troca OBRIGATORIA da senha temporaria. Nao pede a senha atual: quem chega
 * aqui acabou de provar posse dos canais no cadastro verificado, ou digitou a
 * temporaria no login.
 *
 * Roda so com sessao, sem `guard()` de modulo nem de cobranca: precisa
 * funcionar com a conta em `read_only` ou `blocked`, e o proprio gate
 * `MUST_CHANGE_PASSWORD` barra todo o resto ate isso ser resolvido.
 *
 * O corpo exige apenas 8 caracteres; a forca completa e checada na action.
 */
export const changePasswordRequestSchema = z.object({
  new_password: z.string().min(8),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const changePasswordResponseSchema = apiOkSchema(z.object({ id: idSchema }));
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;

// ─────────────────────────────────────────────────────────────
// POST /api/v1/auth/change-password-self
// ─────────────────────────────────────────────────────────────

/**
 * Troca VOLUNTARIA, a qualquer momento, com a senha atual. Rota separada da
 * obrigatoria de proposito: uma rota so, com campo opcional, criaria um
 * caminho para pular a exigencia. Acessivel a qualquer papel.
 *
 * Senha atual errada devolve `INVALID_PASSWORD` (422).
 */
export const changePasswordSelfRequestSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});
export type ChangePasswordSelfRequest = z.infer<typeof changePasswordSelfRequestSchema>;

export const changePasswordSelfResponseSchema = apiOkSchema(z.object({ id: idSchema }));
export type ChangePasswordSelfResponse = z.infer<typeof changePasswordSelfResponseSchema>;

// ─────────────────────────────────────────────────────────────
// POST /api/v1/password-reset/request
// ─────────────────────────────────────────────────────────────

/**
 * Pedido de codigo. Roda sem sessao.
 *
 * A resposta e SEMPRE `{ requested: true }`: exista ou nao a conta, esteja
 * ela ativa ou nao, tenha ou nao telefone para o canal WhatsApp. E protecao
 * contra enumeracao de conta, nao descuido, e o cliente nao deve tentar
 * inferir nada dela. So `RATE_LIMITED` (429) escapa desse padrao, e o limite
 * (3/hora por email) e aplicado antes da busca pelo usuario justamente para
 * nao variar conforme a conta exista.
 */
export const passwordResetRequestSchema = z.object({
  email: emailSchema,
  channel: passwordResetChannelSchema,
});
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetRequestResponseSchema = apiOkSchema(
  z.object({ requested: z.literal(true) }),
);
export type PasswordResetRequestResponse = z.infer<typeof passwordResetRequestResponseSchema>;

// ─────────────────────────────────────────────────────────────
// POST /api/v1/password-reset/verify
// ─────────────────────────────────────────────────────────────

/**
 * Validacao do codigo. Correlacionada pelo EMAIL, nunca por um id de sessao
 * de recuperacao: criar esse id so quando a conta existe ja vazaria a
 * existencia dela.
 *
 * `code` e validado por COMPRIMENTO (exatamente 6), nao por formato: o corpo
 * "abcdef" passa pela rota e falha depois na comparacao com o hash,
 * devolvendo `INVALID_CODE`. Diferente de `/api/v1/signup/verify`, que exige
 * 6 digitos por regex. Contrato modelado como esta hoje, nao como deveria ser.
 *
 * Codigo errado, expirado e conta inexistente devolvem todos `INVALID_CODE`
 * (422), sem distincao.
 */
export const passwordResetVerifyRequestSchema = z.object({
  email: emailSchema,
  code: z.string().trim().length(6),
});
export type PasswordResetVerifyRequest = z.infer<typeof passwordResetVerifyRequestSchema>;

/** `reset_id` e o `PasswordResetCode.id`, exigido pela etapa seguinte. */
export const passwordResetVerifyResponseSchema = apiOkSchema(
  z.object({ reset_id: idSchema }),
);
export type PasswordResetVerifyResponse = z.infer<typeof passwordResetVerifyResponseSchema>;

// ─────────────────────────────────────────────────────────────
// POST /api/v1/password-reset/confirm
// ─────────────────────────────────────────────────────────────

/**
 * Nova senha, depois do codigo validado. Exige `verified_at` preenchido e
 * `consumed_at` nulo no servidor: um `reset_id` ja usado devolve
 * `INVALID_RESET` (422). Zera `must_change_password`.
 *
 * Aqui `new_password` exige apenas 1 caractere no corpo, enquanto
 * `/auth/change-password` exige 8. A forca real e identica nas duas (as duas
 * chamam `isStrongPassword()`), so a validacao da rota diverge. Modelado como
 * esta.
 */
export const passwordResetConfirmRequestSchema = z.object({
  reset_id: trimmedNonEmptySchema,
  new_password: z.string().min(1),
});
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmRequestSchema>;

export const passwordResetConfirmResponseSchema = apiOkSchema(z.object({ id: idSchema }));
export type PasswordResetConfirmResponse = z.infer<typeof passwordResetConfirmResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Cadastro publico verificado (Modulo 19)
// ─────────────────────────────────────────────────────────────

/**
 * Estado do cadastro em andamento (`SignupState` em
 * `src/lib/actions/signup-flow.ts`).
 *
 * `current_step` e derivado, nao armazenado: e o primeiro canal ainda nao
 * confirmado, e "done" quando os dois foram. A ordem WhatsApp -> email e
 * obrigatoria e recusada no servidor se invertida.
 *
 * `allow_edit_after_seconds` (120) e um cronometro DIFERENTE do prazo do
 * codigo (10 minutos): amarrar os dois faria quem digita devagar perder um
 * codigo valido.
 */
export const signupStateSchema = z.object({
  whatsapp_verified: z.boolean(),
  email_verified: z.boolean(),
  phone_masked: z.string(),
  email_masked: z.string(),
  current_step: z.enum(["whatsapp", "email", "done"]),
  allow_edit_after_seconds: z.number().int().nonnegative(),
});
export type SignupState = z.infer<typeof signupStateSchema>;

/**
 * Etapa 1. Nao cria `Tenant` nem `User`: abre um cadastro pendente e dispara
 * o codigo de WhatsApp. O identificador volta em cookie httpOnly
 * (`tibe-signup`), NUNCA no corpo: na URL ele ficaria no historico e em log
 * de referrer, e quem o tivesse poderia trocar o email de destino antes da
 * verificacao. Toda etapa seguinte depende desse cookie.
 *
 * Nao ha campo de senha: ela e gerada no fim e enviada pelos dois canais ja
 * verificados.
 *
 * Os tres campos de UTM sao aceitos pela rota e NAO aparecem em `/docs/api`.
 */
export const signupStartRequestSchema = z.object({
  company_name: trimmedNonEmptySchema,
  owner_name: trimmedNonEmptySchema,
  owner_email: emailSchema,
  document: z.string().trim().min(11),
  phone: z.string().trim().min(8),
  plan: tenantPlanSchema,
  utm_source: trimmedNullishSchema,
  utm_medium: trimmedNullishSchema,
  utm_campaign: trimmedNullishSchema,
});
export type SignupStartRequest = z.infer<typeof signupStartRequestSchema>;

/** 201. O estado vem embrulhado em `state`, ao contrario de `/resend` e `/state`. */
export const signupStartResponseSchema = apiOkSchema(
  z.object({ state: signupStateSchema }),
);
export type SignupStartResponse = z.infer<typeof signupStartResponseSchema>;

/**
 * Etapas 2 e 3. Formato errado do codigo responde igual a codigo errado
 * (`INVALID_CODE`, 422): nao entrega pista nenhuma.
 */
export const signupVerifyRequestSchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  code: z.string().trim().regex(/^\d{6}$/),
});
export type SignupVerifyRequest = z.infer<typeof signupVerifyRequestSchema>;

/**
 * Uniao discriminada por `completed`, e essa e a parte que `/docs/api` nao
 * mostra: la aparece so o ramo `completed: true`. Confirmar o PRIMEIRO canal
 * devolve `completed: false` com o estado atualizado, sem `email` nem
 * `temp_password`. Um cliente que assumir os dois campos sempre presentes
 * quebra na primeira confirmacao.
 *
 * `temp_password` existe so para o login automatico de quem acabou de
 * concluir, e vem junto de `must_change_password: true` no usuario criado.
 */
export const signupVerifyResultSchema = z.discriminatedUnion("completed", [
  z.object({
    completed: z.literal(false),
    state: signupStateSchema,
  }),
  z.object({
    completed: z.literal(true),
    email: z.string(),
    temp_password: z.string(),
  }),
]);
export type SignupVerifyResult = z.infer<typeof signupVerifyResultSchema>;

export const signupVerifyResponseSchema = apiOkSchema(signupVerifyResultSchema);
export type SignupVerifyResponse = z.infer<typeof signupVerifyResponseSchema>;

/**
 * Reenvia o codigo e, com `destination`, corrige numero ou email antes.
 *
 * Trocar o destino DERRUBA a verificacao daquele canal: verificamos o
 * contato, nao a intencao de quem preencheu. So vale para canal ainda nao
 * confirmado.
 */
export const signupResendRequestSchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  destination: trimmedNullishSchema,
});
export type SignupResendRequest = z.infer<typeof signupResendRequestSchema>;

/** Devolve o estado direto em `data`, sem embrulho. */
export const signupResendResponseSchema = apiOkSchema(signupStateSchema);
export type SignupResendResponse = z.infer<typeof signupResendResponseSchema>;

/**
 * Estado das etapas, para a pagina renderizar o passo certo na retomada.
 * Sem cookie, ou com cadastro vencido, devolve `SIGNUP_EXPIRED` (410).
 */
export const signupStateResponseSchema = apiOkSchema(signupStateSchema);
export type SignupStateResponse = z.infer<typeof signupStateResponseSchema>;
