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
 * - Tenant:                   src/app/api/v1/tenant/route.ts (GET, Onda 4:
 *                              existe desde então especificamente pra suprir
 *                              este gap do app mobile, nunca consumida aqui
 *                              até esta rodada)
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

/**
 * GET /api/v1/animals: um LOTE do rebanho, não um animal.
 *
 * Renomeado de `Animal` em 2026-08-04, quando o back-end unificou o rebanho
 * em `AnimalBatch`: rebanho é sempre categoria + quantidade, e o brinco é
 * OPCIONAL (quem trabalha com brinco cadastra um lote de 1 cabeça). O modelo
 * `Animal` e o enum `AnimalStatus` deixaram de existir; `quantity` substitui
 * `status` para dizer o que resta.
 *
 * Espelha `serializeAnimal` (src/lib/serializers.ts) mais as três extensões
 * aditivas da rota de listagem.
 */
export type AnimalBatch = {
  id: string;
  category_id: string;
  quantity: number;
  ear_tag: string | null;
  breed: string | null;
  sex: AnimalSex | null;
  property_id: string;
  birth_date: string | null;
  average_weight: number | null;
  acquisition_cost: number | null;
  acquired_at: string | null;
  created_at: string;
  /** Extensões aditivas da rota de listagem (não estão em `serializeAnimal`). */
  property_name: string | null;
  category_name: string | null;
  last_vaccination_at: string | null;
};

export type FinancialEntryType = "income" | "expense";
export type FinancialEntryStatus = "pending" | "paid" | "overdue";
export type RelatedModule = "rebanho" | "lavoura" | "servico" | "maquinas" | "geral";

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

/** GET /api/v1/tenant */
export type Tenant = {
  id: string;
  name: string;
  document: string;
  phone: string | null;
  email: string | null;
};

/** GET /api/v1/machines (Módulo 26). Espelha `serializeMachine`. */
export type Machine = {
  id: string;
  property_id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  acquired_at: string | null;
  acquisition_cost: number | null;
  hour_meter: number | null;
  status: string;
  next_maintenance_at: string | null;
  created_at: string;
};

/** GET /api/v1/machines/:id devolve a máquina com o histórico de manutenção. */
export type MachineMaintenance = {
  id: string;
  machine_id: string;
  performed_at: string | null;
  description: string;
  cost: number | null;
  next_due_at: string | null;
  created_at: string;
};

export type MachineDetailData = Machine & { maintenances?: MachineMaintenance[] };

/** GET /api/v1/properties: usado pelo formulário de máquina. */
export type Property = {
  id: string;
  name: string;
};
