/**
 * Verificacao dos contratos contra os payloads reais de `/docs/api`.
 *
 * Rode com: npx tsx packages/contracts/test/contracts.test.ts
 *
 * Nao depende de banco, de rede, nem do Next: so de zod. Cada caso diz de
 * onde o payload veio.
 *
 * SOBRE OS EXEMPLOS DE `/docs/api`
 *
 * Boa parte deles e ABREVIADA: usa "..." no lugar de valores e omite campos
 * que a resposta real sempre traz. Onde isso acontece o teste faz as duas
 * coisas, de proposito:
 *
 *   1. mostra que o exemplo documentado, como esta escrito, NAO passa; e
 *   2. mostra que a resposta real (completa) passa.
 *
 * A primeira metade e o achado: e a lista de lugares onde a documentacao
 * esta incompleta ou errada. A segunda e a prova de que o contrato aqui
 * descreve o servidor.
 *
 * Toda substituicao feita num exemplo documentado esta anotada no proprio
 * caso, com o que foi trocado e por que.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  alertSchema,
  apiErrorSchema,
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  changePasswordSelfRequestSchema,
  changePasswordSelfResponseSchema,
  createFinancialEntryRequestSchema,
  createFinancialEntryResponseSchema,
  dismissAlertResponseSchema,
  emailSchema,
  financialEntrySchema,
  inviteUserRequestSchema,
  inviteUserResponseSchema,
  isApiError,
  isoDateTimeSchema,
  listAlertsQuerySchema,
  listAlertsResponseSchema,
  listFinancialEntriesQuerySchema,
  listFinancialEntriesResponseSchema,
  listUpcomingResponseSchema,
  listUsersResponseSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestResponseSchema,
  passwordResetRequestSchema,
  passwordResetVerifyRequestSchema,
  passwordResetVerifyResponseSchema,
  payFinancialEntryRequestSchema,
  setUserActiveRequestSchema,
  setUserActiveResponseSchema,
  signupResendRequestSchema,
  signupResendResponseSchema,
  signupStartRequestSchema,
  signupStartResponseSchema,
  signupVerifyRequestSchema,
  signupVerifyResponseSchema,
  strongPasswordSchema,
  updateFinancialEntryRequestSchema,
  updateUserRoleRequestSchema,
  updateUserRoleResponseSchema,
  isKnownApiErrorCode,
} from "../src/index";

// ─────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

function record(ok: boolean, label: string, detail?: string) {
  if (ok) {
    passed++;
    return;
  }
  failures.push(detail ? `${label}\n      ${detail}` : label);
}

/** O schema deve ACEITAR o valor. */
function accepts(schema: z.ZodType, value: unknown, label: string) {
  const result = schema.safeParse(value);
  record(result.success, label, result.success ? undefined : firstIssue(result.error));
}

/** O schema deve RECUSAR o valor. */
function rejects(schema: z.ZodType, value: unknown, label: string) {
  const result = schema.safeParse(value);
  record(!result.success, label, result.success ? "aceitou quando deveria recusar" : undefined);
}

/** O schema deve aceitar e produzir exatamente o valor esperado. */
function parsesTo(schema: z.ZodType, value: unknown, expected: unknown, label: string) {
  const result = schema.safeParse(value);
  if (!result.success) {
    record(false, label, firstIssue(result.error));
    return;
  }
  const got = JSON.stringify(result.data);
  const want = JSON.stringify(expected);
  record(got === want, label, got === want ? undefined : `esperado ${want}, veio ${got}`);
}

function assert(ok: boolean, label: string, detail?: string) {
  record(ok, label, detail);
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "erro sem detalhe";
  const path = issue.path.length > 0 ? issue.path.join(".") : "(raiz)";
  return `${path}: ${issue.message}`;
}

function section(title: string) {
  console.log(`\n${title}`);
}

// Valores usados para substituir os "..." dos exemplos documentados.
const ID = "clx0000000000000000000000";
const ISO = "2026-07-10T12:00:00.000Z";

// ─────────────────────────────────────────────────────────────
// 0a. Dependencias: o pacote so pode importar zod
// ─────────────────────────────────────────────────────────────

section("Dependencias do pacote");

{
  // O `tsconfig.json` da biblioteca ja impede o uso de Node e de navegador
  // (compila `src/` com `types: []` e sem "dom" no `lib`). O que ele NAO
  // impede e um import de pacote instalado: `@prisma/client` e `next` estao
  // no node_modules da raiz e resolveriam sem erro. Esta checagem fecha esse
  // buraco lendo os imports de verdade.
  const srcDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src");
  const arquivos = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));

  // Casa `from "alvo"` e `import "alvo"` em qualquer posicao, de proposito:
  // um padrao ancorado no inicio da linha deixaria passar exatamente os
  // imports de varias linhas, que sao a maioria aqui.
  const alvoRe = /\b(?:from|import)\s*["']([^"']+)["']/g;

  const proibidos: string[] = [];
  let inspecionados = 0;
  for (const arquivo of arquivos) {
    const codigo = readFileSync(join(srcDir, arquivo), "utf8");
    // `exec` em laco, e nao `matchAll`: o tsconfig da raiz compila este
    // arquivo tambem (o `include` dele e `**/*.ts`) sem `target` definido,
    // e iterar o retorno de `matchAll` exigiria ES2015+ la.
    alvoRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = alvoRe.exec(codigo)) !== null) {
      const alvo = m[1];
      if (alvo === undefined) continue;
      inspecionados++;
      const relativo = alvo.startsWith("./") || alvo.startsWith("../");
      if (alvo !== "zod" && !relativo) proibidos.push(`${arquivo} -> ${alvo}`);
    }
  }

  assert(arquivos.length > 0, "encontrou os arquivos de src/ para inspecionar");
  // Sem esta linha, um regex que nao casa com nada passaria como "aprovado".
  assert(
    inspecionados >= arquivos.length,
    "o inspetor achou ao menos um import por arquivo de src/",
    `${inspecionados} imports em ${arquivos.length} arquivos`,
  );
  assert(
    proibidos.length === 0,
    "src/ so importa zod e caminhos relativos",
    proibidos.join(", "),
  );
}

// ─────────────────────────────────────────────────────────────
// 0b. Fundamentos: as equivalencias afirmadas nos comentarios
// ─────────────────────────────────────────────────────────────

section("Fundamentos (primitives.ts)");

{
  // `primitives.ts` afirma que `z.iso.datetime()` (usado aqui) se comporta
  // igual ao `z.string().datetime()` (usado hoje nas rotas). Se a afirmacao
  // for falsa, o contrato aceita ou recusa coisa diferente da rota.
  const daRota = z.string().datetime();
  const casos = [
    "2026-07-15T00:00:00.000Z",
    "2026-07-15T00:00:00Z",
    "2026-07-15",
    "2026-07-15T00:00:00-03:00",
    "amanha",
    "",
  ];
  const iguais = casos.every(
    (c) => daRota.safeParse(c).success === isoDateTimeSchema.safeParse(c).success,
  );
  assert(iguais, "isoDateTimeSchema decide igual ao z.string().datetime() das rotas");

  accepts(isoDateTimeSchema, "2026-07-15T00:00:00.000Z", "aceita ISO8601 em UTC");
  rejects(isoDateTimeSchema, "2026-07-15", "recusa data pura, sem hora");
  rejects(isoDateTimeSchema, "2026-07-15T00:00:00-03:00", "recusa data com offset de fuso");
}

{
  // `primitives.ts` afirma que `emailSchema` equivale ao
  // `z.string().trim().email()` das rotas, inclusive no trim.
  const daRota = z.string().trim().email();
  const casos = ["a@b.com", " a@b.com ", "nope", "joao@fazendaboavista.com.br", ""];
  const iguais = casos.every(
    (c) => daRota.safeParse(c).success === emailSchema.safeParse(c).success,
  );
  assert(iguais, "emailSchema decide igual ao z.string().trim().email() das rotas");

  parsesTo(emailSchema, "  maria@fazenda.com.br  ", "maria@fazenda.com.br", "email vem com trim aplicado");
  rejects(emailSchema, "joao@", "recusa email incompleto");
}

{
  accepts(strongPasswordSchema, "MinhaSenha1!", "senha forte: 8+, maiuscula, numero e simbolo");
  rejects(strongPasswordSchema, "minhasenha1!", "senha forte recusa sem maiuscula");
  rejects(strongPasswordSchema, "MinhaSenha!", "senha forte recusa sem numero");
  rejects(strongPasswordSchema, "MinhaSenha1", "senha forte recusa sem simbolo");
  rejects(strongPasswordSchema, "Ab1!", "senha forte recusa com menos de 8 caracteres");
}

// ─────────────────────────────────────────────────────────────
// 1. Envelope
// ─────────────────────────────────────────────────────────────

section("Envelope { data, meta } e { error }");

{
  accepts(apiErrorSchema, { error: { code: "NOT_FOUND", message: "Recurso nao encontrado" } }, "erro documentado");
  rejects(apiErrorSchema, { error: { code: "NOT_FOUND" } }, "erro sem message e recusado");
  rejects(apiErrorSchema, { error: "NOT_FOUND" }, "erro com formato antigo (string) e recusado");

  // Codigo desconhecido nao pode quebrar a LEITURA do erro: o cliente precisa
  // conseguir mostrar a mensagem de um codigo que ainda nao conhece.
  accepts(
    apiErrorSchema,
    { error: { code: "CODIGO_QUE_AINDA_NAO_EXISTE", message: "..." } },
    "erro com codigo desconhecido continua legivel",
  );
  assert(isKnownApiErrorCode("SEAT_LIMIT_REACHED"), "SEAT_LIMIT_REACHED esta no catalogo");
  assert(!isKnownApiErrorCode("CODIGO_QUE_AINDA_NAO_EXISTE"), "codigo fora do catalogo e reconhecido como desconhecido");

  assert(isApiError({ error: { code: "X", message: "y" } }), "isApiError reconhece resposta de erro");
  assert(!isApiError({ data: {}, meta: {} }), "isApiError nao confunde resposta de sucesso");

  // `apiOk()` sempre manda `meta`. Uma resposta sem `meta` nao existe no
  // servidor, mesmo que varios exemplos de /docs/api a omitam.
  rejects(dismissAlertResponseSchema, { data: { id: ID, status: "dismissed" } }, "sucesso sem meta e recusado");
}

// ─────────────────────────────────────────────────────────────
// 2. Autenticacao e conta
// ─────────────────────────────────────────────────────────────

section("Autenticacao e conta");

// --- POST /api/v1/auth/change-password (payloads literais de /docs/api) ---
accepts(changePasswordRequestSchema, { new_password: "MinhaSenha1!" }, "[docs] change-password: requisicao");
accepts(changePasswordResponseSchema, { data: { id: "cl..." }, meta: {} }, "[docs] change-password: resposta");
rejects(changePasswordRequestSchema, { new_password: "curta1!" }, "change-password recusa senha com menos de 8");
rejects(changePasswordRequestSchema, {}, "change-password recusa corpo vazio");

// --- POST /api/v1/auth/change-password-self (payloads literais de /docs/api) ---
accepts(
  changePasswordSelfRequestSchema,
  { current_password: "SenhaAtual1!", new_password: "MinhaSenha1!" },
  "[docs] change-password-self: requisicao",
);
accepts(changePasswordSelfResponseSchema, { data: { id: "cl..." }, meta: {} }, "[docs] change-password-self: resposta");
rejects(
  changePasswordSelfRequestSchema,
  { new_password: "MinhaSenha1!" },
  "change-password-self recusa sem a senha atual (e o ponto da rota)",
);

// --- Recuperacao de senha: NAO existe em /docs/api. Derivado das rotas. ---
accepts(passwordResetRequestSchema, { email: "maria@fazenda.com.br", channel: "whatsapp" }, "password-reset/request: canal whatsapp");
accepts(passwordResetRequestSchema, { email: "maria@fazenda.com.br", channel: "email" }, "password-reset/request: canal email");
rejects(passwordResetRequestSchema, { email: "maria@fazenda.com.br", channel: "sms" }, "password-reset/request recusa canal inexistente");
accepts(passwordResetRequestResponseSchema, { data: { requested: true }, meta: {} }, "password-reset/request: resposta generica");
rejects(passwordResetRequestResponseSchema, { data: { requested: false }, meta: {} }, "password-reset/request nunca responde requested: false");

accepts(passwordResetVerifyRequestSchema, { email: "maria@fazenda.com.br", code: "123456" }, "password-reset/verify: codigo de 6 digitos");
rejects(passwordResetVerifyRequestSchema, { email: "maria@fazenda.com.br", code: "12345" }, "password-reset/verify recusa codigo de 5 digitos");
// A rota valida COMPRIMENTO, nao formato: "abcdef" passa e so falha na
// comparacao com o hash. Contrato modelado como esta hoje.
accepts(passwordResetVerifyRequestSchema, { email: "maria@fazenda.com.br", code: "abcdef" }, "password-reset/verify aceita 6 caracteres nao numericos (so checa comprimento)");
accepts(passwordResetVerifyResponseSchema, { data: { reset_id: ID }, meta: {} }, "password-reset/verify: resposta");

accepts(passwordResetConfirmRequestSchema, { reset_id: ID, new_password: "MinhaSenha1!" }, "password-reset/confirm: requisicao");
rejects(passwordResetConfirmRequestSchema, { reset_id: "", new_password: "MinhaSenha1!" }, "password-reset/confirm recusa reset_id vazio");

// --- POST /api/v1/signup/start (requisicao literal de /docs/api) ---
accepts(
  signupStartRequestSchema,
  {
    company_name: "Fazenda Boa Vista",
    owner_name: "Maria Silva",
    owner_email: "maria@fazendaboavista.com.br",
    document: "12345678000199",
    phone: "22999990000",
    plan: "fazenda",
  },
  "[docs] signup/start: requisicao",
);
// A rota tambem aceita utm_source/medium/campaign, que /docs/api nao lista.
accepts(
  signupStartRequestSchema,
  {
    company_name: "Fazenda Boa Vista",
    owner_name: "Maria Silva",
    owner_email: "maria@fazendaboavista.com.br",
    document: "12345678000199",
    phone: "22999990000",
    plan: "fazenda",
    utm_source: "instagram",
    utm_medium: "social",
    utm_campaign: "safra-2026",
  },
  "signup/start aceita os campos de UTM (ausentes de /docs/api)",
);
rejects(
  signupStartRequestSchema,
  {
    company_name: "Fazenda Boa Vista",
    owner_name: "Maria Silva",
    owner_email: "maria@fazendaboavista.com.br",
    document: "1234567",
    phone: "22999990000",
    plan: "fazenda",
  },
  "signup/start recusa documento com menos de 11 caracteres",
);
rejects(
  signupStartRequestSchema,
  {
    company_name: "Fazenda Boa Vista",
    owner_name: "Maria Silva",
    owner_email: "maria@fazendaboavista.com.br",
    document: "12345678000199",
    phone: "22999990000",
    plan: "premium",
  },
  "signup/start recusa plano inexistente",
);

// --- POST /api/v1/signup/start: resposta literal de /docs/api ---
accepts(
  signupStartResponseSchema,
  {
    data: {
      state: {
        whatsapp_verified: false,
        email_verified: false,
        phone_masked: "5522*****0000",
        email_masked: "ma****@fazendaboavista.com.br",
        current_step: "whatsapp",
        allow_edit_after_seconds: 120,
      },
    },
    meta: {},
  },
  "[docs] signup/start: resposta (exemplo completo, sem substituicao)",
);

// --- POST /api/v1/signup/verify (payloads literais de /docs/api) ---
accepts(signupVerifyRequestSchema, { channel: "whatsapp", code: "123456" }, "[docs] signup/verify: requisicao");
// Contraste deliberado com password-reset/verify: aqui a rota exige 6 DIGITOS.
rejects(signupVerifyRequestSchema, { channel: "whatsapp", code: "abcdef" }, "signup/verify recusa 6 caracteres nao numericos (regex, nao comprimento)");
accepts(
  signupVerifyResponseSchema,
  { data: { completed: true, email: "maria@fazendaboavista.com.br", temp_password: "Xy9k2Qmz" }, meta: {} },
  "[docs] signup/verify: resposta do ramo completed: true",
);
// O ramo `completed: false` existe no codigo e nao aparece em /docs/api.
accepts(
  signupVerifyResponseSchema,
  {
    data: {
      completed: false,
      state: {
        whatsapp_verified: true,
        email_verified: false,
        phone_masked: "5522*****0000",
        email_masked: "ma****@fazendaboavista.com.br",
        current_step: "email",
        allow_edit_after_seconds: 120,
      },
    },
    meta: {},
  },
  "signup/verify: ramo completed: false (ausente de /docs/api)",
);
rejects(
  signupVerifyResponseSchema,
  { data: { completed: false, email: "maria@fazendaboavista.com.br", temp_password: "Xy9k2Qmz" }, meta: {} },
  "signup/verify recusa temp_password no ramo nao concluido",
);

// --- POST /api/v1/signup/resend ---
accepts(signupResendRequestSchema, { channel: "whatsapp", destination: "22988887777" }, "[docs] signup/resend: requisicao");
accepts(signupResendRequestSchema, { channel: "email" }, "signup/resend aceita reenvio sem trocar destino");

// O exemplo de resposta em /docs/api e abreviado: tem literalmente a chave
// "...": "..." e falta 4 dos 6 campos do estado.
rejects(
  signupResendResponseSchema,
  { data: { whatsapp_verified: false, current_step: "whatsapp", "...": "..." }, meta: {} },
  "[docs abreviado] signup/resend: exemplo documentado nao passa (faltam 4 campos do estado)",
);
accepts(
  signupResendResponseSchema,
  {
    data: {
      whatsapp_verified: false,
      email_verified: false,
      phone_masked: "5522*****0000",
      email_masked: "ma****@fazendaboavista.com.br",
      current_step: "whatsapp",
      allow_edit_after_seconds: 120,
    },
    meta: {},
  },
  "signup/resend: resposta real completa passa",
);

// ─────────────────────────────────────────────────────────────
// 3. Financeiro: lancamentos e pendencias
// ─────────────────────────────────────────────────────────────

section("Financeiro (lancamentos e pendencias)");

// --- POST /api/v1/financial-entries: requisicao literal de /docs/api ---
accepts(
  createFinancialEntryRequestSchema,
  { entry_type: "expense", category: "Combustivel", amount: 350, due_date: "2026-07-15T00:00:00.000Z", notes: null },
  "[docs] financial-entries POST: requisicao",
);
accepts(
  createFinancialEntryRequestSchema,
  { entry_type: "income", category: "Venda", amount: 4500, due_date: "2026-07-15T00:00:00.000Z" },
  "financial-entries POST: notes pode simplesmente nao vir",
);
rejects(
  createFinancialEntryRequestSchema,
  { entry_type: "expense", category: "Combustivel", amount: 0, due_date: "2026-07-15T00:00:00.000Z" },
  "financial-entries POST recusa amount zero",
);
rejects(
  createFinancialEntryRequestSchema,
  { entry_type: "expense", category: "Combustivel", amount: -350, due_date: "2026-07-15T00:00:00.000Z" },
  "financial-entries POST recusa amount negativo",
);
rejects(
  createFinancialEntryRequestSchema,
  { entry_type: "expense", category: "Combustivel", amount: "350", due_date: "2026-07-15T00:00:00.000Z" },
  "financial-entries POST recusa amount como string",
);
rejects(
  createFinancialEntryRequestSchema,
  { entry_type: "expense", category: "   ", amount: 350, due_date: "2026-07-15T00:00:00.000Z" },
  "financial-entries POST recusa categoria so com espacos",
);
rejects(
  createFinancialEntryRequestSchema,
  { entry_type: "expense", category: "Combustivel", amount: 350, due_date: "2026-07-15" },
  "financial-entries POST recusa due_date sem hora",
);
rejects(
  createFinancialEntryRequestSchema,
  { entry_type: "outcome", category: "Combustivel", amount: 350, due_date: "2026-07-15T00:00:00.000Z" },
  "financial-entries POST recusa entry_type inexistente",
);
// `related_module` e `status` nao sao aceitos no corpo: quem os define e a
// action. O z.object descarta, entao o efeito e o mesmo de nao existirem.
parsesTo(
  createFinancialEntryRequestSchema,
  { entry_type: "expense", category: "Combustivel", amount: 350, due_date: "2026-07-15T00:00:00.000Z", related_module: "rebanho", status: "paid" },
  { entry_type: "expense", category: "Combustivel", amount: 350, due_date: "2026-07-15T00:00:00.000Z" },
  "financial-entries POST descarta related_module e status enviados pelo cliente",
);

// --- PATCH /api/v1/financial-entries/:id: requisicao literal de /docs/api ---
accepts(updateFinancialEntryRequestSchema, { amount: 380 }, "[docs] financial-entries PATCH: requisicao");
accepts(updateFinancialEntryRequestSchema, {}, "financial-entries PATCH aceita corpo vazio (tudo opcional)");
rejects(updateFinancialEntryRequestSchema, { amount: -1 }, "financial-entries PATCH recusa amount negativo");

// --- PATCH /api/v1/financial-entries/:id/pay: requisicao literal de /docs/api ---
accepts(payFinancialEntryRequestSchema, { paid_at: "2026-07-10T00:00:00.000Z" }, "[docs] financial-entries pay: requisicao");
accepts(payFinancialEntryRequestSchema, {}, "financial-entries pay aceita corpo vazio (usa o instante atual)");
accepts(payFinancialEntryRequestSchema, { paid_at: null }, "financial-entries pay aceita paid_at nulo");
rejects(payFinancialEntryRequestSchema, { paid_at: "ontem" }, "financial-entries pay recusa data invalida");

// --- Filtros de GET /api/v1/financial-entries ---
accepts(listFinancialEntriesQuerySchema, {}, "financial-entries GET: sem filtro");
accepts(
  listFinancialEntriesQuerySchema,
  { start: "2026-07-01T00:00:00.000Z", end: "2026-07-31T23:59:59.000Z", entry_type: "expense", category: "Comb", related_module: "geral", status: "pending" },
  "financial-entries GET: todos os filtros",
);
rejects(listFinancialEntriesQuerySchema, { status: "atrasado" }, "financial-entries GET recusa status inexistente");
rejects(listFinancialEntriesQuerySchema, { related_module: "financeiro" }, "financial-entries GET recusa modulo inexistente");

// --- GET /api/v1/financial-entries: resposta ---
// O exemplo de /docs/api traz 5 dos 11 campos do lancamento.
rejects(
  listFinancialEntriesResponseSchema,
  { data: [{ id: "cl...", entry_type: "expense", category: "Insumo (fertilizer) - NPK", amount: 1800, status: "pending" }], meta: { total: 1 } },
  "[docs abreviado] financial-entries GET: exemplo documentado nao passa (faltam 6 campos)",
);
const lancamentoReal = {
  id: ID,
  entry_type: "expense",
  category: "Insumo (fertilizer) - NPK",
  amount: 1800,
  related_module: "lavoura",
  related_id: ID,
  due_date: ISO,
  paid_at: null,
  status: "pending",
  notes: null,
  created_at: ISO,
};
accepts(listFinancialEntriesResponseSchema, { data: [lancamentoReal], meta: { total: 1 } }, "financial-entries GET: resposta real completa passa");
accepts(listFinancialEntriesResponseSchema, { data: [], meta: { total: 0 } }, "financial-entries GET: lista vazia");

// Campos anulaveis do lancamento, conforme as colunas do schema.prisma.
accepts(
  financialEntrySchema,
  { ...lancamentoReal, category: null, related_id: null, due_date: null, paid_at: null, notes: null },
  "lancamento aceita nulo em category, related_id, due_date, paid_at e notes",
);
// `amount` nao e anulavel: a coluna e Decimal obrigatorio.
rejects(createFinancialEntryResponseSchema, { data: { ...lancamentoReal, amount: null }, meta: {} }, "lancamento recusa amount nulo");

// --- GET /api/v1/financial/upcoming: resposta ---
// Substituicoes no exemplo de /docs/api: `id` "cl..." -> cuid de teste,
// `due_date` "..." -> ISO real, e `meta` acrescentado (o exemplo a omite, mas
// a rota devolve `{ total }`).
accepts(
  listUpcomingResponseSchema,
  { data: [{ id: ID, entry_type: "expense", category: "Combustivel", amount: 350, due_date: ISO, related_module: "geral" }], meta: { total: 1 } },
  "[docs] financial/upcoming: resposta (id, due_date e meta substituidos)",
);
// A pendencia e uma projecao propria: `due_date` nunca e nulo aqui.
rejects(
  listUpcomingResponseSchema,
  { data: [{ id: ID, entry_type: "expense", category: "Combustivel", amount: 350, due_date: null, related_module: "geral" }], meta: { total: 1 } },
  "financial/upcoming recusa due_date nulo (a consulta ja garante que existe)",
);
// E nao traz `status`: quem precisa dele usa /financial-entries.
parsesTo(
  listUpcomingResponseSchema,
  { data: [{ id: ID, entry_type: "expense", category: "Combustivel", amount: 350, due_date: ISO, related_module: "geral", status: "pending" }], meta: { total: 1 } },
  { data: [{ id: ID, entry_type: "expense", category: "Combustivel", amount: 350, due_date: ISO, related_module: "geral" }], meta: { total: 1 } },
  "financial/upcoming nao inclui status na projecao",
);

// ─────────────────────────────────────────────────────────────
// 4. Alertas
// ─────────────────────────────────────────────────────────────

section("Alertas");

// O exemplo de /docs/api traz 4 dos 9 campos do alerta.
rejects(
  listAlertsResponseSchema,
  { data: [{ id: "cl...", alert_type: "vaccine_due", message: "Vacina vence em 3 dias", status: "pending" }], meta: { total: 1 } },
  "[docs abreviado] alerts GET: exemplo documentado nao passa (faltam 5 campos)",
);
const alertaReal = {
  id: ID,
  alert_type: "vaccine_due",
  related_module: "rebanho",
  related_id: ID,
  message: "Atencao: a vacina de aftosa do animal 1234 vence em 3 dias",
  status: "pending",
  scheduled_for: ISO,
  sent_at: null,
  created_at: ISO,
};
accepts(listAlertsResponseSchema, { data: [alertaReal], meta: { total: 1 } }, "alerts GET: resposta real completa passa");
// `related_module` e a unica enumeracao anulavel: low_balance e trial_ending
// nao pertencem a modulo nenhum.
accepts(
  listAlertsResponseSchema,
  { data: [{ ...alertaReal, alert_type: "low_balance", related_module: null, related_id: "2026-W28" }], meta: { total: 1 } },
  "alerts GET: low_balance com related_module nulo e related_id da semana ISO",
);
accepts(alertSchema, { ...alertaReal, alert_type: "trial_ending", related_module: null }, "alerta trial_ending (extensao aditiva da spec 5.8)");
rejects(alertSchema, { ...alertaReal, alert_type: "conta_vencida" }, "alerta recusa tipo inexistente");
rejects(alertSchema, { ...alertaReal, message: null }, "alerta recusa message nula");

// Filtros. `type` (nao `alert_type`) e o nome do parametro na query.
accepts(listAlertsQuerySchema, { type: "bill_due", status: "pending" }, "alerts GET: filtros type e status");
// A rota faz um cast TypeScript que esquece `trial_ending`, mas o cast nao
// valida nada em runtime: filtrar por ele funciona de verdade.
accepts(listAlertsQuerySchema, { type: "trial_ending" }, "alerts GET: filtro por trial_ending (omitido do cast da rota)");
rejects(listAlertsQuerySchema, { type: "vencido" }, "alerts GET recusa tipo inexistente");
rejects(listAlertsQuerySchema, { status: "resolvido" }, "alerts GET recusa status inexistente");

// --- PATCH /api/v1/alerts/:id/dismiss: resposta literal de /docs/api ---
accepts(dismissAlertResponseSchema, { data: { id: "cl...", status: "dismissed" }, meta: {} }, "[docs] alerts dismiss: resposta (exemplo completo, sem substituicao)");

// ─────────────────────────────────────────────────────────────
// 5. Usuarios
// ─────────────────────────────────────────────────────────────

section("Usuarios");

// --- GET /api/v1/users: resposta ---
// Substituicao no exemplo de /docs/api: `created_at` "..." -> ISO real.
// `name`, `email` e `phone` continuam como "..." porque a resposta nao os
// valida, e o contrato tambem nao deve valida-los na leitura.
accepts(
  listUsersResponseSchema,
  {
    data: [{ id: "cl...", name: "...", email: "...", phone: "...", role: "OPERADOR", active: true, created_at: ISO }],
    meta: { total: 1, seats: { used: 1, limit: 2, has_room: true } },
  },
  "[docs] users GET: resposta (so created_at substituido)",
);
// `created_at` "..." e a unica razao de o exemplo nao passar cru.
rejects(
  listUsersResponseSchema,
  {
    data: [{ id: "cl...", name: "...", email: "...", phone: "...", role: "OPERADOR", active: true, created_at: "..." }],
    meta: { total: 1, seats: { used: 1, limit: 2, has_room: true } },
  },
  "[docs abreviado] users GET: created_at \"...\" nao e uma data",
);
accepts(
  listUsersResponseSchema,
  { data: [{ id: ID, name: "Joao", email: "joao@fazenda.com.br", phone: null, role: "OWNER", active: false, created_at: ISO }], meta: { total: 1, seats: { used: 1, limit: 1, has_room: false } } },
  "users GET: phone nulo e usuario desativado",
);
// `meta.seats` e obrigatorio: a rota sempre calcula.
rejects(listUsersResponseSchema, { data: [], meta: { total: 0 } }, "users GET recusa meta sem seats");
// Um tenant que caiu de plano fica acima do limite, e isso e valido.
accepts(
  listUsersResponseSchema,
  { data: [], meta: { total: 0, seats: { used: 5, limit: 2, has_room: false } } },
  "users GET: used acima do limit e estado valido (downgrade nao desativa ninguem)",
);

// --- POST /api/v1/users: payloads literais de /docs/api ---
accepts(
  inviteUserRequestSchema,
  { name: "Joao Souza", email: "joao@fazendaboavista.com.br", phone: "22988887777", role: "OPERADOR" },
  "[docs] users POST: requisicao",
);
accepts(inviteUserResponseSchema, { data: { id: "cl...", temp_password: "Xy9k2Qmz" }, meta: {} }, "[docs] users POST: resposta (exemplo completo, sem substituicao)");
accepts(inviteUserRequestSchema, { name: "Joao", email: "joao@fazenda.com.br", role: "ADMIN" }, "users POST: phone e opcional");
accepts(inviteUserRequestSchema, { name: "Joao", email: "joao@fazenda.com.br", phone: null, role: "ADMIN" }, "users POST: phone pode ser nulo");
rejects(inviteUserRequestSchema, { name: "Joao", email: "joao@", role: "OPERADOR" }, "users POST recusa email invalido");
rejects(inviteUserRequestSchema, { name: "   ", email: "joao@fazenda.com.br", role: "OPERADOR" }, "users POST recusa nome so com espacos");
rejects(inviteUserRequestSchema, { name: "Joao", email: "joao@fazenda.com.br", role: "SUPERVISOR" }, "users POST recusa papel inexistente");
rejects(inviteUserRequestSchema, { name: "Joao", email: "joao@fazenda.com.br", role: "owner" }, "users POST recusa papel em minusculas");

// --- PATCH /api/v1/users/:id/role ---
accepts(updateUserRoleRequestSchema, { role: "ADMIN" }, "[docs] users role PATCH: requisicao");
rejects(updateUserRoleRequestSchema, {}, "users role PATCH recusa corpo sem role");
// /docs/api documenta `{ id, role }` na resposta, mas a action devolve so o
// `id`. O exemplo documentado "passa" porque chave desconhecida e descartada:
// o que este caso prova e que `role` NAO chega ao consumidor.
parsesTo(
  updateUserRoleResponseSchema,
  { data: { id: ID, role: "ADMIN" }, meta: {} },
  { data: { id: ID }, meta: {} },
  "[divergencia] users role PATCH: /docs/api promete `role`, o servidor devolve so `id`",
);

// --- PATCH /api/v1/users/:id/active ---
accepts(setUserActiveRequestSchema, { active: false }, "[docs] users active PATCH: requisicao");
rejects(setUserActiveRequestSchema, { active: "false" }, "users active PATCH recusa active como string");
parsesTo(
  setUserActiveResponseSchema,
  { data: { id: ID, active: false }, meta: {} },
  { data: { id: ID }, meta: {} },
  "[divergencia] users active PATCH: /docs/api promete `active`, o servidor devolve so `id`",
);

// ─────────────────────────────────────────────────────────────
// Resultado
// ─────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
if (failures.length === 0) {
  console.log(`OK: ${passed} verificacoes passaram.`);
} else {
  console.log(`FALHOU: ${failures.length} de ${passed + failures.length} verificacoes.`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
