import { z } from "zod";

/**
 * Tipos primitivos e enumeracoes compartilhadas pelos contratos.
 *
 * As enumeracoes espelham `prisma/schema.prisma` (fonte de verdade do banco)
 * e os valores que as rotas realmente aceitam hoje. Nomes de campo e de valor
 * seguem o contrato ATUAL: renomear e mudanca de contrato, nao cabe aqui.
 */

/**
 * Data e hora: string ISO8601 em UTC, ex "2026-07-15T00:00:00.000Z".
 *
 * E o que `Date#toISOString()` produz nas respostas (via `isoOrNull()` em
 * `src/lib/serialize.ts`) e exatamente o que as rotas aceitam nas
 * requisicoes: elas usam `z.string().datetime()`, cujo comportamento e
 * identico ao `z.iso.datetime()` usado aqui (a forma nao depreciada do zod 4).
 * Verificado no teste: data pura ("2026-07-15") e offset ("...-03:00") sao
 * recusados nas duas formas.
 */
export const isoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;

/**
 * Identificador de registro: cuid gerado pelo Prisma. Validado como string
 * nao vazia e nao como cuid: o formato do id e detalhe do banco, e prender o
 * cliente a ele transformaria uma troca interna de estrategia de id em quebra
 * de contrato.
 */
export const idSchema = z.string().min(1);

/**
 * Email no formato que as rotas aceitam: `z.string().trim().email()`.
 *
 * O `trim` faz parte do contrato, nao e detalhe: " a@b.com " e aceito e
 * normalizado para "a@b.com". `z.email()` sozinho recusaria. A forma abaixo e
 * a equivalente nao depreciada no zod 4, e o teste prova a equivalencia.
 */
export const emailSchema = z.string().trim().pipe(z.email());

/** Texto obrigatorio, com espacos das pontas removidos antes da validacao. */
export const trimmedNonEmptySchema = z.string().trim().min(1);

/** Texto opcional que aceita `null` e ausencia, como `.nullish()` nas rotas. */
export const trimmedNullishSchema = z.string().trim().nullish();

// ─────────────────────────────────────────────────────────────
// Enumeracoes de dominio
// ─────────────────────────────────────────────────────────────

/** `UserRole` (schema.prisma). Maiusculas, conforme o contrato de login. */
export const userRoleSchema = z.enum(["OWNER", "ADMIN", "OPERADOR", "VISUALIZADOR"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/** `EntryType` (schema.prisma). */
export const entryTypeSchema = z.enum(["income", "expense"]);
export type EntryType = z.infer<typeof entryTypeSchema>;

/** `RelatedModule` (schema.prisma). */
export const relatedModuleSchema = z.enum(["rebanho", "lavoura", "servico", "geral"]);
export type RelatedModule = z.infer<typeof relatedModuleSchema>;

/** `FinancialEntryStatus` (schema.prisma). */
export const financialEntryStatusSchema = z.enum(["pending", "paid", "overdue"]);
export type FinancialEntryStatus = z.infer<typeof financialEntryStatusSchema>;

/**
 * `AlertType` (schema.prisma). Inclui `trial_ending`, extensao aditiva da
 * spec 5.8.
 *
 * Precisa listar TODOS os valores do enum do banco, e nao so os que o app
 * usa hoje: um alerta de tipo ausente daqui faz o parse do app FALHAR, e a
 * lista inteira de alertas some por causa de uma linha. Ficou parado em 5
 * valores enquanto o banco chegava a 8, entao um tenant com manutencao de
 * maquina prevista ja quebrava a tela de alertas do celular.
 *
 * Ao adicionar um `AlertType` no schema, adicione aqui tambem.
 */
export const alertTypeSchema = z.enum([
  "vaccine_due",
  "harvest_near",
  "bill_due",
  "low_balance",
  "trial_ending",
  "maintenance_due",
  "task_reminder",
  "low_stock",
]);
export type AlertType = z.infer<typeof alertTypeSchema>;

/** `AlertStatus` (schema.prisma). */
export const alertStatusSchema = z.enum(["pending", "sent", "dismissed"]);
export type AlertStatus = z.infer<typeof alertStatusSchema>;

/** `PasswordResetChannel` (schema.prisma). */
export const passwordResetChannelSchema = z.enum(["email", "whatsapp"]);
export type PasswordResetChannel = z.infer<typeof passwordResetChannelSchema>;

/** `TenantPlan` (schema.prisma). */
export const tenantPlanSchema = z.enum(["campo", "fazenda", "grupo"]);
export type TenantPlan = z.infer<typeof tenantPlanSchema>;
