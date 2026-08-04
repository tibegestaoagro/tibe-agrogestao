import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/lib/tenant-context";

/**
 * Identidade por token para o aplicativo (Onda 1, agente A1).
 *
 * Existe porque o aplicativo não tem cookie de navegador: precisa autenticar
 * nas rotas `/api/v1/*` JÁ EXISTENTES, sem rota paralela e sem alterar
 * nenhuma delas. O ponto de encaixe é único: `getSessionUser()`
 * (`tenant-context.ts`) passou a resolver identidade por dois adapters
 * (`Authorization: Bearer` primeiro, cookie depois). Nada além daquela função
 * sabe que token existe.
 *
 * A REGRA MAIS IMPORTANTE DO PROJETO CONTINUA VALENDO: `tenant_id` não é
 * autoridade no token. O access token carrega apenas `sub` (o `user_id`), e o
 * tenant é lido da linha de `User` no banco a cada requisição. Um token
 * adulterado para apontar outro tenant não teria efeito: o campo simplesmente
 * não é consultado. Por isso ele nem é emitido dentro do JWT.
 *
 * Formatos:
 * - Access token: JWT HS256, 15 minutos, assinado com `MOBILE_JWT_SECRET`
 *   (segredo próprio, NUNCA `NEXTAUTH_SECRET`: comprometer o aplicativo não
 *   pode virar sessão de navegador, nem o contrário). Não é persistido.
 * - Refresh token: opaco (não JWT), 30 dias, guardado só como hash, de uso
 *   único com rotação: renovar invalida o anterior e emite um novo par.
 *
 * O JWT é assinado à mão com `node:crypto` em vez de uma biblioteca nova: é
 * HS256 com segredo simétrico nosso dos dois lados, o mesmo mecanismo já usado
 * em `reports/report-token.ts`, e evita acrescentar dependência a um
 * `package.json` que outros agentes estão tocando em paralelo.
 */

/** 15 minutos: janela curta o bastante para um token vazado envelhecer sozinho. */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** 30 dias: o aplicativo não pode pedir senha toda semana; a rotação é quem protege. */
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Escopo de rate limit da rota de login por token (pública, alvo de força bruta). */
const RATE_LIMIT_SCOPE = "mobile-token";

/**
 * Hash bcrypt descartável (de um valor aleatório que ninguém conhece),
 * comparado quando a conta não existe para igualar o tempo de resposta ao do
 * caminho normal. Criado sob demanda: um `hash()` no carregamento do módulo
 * custaria ~100ms em todo cold start, inclusive nas requisições que nunca
 * passam por aqui.
 */
let dummyPasswordHash: string | null = null;

async function equalizeFailureTiming(password: string): Promise<void> {
  dummyPasswordHash ??= await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);
  await bcrypt.compare(password, dummyPasswordHash);
}

type AccessTokenClaims = {
  /** user_id: a ÚNICA informação do token usada como autoridade. */
  sub: string;
  /** Distingue do JWT de sessão do NextAuth; um não pode ser aceito no lugar do outro. */
  typ: "mobile_access";
  iat: number;
  exp: number;
};

export type TokenPair = {
  access_token: string;
  token_type: "Bearer";
  /** Segundos de validade do access token (padrão OAuth2, para o aplicativo agendar a renovação). */
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
};

export type TokenAuthResult =
  | { ok: true; data: TokenPair & { user: { id: string; name: string; email: string; role: SessionUser["role"] } } }
  | { ok: false; code: string; message: string; status: number };

function getJwtSecret(): string {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "MOBILE_JWT_SECRET não configurado: necessário para assinar o token do aplicativo.",
    );
  }
  // Defesa explícita contra a regressão mais provável em deploy: copiar o
  // segredo da sessão web para cá tornaria as duas identidades a mesma coisa.
  if (secret === process.env.NEXTAUTH_SECRET) {
    throw new Error(
      "MOBILE_JWT_SECRET não pode ser igual a NEXTAUTH_SECRET: as duas identidades precisam ser independentes.",
    );
  }
  return secret;
}

function b64url(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function hmac(signingInput: string): string {
  return crypto.createHmac("sha256", getJwtSecret()).update(signingInput).digest("base64url");
}

/** Assina um access token para `userId`. `ttlSeconds` só é passado em teste. */
export function signAccessToken(
  userId: string,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims: AccessTokenClaims = {
    sub: userId,
    typ: "mobile_access",
    iat: now,
    exp: now + ttlSeconds,
  };
  const payload = b64url(JSON.stringify(claims));
  return `${header}.${payload}.${hmac(`${header}.${payload}`)}`;
}

/**
 * Devolve as claims se, e somente se, a assinatura confere, o formato é o
 * esperado e o token não expirou. A assinatura é conferida ANTES de qualquer
 * `JSON.parse` do conteúdo, e o algoritmo é fixo em HS256 do nosso lado: não
 * existe caminho em que um `alg` escolhido pelo atacante (`none`, RS256 com
 * chave pública) seja levado em conta.
 */
export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;

  let expected: string;
  try {
    expected = hmac(`${header}.${payload}`);
  } catch {
    // Segredo ausente ou mal configurado: nada pode ser provado, então ninguém
    // entra (falha fechada). A emissão, ao contrário, continua lançando: é lá
    // que uma variável faltando precisa aparecer, e não em forma de erro 500
    // no painel web só porque alguém mandou um header qualquer.
    return null;
  }
  const got = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;

  try {
    const head = JSON.parse(Buffer.from(header, "base64url").toString("utf-8")) as {
      alg?: string;
      typ?: string;
    };
    if (head.alg !== "HS256" || head.typ !== "JWT") return null;

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as AccessTokenClaims;
    if (claims.typ !== "mobile_access") return null;
    if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;
    if (typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Extrai o token de um header `Authorization` (esquema case-insensitive, como manda a RFC 7235). */
export function readBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const match = /^Bearer[ ]+(.+)$/i.exec(headerValue.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Traduz um access token na MESMA `SessionUser` que a sessão de cookie
 * devolve. `tenant_id` e `role` vêm da linha do banco, nunca do token: é aqui
 * que o isolamento continua sendo garantido no servidor.
 *
 * O client base é o correto neste ponto pelo mesmo motivo de `auth.ts` (que
 * busca o usuário pelo email no login): resolver identidade é justamente o
 * passo que acontece ANTES de existir um tenant conhecido. Toda query de
 * negócio depois disso segue no client escopado.
 */
export async function resolveSessionUserFromAccessToken(
  token: string,
): Promise<SessionUser | null> {
  const claims = verifyAccessToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || !user.active) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    tenant_id: user.tenant_id,
    role: user.role,
  };
}

/**
 * Refresh token opaco: 32 bytes aleatórios. Não é JWT de propósito, porque a
 * revogação precisa ser um fato do banco, e não algo que dependa de o portador
 * do token cooperar.
 */
function generateRefreshTokenRaw(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * SHA-256, não bcrypt: o valor tem 256 bits de aleatoriedade (não é senha
 * escolhida por humano, então não há dicionário a proteger), e o hash precisa
 * ser determinístico para a busca pelo índice único, que é o que sustenta o
 * uso único.
 */
function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Emite um par novo e persiste apenas o hash do refresh. */
async function issueTokenPair(user: {
  id: string;
  tenant_id: string;
}): Promise<TokenPair> {
  const raw = generateRefreshTokenRaw();
  const db = prismaForTenant(user.tenant_id);
  await db.refreshToken.create({
    data: scoped({
      user_id: user.id,
      token_hash: hashRefreshToken(raw),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    }),
  });

  return {
    access_token: signAccessToken(user.id),
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: raw,
    refresh_expires_in: REFRESH_TOKEN_TTL_SECONDS,
  };
}

/**
 * Login por email e senha. Mesmas regras do login web (bcrypt, usuário
 * inativo não entra, rate limit por email), com um escopo de rate limit
 * próprio para não misturar a contagem dos dois canais.
 *
 * Credencial errada e usuário inexistente devolvem exatamente o mesmo erro:
 * a rota é pública e não pode servir de oráculo de existência de conta.
 *
 * O gate de sessão NÃO é aplicado aqui de propósito: quem tem
 * `must_change_password` precisa autenticar para conseguir trocar a senha. O
 * bloqueio das rotas de negócio continua sendo do `guard()`, sem exceção.
 */
export async function authenticateWithPassword(
  emailInput: string,
  password: string,
): Promise<TokenAuthResult> {
  // Só `trim()`, exatamente como o login web: o email é gravado como digitado
  // e normalizar aqui faria o aplicativo recusar contas que o navegador aceita.
  // (A chave do rate limit é normalizada dentro de `rate-limit.ts`.)
  const email = emailInput.trim();
  const invalid = {
    ok: false,
    code: "INVALID_CREDENTIALS",
    message: "Email ou senha inválidos",
    status: 401,
  } as const;

  if (!(await checkLoginRateLimit(RATE_LIMIT_SCOPE, email))) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
      status: 429,
    };
  }

  // Email é globalmente único: resolve um único usuário/tenant (mesma consulta
  // do login web, mesma justificativa para o client base).
  const user = await prisma.user.findUnique({ where: { email } });

  // Conta inexistente ou desativada também paga o custo de um bcrypt: sem
  // isso, o tempo de resposta contaria ao atacante quais emails existem, e o
  // erro genérico acima seria só aparência.
  if (!user || !user.active) {
    await equalizeFailureTiming(password);
    return invalid;
  }
  if (!(await bcrypt.compare(password, user.password_hash))) return invalid;

  await resetLoginRateLimit(RATE_LIMIT_SCOPE, email);

  const pair = await issueTokenPair({ id: user.id, tenant_id: user.tenant_id });
  return {
    ok: true,
    data: {
      ...pair,
      // Sem `tenant_id`: o aplicativo nunca precisa dele (o servidor resolve
      // sozinho a cada requisição), e não devolvê-lo remove a tentação de um
      // dia mandá-lo de volta como se fosse autoridade.
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    },
  };
}

/** Linha viva (não revogada, não expirada) correspondente a um refresh token em claro. */
async function findLiveRefreshToken(raw: string) {
  // Busca pelo hash (único) antes de saber o tenant: mesma necessidade
  // estrutural de `confirmPasswordResetAction`, que resolve o
  // `PasswordResetCode` pelo próprio id. O tenant sai da linha encontrada e,
  // dali em diante, tudo passa pelo client escopado.
  const row = await prisma.refreshToken.findUnique({
    where: { token_hash: hashRefreshToken(raw) },
  });
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at.getTime() <= Date.now()) return null;
  return row;
}

/**
 * Uso único com rotação: revoga o refresh apresentado e emite um par novo.
 *
 * A revogação usa `updateMany` com `revoked_at: null` no filtro e confere o
 * `count`: duas renovações simultâneas com o mesmo token deixam exatamente uma
 * passar, sem depender de transação nem de lock.
 */
export async function rotateRefreshToken(raw: string): Promise<TokenPair | null> {
  const row = await findLiveRefreshToken(raw);
  if (!row) return null;

  const db = prismaForTenant(row.tenant_id);

  const user = await db.user.findUnique({ where: { id: row.user_id } });
  if (!user || !user.active) return null;

  const consumed = await db.refreshToken.updateMany({
    where: { id: row.id, revoked_at: null },
    data: { revoked_at: new Date() },
  });
  if (consumed.count !== 1) return null;

  return issueTokenPair({ id: user.id, tenant_id: row.tenant_id });
}

/**
 * Revoga um refresh token (logout do aplicativo). Devolve `true` quando havia
 * uma linha viva para revogar; quem chama responde igual nos dois casos, para
 * não transformar a rota num oráculo de token válido.
 */
export async function revokeRefreshToken(raw: string): Promise<boolean> {
  const row = await findLiveRefreshToken(raw);
  if (!row) return false;

  const db = prismaForTenant(row.tenant_id);
  const revoked = await db.refreshToken.updateMany({
    where: { id: row.id, revoked_at: null },
    data: { revoked_at: new Date() },
  });
  return revoked.count === 1;
}
