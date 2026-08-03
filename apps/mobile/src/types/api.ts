/**
 * Tipos leves que espelham o contrato REAL das rotas `/api/v1/*` do Tibé,
 * conforme lido no código-fonte do back-end (não uma versão idealizada).
 * Fontes exatas, para quem for revisar ou atualizar:
 *
 * - Envelope de sucesso/erro: src/lib/api.ts (`apiOk`/`apiError`)
 * - Auth por token:           src/lib/auth-token.ts,
 *                              src/app/api/v1/auth/token/{route,refresh/route,revoke/route}.ts
 * - Animal:                   src/lib/serializers.ts (`serializeAnimal`) +
 *                              src/app/api/v1/animals/route.ts (campos extra
 *                              `property_name`/`last_vaccination_at`)
 * - FinancialEntry:           src/lib/serializers.ts (`serializeFinancialEntry`)
 * - Saldo em fluxo de caixa:  src/lib/actions/financial-reports.ts (`getCashFlow`)
 *
 * Deliberadamente SEM depender de `packages/contracts` (decisão desta onda,
 * ver docs/arquitetura/plano-separacao-e-mobile.md): o aplicativo é standalone
 * nesta rodada.
 */

/** Envelope de sucesso: `{ data, meta }`. */
export type ApiOk<T> = { data: T; meta: Record<string, unknown> };

/** Envelope de erro: `{ error: { code, message } }`. */
export type ApiErrorBody = { error: { code: string; message: string } };

export type UserRole = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";

/**
 * Usuário autenticado, exatamente como o login por token devolve.
 * Sem `tenant_id` de propósito: o token não carrega isso (ver
 * src/lib/auth-token.ts no back-end), e o app não deve tratar tenant como
 * dado seu para guardar/derivar.
 */
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

/** Par de tokens devolvido por login e por refresh (mesmo formato nos dois). */
export type TokenPair = {
  access_token: string;
  token_type: "Bearer";
  /** Segundos de validade do access token (15 min hoje). */
  expires_in: number;
  refresh_token: string;
  /** Segundos de validade do refresh token (30 dias hoje). */
  refresh_expires_in: number;
};

/** POST /api/v1/auth/token: par de tokens + quem logou. */
export type LoginData = TokenPair & { user: AuthUser };

export type AnimalSex = "male" | "female";
export type AnimalStatus = "active" | "sold" | "deceased";

/** GET /api/v1/animals */
export type Animal = {
  id: string;
  ear_tag: string;
  breed: string | null;
  sex: AnimalSex;
  property_id: string;
  birth_date: string | null;
  status: AnimalStatus;
  current_weight: number | null;
  created_at: string;
  /** Extensão aditiva desta rota (não está em `serializeAnimal`): nome da propriedade. */
  property_name: string | null;
  /** Extensão aditiva desta rota: data da última vacinação aplicada, se houver. */
  last_vaccination_at: string | null;
};

export type FinancialEntryType = "income" | "expense";
export type FinancialEntryStatus = "pending" | "paid" | "overdue";
export type RelatedModule = "rebanho" | "lavoura" | "servico" | "geral";

/** GET /api/v1/financial-entries */
export type FinancialEntry = {
  id: string;
  entry_type: FinancialEntryType;
  category: string | null;
  amount: number | null;
  related_module: RelatedModule;
  related_id: string | null;
  due_date: string | null;
  paid_at: string | null;
  status: FinancialEntryStatus;
  notes: string | null;
  created_at: string;
};

/**
 * GET /api/v1/financial/cash-flow: um "balde" por dia ou por mês (regime de
 * caixa: só lançamentos pagos, agrupados por `paid_at`). Chamada com
 * `group_by=month` e sem `start`/`end`, o back-end aplica o range do mês
 * corrente por padrão (`resolvePeriod`/`defaultMonthRange` em
 * financial-reports.ts): é assim que a tela Início lê o "saldo do mês" sem
 * o app precisar calcular datas.
 */
export type CashFlowBucket = {
  /** "YYYY-MM-DD" (group_by=day) ou "YYYY-MM" (group_by=month). */
  period: string;
  income: number;
  expense: number;
  balance: number;
};
