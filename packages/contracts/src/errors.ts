/**
 * Catalogo dos codigos de erro que as rotas cobertas por este pacote emitem
 * hoje, com o status HTTP que as acompanha.
 *
 * O catalogo e informativo, nao restritivo: `apiErrorSchema` (envelope.ts)
 * continua aceitando `code` como string livre de proposito, porque um codigo
 * novo no servidor nunca deve fazer o cliente falhar ao LER a resposta de
 * erro. Use este mapa para tratar casos conhecidos, com um ramo padrao para
 * os desconhecidos.
 */

/** Erros que qualquer rota autenticada pode devolver, antes da regra propria. */
export const COMMON_ERROR_CODES = {
  /** Sem sessao (ou sem identidade valida). `src/lib/api.ts`. */
  UNAUTHORIZED: 401,
  /** Papel sem permissao no modulo (matriz do PRD 5.2). */
  FORBIDDEN: 403,
  /** Corpo reprovado na validacao da rota. */
  VALIDATION_ERROR: 422,
  /** Registro nao encontrado dentro do tenant da sessao. */
  NOT_FOUND: 404,
  /** Corpo nao e JSON valido. `readJson()` em `src/lib/api-guard.ts`. */
  INVALID_JSON: 400,
} as const;

/**
 * Erros do `guard()` e do gate de sessao: valem para toda rota de negocio,
 * antes de a regra especifica do endpoint rodar.
 */
export const GUARD_ERROR_CODES = {
  /** Perfil de tenant exigido pela rota nao esta ativo. */
  PROFILE_INACTIVE: 403,
  /** Cobranca vencida ha tempo demais: nada passa. `billing-access.ts`. */
  SUBSCRIPTION_BLOCKED: 402,
  /** Cobranca em atraso: leitura passa, escrita nao. */
  SUBSCRIPTION_READ_ONLY: 402,
  /** Senha temporaria ainda nao trocada. `session-gate.ts`. */
  MUST_CHANGE_PASSWORD: 403,
  /** Plano ainda nao confirmado. `session-gate.ts`. */
  PLAN_NOT_CONFIRMED: 403,
} as const;

/** Erros proprios das rotas de autenticacao e recuperacao de senha. */
export const AUTH_ERROR_CODES = {
  /** Senha atual incorreta (troca voluntaria). */
  INVALID_PASSWORD: 422,
  /** Limite de tentativas por janela. Pedido de codigo: 3/hora por email. */
  RATE_LIMITED: 429,
  /** Codigo errado, expirado, ou conta inexistente: os tres sao iguais aqui. */
  INVALID_CODE: 422,
  /** `reset_id` nao validado, ja consumido, ou expirado. */
  INVALID_RESET: 422,
  /** Cadastro pendente sem cookie, vencido, ou ja concluido. */
  SIGNUP_EXPIRED: 410,
} as const;

/** Erros proprios das rotas de lancamento financeiro. */
export const FINANCIAL_ERROR_CODES = {
  /** Lancamento gerado por outro modulo nao pode ser editado. */
  NOT_EDITABLE: 422,
  /** Lancamento ja estava marcado como pago. */
  ALREADY_PAID: 409,
} as const;

/** Erros proprios das rotas de usuario. */
export const USER_ERROR_CODES = {
  /** `User.email` e globalmente unico. */
  DUPLICATE_EMAIL: 409,
  /** Limite de assentos do plano atingido. `src/lib/seats.ts`. */
  SEAT_LIMIT_REACHED: 422,
  /** Ninguem altera o proprio papel. */
  CANNOT_EDIT_SELF: 422,
  /** Ninguem desativa a propria conta. */
  CANNOT_DEACTIVATE_SELF: 422,
  /** O Owner nao pode ser desativado. */
  CANNOT_DEACTIVATE_OWNER: 422,
} as const;

export const API_ERROR_CODES = {
  ...COMMON_ERROR_CODES,
  ...GUARD_ERROR_CODES,
  ...AUTH_ERROR_CODES,
  ...FINANCIAL_ERROR_CODES,
  ...USER_ERROR_CODES,
} as const;

export type KnownApiErrorCode = keyof typeof API_ERROR_CODES;

/** Restringe para os codigos catalogados, deixando os demais passarem adiante. */
export function isKnownApiErrorCode(code: string): code is KnownApiErrorCode {
  return Object.prototype.hasOwnProperty.call(API_ERROR_CODES, code);
}
