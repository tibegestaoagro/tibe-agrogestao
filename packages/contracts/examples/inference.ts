/**
 * Demonstracao de inferencia de tipo a partir dos schemas.
 *
 * Este arquivo e uma PROVA DE COMPILACAO, nao um teste de runtime: o valor
 * dele esta em `tsc` aceitar as linhas certas e recusar as erradas. Os
 * `@ts-expect-error` sao a parte que prova de verdade, porque o TypeScript
 * reclama de um `@ts-expect-error` que NAO encontra erro
 * ("Unused '@ts-expect-error' directive"). Ou seja: se algum schema
 * degenerasse para `any`, a compilacao quebraria aqui em vez de passar calada.
 *
 * Rode com: npx tsc -p packages/contracts/tsconfig.check.json
 */

import {
  alertSchema,
  apiOkSchema,
  createFinancialEntryRequestSchema,
  financialEntrySchema,
  isApiError,
  listUsersResponseSchema,
  signupVerifyResultSchema,
  userSchema,
  type Alert,
  type ApiOk,
  type CreateFinancialEntryRequest,
  type EntryType,
  type FinancialEntry,
  type SeatUsage,
  type User,
} from "../src/index";

// ─────────────────────────────────────────────────────────────
// 1. `z.infer` produz o tipo do objeto, campo a campo
// ─────────────────────────────────────────────────────────────

const entry: FinancialEntry = {
  id: "clx0000000000000000000000",
  entry_type: "expense",
  category: "Combustivel",
  amount: 350,
  related_module: "geral",
  related_id: null,
  due_date: "2026-07-15T00:00:00.000Z",
  paid_at: null,
  status: "pending",
  notes: null,
  created_at: "2026-07-01T12:00:00.000Z",
};

// @ts-expect-error `entry_type` so aceita "income" | "expense"
const entryComTipoInvalido: FinancialEntry = { ...entry, entry_type: "outcome" };

// @ts-expect-error `category` e anulavel, mas nao pode ser numero
const entryComCategoriaInvalida: FinancialEntry = { ...entry, category: 42 };

// @ts-expect-error campo inexistente no contrato
const entryComCampoInventado: FinancialEntry = { ...entry, valor_total: 350 };

// ─────────────────────────────────────────────────────────────
// 2. `parse` devolve o tipo ja estreitado, sem anotacao manual
// ─────────────────────────────────────────────────────────────

declare const respostaCrua: unknown;

const lancamento = financialEntrySchema.parse(respostaCrua);

// Estreitado para a uniao literal, nao para `string`.
const tipo: EntryType = lancamento.entry_type;

// `null` faz parte do tipo de `due_date`, entao o compilador exige o tratamento.
const vencimento: string = lancamento.due_date ?? "sem vencimento";

// @ts-expect-error `due_date` e `string | null`, nao `string`
const vencimentoSemTratarNulo: string = lancamento.due_date;

// ─────────────────────────────────────────────────────────────
// 3. Requisicao: campos opcionais e obrigatorios saem do schema
// ─────────────────────────────────────────────────────────────

const novoLancamento: CreateFinancialEntryRequest = {
  entry_type: "expense",
  category: "Combustivel",
  amount: 350,
  due_date: "2026-07-15T00:00:00.000Z",
  notes: null,
};

// `notes` e nullish: pode simplesmente nao existir.
const novoLancamentoSemNotas: CreateFinancialEntryRequest = {
  entry_type: "income",
  category: "Venda de bezerro",
  amount: 4500,
  due_date: "2026-07-20T00:00:00.000Z",
};

// @ts-expect-error `category` e obrigatoria na criacao
const novoLancamentoSemCategoria: CreateFinancialEntryRequest = {
  entry_type: "expense",
  amount: 350,
  due_date: "2026-07-15T00:00:00.000Z",
};

// ─────────────────────────────────────────────────────────────
// 4. O envelope e generico e preserva o tipo de `data` e de `meta`
// ─────────────────────────────────────────────────────────────

const listaDeUsuarios = listUsersResponseSchema.parse(respostaCrua);

const usuarios: User[] = listaDeUsuarios.data;
const assentos: SeatUsage = listaDeUsuarios.meta.seats;
// `has_room` mora dentro de `seats`, e nao na raiz de `meta`.
const cabeMaisGente: boolean = listaDeUsuarios.meta.seats.has_room;

// @ts-expect-error `meta` desta rota e tipada: `seats` e `total`, nada mais
const metaInexistente: number = listaDeUsuarios.meta.pagina;

// O tipo `ApiOk<T>` cobre o caso em que so o formato do envelope importa.
const envelopeGenerico: ApiOk<Alert[]> = { data: [], meta: {} };

// `apiOkSchema` tambem serve para montar contratos derivados sem repetir o envelope.
const listaDeAlertas = apiOkSchema(alertSchema.array()).parse(respostaCrua);
const primeiroAlerta: Alert | undefined = listaDeAlertas.data[0];

// ─────────────────────────────────────────────────────────────
// 5. Uniao discriminada: o compilador cobra o tratamento dos dois ramos
// ─────────────────────────────────────────────────────────────

const verificacao = signupVerifyResultSchema.parse(respostaCrua);

if (verificacao.completed) {
  // So neste ramo existem `email` e `temp_password`.
  const senhaTemporaria: string = verificacao.temp_password;
} else {
  // E so neste existe `state`.
  const proximoPasso: "whatsapp" | "email" | "done" = verificacao.state.current_step;

  // @ts-expect-error `temp_password` nao existe enquanto o cadastro nao terminou
  const senhaQueAindaNaoExiste: string = verificacao.temp_password;
}

// ─────────────────────────────────────────────────────────────
// 6. Erro: `isApiError` estreita `unknown` para o formato de erro
// ─────────────────────────────────────────────────────────────

declare const resposta: unknown;

if (isApiError(resposta)) {
  const codigo: string = resposta.error.code;
  const mensagem: string = resposta.error.message;
} else {
  const usuario = userSchema.array().parse((resposta as ApiOk<unknown>).data);
  const primeiroNome: string | undefined = usuario[0]?.name;
}

/**
 * Nada aqui e exportado nem executado: as declaracoes existem so para o
 * compilador conferir. O `void` abaixo mantem o lint quieto sobre variaveis
 * nao usadas sem esconder nenhum erro de tipo.
 */
void [
  entry,
  entryComTipoInvalido,
  entryComCategoriaInvalida,
  entryComCampoInventado,
  tipo,
  vencimento,
  vencimentoSemTratarNulo,
  novoLancamento,
  novoLancamentoSemNotas,
  novoLancamentoSemCategoria,
  usuarios,
  assentos,
  cabeMaisGente,
  metaInexistente,
  envelopeGenerico,
  primeiroAlerta,
];
